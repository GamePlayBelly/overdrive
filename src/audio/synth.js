// Offline sample synthesis: screams, impacts, glass, splashes, footsteps, doors, starter, UI ticks, animals.
// Everything returns Float32Array mono at the requested sample rate.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed = 1) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

class Biquad {
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.b0 = 1; this.b1 = this.b2 = this.a1 = this.a2 = 0; }
  set(type, f, q, sr, gainDb = 0) {
    const w = (TAU * clamp(f, 20, sr * 0.45)) / sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else { const A = Math.pow(10, gainDb / 40); b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  run(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

function normalize(buf, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; }
  if (m > 0) { const k = peak / m; for (let i = 0; i < buf.length; i++) buf[i] *= k; }
  return buf;
}
function fadeEnds(buf, a, b) {
  for (let i = 0; i < a && i < buf.length; i++) buf[i] *= i / a;
  for (let i = 0; i < b && i < buf.length; i++) buf[buf.length - 1 - i] *= i / b;
  return buf;
}

// ---------------------------------------------------------------- human voice
// Formant vowel targets [F1,F2,F3,F4] for adult male / female
const VOWELS = {
  male: { ah: [730, 1090, 2440, 3400], ee: [270, 2290, 3010, 3600], oh: [570, 840, 2410, 3300], eh: [530, 1840, 2480, 3500] },
  female: { ah: [850, 1220, 2810, 3800], ee: [310, 2790, 3310, 4000], oh: [590, 920, 2710, 3600], eh: [610, 2330, 2990, 3900] },
};

function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// vowel path: array of [time01, vowelName]; f0 contour is built from f0 base with a shout rise and fall
export function renderVoice(sr, { f0 = 200, dur = 1, female = false, seed = 1, path = [[0, 'ah'], [1, 'ah']], rise = 0.4, riseT = 0.09, fall = 0.15, rough = 0.2, breath = 0.1, drive = 1.6, vibrato = 0.012, attack = 0.02, release = 0.12, tremolo = 0.08, open = 1 } = {}) {
  const r = rng(seed), n = Math.floor(sr * dur), out = new Float32Array(n);
  const V = female ? VOWELS.female : VOWELS.male;
  const bw = [90, 110, 170, 250];
  const bq = [new Biquad(), new Biquad(), new Biquad(), new Biquad()];
  const gains = [1.0, 0.85, 0.5, 0.28];
  let phase = 0, jit = 0, vibPh = r() * 6, amPh = 0, hpState = 0, lpN = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = t / dur;
    jit += (r() - 0.5) * 0.0025; jit *= 0.995;
    const f = f0 * (1 + rise * (1 - Math.exp(-t / riseT))) * (1 - fall * smooth(0.45, 1, u)) * (1 + vibrato * Math.sin(vibPh) + jit);
    vibPh += (TAU * (5.4 + u * 1.2)) / sr;
    const dt = f / sr;
    phase += dt; if (phase >= 1) phase -= 1;
    let s = 2 * phase - 1 - polyblep(phase, dt);
    s = s * 0.85 + (Math.sin(TAU * phase) * 0.3);
    amPh += (TAU * (62 + 22 * u)) / sr;
    s *= 1 - rough * (0.5 + 0.5 * Math.sin(amPh));
    // vowel morph
    let k = 0; while (k < path.length - 2 && u > path[k + 1][0]) k++;
    const a = path[k], b = path[k + 1] || path[k];
    const m = a === b ? 0 : smooth(a[0], b[0], u);
    const fa = V[a[1]], fb = V[b[1]];
    let y = 0;
    for (let q = 0; q < 4; q++) {
      const fm = (fa[q] + (fb[q] - fa[q]) * m) * (q === 0 ? (1 + 0.1 * open) : 1);
      if ((i & 15) === 0) bq[q].set('bp', fm * (1 + jit * 4), fm / bw[q] * 0.8, sr);
      y += bq[q].run(s) * gains[q];
    }
    const noise = r() * 2 - 1; lpN += (noise - lpN) * 0.35;
    y += lpN * breath * (0.4 + 0.6 * smooth(0.3, 1, u));
    const env = smooth(0, attack, t) * (1 - smooth(dur - release, dur, t)) * (1 - tremolo + tremolo * Math.sin(TAU * 7.5 * t));
    y = Math.tanh(y * drive * (0.6 + 0.4 * env)) * env;
    hpState += (y - hpState) * 0.02;
    out[i] = y - hpState;
  }
  return normalize(out, 0.85);
}

// distressed scream: high, rising, cracking, ends with a gasp
export function renderScream(sr, { female = true, seed = 1, dur = 1.3, big = 1 } = {}) {
  const f0 = (female ? 560 : 320) * (0.93 + ((seed * 37) % 17) / 100);
  const a = renderVoice(sr, { f0, dur, female, seed, path: [[0, 'eh'], [0.22, 'ah'], [0.6, 'ah'], [1, 'oh']], rise: 0.5, riseT: 0.11, fall: 0.22, rough: 0.32 * big, breath: 0.16, drive: 2.1 * big, vibrato: 0.018, attack: 0.018, release: 0.2, tremolo: 0.12 });
  // upper "crack" layer an octave higher for the first 0.4 s
  const b = renderVoice(sr, { f0: f0 * 1.98, dur: dur * 0.5, female, seed: seed + 9, path: [[0, 'ee'], [1, 'ah']], rise: 0.3, riseT: 0.07, fall: 0.25, rough: 0.4, breath: 0.2, drive: 2.4, vibrato: 0.02, attack: 0.03, release: 0.25 });
  for (let i = 0; i < b.length; i++) a[i] += b[i] * 0.22;
  return normalize(a, 0.85);
}
export function renderShout(sr, { female = false, seed = 1 } = {}) { return renderVoice(sr, { f0: female ? 340 : 190, dur: 0.6, female, seed, path: [[0, 'oh'], [0.3, 'ah'], [1, 'ah']], rise: 0.28, riseT: 0.06, fall: 0.3, rough: 0.28, breath: 0.12, drive: 1.9, vibrato: 0.01, attack: 0.012, release: 0.16 }); }
export function renderGrunt(sr, { female = false, seed = 1 } = {}) { return renderVoice(sr, { f0: female ? 210 : 115, dur: 0.32, female, seed, path: [[0, 'oh'], [1, 'eh']], rise: -0.15, riseT: 0.05, fall: 0.35, rough: 0.35, breath: 0.25, drive: 1.4, vibrato: 0.004, attack: 0.008, release: 0.12, tremolo: 0 }); }
export function renderGasp(sr, { female = false, seed = 1 } = {}) {
  const r = rng(seed), n = Math.floor(sr * 0.5), o = new Float32Array(n), b = new Biquad(), b2 = new Biquad();
  for (let i = 0; i < n; i++) { const t = i / sr; if ((i & 15) === 0) { b.set('bp', 900 + 1600 * smooth(0, 0.25, t), 1.4, sr); b2.set('bp', 2600, 1.2, sr); } const x = r() * 2 - 1; o[i] = (b.run(x) + b2.run(x) * 0.4) * smooth(0, 0.04, t) * (1 - smooth(0.2, 0.5, t)); }
  return normalize(o, 0.5);
}
export function renderCough(sr, seed = 1) { return renderVoice(sr, { f0: 150, dur: 0.28, female: false, seed, path: [[0, 'eh'], [1, 'ah']], rise: 0.1, riseT: 0.03, fall: 0.4, rough: 0.6, breath: 0.5, drive: 1.2, attack: 0.005, release: 0.1, tremolo: 0 }); }

// ---------------------------------------------------------------- impacts
function ring(out, sr, f, tau, amp, start = 0) {
  const w = (TAU * f) / sr, dec = Math.exp(-1 / (tau * sr));
  let re = amp, im = 0;
  const cw = dec * Math.cos(w), sw = dec * Math.sin(w);
  for (let i = start; i < out.length; i++) { out[i] += im; const nr = re * cw - im * sw, ni = re * sw + im * cw; re = nr; im = ni; if (re * re + im * im < 1e-10) break; }
}

export function renderCrash(sr, { kind = 'metal', power = 1, seed = 1 } = {}) {
  const r = rng(seed), dur = kind === 'light' ? 0.5 : kind === 'metal' ? 1.1 : kind === 'wall' ? 1.4 : 0.9;
  const n = Math.floor(sr * dur), out = new Float32Array(n);
  const P = clamp(power, 0.2, 1.6);
  // low body thump
  { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; const f = 34 + 70 * Math.exp(-t / 0.05); ph += (TAU * f) / sr; out[i] += Math.sin(ph) * Math.exp(-t / 0.13) * 1.1 * P; } }
  // crunch: noise through sweeping resonances
  const b1 = new Biquad(), b2 = new Biquad(), b3 = new Biquad();
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 7) === 0) { b1.set('bp', 260 + 700 * Math.exp(-t / 0.08), 1.6, sr); b2.set('bp', 1400 + 900 * Math.exp(-t / 0.1), 2.2, sr); b3.set('bp', 3400, 1.8, sr); }
    const x = r() * 2 - 1;
    const env = Math.exp(-t / (0.09 + 0.06 * P)) * (1 + 0.6 * Math.sin(t * 190));
    out[i] += (b1.run(x) * 1.0 + b2.run(x) * 0.7 + b3.run(x) * 0.4) * env * 0.9 * P;
  }
  // metallic ringing
  const parts = kind === 'wall' ? [180, 310, 520, 880] : [210, 340, 470, 690, 1130, 1750, 2650, 3700];
  for (const f of parts) ring(out, sr, f * (0.94 + r() * 0.12), 0.05 + r() * (kind === 'light' ? 0.06 : 0.22), (0.05 + r() * 0.08) * P * (kind === 'light' ? 0.6 : 1));
  // debris scatter
  const clicks = Math.round(10 + 22 * P);
  for (let k = 0; k < clicks; k++) {
    const st = Math.floor(sr * (0.02 + Math.pow(r(), 1.8) * dur * 0.8)), f = 1800 + r() * 5000, a = (0.02 + r() * 0.07) * P;
    ring(out, sr, f, 0.004 + r() * 0.01, a, st);
  }
  return fadeEnds(normalize(out, 0.92), 32, Math.floor(sr * 0.05));
}

