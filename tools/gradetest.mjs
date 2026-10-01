import { Terrain } from '../src/world/terrain.js';
import { CORRIDORS } from '../src/world/corridors.js';
new Terrain();
for (const c of CORRIDORS) {
  const out = [];
  for (let i = 1; i < c.y.length; i++) { const g = Math.abs(c.y[i] - c.y[i - 1]) / 4; if (g > 0.085) out.push([i, (g * 100).toFixed(1), c.y[i - 1].toFixed(1), c.y[i].toFixed(1), Math.round(c.pts[i].x), Math.round(c.pts[i].z)]); }
  console.log(c.id, 'steep samples', out.length, JSON.stringify(out.slice(0, 6)));
}
