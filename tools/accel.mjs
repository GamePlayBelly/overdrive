import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
console.log(JSON.stringify(await page.evaluate(() => {
  window.__pauseLoop = true;
  const g = window.__game;
  g.traffic.update = () => {}; g.peds.update = () => {};
  const env = { ground: (x, z, y) => g.world.ground(x, z, y), wet: 0, rain: 0, night: 0, fog: 0 };
  const res = {};
  for (const [name, x, z, yaw] of [['road', 0, -60, 0], ['hill', 880, 1500, Math.PI / 2], ['hill2', 920, 1500, -Math.PI / 2]]) {
    const v = g.spawnVehicle('meridian', x, z, yaw, {}, {});
    v.input.throttle = 1;
    const sp = [], ys = [];
    for (let i = 0; i < 480; i++) { g.world.sea.t += 1 / 60; v.update(1 / 60, env); if (i % 60 === 59) { sp.push(+v.phys.speed.toFixed(1)); ys.push(+v.phys.y.toFixed(1)); } }
    res[name] = { sp, ys, engineOn: v.phys.engineOn, gear: v.phys.gear };
    g.removeVehicle(v);
  }
  return res;
})));
await close(); process.exit(0);
