import { Terrain } from '../src/world/terrain.js';
import { CORRIDORS } from '../src/world/corridors.js';
new Terrain();
for (const c of CORRIDORS) {
  const P = c.points(4); let minR = 1e9, at = null;
  for (let i = 2; i < P.length - 2; i++) {
    const a = P[i - 2], b = P[i], d = P[i + 2];
    const h1 = Math.atan2(b.x - a.x, b.z - a.z), h2 = Math.atan2(d.x - b.x, d.z - b.z);
    let dh = h2 - h1; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    const ds = Math.hypot(d.x - a.x, d.z - a.z) / 2;
    const R = Math.abs(dh) > 1e-4 ? ds / Math.abs(dh) : 1e9;
    if (R < minR) { minR = R; at = [Math.round(b.x), Math.round(b.z), +b.y.toFixed(1)]; }
  }
  console.log(c.id, 'min radius', minR.toFixed(1), 'at', at);
}
