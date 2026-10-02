// Physical-modelling engine synthesizer shared by the AudioWorklet and the ScriptProcessor fallback.
// Each cylinder firing launches a damped resonant burst (exhaust thump, exhaust body, mid bark, top edge, cabin boom); overlapping bursts at
// the firing rate form the engine tone, so pitch follows rpm while the resonances stay fixed like a real exhaust. On top of that every voice
// has an intake roar, turbo whistle with blow-off, gearbox/chain whine, tyre noise, shift transients (fuel cut, clunk, bang), overrun
// crackle and a starter-motor crank. Far voices (lod 1 and 2) skip the expensive layers.
export const STRIDE = 25;
// param slots
export const P = {
  active: 0, rpm: 1, load: 2, gain: 3, pan: 4, cyl: 5, rough: 6, pitch: 7, kind: 8, lp: 9, turbo: 10, cut: 11, whine: 12, whineHz: 13,
  exhaust: 14, intake: 15, trans: 16, shift: 17, tire: 18, tireHz: 19, cabin: 20, lod: 21, crank: 22, chain: 23, block: 24,
};

// engine kinds: 0 inline-4, 1 diesel / heavy, 2 small single-twin / light engine, 3 V8 / jet, 4 sport-bike inline-4, 5 V-twin cruiser,
// 6 three-cylinder, 7 exotic high-rev (V10 / V12 / flat-six), 8 smooth six
const COMP = 5;
const TWO_PI = Math.PI * 2;

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// [freq Hz, tau ms, amplitude] per resonance for each engine character
function combustion(kind, pit, load, rn) {
  switch (kind) {
    case 1: return [[60 * pit, 22, 1.0], [150 * pit, 12, 0.7], [470 * pit, 6, 0.55 * (0.4 + load)], [1900, 2.2, 0.55 * (0.25 + load)]];
    case 2: return [[95 * pit, 9, 0.7], [310 * pit, 5.5, 0.85], [980 * pit, 3.2, 0.6 * (0.5 + load)], [2800, 1.6, 0.35 * (0.3 + rn)]];
    case 3: return [[52 * pit, 24, 1.05], [128 * pit, 15, 0.85], [390 * pit, 8, 0.6 * (0.4 + load)], [1250, 3, 0.28 * (0.3 + load)]];
    case 4: return [[120 * pit, 7, 0.55], [380 * pit, 4.5, 0.8], [1250 * pit, 2.8, 0.78 * (0.45 + load)], [3600, 1.4, 0.55 * (0.3 + load)]];
    case 5: return [[46 * pit, 28, 1.15], [108 * pit, 17, 0.95], [300 * pit, 9, 0.6 * (0.4 + load)], [900, 3.5, 0.3 * (0.3 + load)]];
    case 6: return [[85 * pit, 12, 0.8], [230 * pit, 8, 0.8], [780 * pit, 4.5, 0.6 * (0.4 + load)], [2600, 2, 0.35 * (0.3 + load)]];
    case 7: return [[90 * pit, 10, 0.6], [270 * pit, 7, 0.8], [940 * pit, 4, 0.82 * (0.5 + load)], [3300, 1.8, 0.58 * (0.3 + load)]];
    case 8: return [[66 * pit, 18, 0.95], [170 * pit, 11, 0.8], [560 * pit, 6, 0.55 * (0.4 + load * 0.9)], [1900, 2.6, 0.3 * (0.2 + load) * (0.5 + rn)]];
    default: return [[74 * pit, 16, 0.9], [196 * pit, 10, 0.75], [640 * pit, 5.5, 0.55 * (0.35 + load * 0.9)], [2100, 2.4, 0.3 * (0.2 + load) * (0.5 + rn)]];
  }
}

// firing-order character: interval (relative to even firing) and strength of each successive cylinder
const PATTERN = {
  0: { int: [1], amp: [1] },
  1: { int: [1, 1, 1, 1], amp: [1.1, 0.9, 1.05, 0.95] },
  2: { int: [1, 1], amp: [1.1, 0.9] },
  3: { int: [1, 1, 1, 1, 1, 1, 1, 1], amp: [1.3, 0.8, 1.1, 0.85, 1.25, 0.8, 1.05, 0.9] },
  4: { int: [1], amp: [1] },
  5: { int: [0.875, 1.125], amp: [1.25, 0.85] },
  6: { int: [1, 1, 1], amp: [1.1, 1, 0.9] },
  7: { int: [1], amp: [1, 0.96] },
  8: { int: [1, 1, 1, 1, 1, 1], amp: [1, 0.95, 1.05, 0.97, 1.03, 0.94] },
};

