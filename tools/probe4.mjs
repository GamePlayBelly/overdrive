import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__game, near = [];
  g.world.colliders.query(-612, -135, 40, -2, 6, (q) => { near.push(`${q.kind}:${q.solid ? 's' : 'n'}:${q.type}:${(q.x ?? 0).toFixed(0)},${(q.z ?? 0).toFixed(0)}:${(q.hx ?? q.r ?? 0).toFixed(0)}x${(q.hz ?? 0).toFixed(0)}`); });
  return { near, vehicles: g.vehicles.filter((v) => Math.hypot(v.x + 612, v.z + 135) < 60).map((v) => v.def.id + '@' + v.x.toFixed(0) + ',' + v.z.toFixed(0)), parked: g.world.parked.filter((q) => Math.hypot(q.x + 612, q.z + 135) < 60).length };
})));
await close(); process.exit(0);
