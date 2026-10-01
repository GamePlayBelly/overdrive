import { Terrain } from '../src/world/terrain.js';
import { CORRIDORS } from '../src/world/corridors.js';
new Terrain();
for (const [id, fr] of [['route12', [0.14, 0.3, 0.46, 0.62, 0.78, 0.92, 1]], ['route40a', [0.2, 0.4, 0.6, 0.8, 1]], ['marin', [0.2, 0.4, 0.6, 0.8]]]) {
  const c = CORRIDORS.find((q) => q.id === id);
  const out = fr.map((f) => { const i = Math.min(c.pts.length - 1, Math.round(f * (c.pts.length - 1))); return [Math.round(c.pts[i].x), Math.round(c.pts[i].z)]; });
  console.log(id, JSON.stringify(out));
}
