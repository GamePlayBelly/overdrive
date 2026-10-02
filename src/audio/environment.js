import * as THREE from 'three';

// Acoustic environment: measures how enclosed the listener is (roof overhead, walls either side), picks a room character
// (open road, city canyon, tunnel, garage, industrial, mountain, forest, indoors) and cross-fades a procedural convolution reverb plus an
// EQ on the vehicle buses, quickly when you drive in and slowly when you drive out.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// length s, pre-delay s, decay (RT60-ish), brightness 0..1, echoes [time s, level] discrete reflections, comb = metallic ringing
const PRESETS = {
  open: { len: 0.7, pre: 0.012, rt: 0.35, bright: 0.55, echoes: [], wet: 0.07, shelf: 0, mid: 0 },
  forest: { len: 1.0, pre: 0.02, rt: 0.55, bright: 0.35, echoes: [[0.09, 0.2]], wet: 0.1, shelf: 0, mid: 0 },
  city: { len: 1.2, pre: 0.018, rt: 0.7, bright: 0.5, echoes: [[0.045, 0.5], [0.09, 0.32], [0.16, 0.2]], wet: 0.2, shelf: 1.5, mid: 0.5 },
  industrial: { len: 1.5, pre: 0.015, rt: 1.0, bright: 0.75, echoes: [[0.03, 0.4], [0.07, 0.35]], comb: 0.0113, wet: 0.26, shelf: 1.5, mid: 1.2 },
  mountain: { len: 2.6, pre: 0.05, rt: 1.8, bright: 0.3, echoes: [[0.32, 0.45], [0.7, 0.3], [1.15, 0.18]], wet: 0.28, shelf: 0, mid: 0 },
  garage: { len: 2.0, pre: 0.01, rt: 1.5, bright: 0.45, echoes: [[0.02, 0.5], [0.05, 0.45]], wet: 0.45, shelf: 3, mid: 1.5 },
  tunnel: { len: 3.4, pre: 0.008, rt: 2.8, bright: 0.6, echoes: [[0.03, 0.5], [0.06, 0.45], [0.12, 0.35]], wet: 0.58, shelf: 4, mid: 2.5 },
  room: { len: 0.55, pre: 0.004, rt: 0.28, bright: 0.4, echoes: [], wet: 0.3, shelf: 0, mid: 0 },
};

export class AcousticEnv {
  constructor(A) {
    this.A = A; this.ctx = A.ctx;
    this.preset = 'open'; this.target = 'open';
    this.cover = 0; this.canyon = 0; this.inside = 0;
    this.irs = {}; this.t = 0; this.holdT = 0;
    this.active = 0;
    const ctx = this.ctx;
    // buses of vehicles and effects feed one input; it feeds the dry path through the EQ and the reverb sends
    this.input = ctx.createGain();
    this.shelf = ctx.createBiquadFilter(); this.shelf.type = 'lowshelf'; this.shelf.frequency.value = 220;
    this.mid = ctx.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.frequency.value = 1100; this.mid.Q.value = 0.7;
    this.input.connect(this.shelf); this.shelf.connect(this.mid); this.mid.connect(A.comp);
    this.send = ctx.createGain(); this.send.gain.value = 0.07;
    this.input.connect(this.send);
    this.slots = [0, 1].map(() => {
      const conv = ctx.createConvolver(), g = ctx.createGain(); g.gain.value = 0;
      this.send.connect(conv); conv.connect(g); g.connect(A.comp);
      return { conv, g, name: null };
    });
    this.cur = 0;
    this.setPreset('open', true);
  }

