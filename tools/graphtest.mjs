import { Terrain } from '../src/world/terrain.js';
import { RoadGraph } from '../src/world/roadGraph.js';
const T = new Terrain();
const t0 = performance.now();
const R = new RoadGraph(T);
console.log('graph ms', Math.round(performance.now() - t0), 'nodes', R.nodes.length, 'edges', R.edges.length, 'lanes', R.lanes.length);
const near = (x, z) => R.nearestNode(x, z);
const pairs = [['city', 0, 0], ['alder', -40, -1610], ['dry', 2740, 150], ['marin village', -1870, -420], ['marlow', 0, 1990], ['harbor', -900, -20]];
for (const [n, x, z] of pairs.slice(1)) {
  const a = near(0, 0), b = near(x, z);
  const path = R.route(a.id, b.id);
  console.log(n, 'node', b.id, Math.round(b.x), Math.round(b.z), 'd', Math.round(Math.hypot(b.x - x, b.z - z)), path ? 'route edges ' + path.length + ' len ' + Math.round(path.reduce((s, p) => s + R.edges[p.edge].pl.len, 0)) : 'NO ROUTE');
}
const hs = R.edges.filter((e) => e.name === 'Bayline Bridge').map((e) => e.pts[0].y.toFixed(1) + '->' + e.pts[e.pts.length - 1].y.toFixed(1));
console.log('bridge edges', hs.join(' '));