export function renderGlass(sr, { power = 1, seed = 2 } = {}) {
  const r = rng(seed), dur = 1.0, n = Math.floor(sr * dur), out = new Float32Array(n);
  const hp = new Biquad(), bp = new Biquad();
  for (let i = 0; i < n; i++) { const t = i / sr; if ((i & 15) === 0) { hp.set('hp', 3200, 0.7, sr); bp.set('bp', 6000, 1.0, sr); } const x = r() * 2 - 1; out[i] += (hp.run(x) + bp.run(x)) * Math.exp(-t / 0.04) * 0.6 * power; }
  const grains = Math.round(60 + 120 * power);
  for (let k = 0; k < grains; k++) {
    const st = Math.floor(sr * Math.pow(r(), 2.2) * 0.9), f = 2500 + r() * 6500, a = (0.02 + r() * 0.1) * power;
    ring(out, sr, f, 0.0015 + r() * 0.006, a, st);
  }
  for (const f of [3300, 4700, 6100, 7700]) ring(out, sr, f * (0.97 + r() * 0.06), 0.06 + r() * 0.05, 0.05 * power);
  return fadeEnds(normalize(out, 0.85), 16, Math.floor(sr * 0.08));
}

export function renderBodyHit(sr, { seed = 3, power = 1 } = {}) {
  const r = rng(seed), n = Math.floor(sr * 0.45), out = new Float32Array(n);
  let ph = 0;
  const lp = new Biquad(), bp = new Biquad();
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 48 + 90 * Math.exp(-t / 0.035); ph += (TAU * f) / sr;
    if ((i & 15) === 0) { lp.set('lp', 900, 0.8, sr); bp.set('bp', 2200, 1.4, sr); }
    const x = r() * 2 - 1;
    out[i] = Math.sin(ph) * Math.exp(-t / 0.09) * 1.0 * power + lp.run(x) * Math.exp(-t / 0.05) * 0.8 + bp.run(x) * Math.exp(-t / 0.012) * 0.35;
  }
  return fadeEnds(normalize(out, 0.9), 16, 200);
}

