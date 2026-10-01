import { launch } from './harness.mjs';
// Connected components of the road graph (directed routing via R.route) and a few probe routes.
const PROBES = JSON.parse(process.env.PROBES || '[[-720,-585,-470,-600],[-945,-500,-720,-585],[-470,-600,-160,-610]]');
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate((PROBES) => {
  const R = window.__game.world.roads;
  const adj = new Map();
  for (const n of R.nodes) adj.set(n.id, []);
  for (const e of R.edges) { adj.get(e.a)?.push(e.b); adj.get(e.b)?.push(e.a); }
  const seen = new Set(), comps = [];
  for (const n of R.nodes) {
    if (seen.has(n.id)) continue;
    const q = [n.id]; seen.add(n.id); const mem = [];
    while (q.length) { const c = q.pop(); mem.push(c); for (const d of adj.get(c) || []) if (!seen.has(d)) { seen.add(d); q.push(d); } }
    comps.push(mem);
  }
  comps.sort((a, b) => b.length - a.length);
  const out = { nodes: R.nodes.length, edges: R.edges.length, comps: comps.map((c) => ({ n: c.length, at: [Math.round(R.nodes[c[0]].x), Math.round(R.nodes[c[0]].z)] })).slice(0, 12), probes: [] };
  for (const [ax, az, bx, bz] of PROBES) {
    const a = R.nearestNode(ax, az), b = R.nearestNode(bx, bz), p = R.route(a.id, b.id);
    out.probes.push({ from: [Math.round(a.x), Math.round(a.z)], to: [Math.round(b.x), Math.round(b.z)], route: p ? p.length : null, len: p ? Math.round(p.reduce((s, q) => s + R.edges[q.edge].pl.len, 0)) : 0, ids: [a.id, b.id] });
  }
  return out;
}, PROBES);
console.log(JSON.stringify(r, null, 1));
await close(); process.exit(0);