class Voice {
  constructor(sr, seed) {
    this.sr = sr;
    this.r = rng(seed * 2654435761);
    this.y1 = new Float32Array(COMP); this.y2 = new Float32Array(COMP);
    this.a1 = new Float32Array(COMP); this.a2 = new Float32Array(COMP); this.g = new Float32Array(COMP);
    this.fire = 0; this.n1 = 0; this.lp = 0; this.lp2 = 0;
    this.whine = 0; this.whine2 = 0; this.turboPh = 0; this.turbo2 = 0;
    this.popT = 0; this.limT = 0; this.cylN = 0;
    // layers
    this.iy1 = 0; this.iy2 = 0; this.ia1 = 0; this.ia2 = 0; this.ig = 0; this.ienv = 0;       // intake resonator
    this.by1 = 0; this.by2 = 0;                                                                // blow-off / pop hiss resonator
    this.popEnv = 0; this.bovT = 0; this.bovLen = 1; this.bovAmp = 0; this.bovCool = 0; this.loadSlow = 0; this.flutter = 0;
    this.shiftT = 0; this.shiftLen = 0.2; this.shiftI = 0; this.shiftDir = 0; this.shiftSeen = 0; this.clunk = false; this.bang = false;
    this.tn1 = 0; this.tn2 = 0; this.chy1 = 0; this.chy2 = 0; this.chPh = 0; this.stPh = 0; this.cabPh = 0;
    this.ovr = 0; this.rumble = 0;
  }

  tune(p) {
    const sr = this.sr, load = p[P.load], rn = Math.min(1, p[P.rpm] / 9000);
    const comps = combustion(p[P.kind] | 0, p[P.pitch] || 1, load, rn);
    const ex = p[P.exhaust], bl = p[P.block];
    for (let c = 0; c < 4; c++) {
      const f = comps[c][0], tau = comps[c][1] * 0.001 * (0.85 + 0.3 * (1 - rn)), th = (TWO_PI * f) / sr, rr = Math.exp(-1 / (tau * sr));
      this.a1[c] = 2 * rr * Math.cos(th); this.a2[c] = -rr * rr; this.g[c] = comps[c][2] * Math.sin(th) * 2.2 * (c < 2 ? ex : bl);
    }
    // cabin boom: a low, long resonance only the interior hears
    const pit = p[P.pitch] || 1, fb = 78 * pit, th = (TWO_PI * fb) / sr, rr = Math.exp(-1 / (0.045 * sr));
    this.a1[4] = 2 * rr * Math.cos(th); this.a2[4] = -rr * rr; this.g[4] = p[P.cabin] * Math.sin(th) * 1.6;
    // intake resonator follows throttle: bright howl when open, dull whoosh when closed
    const fi = 650 + load * 900 + rn * 1100 + (p[P.kind] === 4 ? 700 : 0), thi = (TWO_PI * fi) / sr, ri = Math.exp(-1 / (0.0016 * sr));
    this.ia1 = 2 * ri * Math.cos(thi); this.ia2 = -ri * ri; this.ig = Math.sin(thi);
  }

  spawn(p, energy, comp = 4) {
    const kind = p[P.kind] | 0, load = p[P.load], rough = p[P.rough];
    const pat = PATTERN[kind] || PATTERN[0];
    const jitter = 1 + (this.r() - 0.5) * rough * 0.5;
    this.cylN = (this.cylN + 1) % Math.max(1, p[P.cyl] | 0 || 4);
    const sig = pat.amp[this.cylN % pat.amp.length];
    const amp = energy * jitter * sig * (0.28 + 0.72 * load);
    for (let c = 0; c < comp; c++) this.y1[c] += this.g[c] * amp;
    this.ienv += (0.35 + 0.65 * load) * energy;
  }

