import { Terrain } from '../src/world/terrain.js';
const b = (x, z) => Terrain.prototype.base(x, z);
const [x0, x1, z0, z1, st] = (process.env.BOX || '1300,2600,-600,800,50').split(',').map(Number);
let head = '       ';
for (let x = x0; x <= x1; x += st) head += String(x).padStart(5);
console.log(head);
for (let z = z0; z <= z1; z += st) { let row = String(z).padStart(6) + ' '; for (let x = x0; x <= x1; x += st) row += String(Math.round(b(x, z))).padStart(5); console.log(row); }
