import { launch, sleep } from './harness.mjs';
const { page, close, logs } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const res = await page.evaluate(async () => {
  const g = window.__game, A = g.audio;
  await A.unlock();
  const out = [];
  out.push(`audio ready ${A.ready} state ${A.ctx?.state}`);
  const an = A.ctx.createAnalyser(); an.fftSize = 2048; A.bus.music.connect(an);
  const buf = new Float32Array(an.fftSize);
  const rms = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };
  for (let i = 0; i < g.radio.stations.length; i++) {
    g.radio.set(i);
    let peak = 0, n = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 3200) { g.update(1 / 60); const r = rms(); peak = Math.max(peak, r); n++; await new Promise((r2) => setTimeout(r2, 16)); }
    out.push(`${g.radio.stations[i].name}: peak rms ${peak.toFixed(3)} frames ${n} time ${A.ctx.currentTime.toFixed(2)}`);
  }
  g.radio.off();
  return out.join('\n');
});
console.log(res);
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 8).join('\n') || 'none');
await close(); process.exit(0);
