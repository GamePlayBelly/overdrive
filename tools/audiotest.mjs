import * as S from '../src/audio/synth.js';
import { EngineBank, STRIDE, P } from '../src/audio/engineDSP.js';
import fs from 'node:fs';
const sr = 44100;
fs.mkdirSync('data/audio', { recursive: true });
function wav(name, buf, ch = 1) {
  const n = buf.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2 * ch, 28); b.writeUInt16LE(2 * ch, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf[i] * 30000))), 44 + i * 2);
  fs.writeFileSync(`data/audio/${name}.wav`, b);
}
function stats(name, buf) {
  let peak = 0, sum = 0, nan = 0, zc = 0;
  for (let i = 0; i < buf.length; i++) { const v = buf[i]; if (!Number.isFinite(v)) nan++; peak = Math.max(peak, Math.abs(v)); sum += v * v; if (i && (buf[i - 1] < 0) !== (v < 0)) zc++; }
  console.log(name.padEnd(16), 'dur', (buf.length / sr).toFixed(2), 'peak', peak.toFixed(2), 'rms', Math.sqrt(sum / buf.length).toFixed(3), 'zcHz', Math.round(zc / 2 / (buf.length / sr)), nan ? 'NaN!' : 'ok');
}
const t0 = performance.now();
const set = {
  scream_f1: S.renderScream(sr, { female: true, seed: 1 }), scream_f2: S.renderScream(sr, { female: true, seed: 5, dur: 1.0 }),
  scream_m1: S.renderScream(sr, { female: false, seed: 2 }), scream_m2: S.renderScream(sr, { female: false, seed: 7, dur: 0.9 }),
  shout: S.renderShout(sr, {}), grunt: S.renderGrunt(sr, {}), gasp: S.renderGasp(sr, {}), cough: S.renderCough(sr),
  crash_metal: S.renderCrash(sr, { kind: 'metal', power: 1.2 }), crash_light: S.renderCrash(sr, { kind: 'light', power: 0.6 }), crash_wall: S.renderCrash(sr, { kind: 'wall', power: 1.4 }),
  glass: S.renderGlass(sr, {}), bodyhit: S.renderBodyHit(sr, {}), thud: S.renderThud(sr, {}), splash: S.renderSplash(sr, {}), splash_big: S.renderSplash(sr, { big: true }),
  step_conc: S.renderFootstep(sr, { surf: 'concrete' }), step_grass: S.renderFootstep(sr, { surf: 'grass' }), step_gravel: S.renderFootstep(sr, { surf: 'gravel' }),
  door: S.renderDoor(sr, {}), starter: S.renderStarter(sr, {}), tick: S.renderTick(sr, {}), ui_confirm: S.renderUI(sr, 'confirm'), ui_levelup: S.renderUI(sr, 'levelup'),
  gull: S.renderGull(sr, 3), bird: S.renderBird(sr, 2), cricket: S.renderCricket(sr), horn: S.renderHornTone(sr, {}), waves: S.renderWaveLoop(sr), rain: S.renderNoiseLoop(sr, { color: 'white', hp: 1500, seconds: 3 }),
};
console.log('synth ms', Math.round(performance.now() - t0));
for (const [k, v] of Object.entries(set)) { stats(k, v); wav(k, v); }
// engine test: idle -> full rev V8 and inline 4
for (const [name, cyl, kind, rough, rpm0, rpm1, pit] of [['eng_i4', 4, 0, 0.3, 900, 6800, 1.05], ['eng_v8', 8, 3, 0.6, 750, 5800, 0.8], ['eng_bike', 4, 2, 0.15, 1400, 12000, 1.5], ['eng_diesel', 6, 1, 0.5, 700, 2600, 0.7]]) {
  const bank = new EngineBank(sr, 2);
  const N = sr * 5, L = new Float32Array(N), R = new Float32Array(N);
  const arr = new Float32Array(STRIDE * 2);
  const t1 = performance.now();
  for (let s = 0; s < N; s += 128) {
    const t = s / N, rpm = rpm0 + (rpm1 - rpm0) * Math.min(1, t * 1.6), load = t < 0.6 ? 1 : 0;
    arr[P.active] = 1; arr[P.rpm] = rpm; arr[P.load] = load; arr[P.gain] = 0.6; arr[P.pan] = 0; arr[P.cyl] = cyl; arr[P.rough] = rough; arr[P.pitch] = pit; arr[P.kind] = kind; arr[P.lp] = 1; arr[P.turbo] = 0; arr[P.cut] = 0; arr[P.whine] = 0.3; arr[P.whineHz] = 600 + rpm * 0.2;
    bank.setParams(arr);
    const n = Math.min(128, N - s), l = new Float32Array(128), r = new Float32Array(128);
    bank.process(l, r, 128);
    L.set(l.subarray(0, n), s);
  }
  const ms = performance.now() - t1;
  console.log(name, 'cpu ms per 5 s', Math.round(ms));
  stats(name, L); wav(name, L);
}
