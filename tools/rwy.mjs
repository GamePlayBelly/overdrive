import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__game, W = g.world, near = [];
  W.colliders.query(1000, 2135, 520, -2, 40, (q) => { if (Math.abs(q.z - 2135) < 40) near.push(`${q.kind}:${q.type}:${(q.x ?? 0).toFixed(0)},${(q.z ?? 0).toFixed(0)}`); });
  return { n: near.length, near: near.slice(0, 30), h: [640, 800, 1000, 1200, 1400].map((x) => +W.terrain.height(x, 2135).toFixed(2)), air: !!W.airfield, v: g.vehicles.filter((v) => v.isAir).map((v) => [v.def.id, v.x.toFixed(0), v.z.toFixed(0)]) };
})));
await close(); process.exit(0);
