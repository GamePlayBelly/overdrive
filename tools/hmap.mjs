import { Terrain } from '../src/world/terrain.js';
const b = (x, z) => Terrain.prototype.base(x, z);
const [x0, x1, z0, z1, st] = (process.env.BOX || '800,3600,-2600,900,100').split(',').map(Number);
const ch = (h) => h < -2 ? '~' : h < 5 ? '.' : String(Math.min(9, Math.floor(h / 40) + 1));
let head = '      ';
for (let x = x0; x <= x1; x += st) head += (x % 500 === 0 ? String(x / 100).padStart(3).slice(-2) : '  ') ;
console.log('x ->', head);
for (let z = z0; z <= z1; z += st) { let row = String(z).padStart(6) + ' '; for (let x = x0; x <= x1; x += st) row += ch(b(x, z)) + ' '; console.log(row); }
console.log('legend: ~ sea  . <5m  1: <40  2:<80 3:<120 4:<160 5:<200 6:<240 7:<280 8:<320 9:>=320');