export function renderThud(sr, { seed = 1, pitch = 60, len = 0.25 } = {}) {
  const r = rng(seed), n = Math.floor(sr * len), out = new Float32Array(n), lp = new Biquad().set('lp', 500, 0.7, sr);
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; ph += (TAU * (pitch + 60 * Math.exp(-t / 0.03))) / sr; out[i] = Math.sin(ph) * Math.exp(-t / 0.07) + lp.run(r() * 2 - 1) * Math.exp(-t / 0.03) * 0.6; }
  return fadeEnds(normalize(out, 0.9), 8, 120);
}

export function renderSplash(sr, { big = false, seed = 4 } = {}) {
  const r = rng(seed), dur = big ? 1.6 : 0.9, n = Math.floor(sr * dur), out = new Float32Array(n);
  const bp = new Biquad(), lp = new Biquad();
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 15) === 0) { bp.set('bp', 1800 * Math.exp(-t / (big ? 0.5 : 0.25)) + 500, 0.7, sr); lp.set('lp', 3800 * Math.exp(-t / 0.7) + 700, 0.7, sr); }
    const x = r() * 2 - 1;
    out[i] = (bp.run(x) * 1.2 + lp.run(x) * 0.5) * smooth(0, 0.012, t) * Math.exp(-t / (big ? 0.55 : 0.22));
  }
  // bubbles
  const bubbles = big ? 26 : 12;
  for (let k = 0; k < bubbles; k++) { const st = Math.floor(sr * (0.05 + r() * dur * 0.7)), f = 400 + r() * 1300; const w = (TAU * f) / sr; let ph = 0; const len = Math.floor(sr * 0.05); for (let i = 0; i < len && st + i < n; i++) { ph += w * (1 + i / len * 0.8); out[st + i] += Math.sin(ph) * Math.exp(-i / (sr * 0.012)) * 0.12; } }
  return fadeEnds(normalize(out, 0.85), 8, Math.floor(sr * 0.1));
}

