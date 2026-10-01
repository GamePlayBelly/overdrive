import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
console.log(JSON.stringify(await page.evaluate(() => {
  window.__pauseLoop = true;
  const g = window.__game, v = g.player.vehicle;
  g.traffic.update = () => {}; g.peds.update = () => {};
  v.place(0, g.world.groundY(0, -60, 60), -60, 0);
  const t = () => { for (let i = 0; i < 40; i++) g.update(1 / 60); const t0 = performance.now(); for (let i = 0; i < 200; i++) g.update(1 / 60); return +((performance.now() - t0) / 200).toFixed(2); };
  const base = t();
  const cars = [];
  for (let i = 0; i < 8; i++) { const c = g.spawnVehicle(['thunder', 'vireo', 'arc', 'gts'][i % 4], 20 + i * 6, -60, 0, {}, {}); c.input = { throttle: 0, brake: 1, steer: 0, hand: true }; cars.push(c); }
  const with8 = t();
  return { base, with8, perCar: +((with8 - base) / 8).toFixed(2) };
})));
await close(); process.exit(0);