  render(L, R, n, s, cur, tgt, blend) {
    const sr = this.sr, rnd = this.r;
    const rpm0 = cur[P.rpm], rpm1 = cur[P.rpm] + (tgt[P.rpm] - cur[P.rpm]) * blend;
    const load = cur[P.load] + (tgt[P.load] - cur[P.load]) * blend; cur[P.load] = load;
    const lp = cur[P.lp] + (tgt[P.lp] - cur[P.lp]) * blend; cur[P.lp] = lp;
    const gain0 = cur[P.gain], gain1 = cur[P.gain] + (tgt[P.gain] - cur[P.gain]) * blend;
    cur[P.rpm] = rpm1; cur[P.gain] = gain1;
    for (const k of [P.pan, P.turbo, P.whine, P.whineHz, P.exhaust, P.intake, P.trans, P.tire, P.tireHz, P.cabin, P.chain, P.block, P.crank]) cur[k] += (tgt[k] - cur[k]) * blend;
    cur[P.cyl] = tgt[P.cyl]; cur[P.rough] = tgt[P.rough]; cur[P.pitch] = tgt[P.pitch]; cur[P.kind] = tgt[P.kind]; cur[P.cut] = tgt[P.cut]; cur[P.lod] = tgt[P.lod];
    this.tune(cur);
    const lod = cur[P.lod] | 0, full = lod === 0, near = lod <= 1;
    const kind = cur[P.kind] | 0, pat = PATTERN[kind] || PATTERN[0];
    const pan = cur[P.pan], gL = Math.cos((pan * 0.5 + 0.5) * Math.PI * 0.5), gR = Math.sin((pan * 0.5 + 0.5) * Math.PI * 0.5);
    const cyl = Math.max(1, cur[P.cyl]);
    const rnorm = Math.min(1, rpm1 / 8000);
    const bike = kind === 4 || kind === 5 || kind === 6 || kind === 2;
    const noiseA = (0.008 + 0.055 * load * load) * (0.3 + rnorm) * (kind === 2 || kind === 4 ? 1.3 : 1);
    const nlp = Math.min(0.9, ((500 + rpm1 * 0.55) / sr) * 6.28);
    const lpc = Math.min(0.98, 0.05 + lp * 0.93);
    const turbo = cur[P.turbo], whine = cur[P.whine], whineW = (TWO_PI * cur[P.whineHz]) / sr;
    const cut = cur[P.cut] > 0.5, rough = cur[P.rough];
    const decel = load < 0.1 && rpm1 > 2200;
    const crank = cur[P.crank];
    const intakeG = cur[P.intake] * (0.12 + 0.88 * load) * (0.25 + rnorm * 0.9) * (bike ? 1.5 : 1) * (kind === 4 ? 1.4 : 1);
    const ovrT = decel ? 1 : 0;
    // shift edge: the audio side raises the flag (sign = up / down, magnitude = intensity) for the duration of the gear change
    const sh = tgt[P.shift];
    if (sh !== 0 && this.shiftSeen === 0) {
      this.shiftT = this.shiftLen = 0.2 + Math.abs(sh) * 0.06; this.shiftI = Math.min(1.6, Math.abs(sh)); this.shiftDir = sh > 0 ? 1 : -1; this.clunk = false; this.bang = false;
    }
    this.shiftSeen = sh !== 0 ? 1 : 0;
    // blow-off valve: closing the throttle on boost
    this.loadSlow += (load - this.loadSlow) * Math.min(1, n / (0.12 * sr));
    this.bovCool -= n / sr;
    if (near && turbo > 0.22 && this.loadSlow > 0.45 && load < 0.12 && this.bovCool <= 0) {
      this.bovLen = 0.35 + turbo * 0.4; this.bovT = this.bovLen; this.bovAmp = 0.35 + turbo * 0.65; this.bovCool = 0.9; this.flutter = rough > 0.18 || kind === 4 ? 1 : 0.5;
    }
    // intake / pop / blow-off resonator for this block
    const fb = this.bovT > 0 ? 3600 - 1800 * (1 - this.bovT / this.bovLen) : 2400, thb = (TWO_PI * fb) / sr, rb = Math.exp(-1 / (0.0012 * sr)), b1 = 2 * rb * Math.cos(thb), b2 = -rb * rb, bg = Math.sin(thb);
    const tireLp = Math.min(0.5, (cur[P.tireHz] / sr) * 6.28), tireG = cur[P.tire];
    const transG = cur[P.trans];
    const a1 = this.a1, a2 = this.a2, y1 = this.y1, y2 = this.y2;
    const stW = (TWO_PI * (170 + crank * 70)) / sr;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let rpm = rpm0 + (rpm1 - rpm0) * t;
      // downshift blip / upshift droop while the clutch is out
      let shEnv = 0, shU = 1;
      if (this.shiftT > 0) {
        shU = 1 - this.shiftT / this.shiftLen; shEnv = Math.sin(Math.PI * shU);
        rpm *= 1 + (this.shiftDir > 0 ? -0.05 : 0.09) * this.shiftI * shEnv;
        if (!this.clunk && shU > 0.55) { this.clunk = true; this.y1[0] += this.g[0] * (1.4 + this.shiftI) * transG * 2; this.y1[1] += this.g[1] * 0.8 * this.shiftI * transG; }
        if (!this.bang && shU > 0.08 && this.shiftDir > 0) { this.bang = true; if (rough > 0.12 && rnd() < 0.35 + rough) this.popEnv += 0.9 * this.shiftI * (kind === 3 || kind === 7 ? 1.4 : 1); }
        this.shiftT -= 1 / sr;
      }
      const idx = this.cylN % pat.int.length;
      const rate = (rpm / 60) * (cyl / 2) * (kind === 5 ? 1 : 1);
      this.fire += rate / sr / pat.int[idx];
      if (this.fire >= 1) {
        this.fire -= 1;
        const fuelCut = this.shiftT > 0 && this.shiftDir > 0 && shU < 0.5 && rnd() < 0.8 * Math.min(1, this.shiftI);
        const misfire = crank > 0.02 && rnd() < 0.2 + crank * 0.55;
        if (this.limT > 0) { this.limT--; this.cylN = (this.cylN + 1) % Math.max(1, cyl | 0); }
        else if (!fuelCut && !misfire) this.spawn(cur, 0.5 + 0.5 * Math.min(1, rpm / 6000), 5);
        else this.cylN = (this.cylN + 1) % Math.max(1, cyl | 0);
        if (cut) { this.limT = Math.round(sr / (kind === 4 ? 30 : 24)); if (rough > 0.25 && rnd() < 0.35) this.popEnv += 0.5; }
      }
      if (decel && rough > 0.12 && near) {
        this.popT -= 1;
        if (this.popT <= 0) { this.popT = (sr * (0.04 + rnd() * 0.3)) / (0.4 + rough * (kind === 3 || kind === 7 ? 1.8 : 1)); if (rnd() < 0.55 * rough + 0.1) { this.spawn(cur, 1.6 + rnd(), 4); this.popEnv += 0.5 + rnd() * 0.5; } }
      }
      let out = 0;
      for (let c = 0; c < COMP; c++) {
        const y = a1[c] * y1[c] + a2[c] * y2[c];
        y2[c] = y1[c]; y1[c] = y;
        out += y;
      }
      out *= 0.5;
      const nz = rnd() * 2 - 1;
      this.n1 += (nz - this.n1) * nlp;
      out += this.n1 * noiseA * 2.4;
      if (whine > 0.002) {
        this.whine += whineW; if (this.whine > TWO_PI) this.whine -= TWO_PI;
        out += Math.sin(this.whine) * whine * 0.04;
        if (near) { this.whine2 += whineW * 1.97; if (this.whine2 > TWO_PI) this.whine2 -= TWO_PI; out += Math.sin(this.whine2) * whine * 0.014; }
      }
      if (near) {
        // induction roar pulsing with the intake strokes
        if (intakeG > 0.002) {
          this.ienv *= 0.9992 - rpm1 * 1.2e-8;
          const ix = nz * Math.min(1.6, this.ienv) * 0.35;
          const iy = this.ia1 * this.iy1 + this.ia2 * this.iy2 + this.ig * ix;
          this.iy2 = this.iy1; this.iy1 = iy;
          out += iy * intakeG * 0.2;
        }
        if (turbo > 0.01) {
          this.turboPh += (TWO_PI * (1800 + turbo * 5200)) / sr; if (this.turboPh > TWO_PI) this.turboPh -= TWO_PI;
          this.turbo2 += (TWO_PI * (3300 + turbo * 9300)) / sr; if (this.turbo2 > TWO_PI) this.turbo2 -= TWO_PI;
          out += (Math.sin(this.turboPh) * 0.02 + Math.sin(this.turbo2) * 0.006 * turbo) * turbo * (0.3 + load);
        }
        // hiss of the blow-off valve, pops and crackle share one noisy band
        let hiss = 0;
        if (this.bovT > 0) {
          const u = this.bovT / this.bovLen; this.bovT -= 1 / sr;
          const fl = this.flutter > 0.6 ? 0.55 + 0.45 * Math.sin(this.bovT * TWO_PI * 16) : 1;
          hiss += nz * this.bovAmp * u * u * fl * 0.6;
        }
        if (this.popEnv > 0.003) { hiss += nz * this.popEnv * 0.9; this.popEnv *= 0.9992 - 0.0006; }
        if (hiss !== 0) { const by = b1 * this.by1 + b2 * this.by2 + bg * hiss; this.by2 = this.by1; this.by1 = by; out += by * 0.4; }
        if (crank > 0.02) {
          // starter motor: a thin whirr that wobbles with every compression stroke
          this.stPh += stW; if (this.stPh > TWO_PI) this.stPh -= TWO_PI;
          this.cabPh += (TWO_PI * rate) / sr; if (this.cabPh > TWO_PI) this.cabPh -= TWO_PI;
          out += (Math.sin(this.stPh) * 0.6 + Math.sin(this.stPh * 2.01) * 0.25) * crank * 0.045 * (0.75 + 0.25 * Math.sin(this.cabPh));
        }
        const ch = cur[P.chain];
        if (ch > 0.002) {
          this.chPh += (TWO_PI * (40 + rpm * 0.012)) / sr; if (this.chPh > TWO_PI) this.chPh -= TWO_PI;
          const cx = nz * (0.6 + 0.4 * Math.sin(this.chPh));
          const cy = 1.55 * 0.62 * this.chy1 - 0.62 * 0.62 * this.chy2 + 0.36 * cx;
          this.chy2 = this.chy1; this.chy1 = cy;
          out += cy * ch * 0.05;
        }
      } else if (this.popEnv > 0.003) this.popEnv *= 0.9992;
      if (tireG > 0.002) { this.tn1 += (nz - this.tn1) * tireLp; this.tn2 += (this.tn1 - this.tn2) * tireLp; out += this.tn2 * tireG * 1.5; }
      out = Math.tanh(out * 1.35);
      this.lp += (out - this.lp) * lpc;
      let o = this.lp;
      if (lod < 2) { this.lp2 += (this.lp - this.lp2) * Math.min(1, lpc * 1.1); o = this.lp2; }
      const g = (gain0 + (gain1 - gain0) * t) * (1 - 0.5 * shEnv * Math.min(1, this.shiftI) * (this.shiftDir > 0 ? 1 : 0.4));
      L[s + i] += o * g * gL * 1.4; R[s + i] += o * g * gR * 1.4;
    }
    void ovrT; void full;
  }
}

