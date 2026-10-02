import { launch } from './harness.mjs';
// How many buildings can actually be entered? Stands 1.4 m outside the middle of each facade of every building collider, facing it,
// and asks the door detector whether it offers a door; reports the share by reason for the ones that do not.
const { page, close } = await launch({ width: 320, height: 180, query: '?dev=1&nophoto=1' });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 500000 });
const r = await page.evaluate(() => {
  const a = window.__app, g = window.__game, P = g.player, W = g.world, out = { total: 0, ok: 0, reasons: {}, byType: {}, samples: [] };
  P.exit(); g.traffic.update = () => {}; g.peds.update = () => {};
  const list = W.colliders.list.filter((c) => !c.removed && c.kind === 'building');
  out.buildings = list.length;
  let n = 0;
  for (const c of list) {
    if (n++ % 3) continue;   // sample
    out.total++;
    let reason = null;
    if (c.type !== 'box') reason = 'circle (round tower or silo)';
    else if (c.hx < 1.7 || c.hz < 1.7) reason = 'too small (<3.4 m)';
    else if (c.y1 - Math.max(c.y0, 0) < 3) reason = 'too low (<3 m)';
    if (reason) { out.reasons[reason] = (out.reasons[reason] || 0) + 1; continue; }
    // approach the +x local face
    let found = false;
    for (const [lx, lz, yawL] of [[c.hx + 1.4, 0, -Math.PI / 2], [-(c.hx + 1.4), 0, Math.PI / 2], [0, c.hz + 1.4, Math.PI], [0, -(c.hz + 1.4), 0]]) {
      const wx = c.x + lx * c.cos - lz * c.sin, wz = c.z + lx * c.sin + lz * c.cos;
      const yaw = Math.atan2(c.x - wx, c.z - wz);
      P.x = wx; P.z = wz; P.yaw = yaw; P.y = W.groundY(wx, wz, 200); P.state = 'foot';
      const d = a.interiors.doorway();
      if (d) { found = true; out.byType[d.type] = (out.byType[d.type] || 0) + 1; break; }
    }
    if (found) out.ok++; else { out.reasons['no door found'] = (out.reasons['no door found'] || 0) + 1; if (out.samples.length < 6) out.samples.push({ x: +c.x.toFixed(0), z: +c.z.toFixed(0), hx: +c.hx.toFixed(1), hz: +c.hz.toFixed(1), y0: +c.y0.toFixed(0), y1: +c.y1.toFixed(0), mat: c.mat }); }
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await close(); process.exit(0);