export function renderFootstep(sr, { surf = 'concrete', seed = 1 } = {}) {
  const r = rng(seed), len = surf === 'gravel' ? 0.16 : 0.12, n = Math.floor(sr * len), out = new Float32Array(n);
  const bp = new Biquad(), lp = new Biquad();
  const cfg = { concrete: [2400, 0.9, 0.012, 0.6], grass: [900, 0.6, 0.04, 0.5], sand: [1200, 0.5, 0.05, 0.5], gravel: [3200, 0.8, 0.03, 1], wood: [700, 1.5, 0.02, 0.7], metal: [3000, 2, 0.03, 0.8], carpet: [500, 0.5, 0.04, 0.4] }[surf] || [2000, 1, 0.02, 0.6];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 15) === 0) { bp.set('bp', cfg[0] * (0.9 + r() * 0.2), cfg[1], sr); lp.set('lp', 220, 0.7, sr); }
    const x = r() * 2 - 1;
    let v = bp.run(x) * Math.exp(-t / cfg[2]) + lp.run(x) * Math.exp(-t / 0.03) * 0.9;
    if (surf === 'gravel') v *= 0.6 + 0.8 * (Math.sin(i * 0.9) > 0.3 ? 1 : 0.3);
    out[i] = v * cfg[3];
  }
  return normalize(out, 0.5);
}

export function renderDoor(sr, { close = true, seed = 5 } = {}) {
  const r = rng(seed), n = Math.floor(sr * 0.32), out = new Float32Array(n);
  const lp = new Biquad().set('lp', 700, 0.8, sr), bp = new Biquad().set('bp', 2600, 1.6, sr);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, x = r() * 2 - 1;
    ph += (TAU * (85 + 40 * Math.exp(-t / 0.03))) / sr;
    out[i] = Math.sin(ph) * Math.exp(-t / 0.08) * 0.8 + lp.run(x) * Math.exp(-t / 0.05) * 0.8 + (close ? bp.run(x) * Math.exp(-t / 0.006) * (t > 0.045 ? 0.6 : 0.2) : bp.run(x) * Math.exp(-t / 0.01) * 0.3);
    if (close && t > 0.06 && t < 0.075) out[i] += (r() - 0.5) * 0.5;
  }
  return fadeEnds(normalize(out, 0.8), 8, 300);
}

