import { buildCar } from '../src/vehicles/carModel.js';
import { splitPanels } from '../src/vehicles/doors.js';
import { VEHICLE_BY_ID } from '../src/data/vehicles.js';
const def = VEHICLE_BY_ID[process.env.CAR || 'gts'];
const t0 = performance.now();
const geo = buildCar(def, { noFiller: true });
const t1 = performance.now();
const sp = splitPanels(def, geo);
const bb = (g) => { if (!g) return null; g.computeBoundingBox(); const b = g.boundingBox; return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(v => +v.toFixed(2)).join(' '); };
console.log('build ms', (t1 - t0).toFixed(0), 'split ms', (performance.now() - t1).toFixed(0));
for (const k of ['paint', 'glass', 'trim', 'chrome', 'lights', 'plates']) console.log(k, geo[k] ? geo[k].index.count / 3 + ' tris' : '-', bb(geo[k]));
console.log('interior', bb(sp.interior));
console.log('spec', JSON.stringify(sp.spec));
console.log('roofY', def.body.roofY, 'L', def.body.L);
{
  const g = geo.lights, u = g.attributes.uv, p = g.attributes.position;
  const acc = {};
  for (let i = 0; i < p.count; i++) { const k = Math.floor(u.getX(i)); const a = acc[k] || (acc[k] = { n: 0, x: 0, y: 0, z: 0, minz: 9, maxz: -9, maxy: -9 }); a.n++; a.x += p.getX(i); a.y += p.getY(i); a.z += p.getZ(i); a.minz = Math.min(a.minz, p.getZ(i)); a.maxz = Math.max(a.maxz, p.getZ(i)); a.maxy = Math.max(a.maxy, p.getY(i)); }
  for (const k in acc) { const a = acc[k]; console.log('light kind', k, 'n', a.n, 'mean', (a.x / a.n).toFixed(2), (a.y / a.n).toFixed(2), (a.z / a.n).toFixed(2), 'z', a.minz.toFixed(2), a.maxz.toFixed(2), 'maxy', a.maxy.toFixed(2)); }
}
