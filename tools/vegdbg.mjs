import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 800, height: 450 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(() => {
  const V = window.__game.world.veg, K = V.kinds.street;
  const g = K.solid, c = g.attributes.color, uv = g.attributes.uv, p = g.attributes.position;
  const out = [];
  for (let i = 0; i < 12; i++) out.push([p.getX(i).toFixed(2), p.getY(i).toFixed(2), uv.getX(i).toFixed(1), c.getX(i).toFixed(3), c.getY(i).toFixed(3), c.getZ(i).toFixed(3)].join(' '));
  return { n: p.count, out, mat: V.mats.broad.vertexColors, map: !!V.mats.broad.map };
});
console.log(JSON.stringify(r, null, 1));
await close(); process.exit(0);
