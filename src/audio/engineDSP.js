// Physical-modelling engine synthesizer shared by the AudioWorklet and the ScriptProcessor fallback.
// Each cylinder firing launches a damped resonant burst (block thump, exhaust body, mid bark, top edge); overlapping bursts at the firing
// rate form the engine tone, so pitch follows rpm while the resonances stay fixed like a real exhaust.
export const STRIDE = 14;
// param slots
export const P = { active: 0, rpm: 1, load: 2, gain: 3, pan: 4, cyl: 5, rough: 6, pitch: 7, kind: 8, lp: 9, turbo: 10, cut: 11, whine: 12, whineHz: 13 };

const COMP = 4;

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// [freq Hz, tau ms, amplitude] per resonance for each engine character
function combustion(kind, pit, load, rn) {
  if (kind === 1) return [[60 * pit, 22, 1.0], [150 * pit, 12, 0.7], [470 * pit, 6, 0.55 * (0.4 + load)], [1900, 2.2, 0.32]];
  if (kind === 2) return [[95 * pit, 9, 0.7], [310 * pit, 5.5, 0.85], [980 * pit, 3.2, 0.6 * (0.5 + load)], [2800, 1.6, 0.35 * (0.3 + rn)]];
  if (kind === 3) return [[52 * pit, 24, 1.05], [128 * pit, 15, 0.85], [390 * pit, 8, 0.6 * (0.4 + load)], [1250, 3, 0.28 * (0.3 + load)]];
  return [[74 * pit, 16, 0.9], [196 * pit, 10, 0.75], [640 * pit, 5.5, 0.55 * (0.35 + load * 0.9)], [2100, 2.4, 0.3 * (0.2 + load) * (0.5 + rn)]];
}

class Voice {
  constructor(sr, seed) {
    this.sr = sr;
    this.r = rng(seed * 2654435761);
    this.y1 = new Float32Array(COMP); this.y2 = new Float32Array(COMP);
    this.a1 = new Float32Array(COMP); this.a2 = new Float32Array(COMP); this.g = new Float32Array(COMP);
    this.fire = 0; this.n1 = 0; this.lp = 0; this.lp2 = 0;
    this.whine = 0; this.turboPh = 0;
    this.popT = 0; this.limT = 0; this.cylN = 0;
  }

  tune(p) {
    const sr = this.sr, load = p[P.load], rn = Math.min(1, p[P.rpm] / 9000);
    const comps = combustion(p[P.kind], p[P.pitch] || 1, load, rn);
    for (let c = 0; c < COMP; c++) {
      const f = comps[c][0], tau = comps[c][1] * 0.001 * (0.85 + 0.3 * (1 - rn)), th = (Math.PI * 2 * f) / sr, rr = Math.exp(-1 / (tau * sr));
      this.a1[c] = 2 * rr * Math.cos(th); this.a2[c] = -rr * rr; this.g[c] = comps[c][2] * Math.sin(th) * 2.2;
    }
  }

  spawn(p, energy) {
    const kind = p[P.kind], load = p[P.load], rough = p[P.rough];
    const jitter = 1 + (this.r() - 0.5) * rough * 0.5;
    this.cylN = (this.cylN + 1) % Math.max(1, p[P.cyl] | 0 || 4);
    const sig = kind === 3 ? (this.cylN % 4 === 0 ? 1.25 : this.cylN % 4 === 2 ? 0.8 : 1) : 1;
    const amp = energy * jitter * sig * (0.28 + 0.72 * load);
    for (let c = 0; c < COMP; c++) this.y1[c] += this.g[c] * amp;
  }

