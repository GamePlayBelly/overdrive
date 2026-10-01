import { launch } from './harness.mjs';
const { page, close, logs } = await launch({});
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  const g = window.__game;
  g.traffic.update = () => {}; g.peds.update = () => {};
  const env = { ground: (x, z, y) => g.world.ground(x, z, y), wet: 0, rain: 0, night: 0, fog: 0 };
  const L = [];
  const step = (vs, secs) => { for (let i = 0; i < secs * 60; i++) { g.world.sea.t += 1 / 60; for (const v of vs) v.update(1 / 60, env); for (let a = 0; a < vs.length; a++) for (let b = a + 1; b < vs.length; b++) window.__cv(vs[a], vs[b]); } };
  const { collideVehicles } = await import('/src/vehicles/vehicle.js');
  window.__cv = collideVehicles;
  // 1. head-on between two cars on an empty stretch of the forest road
  const x0 = 412, z0 = 252;
  const a = g.spawnVehicle('meridian', x0, z0, Math.PI / 2, {}, {}), b = g.spawnVehicle('gts', x0 + 56, z0 + 1.2, -Math.PI / 2, {}, {});
  a.input.throttle = 1; b.input.throttle = 1;
  let ev = 0; g.on('vehicle:crash', () => ev++);
  step([a, b], 4.5);
  L.push(`head-on: a.x ${a.x.toFixed(1)} v ${a.phys.speed.toFixed(1)} yaw ${a.yaw.toFixed(2)} | b.x ${b.x.toFixed(1)} v ${b.phys.speed.toFixed(1)} yaw ${b.yaw.toFixed(2)} dmg ${a.damage.total.toFixed(2)}/${b.damage.total.toFixed(2)} crashes ${ev}`);
  const nan = [a, b].some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.yaw));
  L.push('nan: ' + nan);
  g.removeVehicle(a); g.removeVehicle(b);
  // 2. car into the pier rails at an angle
  const c = g.spawnVehicle('hauler', 90 - 20, 2300, Math.PI / 2 - 0.4, {}, {});
  c.input.throttle = 1;
  step([c], 4);
  L.push(`pier rail: x ${c.x.toFixed(1)} z ${c.z.toFixed(1)} v ${c.phys.speed.toFixed(1)} yaw ${c.yaw.toFixed(2)}`);
  g.removeVehicle(c);
  return L.join('\n');
});
console.log(out);
console.log('logs', logs.filter((l) => !/getImageData/.test(l)).slice(0, 5).join('\n'));
await close(); process.exit(0);
