import { Terrain } from '../src/world/terrain.js';
import { CORRIDORS } from '../src/world/corridors.js';
new Terrain();
const c = CORRIDORS.find((q) => q.id === (process.env.ID || 'route12'));
const [x0, z0, r] = (process.env.NEAR || '283,-1542,40').split(',').map(Number);
c.pts.forEach((p, i) => { if (Math.hypot(p.x - x0, p.z - z0) < r) console.log(i, p.x.toFixed(1), p.z.toFixed(1), 'y', c.y[i].toFixed(1), 'ds', i ? Math.hypot(p.x - c.pts[i - 1].x, p.z - c.pts[i - 1].z).toFixed(2) : ''); });
console.log('ctrl count', c.spec.ctrl.length);
const sp = c.spec.ctrl; for (let i = 0; i < sp.length; i++) if (Math.hypot(sp[i][0] - x0, sp[i][1] - z0) < 120) console.log('ctrl', i, sp[i][0].toFixed(1), sp[i][1].toFixed(1));
