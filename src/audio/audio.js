import * as THREE from 'three';
import * as SY from './synth.js';
import { VehicleAudio, VOICES } from './vehicleAudio.js';
import { AcousticEnv } from './environment.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const SURF_STEP = ['grass', 'concrete', 'concrete', 'gravel', 'sand', 'sand', 'sand', 'concrete', 'concrete', 'grass'];

export class AudioSystem {
  constructor() {
    this.ctx = null; this.ready = false; this.enabled = true;
    this.vol = { master: 0.8, engine: 0.9, effects: 0.9, music: 0.45, ambience: 0.7, voice: 0.9, radio: 0.8 };
    this.buf = {};
    this.variants = {};
    this.voices = [];
    this.prev = new Map();
    this.stepT = 0; this.gullT = 4; this.birdT = 2; this.siren = new Map(); this.uwK = 0; this.slapT = 1; this.bellT = 3; this.fogT = 12; this.bubT = 1;
    this.hornOn = false; this.startT = 0;
    this.loadingPromise = null;
    this.state = { skid: 0, wind: 0, road: 0, rain: 0 };
    this.zone = { city: 0.5, forest: 0, sea: 0, night: 0, rain: 0 };
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.mutedByFocus = false;
  }

  // builds the graph and synthesizes samples; the context stays suspended until a user gesture calls resume()
  init() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master = ctx.createGain(); this.master.gain.value = this.vol.master;
      // everything passes a lowpass that closes under water
      this.comp = comp;
      this.uw = ctx.createBiquadFilter(); this.uw.type = 'lowpass'; this.uw.frequency.value = 20000; this.uw.Q.value = 0.7;
      comp.connect(this.uw); this.uw.connect(this.master); this.master.connect(ctx.destination);
      // vehicles and effects pass through the acoustic environment (EQ + reverb for tunnels, garages, canyons); voice, music, ambience and UI stay dry
      this.env = new AcousticEnv(this);
      this.bus = {};
      for (const k of ['engine', 'sfx', 'voice', 'amb', 'music', 'ui', 'tires']) { const g = ctx.createGain(); g.connect(k === 'engine' || k === 'sfx' || k === 'tires' ? this.env.input : comp); this.bus[k] = g; }
      this.veh = new VehicleAudio(this);
      this.setVolumes(this.vol);
      this.listener = ctx.listener;
      this.buildLoops();
      this.loadingPromise = this.renderSamples();
      try {
        await ctx.audioWorklet.addModule(new URL('./engine.worklet.js', import.meta.url).href);
        this.bankNode = new AudioWorkletNode(ctx, 'engine-bank', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { voices: VOICES } });
        this.bankNode.connect(this.bus.engine);
      } catch (e) { console.warn('engine worklet unavailable', e); this.bankNode = null; }
      await this.loadingPromise;
    })();
    return this.initPromise;
  }

  // must be called from a user gesture
  async unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch (e) { console.warn(e); } }
    return this.initPromise;
  }

  setVolumes(v) {
    Object.assign(this.vol, v || {});
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (g, val) => g.gain.setTargetAtTime(val, t, 0.05);
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    set(this.bus.engine, this.vol.engine); set(this.bus.tires, this.vol.effects); set(this.bus.sfx, this.vol.effects); set(this.bus.voice, this.vol.voice);
    set(this.bus.amb, this.vol.ambience); set(this.bus.music, this.vol.music * this.vol.radio); set(this.bus.ui, this.vol.effects);
  }

  // k 0..1: how far under the surface the listener is
  setUnderwater(k) {
    this.uwK = k;
    if (!this.ctx || !this.uw) return;
    const f = Math.exp(Math.log(20000) + (Math.log(380) - Math.log(20000)) * k);
    this.uw.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.06);
  }

  toBuffer(arr, sr = this.ctx.sampleRate) { const b = this.ctx.createBuffer(1, arr.length, sr); b.copyToChannel(arr, 0); return b; }

  renderSamples() {
    return new Promise((resolve) => {
      const sr = 32000;
      this.loops = {};
      let w;
      try { w = new Worker(new URL('./synth.worker.js', import.meta.url), { type: 'module' }); } catch (e) { console.warn('audio worker unavailable', e); resolve(); return; }
      this.sampleWorker = w;
      w.onmessage = (e) => {
        const m = e.data;
        if (m.done) { w.terminate(); this.sampleWorker = null; this.startLoops(); this.ready = true; resolve(); return; }
        const bufs = m.arrs.map((a) => this.toBuffer(a, sr));
        if (m.kind === 'many') this.variants[m.name] = bufs;
        else if (m.kind === 'put') this.buf[m.name] = bufs[0];
        else this.loops[m.name] = bufs[0];
      };
      w.onerror = (e) => { console.warn('audio worker error', e.message); resolve(); };
      w.postMessage({ sr });
    });
  }

  // ---- continuous layers ----
  buildLoops() {
    const ctx = this.ctx;
    this.L = {};
    const mkLayer = (bus) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(bus); return g; };
    this.L.wind = { out: mkLayer(this.bus.amb) }; this.L.road = { out: mkLayer(this.bus.tires) }; this.L.squeal = { out: mkLayer(this.bus.tires) }; this.L.grit = { out: mkLayer(this.bus.tires) };
    this.L.city = { out: mkLayer(this.bus.amb) }; this.L.sea = { out: mkLayer(this.bus.amb) }; this.L.forest = { out: mkLayer(this.bus.amb) }; this.L.rain = { out: mkLayer(this.bus.amb) }; this.L.night = { out: mkLayer(this.bus.amb) };
    this.L.gale = { out: mkLayer(this.bus.amb) }; this.L.swell = { out: mkLayer(this.bus.amb) }; this.L.surf = { out: mkLayer(this.bus.amb) }; this.L.wake = { out: mkLayer(this.bus.tires) }; this.L.under = { out: mkLayer(this.bus.amb) }; this.L.spray = { out: mkLayer(this.bus.tires) };
    this.L.brake = { out: mkLayer(this.bus.tires) }; this.L.roof = { out: mkLayer(this.bus.amb) };
    this.L.hornG = mkLayer(this.bus.sfx);
  }

  startLoops() {
    if (this.loopsOn) return;
    this.loopsOn = true;
    const ctx = this.ctx, Lp = this.loops, L = this.L;
    const src = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * buf.duration); return s; };
    const chain = (buf, out, nodes = []) => { const s = src(buf); let n = s; for (const f of nodes) { n.connect(f); n = f; } n.connect(out); return s; };
    const bq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    L.wind.lp = bq('lowpass', 1200); L.wind.src = chain(Lp.wind, L.wind.out, [L.wind.lp]);
    L.road.lp = bq('lowpass', 500); L.road.src = chain(Lp.pink, L.road.out, [L.road.lp]);
    L.squeal.bp = bq('bandpass', 1500, 9); L.squeal.bp2 = bq('bandpass', 2600, 6); L.squeal.src = src(Lp.white); L.squeal.src.connect(L.squeal.bp); L.squeal.src.connect(L.squeal.bp2); L.squeal.bp.connect(L.squeal.out); L.squeal.bp2.connect(L.squeal.out);
    L.grit.lp = bq('lowpass', 2400, 0.5); L.grit.src = chain(Lp.pink, L.grit.out, [L.grit.lp]);
    L.city.lp = bq('lowpass', 420); L.city.src = chain(Lp.pink, L.city.out, [L.city.lp]);
    L.sea.src = chain(Lp.waves, L.sea.out);
    L.forest.hp = bq('highpass', 300); L.forest.lp = bq('lowpass', 2500); L.forest.src = chain(Lp.pink, L.forest.out, [L.forest.hp, L.forest.lp]);
    L.rain.src = chain(Lp.rain, L.rain.out);
    L.night.src = chain(this.buf.cricket, L.night.out);
    L.gale.hp = bq('highpass', 120); L.gale.lp = bq('lowpass', 900); L.gale.src = chain(Lp.wind, L.gale.out, [L.gale.hp, L.gale.lp]);
    L.swell.lp = bq('lowpass', 150); L.swell.src = chain(Lp.pink, L.swell.out, [L.swell.lp]);
    L.surf.hp = bq('highpass', 500); L.surf.lp = bq('lowpass', 5200); L.surf.src = chain(Lp.waves, L.surf.out, [L.surf.hp, L.surf.lp]);
    L.wake.hp = bq('highpass', 1800); L.wake.lp = bq('lowpass', 7000); L.wake.src = chain(Lp.white, L.wake.out, [L.wake.hp, L.wake.lp]);
    L.spray.hp = bq('highpass', 2200); L.spray.lp = bq('lowpass', 9000); L.spray.src = chain(Lp.white, L.spray.out, [L.spray.hp, L.spray.lp]);
    L.brake.bp = bq('bandpass', 3600, 1.4); L.brake.src = chain(Lp.white, L.brake.out, [L.brake.bp]);
    L.roof.lp = bq('lowpass', 1700, 0.5); L.roof.src = chain(Lp.rain, L.roof.out, [L.roof.lp]);
    L.under.lp = bq('lowpass', 180); L.under.src = chain(Lp.pink, L.under.out, [L.under.lp]);
  }

  // ---- one shots ----
  pick(name) { const v = this.variants[name]; return v ? v[(Math.random() * v.length) | 0] : this.buf[name]; }

  // opts: { vol, rate, pos {x,y,z}, bus, delay, refDist }
  play(name, o = {}) {
    if (!this.ready || !this.enabled) return null;
    const buf = typeof name === 'string' ? this.pick(name) : name;
    if (!buf) return null;
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = buf;
    s.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.jitter ?? 0.06));
    const g = ctx.createGain(); g.gain.value = o.vol ?? 1;
    let node = s; node.connect(g); node = g;
    if (o.pos) {
      const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = o.refDist || 6; p.rolloffFactor = o.rolloff ?? 1.15; p.maxDistance = 600;
      p.positionX.value = o.pos.x; p.positionY.value = o.pos.y ?? 1; p.positionZ.value = o.pos.z;
      node.connect(p); node = p;
    }
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    node.connect(this.bus[o.bus || 'sfx']);
    s.start(ctx.currentTime + (o.delay || 0));
    return s;
  }

  ui(kind) { this.play('ui_' + kind, { bus: 'ui', vol: 0.55, jitter: 0.02 }); }

  crash(impact, pos, kind = 'vehicle', mat = 'metal') {
    const p = clamp(impact / 14, 0.15, 1.6);
    const wall = kind === 'building' || kind === 'wall' || mat === 'concrete' || mat === 'brick';
    const name = impact < 5 ? 'crash_light' : wall && impact > 8 ? 'crash_wall' : impact < 9 ? 'crash_light' : 'crash_metal';
    this.play(name, { vol: clamp(0.35 + p * 0.6, 0.2, 1.3), pos, rate: 1.05 - p * 0.15, refDist: 8 });
    if (impact > 5) this.play('thud', { vol: clamp(p * 0.9, 0.2, 1), pos, rate: 0.9 });
    if (impact > 12 || (kind === 'vehicle' && impact > 8 && Math.random() < 0.5)) this.play('glass', { vol: clamp(p * 0.55, 0.2, 0.8), pos, delay: 0.03, refDist: 8 });
  }

  scream(pos, female = Math.random() < 0.5, big = 1) {
    this.play(female ? 'scream_f' : 'scream_m', { vol: 0.85 * big, pos, bus: 'voice', refDist: 5, rolloff: 0.9, jitter: 0.1, rate: 1 + (Math.random() - 0.5) * 0.12 });
  }
  shout(pos, female) { this.play(female ? 'shout_f' : 'shout_m', { vol: 0.6, pos, bus: 'voice', refDist: 6, jitter: 0.12 }); }
  pedHit(pos, female, fatal = false) {
    this.play('bodyhit', { vol: 0.95, pos, refDist: 5 });
    this.play(female ? 'grunt_f' : 'grunt_m', { vol: 0.6, pos, bus: 'voice', delay: 0.03, refDist: 5 });
    if (!fatal) this.play(female ? 'scream_f' : 'scream_m', { vol: 0.9, pos, bus: 'voice', delay: 0.14 + Math.random() * 0.12, refDist: 5, rolloff: 0.85, jitter: 0.1 });
    else this.play('gasp', { vol: 0.5, pos, bus: 'voice', delay: 0.12, refDist: 5 });
  }
  splash(pos, big) { this.play(big ? 'splashBig' : 'splash', { vol: big ? 1 : 0.7, pos, refDist: 8 }); }
  door(close, pos) { this.play(close ? 'doorClose' : 'doorOpen', { vol: 0.75, pos, refDist: 4 }); }
  horn(v, on) {
    if (!this.ready) return;
    const id = v.id ?? 0, h = this.horns || (this.horns = new Map());
    let e = h.get(id);
    if (on) {
      if (e) return;
      const ctx = this.ctx, g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.5, ctx.currentTime, 0.008);
      const big = v.def && (v.def.body.style === 'bus' || v.def.body.style === 'truck' || v.isBoat);
      const src = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
      const a = src(big ? this.buf.boatHorn : this.buf.hornA), b = big ? null : src(this.buf.hornB);
      a.connect(g); if (b) b.connect(g);
      let node = g;
      if (v.pos) { const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.refDistance = 8; p.positionX.value = v.x; p.positionY.value = v.y + 1; p.positionZ.value = v.z; g.connect(p); node = p; e = { g, a, b, p }; } else e = { g, a, b };
      node.connect(this.bus.sfx);
      h.set(id, e);
    } else if (e) {
      const t = this.ctx.currentTime; e.g.gain.setTargetAtTime(0, t, 0.02);
      const s = e; setTimeout(() => { try { s.a.stop(); s.b?.stop(); } catch { /* stopped */ } }, 200);
      h.delete(id);
    }
  }

  // ---- siren: oscillator pair with wail/yelp sweep ----
  sirenOn(v, on, pos) {
    if (!this.ready) return;
    let s = this.siren.get(v.id);
    if (on && !s) {
      const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o2.type = 'square'; g.gain.value = 0; lp.type = 'lowpass'; lp.frequency.value = 2400;
      o.connect(lp); o2.connect(lp); lp.connect(g);
      const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.refDistance = 12; p.rolloffFactor = 1; p.maxDistance = 900; g.connect(p); p.connect(this.bus.sfx);
      o.start(); o2.start(); g.gain.setTargetAtTime(0.11, ctx.currentTime, 0.1);
      s = { o, o2, g, p, t: Math.random() * 10 };
      this.siren.set(v.id, s);
    } else if (!on && s) {
      s.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      const x = s; setTimeout(() => { try { x.o.stop(); x.o2.stop(); } catch { /* stopped */ } }, 500);
      this.siren.delete(v.id);
    }
    if (s && pos) { s.p.positionX.value = pos.x; s.p.positionY.value = pos.y + 2; s.p.positionZ.value = pos.z; }
    return s;
  }

  // ---- per-frame ----
  update(game, dt) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const cam = game.camera, P0 = game.player, pv = P0.vehicle;
    // listener follows the camera
    const L = this.listener;
    if (L.positionX) {
      L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z;
      const f = _f.set(0, 0, -1).applyQuaternion(cam.quaternion), u = _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z;
    }
    this.listenerPos.x = cam.position.x; this.listenerPos.y = cam.position.y; this.listenerPos.z = cam.position.z;
    const mode = game.rig.mode;
    const interior = pv && mode === 'cockpit';
    const semi = pv && (mode === 'hood' || mode === 'bumper');
    const sky = game.sky;
    // -------- vehicles: engines, tyres, wind, brakes (vehicleAudio.js) and the acoustic environment (environment.js) --------
    this.env.update(game, dt, this.zone.rain, !!game.indoor);
    this.veh.update(game, dt, { interior, semi, enclosure: this.env.enclosure, inside: this.env.inside });
    this.startT = Math.max(0, this.startT - dt);
    // horns and sirens
    for (const v of game.vehicles) {
      const dx = v.x - cam.position.x, dz = v.z - cam.position.z, near = dx * dx + dz * dz < 250 * 250;
      this.horn(v, !!v.horn && near);
      const sr = near && !!(v.lights && v.lights.bar && v.lights.siren);
      const s = this.sirenOn(v, sr, { x: v.x, y: v.y, z: v.z });
      if (s) { s.t += dt; const w = 0.5 + 0.5 * Math.sin(s.t * 2.6 - 1.57), yelp = Math.sin(s.t * 0.4) > 0.6 ? 1 : 0; const f = yelp ? 900 + 500 * (0.5 + 0.5 * Math.sin(s.t * 14)) : 620 + 640 * w; s.o.frequency.setTargetAtTime(f, t, 0.02); s.o2.frequency.setTargetAtTime(f * 2.01, t, 0.02); }
    }
    const S = this.state, L2 = this.L;
    const set = (g, v, tc = 0.06) => g.gain.setTargetAtTime(v, t, tc);
    // tick of indicators
    if (pv) {
      const v = pv, l = v.lights, on = (l.indL || l.indR || l.hazard);
      const ph = Math.sin(performance.now() / 1000 * 9) > 0;
      if (on && ph !== this._blink) { this._blink = ph; this.play(ph ? 'tickHi' : 'tickLo', { vol: 0.22, bus: 'ui', jitter: 0 }); }
    }
    // -------- ambience mix from location --------
    const Z = this.zone;
    const px = cam.position.x, pz = cam.position.z;
    const w = game.world;
    const d = w.districtAt(px, pz).id;
    const built = d === 'cbd' || d === 'oldtown' || d === 'industrial' || d === 'harbor' || d === 'eastside' || d === 'marlow';
    const rainI = sky.w.rain || 0;
    const seaD = game.sea ? game.sea.distanceToSea(px, pz) : Math.max(0, px - -1062);
    const tCity = built ? (d === 'cbd' ? 1 : d === 'eastside' ? 0.5 : 0.75) : 0.12;
    const tSea = clamp(1 - seaD / 420, 0, 1);
    const tForest = built ? 0 : clamp(0.4 + (w.terrain.height(px, pz) > 6 ? 0.5 : 0.2), 0, 1);
    const tNight = sky.night;
    const k = 1 - Math.exp(-dt * 0.6);
    Z.city += (tCity - Z.city) * k; Z.sea += (tSea - Z.sea) * k; Z.forest += (tForest - Z.forest) * k; Z.night += (tNight - Z.night) * k; Z.rain += (rainI - Z.rain) * k;
    const inside = (interior ? 0.5 : 1) * (1 - 0.7 * this.env.inside);
    set(L2.city.out, (0.06 + Z.city * 0.22) * (1 - Z.night * 0.4) * inside, 0.4); L2.city.lp.frequency.setTargetAtTime(280 + Z.city * 500, t, 0.4);
    const wv = game.world.sea?.waves, U = sky.wind?.speed || 0, hs = wv ? wv.hs : 0, rough = clamp(hs / 4, 0, 1), uwK = this.uwK;
    set(L2.sea.out, Z.sea * (0.3 + 0.7 * rough) * 0.55 * inside * (1 - 0.7 * uwK), 0.5);
    set(L2.swell.out, Z.sea * Math.pow(rough, 1.2) * 0.5 * inside * (1 - 0.5 * uwK), 0.6);
    set(L2.surf.out, clamp(1 - seaD / 90, 0, 1) * (0.15 + 0.85 * rough) * 0.45 * inside * (1 - uwK), 0.5);
    set(L2.gale.out, Math.pow(clamp((U - 4) / 16, 0, 1), 1.3) * 0.5 * inside * (1 - uwK), 0.5); L2.gale.lp.frequency.setTargetAtTime(500 + U * 60 + Math.sin(t * 0.7) * 120, t, 0.3);
    set(L2.under.out, uwK * 0.3, 0.2);
    set(L2.forest.out, Z.forest * 0.13 * (1 - Z.rain * 0.4) * inside, 0.5);
    const bikeView = pv && pv.def.body.style === 'bike';
    set(L2.rain.out, Z.rain * 0.5 * (interior ? 0.55 : 1) * (1 - 0.6 * this.env.inside) * (1 - uwK), 0.4);
    // rain drumming on the roof in a closed cabin, on the helmet on a bike; a duller patter in a covered street
    set(L2.roof.out, (Z.rain * (interior ? 0.55 : bikeView && mode === 'cockpit' ? 0.2 : 0) + Z.rain * this.env.inside * 0.3) * (1 - uwK), 0.4);
    L2.roof.lp.frequency.setTargetAtTime(interior ? 1500 : 2600, t, 0.4);
    set(L2.night.out, Z.night * Z.forest * 0.3, 0.6);
    // random natural one-shots
    this.gullT -= dt; this.birdT -= dt;
    if (this.gullT <= 0) { this.gullT = 3 + Math.random() * 8; if (Z.sea > 0.35) { const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 70; this.play('gull', { vol: 0.35 * Z.sea, pos: { x: px + Math.cos(a) * r, y: 20 + Math.random() * 20, z: pz + Math.sin(a) * r }, refDist: 20 }); } }
    if (this.birdT <= 0) { this.birdT = 1.2 + Math.random() * 4; if (Z.forest > 0.3 && Z.night < 0.5 && Z.rain < 0.6) { const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 45; this.play('bird', { vol: 0.35 * Z.forest, pos: { x: px + Math.cos(a) * r, y: 5 + Math.random() * 8, z: pz + Math.sin(a) * r }, refDist: 8 }); } }
    // sea state one-shots: thunder, hull slaps, buoy bells, fog horns, bubbles under water
    for (const e of sky.events) if (e.type === 'thunder') this.play('thunder', { vol: 0.8, delay: e.delay, bus: 'sfx' });
    sky.events.length = 0;
    this.slapT -= dt; this.bellT -= dt; this.fogT -= dt; this.bubT -= dt;
    if (pv && pv.isBoat && this.slapT <= 0 && pv.phys.speed > 4 && hs > 0.7 && pv.phys.wetN > 0) { this.slapT = 0.5 + Math.random() * 1.2 / (0.5 + hs); this.play('splash', { vol: 0.1 + 0.06 * hs, rate: 0.9 + Math.random() * 0.4, pos: { x: pv.x + Math.sin(pv.yaw) * pv.def.body.L * 0.3, y: pv.y, z: pv.z + Math.cos(pv.yaw) * pv.def.body.L * 0.3 }, refDist: 4 }); }
    if (this.bellT <= 0) { this.bellT = 3 + Math.random() * 5; if (Z.sea > 0.4 && hs > 1.4 && !uwK) { const a = Math.random() * 6.283, r = 120 + Math.random() * 220; this.play('bell', { vol: 0.2 * Math.min(1, hs / 3), rate: 0.95 + Math.random() * 0.1, pos: { x: px + Math.cos(a) * r, y: 2, z: pz + Math.sin(a) * r }, refDist: 40 }); } }
    if (this.fogT <= 0) { this.fogT = 20 + Math.random() * 12; if (Z.sea > 0.3 && sky.w.fog > 0.004 && !uwK) { const a = Math.random() * 6.283, r = 300 + Math.random() * 500; this.play('foghorn', { vol: 0.5, pos: { x: px + Math.cos(a) * r, y: 6, z: pz + Math.sin(a) * r }, refDist: 90 }); } }
    if (this.bubT <= 0) { this.bubT = 0.7 + Math.random() * 1.8; if (uwK > 0.5) this.play('bubble', { vol: 0.3, rate: 0.8 + Math.random() * 0.8, bus: 'sfx' }); }
    // on-foot steps
    if (!pv && P0.speed > 0.4 && P0.onGround !== false) {
      this.stepT -= dt * (P0.speed / 2.2);
      if (this.stepT <= 0) { this.stepT = 0.5; const surf = SURF_STEP[w.terrain.surfAt(P0.x, P0.z)] || 'concrete'; this.play('step_' + surf, { vol: clamp(0.25 + P0.speed * 0.07, 0.2, 0.7), pos: { x: P0.x, y: P0.y, z: P0.z }, refDist: 3, rolloff: 1.5 }); }
    } else this.stepT = 0;
  }

  // on-foot jump, landing and vault sounds, by the surface underfoot
  footImpact(surf, pos, power, kind = 'land') {
    if (!this.ready) return;
    const name = 'step_' + (SURF_STEP[surf] || 'concrete');
    if (kind === 'jump') { this.play(name, { vol: 0.2 + power * 0.1, pos, refDist: 3, rate: 1.25 }); return; }
    this.play(name, { vol: clamp(0.3 + power * 0.07, 0.3, 0.9), pos, refDist: 4, rate: 0.8 });
    if (power > 3) this.play('thud', { vol: clamp(power * 0.06, 0.1, 0.5), pos, rate: 1.1, refDist: 4, delay: 0.02 });
    if (kind === 'vault') this.play('bodyhit', { vol: 0.12, pos, rate: 1.6, refDist: 3, delay: 0.05 });
  }

  // called when the player sits in
  engineStart(v) {
    if (!this.ready) return;
    this.play('starter', { vol: 0.28, pos: v ? { x: v.x, y: v.y, z: v.z } : undefined, refDist: 3, jitter: 0.02 });
    this.startT = 1.15;
  }
}

const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
