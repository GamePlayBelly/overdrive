import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 800, height: 450 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(() => {
  const W = window.__game.world, out = {};
  const bl = W.blocks.filter((b) => ['alder', 'dry', 'marin'].includes(b.district));
  out.blocks = bl.map((b) => ({ d: b.district, zone: b.zone, style: b.style, special: b.special, lot: [b.lot.x0, b.lot.x1, b.lot.z0, b.lot.z1].map(Math.round) }));
  let n = 0; W.colliders.list.forEach((c) => { if (c.kind === 'building' && !c.removed && c.x > -300 && c.x < 300 && c.z < -1500) n++; });
  out.alderBuildings = n;
  let m = 0; W.colliders.list.forEach((c) => { if (c.kind === 'building' && !c.removed && c.x > 2600 && c.x < 3200 && c.z > -50 && c.z < 350) m++; });
  out.dryBuildings = m;
  let k = 0; W.colliders.list.forEach((c) => { if (c.kind === 'building' && !c.removed && c.x < -1700 && c.x > -2200 && c.z > -700 && c.z < -100) k++; });
  out.marinBuildings = k;
  out.groundAlder = W.groundY(-40, -1745, 400);
  return out;
});
console.log(JSON.stringify(r, null, 1));
await close(); process.exit(0);
