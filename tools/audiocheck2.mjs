import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
console.log(await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, A = g.audio, T = {};
  const t0 = performance.now();
  const orig = A.renderSamples.bind(A);
  A.renderSamples = function () { T.preSamples = Math.round(performance.now() - t0); const p = orig(); p.then(() => { T.samples = Math.round(performance.now() - t0); }); return p; };
  await A.unlock();
  T.total = Math.round(performance.now() - t0);
  return JSON.stringify(T);
}));
await close(); process.exit(0);