export class EngineBank {
  constructor(sr, nVoices = 10) {
    this.sr = sr; this.nv = nVoices;
    this.voices = Array.from({ length: nVoices }, (_, i) => new Voice(sr, i + 1));
    this.cur = Array.from({ length: nVoices }, () => new Float32Array(STRIDE));
    this.tgt = Array.from({ length: nVoices }, () => new Float32Array(STRIDE));
    for (const c of this.cur) { c[P.cyl] = 4; c[P.pitch] = 1; c[P.rpm] = 800; c[P.lp] = 1; c[P.exhaust] = 1; c[P.block] = 1; }
  }

  setParams(arr) {
    for (let v = 0; v < this.nv; v++) {
      const o = v * STRIDE;
      if (o + STRIDE > arr.length) break;
      const t = this.tgt[v];
      for (let k = 0; k < STRIDE; k++) t[k] = arr[o + k];
      if (t[P.active] > 0.5 && this.cur[v][P.gain] < 1e-4) {
        const c = this.cur[v];
        c[P.rpm] = t[P.rpm]; c[P.pan] = t[P.pan]; c[P.lp] = t[P.lp]; c[P.load] = t[P.load];
        c[P.exhaust] = t[P.exhaust]; c[P.block] = t[P.block]; c[P.intake] = t[P.intake]; c[P.trans] = t[P.trans]; c[P.cabin] = t[P.cabin]; c[P.tire] = t[P.tire]; c[P.tireHz] = t[P.tireHz]; c[P.chain] = t[P.chain]; c[P.crank] = t[P.crank];
      }
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