export function renderStarter(sr, { seed = 6, dur = 1.15 } = {}) {
  const r = rng(seed), n = Math.floor(sr * dur), out = new Float32Array(n), bp = new Biquad().set('bp', 900, 2, sr);
  let ph = 0, ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 42 + 26 * smooth(0, 0.4, t) - 12 * smooth(0.85, 1.1, t); ph += (TAU * f) / sr; ph2 += (TAU * f * 9) / sr;
    const cough = Math.sin(TAU * 11 * t) > 0.6 ? 1 : 0.55;
    out[i] = (Math.sin(ph) * 0.7 + Math.sin(ph2) * 0.12 + bp.run(r() * 2 - 1) * 0.25) * cough * smooth(0, 0.05, t) * (1 - smooth(dur - 0.15, dur, t));
  }
  return normalize(out, 0.6);
}

export function renderTick(sr, { hi = true } = {}) {
  const n = Math.floor(sr * 0.05), out = new Float32Array(n);
  ring(out, sr, hi ? 2400 : 1700, 0.006, 1);
  ring(out, sr, hi ? 4800 : 3400, 0.003, 0.4);
  return fadeEnds(normalize(out, 0.5), 4, 100);
}

export function renderUI(sr, kind = 'click') {
  const dur = { click: 0.07, hover: 0.04, confirm: 0.28, error: 0.26, back: 0.1, open: 0.22, close: 0.16, buy: 0.5, levelup: 1.1, unlock: 0.6, toast: 0.3, tab: 0.06 }[kind] || 0.1;
  const n = Math.floor(sr * dur), out = new Float32Array(n);
  const tone = (f0, f1, start, len, a, type = 'sine') => { let ph = 0; for (let i = Math.floor(start * sr); i < Math.min(n, Math.floor((start + len) * sr)); i++) { const t = (i / sr - start) / len; ph += (TAU * (f0 + (f1 - f0) * t)) / sr; const s = type === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph); out[i] += s * Math.exp(-t * 4.5) * smooth(0, 0.02, t) * a; } };
  if (kind === 'click') { tone(1800, 1100, 0, 0.06, 0.7, 'tri'); ring(out, sr, 3600, 0.004, 0.25); }
  else if (kind === 'hover') tone(1300, 1500, 0, 0.035, 0.35);
  else if (kind === 'tab') tone(900, 1400, 0, 0.05, 0.5);
  else if (kind === 'confirm') { tone(660, 660, 0, 0.12, 0.6); tone(990, 990, 0.09, 0.19, 0.6); }
  else if (kind === 'error') { tone(260, 200, 0, 0.14, 0.8, 'tri'); tone(260, 190, 0.11, 0.14, 0.8, 'tri'); }
  else if (kind === 'back') tone(900, 520, 0, 0.09, 0.6);
  else if (kind === 'open') { tone(500, 900, 0, 0.16, 0.5); tone(1000, 1500, 0.04, 0.16, 0.3); }
  else if (kind === 'close') { tone(900, 500, 0, 0.14, 0.5); }
  else if (kind === 'toast') { tone(1200, 1200, 0, 0.1, 0.4); tone(1600, 1600, 0.09, 0.2, 0.4); }
  else if (kind === 'buy') { tone(880, 880, 0, 0.1, 0.5); tone(1320, 1320, 0.07, 0.1, 0.5); tone(1760, 1760, 0.14, 0.34, 0.5); ring(out, sr, 5200, 0.05, 0.25, Math.floor(sr * 0.16)); }
  else if (kind === 'unlock') { tone(523, 523, 0, 0.14, 0.5); tone(659, 659, 0.1, 0.14, 0.5); tone(784, 784, 0.2, 0.14, 0.5); tone(1047, 1047, 0.3, 0.3, 0.5); }
  else if (kind === 'levelup') { const seq = [523, 659, 784, 1047, 1319]; seq.forEach((f, i) => { tone(f, f, i * 0.11, 0.3, 0.4); tone(f * 2, f * 2, i * 0.11, 0.2, 0.12); }); }
  return normalize(out, 0.55);
}

