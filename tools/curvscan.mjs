import { launch } from './harness.mjs';
// Scans a road-graph route and reports the tightest curve radii (from the edge polylines the AI follows).
const A = JSON.parse(process.env.A || '[-191,-930]'), B = JSON.parse(process.env.B || '[138,-1094]');
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(({ A, B }) => {
  const R = window.__game.world.roads;
  const path = R.route(R.nearestNode(A[0], A[1]).id, R.nearestNode(B[0], B[1]).id);
  const pts = [];
  for (const s of path) { const e = R.edges[s.edge]; const pp = s.dir > 0 ? e.pl.pts : e.pl.pts.slice().reverse(); for (const q of pp) pts.push({ x: q.x, z: q.z, y: q.y ?? 0 }); }
  const out = []; let acc = 0, minR = 1e9;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.z - a.z), l2 = Math.hypot(c.x - b.x, c.z - b.z);
    acc += l1;
    const h1 = Math.atan2(b.x - a.x, b.z - a.z), h2 = Math.atan2(c.x - b.x, c.z - b.z);
    let d = h2 - h1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const rad = (l1 + l2) / 2 / Math.max(1e-4, Math.abs(d));
    if (rad < 40) out.push([i, Math.round(acc), Math.round(b.x), Math.round(b.z), +l1.toFixed(1), +d.toFixed(2), +rad.toFixed(1)].join(' '));
    minR = Math.min(minR, rad);
  }
  return { n: pts.length, len: Math.round(acc), minR: +minR.toFixed(1), tight: out };
}, { A, B });
console.log(r.n, r.len, r.minR); console.log(r.tight.join('\n'));
await close(); process.exit(0);
