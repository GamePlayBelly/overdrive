import { Terrain } from '../src/world/terrain.js';
import { CORRIDORS } from '../src/world/corridors.js';
const t0 = performance.now();
const T = new Terrain();
console.log('terrain build ms', Math.round(performance.now() - t0), 'grid', T.nx, T.nz, 'surf', T.snx, T.snz);
for (const c of CORRIDORS) {
  const ys = c.y; let maxg = 0, cut = 0;
  for (let i = 1; i < ys.length; i++) maxg = Math.max(maxg, Math.abs(ys[i] - ys[i - 1]) / 8);
  console.log(c.id, 'len', Math.round(c.len), 'y', ys[0].toFixed(1), '->', ys[ys.length - 1].toFixed(1), 'max grade', (maxg * 100).toFixed(1) + '%');
}
for (const [x, z] of [[0, 0], [-300, 100], [500, -200], [1200, 0], [-1500, -420], [-2350, -420], [-2520, -640], [2900, 150], [-40, -1700], [-55, -560]]) console.log(x, z, 'h', T.height(x, z).toFixed(1), 'surf', T.surfAt(x, z));