  // procedurally generated impulse response: shaped noise with an exponential tail, early reflections and optional comb ringing
  ir(name) {
    if (this.irs[name]) return this.irs[name];
    const ctx = this.ctx, P = PRESETS[name], sr = ctx.sampleRate, n = Math.floor(sr * P.len), buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let s = 1234567 + ch * 7919 + name.length * 31;
      const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 * 2 - 1; };
      let lp = 0;
      const k = 0.08 + P.bright * 0.8, pre = Math.floor(P.pre * sr);
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr, env = Math.exp((-6.9 * t) / P.rt);
        lp += (rnd() - lp) * (k * (1 - 0.5 * (t / P.len)));
        d[i] = lp * env * (i - pre < 80 ? (i - pre) / 80 : 1);
      }
      for (const [te, lv] of P.echoes) { const at = Math.floor((te + (ch ? 0.004 : 0)) * sr); for (let j = 0; j < 90 && at + j < n; j++) d[at + j] += rnd() * lv * Math.exp(-j / 30); }
      if (P.comb) { const c = Math.floor(P.comb * sr); for (let i = c; i < n; i++) d[i] += d[i - c] * 0.45; }
      let pk = 1e-6; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
      const norm = 0.7 / Math.sqrt(P.len * 2) / pk * 0.9;
      for (let i = 0; i < n; i++) d[i] *= norm * 3;
    }
    return (this.irs[name] = buf);
  }

  setPreset(name, instant = false) {
    if (name === this.preset && !instant) return;
    const ctx = this.ctx, t = ctx.currentTime, next = instant ? this.cur : 1 - this.cur, from = this.slots[this.cur], to = this.slots[next];
    if (to.name !== name) { to.conv.buffer = this.ir(name); to.name = name; }
    const fade = instant ? 0.01 : this.preset === 'open' ? 0.35 : 1.4;
    to.g.gain.cancelScheduledValues(t); to.g.gain.setTargetAtTime(1, t, fade * 0.4);
    if (!instant) { from.g.gain.cancelScheduledValues(t); from.g.gain.setTargetAtTime(0, t, fade * 0.45); }
    this.cur = next; this.preset = name;
    const P = PRESETS[name];
    this.shelf.gain.setTargetAtTime(P.shelf, t, 0.5); this.mid.gain.setTargetAtTime(P.mid, t, 0.5);
  }

  // measure the surroundings and steer the reverb
  update(game, dt, rain = 0, indoor = false) {
    this.t -= dt;
    const cam = game.camera.position, W = game.world;
    if (this.t <= 0) {
      this.t = 0.12;
      let cover = 0, canyon = 0;
      if (!indoor) {
        const q = [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]];
        let hit = 0;
        for (const [ox, oz] of q) {
          let over = false;
          W.colliders.query(cam.x + ox, cam.z + oz, 1, cam.y + 2.4, cam.y + 16, (c) => {
            if (!c.solid && c.kind !== 'building') return;
            if (c.y0 <= cam.y + 2.2) return;
            const inside = c.type === 'circle' ? Math.hypot(cam.x + ox - c.x, cam.z + oz - c.z) < c.r : Math.abs((cam.x + ox - c.x) * c.cos + (cam.z + oz - c.z) * c.sin) < c.hx && Math.abs(-(cam.x + ox - c.x) * c.sin + (cam.z + oz - c.z) * c.cos) < c.hz;
            if (inside) { over = true; return false; }
          });
          if (over) hit++;
        }
        cover = hit / q.length;
        // walls to both sides within a few metres (urban canyon, tunnel bore)
        const f = game.camera.getWorldDirection(_dir), rx = f.z, rz = -f.x, l = Math.hypot(rx, rz) || 1;
        const side = (s) => 1 - W.colliders.raycast(cam.x, cam.z, cam.x + (rx / l) * 14 * s, cam.z + (rz / l) * 14 * s, cam.y - 0.5, cam.y + 4);
        const a = side(1), b = side(-1);
        canyon = clamp(Math.min(a, b) * 1.6 + Math.max(a, b) * 0.35, 0, 1);
      }
      this.coverT = cover; this.canyonT = canyon;
      const d = W.districtAt(cam.x, cam.z), style = d?.style || '', id = d?.id || '';
      const elev = cam.y;
      let name = 'open';
      if (indoor) name = 'room';
      else if (cover > 0.55 && canyon > 0.35) name = 'tunnel';
      else if (cover > 0.45) name = 'garage';
      else if (canyon > 0.45) name = id === 'industrial' || id === 'harbor' ? 'industrial' : 'city';
      else if (id === 'industrial' && canyon > 0.15) name = 'industrial';
      else if (style === 'hills' || elev > 70) name = 'mountain';
      else if (style === 'forest' || style === 'country') name = 'forest';
      if (name !== this.target) { this.target = name; this.holdT = 0; }
      else this.holdT += 0.12;
      // a short hysteresis stops the reverb flipping when a lamp post passes
      if (this.target !== this.preset && this.holdT > (this.target === 'open' || this.target === 'forest' ? 0.9 : 0.25)) this.setPreset(this.target);
    }
    // smoothed metrics other systems can read
    const kIn = 1 - Math.exp(-dt * 4), kOut = 1 - Math.exp(-dt * 0.9);
    const c = this.coverT || 0, cn = this.canyonT || 0;
    this.cover += (c - this.cover) * (c > this.cover ? kIn : kOut);
    this.canyon += (cn - this.canyon) * (cn > this.canyon ? kIn : kOut);
    this.inside += ((indoor ? 1 : 0) - this.inside) * kIn;
    const P = PRESETS[this.preset];
    this.send.gain.setTargetAtTime(clamp(P.wet * (1 + rain * 0.35), 0, 0.8), this.ctx.currentTime, 0.4);
    // how enclosed it feels: engines get louder and fuller in a tunnel
    this.enclosure = clamp(Math.max(this.cover * (0.5 + this.canyon * 0.5), this.canyon * 0.45, this.inside), 0, 1);
  }
}

const _dir = new THREE.Vector3();