// ---------------------------------------------------------------- animals / ambience
export function renderGull(sr, seed = 1) {
  const r = rng(seed), dur = 1.0 + r() * 0.4, n = Math.floor(sr * dur), out = new Float32Array(n);
  const calls = 3 + Math.floor(r() * 2);
  const bp = [new Biquad(), new Biquad()];
  let ph = 0;
  for (let c = 0; c < calls; c++) {
    const st = Math.floor(sr * (c * 0.28 + r() * 0.05)), len = Math.floor(sr * (0.17 + r() * 0.08));
    for (let i = 0; i < len && st + i < n; i++) {
      const t = i / len, f = 1350 + 900 * Math.sin(Math.PI * Math.min(1, t * 1.3)) - 350 * t + 40 * Math.sin(t * 60);
      ph += (TAU * f) / sr;
      const s = Math.sin(ph) + 0.5 * Math.sin(2 * ph + 0.4) + 0.3 * Math.sin(3 * ph);
      if ((i & 15) === 0) { bp[0].set('bp', 2100, 2.5, sr); bp[1].set('bp', 3700, 3, sr); }
      out[st + i] += (bp[0].run(s) + bp[1].run(s) * 0.5) * Math.sin(Math.PI * t) ** 0.7 * (1 - c * 0.12) * 1.4;
    }
  }
  return normalize(out, 0.55);
}

export function renderBird(sr, seed = 1) {
  const r = rng(seed), dur = 0.8 + r() * 0.6, n = Math.floor(sr * dur), out = new Float32Array(n);
  const notes = 4 + Math.floor(r() * 5);
  let t0 = 0.02;
  for (let k = 0; k < notes && t0 < dur - 0.1; k++) {
    const len = 0.05 + r() * 0.09, f0 = 3000 + r() * 2600, f1 = f0 * (0.65 + r() * 0.9);
    const st = Math.floor(sr * t0), ln = Math.floor(sr * len);
    let ph = 0;
    for (let i = 0; i < ln && st + i < n; i++) { const t = i / ln; ph += (TAU * (f0 + (f1 - f0) * t + 300 * Math.sin(t * 25))) / sr; out[st + i] += Math.sin(ph) * Math.sin(Math.PI * t) ** 1.5 * 0.5; }
    t0 += len + 0.03 + r() * 0.08;
  }
  return normalize(out, 0.4);
}

export function renderCricket(sr, seed = 1) {
  const r = rng(seed), n = Math.floor(sr * 1.6), out = new Float32Array(n);
  for (let p = 0; p < 6; p++) { const st = Math.floor(sr * (0.05 + p * 0.2)); for (let k = 0; k < 4; k++) ring(out, sr, 4300 + r() * 200, 0.006, 0.5, st + Math.floor(k * sr * 0.024)); }
  return normalize(out, 0.25);
}

export function renderHornTone(sr, { f = 420, dur = 0.7 } = {}) {
  const n = Math.floor(sr * dur), out = new Float32Array(n);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr; p1 += (TAU * f) / sr; p2 += (TAU * f * 1.26) / sr;
    let s = Math.sin(p1) + 0.55 * Math.sin(2 * p1) + 0.3 * Math.sin(3 * p1) + (Math.sin(p2) + 0.5 * Math.sin(2 * p2) + 0.25 * Math.sin(3 * p2));
    s = Math.tanh(s * 0.7);
    out[i] = s * smooth(0, 0.012, t) * (1 - smooth(dur - 0.05, dur, t));
  }
  return normalize(out, 0.6);
}

export function renderBoatHorn(sr) { return renderHornTone(sr, { f: 150, dur: 1.4 }); }