  render(L, R, n, s, cur, tgt, blend) {
    const sr = this.sr;
    const rpm0 = cur[P.rpm], rpm1 = cur[P.rpm] + (tgt[P.rpm] - cur[P.rpm]) * blend;
    const load = cur[P.load] + (tgt[P.load] - cur[P.load]) * blend; cur[P.load] = load;
    const lp = cur[P.lp] + (tgt[P.lp] - cur[P.lp]) * blend; cur[P.lp] = lp;
    const gain0 = cur[P.gain], gain1 = cur[P.gain] + (tgt[P.gain] - cur[P.gain]) * blend;
    cur[P.rpm] = rpm1; cur[P.gain] = gain1;
    cur[P.pan] += (tgt[P.pan] - cur[P.pan]) * blend;
    cur[P.turbo] += (tgt[P.turbo] - cur[P.turbo]) * blend;
    cur[P.whine] += (tgt[P.whine] - cur[P.whine]) * blend; cur[P.whineHz] += (tgt[P.whineHz] - cur[P.whineHz]) * blend;
    cur[P.cyl] = tgt[P.cyl]; cur[P.rough] = tgt[P.rough]; cur[P.pitch] = tgt[P.pitch]; cur[P.kind] = tgt[P.kind]; cur[P.cut] = tgt[P.cut];
    this.tune(cur);
    const pan = cur[P.pan], gL = Math.cos((pan * 0.5 + 0.5) * Math.PI * 0.5), gR = Math.sin((pan * 0.5 + 0.5) * Math.PI * 0.5);
    const kind = cur[P.kind], cyl = Math.max(1, cur[P.cyl]);
    const rnorm = Math.min(1, rpm1 / 8000);
    const noiseA = (0.008 + 0.055 * load * load) * (0.3 + rnorm) * (kind === 2 ? 1.3 : 1);
    const nlp = Math.min(0.9, ((500 + rpm1 * 0.55) / sr) * 6.28);
    const lpc = Math.min(0.98, 0.05 + lp * 0.93);
    const turbo = cur[P.turbo], whine = cur[P.whine], whineW = (Math.PI * 2 * cur[P.whineHz]) / sr;
    const cut = cur[P.cut] > 0.5, decel = load < 0.1 && rpm1 > 2200, rough = cur[P.rough];
    const a1 = this.a1, a2 = this.a2, y1 = this.y1, y2 = this.y2;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const rpm = rpm0 + (rpm1 - rpm0) * t;
      this.fire += ((rpm / 60) * (cyl / 2)) / sr;
      if (this.fire >= 1) {
        this.fire -= 1;
        if (this.limT > 0) this.limT--; else this.spawn(cur, 0.5 + 0.5 * Math.min(1, rpm / 6000));
        if (cut) this.limT = Math.round(sr / 24);
      }
      if (decel && rough > 0.25) {
        this.popT -= 1;
        if (this.popT <= 0) { this.popT = (sr * (0.05 + this.r() * 0.35)) / (0.4 + rough); if (this.r() < 0.5 * rough) this.spawn(cur, 1.6 + this.r()); }
      }
      let out = 0;
      for (let c = 0; c < COMP; c++) {
        const y = a1[c] * y1[c] + a2[c] * y2[c];
        y2[c] = y1[c]; y1[c] = y;
        out += y;
      }
      out *= 0.5;
      const nz = this.r() * 2 - 1;
      this.n1 += (nz - this.n1) * nlp;
      out += this.n1 * noiseA * 2.4;
      if (whine > 0.002) { this.whine += whineW; if (this.whine > 6.2832) this.whine -= 6.2832; out += Math.sin(this.whine) * whine * 0.04; }
      if (turbo > 0.01) { this.turboPh += (Math.PI * 2 * (1800 + turbo * 5200)) / sr; if (this.turboPh > 6.2832) this.turboPh -= 6.2832; out += Math.sin(this.turboPh) * turbo * 0.02 * (0.3 + load); }
      out = Math.tanh(out * 1.35);
      this.lp += (out - this.lp) * lpc;
      this.lp2 += (this.lp - this.lp2) * Math.min(1, lpc * 1.1);
      const g = gain0 + (gain1 - gain0) * t;
      L[s + i] += this.lp2 * g * gL * 1.4; R[s + i] += this.lp2 * g * gR * 1.4;
    }
  }
}

export class EngineBank {
  constructor(sr, nVoices = 6) {
    this.sr = sr; this.nv = nVoices;
    this.voices = Array.from({ length: nVoices }, (_, i) => new Voice(sr, i + 1));
    this.cur = Array.from({ length: nVoices }, () => new Float32Array(STRIDE));
    this.tgt = Array.from({ length: nVoices }, () => new Float32Array(STRIDE));
    for (const c of this.cur) { c[P.cyl] = 4; c[P.pitch] = 1; c[P.rpm] = 800; c[P.lp] = 1; }
  }

  setParams(arr) {
    for (let v = 0; v < this.nv; v++) {
      const o = v * STRIDE;
      if (o + STRIDE > arr.length) break;
      const t = this.tgt[v];
      for (let k = 0; k < STRIDE; k++) t[k] = arr[o + k];
      if (t[P.active] > 0.5 && this.cur[v][P.gain] < 1e-4) { this.cur[v][P.rpm] = t[P.rpm]; this.cur[v][P.pan] = t[P.pan]; this.cur[v][P.lp] = t[P.lp]; this.cur[v][P.load] = t[P.load]; }
    }
  }

  process(L, R, n) {
    for (let v = 0; v < this.nv; v++) {
      const t = this.tgt[v], c = this.cur[v];
      if (t[P.active] < 0.5 && c[P.gain] < 1e-4) continue;
      const g = t[P.active] > 0.5 ? t[P.gain] : 0;
      const save = t[P.gain]; t[P.gain] = g;
      this.voices[v].render(L, R, n, 0, c, t, 0.22);
      t[P.gain] = save;
    }
  }
}
