import { EngineBank, STRIDE, P } from '../src/audio/engineDSP.js';
const sr = 44100;
function run(name, base, fn, secs) {
  const bank = new EngineBank(sr, 1), n = Math.floor(sr * secs), L = new Float32Array(n), R = new Float32Array(n), A = new Float32Array(STRIDE);
  const out = { peak: 0, bad: 0, win: [] };
  const win = 4096; let acc = [];
  for (let o = 0; o < n; o += 128) {
    const t = o / sr; A.fill(0); Object.assign(A, {}); A[P.active] = 1;
    const s = fn(t); const set = { cyl: 4, rough: 0.3, pitch: 1, kind: 0, lp: 1, gain: 0.8, exh: 1, intake: 1, trans: 1, vol: 1, ...base, ...s };
    for (const k in set) A[P[k]] = set[k];
    bank.setParams(A);
    const l = new Float32Array(128), r = new Float32Array(128);
    bank.process(l, r, 128);
    for (let i = 0; i < 128; i++) { const v = l[i]; if (!Number.isFinite(v)) out.bad++; out.peak = Math.max(out.peak, Math.abs(v)); L[o + i] = v; }
  }
  // spectral centroid proxy per half-second: zero-crossing rate and rms
  for (let w = 0; w + sr / 2 <= n; w += sr / 2) { let z = 0, e = 0; for (let i = w + 1; i < w + sr / 2; i++) { if ((L[i] > 0) !== (L[i - 1] > 0)) z++; e += L[i] * L[i]; } out.win.push([+(w / sr).toFixed(1), Math.round(z), +Math.sqrt(e / (sr / 2)).toFixed(3)]); }
  console.log(name, 'peak', out.peak.toFixed(2), 'bad', out.bad, JSON.stringify(out.win));
  return out;
}
const sweep = (a, b, secs) => (t) => ({ rpm: a + (b - a) * Math.min(1, t / secs), load: 0.9 });
run('car i4  sweep', { cyl: 4, kind: 0 }, sweep(900, 6500, 3), 3.2);
run('car v8  sweep', { cyl: 8, kind: 3, rough: 0.55 }, sweep(800, 6000, 3), 3.2);
run('bike    sweep', { cyl: 4, kind: 4, pitch: 1.5, rough: 0.2, intake: 1.5 }, sweep(1250, 12000, 3), 3.2);
run('lift off + engine braking', { cyl: 6, kind: 0 }, (t) => ({ rpm: 6000 - 2500 * Math.min(1, t / 2), load: t < 0.5 ? 0.9 : 0.02, brk: t < 0.5 ? 0 : 1 }), 2.5);
run('gear shift dip', { cyl: 6, kind: 0, rough: 0.3 }, (t) => ({ rpm: t < 1 ? 6500 : t < 1.3 ? 4200 : 4200 + (t - 1.3) * 2000, load: t > 1 && t < 1.14 ? 0.1 : 0.9, shift: t > 1 && t < 1.14 ? 1 : 0 }), 2.5);
run('turbo blow-off', { cyl: 4, kind: 1, turbo: 0.8 }, (t) => ({ rpm: 3500, load: t < 1 ? 0.9 : 0.05, turbo: 0.8 }), 2);
run('limiter', { cyl: 4, kind: 0 }, () => ({ rpm: 6800, load: 1, cut: 1 }), 1.5);
