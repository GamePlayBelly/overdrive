import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
console.log(await page.evaluate(async () => {
  const g = window.__game, A = g.audio;
  const t0 = performance.now();
  await A.unlock();
  const out = { state: A.ctx?.state, sr: A.ctx?.sampleRate, ready: A.ready, worklet: !!A.bankNode, unlockMs: Math.round(performance.now() - t0) };
  const v = g.player.vehicle;
  for (let i = 0; i < 120; i++) { v.input.throttle = 1; g.controlVehicle = () => {}; g.update(1 / 60); }
  A.play('scream_f', { vol: 1 }); A.crash(12, { x: v.x + 5, y: 1, z: v.z }, 'vehicle', 'metal'); A.ui('click');
  out.voices = Object.keys(A.variants).length; out.bufs = Object.keys(A.buf).length;
  out.latency = A.ctx.baseLatency;
  return JSON.stringify(out);
}));
await new Promise((r) => setTimeout(r, 1500));
await close(); process.exit(0);
