import { launch } from './harness.mjs';
// Checks that collectibles, hidden spots and rare cars sit on dry land close to a road.
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(async () => {
  const W = window.__game.world, R = W.roads, T = W.terrain;
  const { COLLECTIBLES, HIDDEN_LOCATIONS, RARE_VEHICLES } = await import('/src/data/meta.js');
  const rows = [];
  const chk = (id, x, z) => {
    const g = W.ground(x, z, 400), h = T.height(x, z), e = R.nearest(x, z, g.y, 400);
    let sl = 0; for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) sl = Math.max(sl, Math.abs(T.height(x + dx, z + dz) - h) / 4);
    rows.push([id, Math.round(x), Math.round(z), +g.y.toFixed(1), +h.toFixed(1), g.surf, e ? Math.round(e.d) + ' ' + (e.e?.name || '') : '-', +sl.toFixed(2)].join(' | '));
  };
  for (const c of COLLECTIBLES) chk(c.id, c.x, c.z);
  for (const c of HIDDEN_LOCATIONS) chk(c.id, c.x, c.z);
  for (const c of RARE_VEHICLES) chk(c.id, c.x, c.z);
  return rows;
});
console.log(r.join('\n'));
await close(); process.exit(0);
