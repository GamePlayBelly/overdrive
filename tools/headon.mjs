import { launch } from './harness.mjs';
const { page, close, logs } = await launch({});
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  const g = window.__game;
  g.traffic.update = () => {}; g.peds.update = () => {};
  const env = { ground: (x, z, y) => g.world.ground(x, z, y), wet: 0, rain: 0, night: 0, fog: 0 };
  const { collideVehicles } = await import('/src/vehicles/vehicle.js');
  const { collide } = await import('/src/world/collision.js');
  const L = [];
  const x0 = 880, z0 = 1500;
  const a = g.spawnVehicle('meridian', x0, z0, Math.PI / 2, {}, {}), b = g.spawnVehicle('gts', x0 + 40, z0 + 1.2, -Math.PI / 2, {}, {});
  a.input.throttle = 1; b.input.throttle = 1;
  let ev = 0; g.on('vehicle:crash', () => ev++);
  for (let i = 0; i < 360; i++) {
    g.world.sea.t += 1 / 60; a.update(1 / 60, env); b.update(1 / 60, env);
    const A = a.obb(), B = b.obb();
    const d = Math.hypot(A.x - B.x, A.z - B.z), h = collide(A, B);
    const imp = collideVehicles(a, b);
    if (i % 30 === 0 || imp > 0 || (h && !imp)) L.push(`i${i} d ${d.toFixed(2)} ax ${a.x.toFixed(1)} bx ${b.x.toFixed(1)} yA ${a.phys.y.toFixed(2)} yB ${b.phys.y.toFixed(2)} hit ${!!h} imp ${imp?.toFixed?.(1)} hx ${a.hx.toFixed(2)},${b.hx.toFixed(2)} sp ${a.phys.speed.toFixed(1)},${b.phys.speed.toFixed(1)}`);
  }
  return L.slice(0, 40).join('\n');
});
console.log(out);
await close(); process.exit(0);