export function renderThunder(sr, seed = 1) {
  const r = rng(seed), n = Math.floor(sr * 4.8), out = new Float32Array(n);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, w = r() * 2 - 1;
    a += (w - a) * 0.05; b += (a - b) * 0.04;
    const env = Math.exp(-t * 0.75) * (1 + 0.6 * Math.sin(t * 5.3 + seed)) * Math.min(1, t / 0.04);
    out[i] = (b * 11 + (t < 0.22 ? w * Math.exp(-t * 26) * 0.55 : 0)) * env;
  }
  return normalize(out, 0.9);
}
export function renderBell(sr, seed = 1) {
  const n = Math.floor(sr * 2.2), out = new Float32Array(n);
  for (const [f, d, g] of [[523, 1.1, 1], [1244, 0.7, 0.55], [1978, 0.45, 0.35], [2790, 0.3, 0.2]]) for (let i = 0; i < n; i++) { const t = i / sr; out[i] += Math.sin(6.2832 * f * t * (1 + 0.001 * seed)) * Math.exp(-t / d) * g; }
  return normalize(out, 0.5);
}
export function renderSquelch(sr) {
  const r = rng(11), n = Math.floor(sr * 0.2), out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; lp += ((r() * 2 - 1) - lp) * 0.5; out[i] = (lp * 0.5 + Math.sin(6.2832 * 1450 * t) * 0.3 * (t < 0.07 ? 1 : 0)) * (t < 0.012 ? t / 0.012 : 1) * Math.exp(-t * 14); }
  return normalize(out, 0.5);
}
export function renderBubble(sr, seed = 1) {
  const r = rng(seed), n = Math.floor(sr * 0.09), out = new Float32Array(n), f0 = 380 + r() * 500;
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; ph += (6.2832 * f0 * (1 + t * 14)) / sr; out[i] = Math.sin(ph) * Math.exp(-t * 55); }
  return normalize(out, 0.5);
}
export function renderWaveLoop(sr, seed = 3) {
  const r = rng(seed), dur = 9, n = Math.floor(sr * dur), out = new Float32Array(n);
  const lp = new Biquad(), lp2 = new Biquad(), bp = new Biquad();
  for (let i = 0; i < n; i++) {
    const t = i / sr, w = 0.5 + 0.5 * Math.sin(TAU * t / dur * 1), w2 = 0.5 + 0.5 * Math.sin(TAU * t / dur * 2 + 1.3);
    const swell = Math.pow(0.55 * w + 0.45 * w2, 2.2);
    if ((i & 31) === 0) { lp.set('lp', 300 + 1500 * swell, 0.6, sr); bp.set('bp', 900 + 1800 * swell, 0.5, sr); lp2.set('lp', 160, 0.7, sr); }
    const x = r() * 2 - 1;
    out[i] = lp.run(x) * (0.2 + swell * 0.9) + bp.run(x) * swell * 0.6 + lp2.run(x) * 0.4;
  }
  // crossfade for loop
  const fade = Math.floor(sr * 1.2);
  for (let i = 0; i < fade; i++) { const a = i / fade; out[i] = out[i] * a + out[n - fade + i] * (1 - a); }
  return normalize(out.subarray(0, n - fade), 0.5);
}

export function renderNoiseLoop(sr, { color = 'pink', seconds = 4, lp = 0, hp = 0 } = {}) {
  const r = rng(11), n = Math.floor(sr * seconds), out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  const l = new Biquad(), h = new Biquad();
  if (lp) l.set('lp', lp, 0.7, sr); if (hp) h.set('hp', hp, 0.7, sr);
  for (let i = 0; i < n; i++) {
    let x = r() * 2 - 1;
    if (color === 'pink') { b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898; x = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926; }
    if (lp) x = l.run(x); if (hp) x = h.run(x);
    out[i] = x;
  }
  const fade = Math.floor(sr * 0.25);
  for (let i = 0; i < fade; i++) { const a = i / fade; out[i] = out[i] * a + out[n - fade + i] * (1 - a); }
  return normalize(out.subarray(0, n - fade), 0.6);
}

export function renderRainDrop(sr, seed = 1) { const r = rng(seed); const n = Math.floor(sr * 0.06), out = new Float32Array(n); ring(out, sr, 2600 + r() * 2600, 0.005 + r() * 0.006, 1); return normalize(out, 0.4); }

// ---------------------------------------------------------------- manifest (rendered inside a worker)
export function* manifest(sr) {
  const many = (name, list) => [name, 'many', list];
  yield many('scream_f', [1, 5, 9, 13].map((s, i) => renderScream(sr, { female: true, seed: s, dur: 0.95 + i * 0.12 })));
  yield many('scream_m', [2, 7, 11, 14].map((s, i) => renderScream(sr, { female: false, seed: s, dur: 0.9 + i * 0.13 })));
  yield many('shout_f', [1, 2].map((s) => renderShout(sr, { female: true, seed: s })));
  yield many('shout_m', [1, 2].map((s) => renderShout(sr, { female: false, seed: s })));
  yield many('grunt_f', [1, 2].map((s) => renderGrunt(sr, { female: true, seed: s })));
  yield many('grunt_m', [1, 2, 3].map((s) => renderGrunt(sr, { female: false, seed: s })));
  yield many('gasp', [1, 2].map((s) => renderGasp(sr, { seed: s })));
  yield many('cough', [1, 2].map((s) => renderCough(sr, s)));
  yield many('crash_light', [1, 2, 3].map((s) => renderCrash(sr, { kind: 'light', power: 0.7, seed: s })));
  yield many('crash_metal', [4, 5, 6].map((s) => renderCrash(sr, { kind: 'metal', power: 1.1, seed: s })));
  yield many('crash_wall', [7, 8].map((s) => renderCrash(sr, { kind: 'wall', power: 1.4, seed: s })));
  yield many('glass', [2, 3].map((s) => renderGlass(sr, { seed: s })));
  yield many('bodyhit', [3, 4, 5].map((s) => renderBodyHit(sr, { seed: s })));
  yield many('thud', [1, 2, 3].map((s) => renderThud(sr, { seed: s, pitch: 52 + s * 6 })));
  yield many('splash', [4, 5].map((s) => renderSplash(sr, { seed: s })));
  yield many('splashBig', [6, 7].map((s) => renderSplash(sr, { seed: s, big: true })));
  for (const surf of ['concrete', 'grass', 'gravel', 'sand', 'wood', 'metal']) yield many('step_' + surf, [1, 2, 3, 4].map((s) => renderFootstep(sr, { surf, seed: s })));
  yield many('doorClose', [5, 6].map((s) => renderDoor(sr, { close: true, seed: s })));
  yield many('doorOpen', [7].map((s) => renderDoor(sr, { close: false, seed: s })));
  yield ['starter', 'put', [renderStarter(sr, {})]];
  yield ['tickHi', 'put', [renderTick(sr, { hi: true })]];
  yield ['tickLo', 'put', [renderTick(sr, { hi: false })]];
  for (const k of ['click', 'hover', 'confirm', 'error', 'back', 'open', 'close', 'buy', 'levelup', 'unlock', 'toast', 'tab']) yield ['ui_' + k, 'put', [renderUI(sr, k)]];
  yield many('gull', [1, 2, 3, 4].map((s) => renderGull(sr, s)));
  yield many('bird', [1, 2, 3, 4, 5, 6].map((s) => renderBird(sr, s)));
  yield ['cricket', 'put', [renderCricket(sr, 1)]];
  yield ['hornA', 'put', [renderHornTone(sr, { f: 420 })]];
  yield ['hornB', 'put', [renderHornTone(sr, { f: 330 })]];
  yield ['boatHorn', 'put', [renderBoatHorn(sr)]];
  yield ['foghorn', 'put', [renderHornTone(sr, { f: 98, dur: 2.6 })]];
  yield many('thunder', [1, 2, 3].map((s) => renderThunder(sr, s)));
  yield many('bell', [1, 2].map((s) => renderBell(sr, s)));
  yield ['squelch', 'put', [renderSquelch(sr)]];
  yield many('bubble', [1, 2, 3, 4].map((s) => renderBubble(sr, s)));
  yield many('rainDrop', [1, 2, 3, 4].map((s) => renderRainDrop(sr, s)));
  yield ['waves', 'loop', [renderWaveLoop(sr)]];
  yield ['rain', 'loop', [renderNoiseLoop(sr, { color: 'white', hp: 1400, lp: 9000, seconds: 3 })]];
  yield ['pink', 'loop', [renderNoiseLoop(sr, { color: 'pink', seconds: 4 })]];
  yield ['wind', 'loop', [renderNoiseLoop(sr, { color: 'pink', seconds: 4, lp: 1400 })]];
  yield ['white', 'loop', [renderNoiseLoop(sr, { color: 'white', seconds: 3 })]];
}
