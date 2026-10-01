import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { windowUV, signUV } from './textures.js';
import { SURF } from './terrain.js';
import { smoothstep } from '../core/math.js';
import { BRIDGE, ISLE, ALDER, DRY, MARIN, TOWN_Y, MOORINGS } from '../data/routes.js';
import { WATER_LEVEL } from '../data/world.js';

const C = (h) => new THREE.Color(h);
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _s = new THREE.Vector3(1, 1, 1);

// round strut between two points added to a GeoBuilder
function strut(gb, ax, ay, az, bx, by, bz, r, col, seg = 5) {
  _a.set(bx - ax, by - ay, bz - az);
  const len = _a.length();
  if (len < 1e-3) return;
  _q.setFromUnitVectors(_up, _a.normalize());
  _m.compose(_b.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s);
  gb.add(new THREE.CylinderGeometry(r, r, len, seg, 1, false), _m, col);
}

// ---------------------------------------------------------------- blocks (mixed into BuildingGen)
export const regionMethods = {
  // Marin Village reuses the Marlow Bay pastel blocks: the street-side column gets the shop mix, the outer column beach houses
  isleBlock(B) {
    const row = B.cell.x0 > -1975 ? 2100 : 2000;
    this.coastBlock({ ...B, cell: { ...B.cell, z0: row } });
  },
};

// ---------------------------------------------------------------- landmarks and special lots of the outer regions
export class Regions {
  constructor(world, gen) {
    this.world = world; this.gen = gen;
    this.rng = new RNG('regions');
  }

  zone(B) {
    switch (B.zone) {
      case 'lodge': return this.lodge(B), true;
      case 'chapel': return this.chapel(B), true;
      case 'alpstore': return this.alpineStore(B), true;
      case 'drygas': return this.dryGas(B), true;
      case 'diner': return this.diner(B), true;
      case 'drystore': return this.dryStore(B), true;
      case 'motel': return this.motel(B), true;
    }
    return false;
  }

  // ---- shared bits
  lot(B, w, d, front = 's') {
    const l = B.lot, cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
    return { x0: cx - w / 2, x1: cx + w / 2, z0: front === 's' ? l.z1 - d - 4 : l.z0 + 4, z1: front === 's' ? l.z1 - 4 : l.z0 + 4 + d };
  }
  collide(r, y, H, mat = 'wood') { this.world.colliders.box((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, (r.x1 - r.x0) / 2, (r.z1 - r.z0) / 2, 0, -1, y + H + 2, { kind: 'building', mat }); }
  win(side, rng, y0, rows, step = 3.2, uvk = 'sash', lit = 0.4, h = 1.4, w = 1.2) {
    const G = this.gen, L = G.sideLen(side);
    for (let u = 2; u < L - 1.5; u += step) for (const yy of rows) G.wallQuad('windows', side, u, y0 + yy, w, h, windowUV(uvk, G.windowState(rng, lit)));
  }

  // ---- Alder Peak
  lodge(B) {
    const G = this.gen, rng = this.rng, y = B.raise, l = B.lot, P = this.world.props;
    B.special = 'lodge';
    this.world.terrain.paintRect(l.x0, l.z0, l.x1, l.z1, SURF.CONCRETE);
    G.parkingLot({ x0: l.x0 + 2, x1: l.x1 - 2, z0: l.z0 + 2, z1: l.z0 + 24 }, y);
    const hall = this.lot(B, 34, 16);
    const wood = C('#6e4b30'), stone = C('#8b8a85');
    G.walls('brick', hall, y, y + 1.5, stone, 3, 3);
    G.walls('siding', hall, y + 1.5, y + 7.6, wood, 2.4, 2.4, y + 1.5);
    G.gableRoof(hall, y + 7.6, 6.2, true, C('#e6e9ee'), wood, false);
    this.collide(hall, y, 12);
    const wing = { x0: hall.x0 + 3, x1: hall.x0 + 17, z0: hall.z0 - 11, z1: hall.z0 };
    G.walls('siding', wing, y, y + 5.4, wood, 2.4, 2.4);
    G.gableRoof(wing, y + 5.4, 4.2, false, C('#e6e9ee'), wood, false);
    this.collide(wing, y, 8);
    const sides = G.sides(hall), fs = sides.find((s) => s.key === 's'), L = G.sideLen(fs);
    G.wallQuad('windows', fs, L * 0.5, y + 1.3, 2.4, 2.6, windowUV('door', rng.int(0, 3)));
    for (let u = 2.4; u < L - 1.5; u += 3.4) { if (Math.abs(u - L * 0.5) < 2.4) continue; G.wallQuad('windows', fs, u, y + 2.0, 1.6, 2.0, windowUV('sash', G.windowState(rng, 0.5))); G.wallQuad('windows', fs, u, y + 5.2, 1.6, 2.0, windowUV('sash', G.windowState(rng, 0.45))); }
    for (const s of sides) if (s !== fs) { const Ls = G.sideLen(s); for (let u = 2.4; u < Ls - 1.5; u += 3.6) if (rng.chance(0.8)) G.wallQuad('windows', s, u, y + 2.0, 1.4, 1.8, windowUV('sash', G.windowState(rng, 0.4))); }
    G.wallQuad('signs', fs, L * 0.5, y + 7.1, 8, 1.1, signUV(rng.int(0, 20)), 0.12);
    // porch with log columns
    for (let k = 0; k < 5; k++) { const px = hall.x0 + 12 + k * 2.6; G.g('wood', px, hall.z1 + 2.4).box(px, y + 1.7, hall.z1 + 2.4, 0.4, 3.4, 0.4, C('#5b3d27'), 0, 1, false); }
    G.g('wood', hall.x0, hall.z1).box(hall.x0 + 17, y + 3.45, hall.z1 + 1.4, 14, 0.2, 3.2, C('#e6e9ee'), 0, 1, false);
    // chimney
    const cx = hall.x1 - 5, cz = (hall.z0 + hall.z1) / 2;
    G.g('brick', cx, cz).box(cx, y + 10.2, cz, 1.8, 7.6, 1.8, C('#7d7b78'), 0, 1.4, false);
    for (let k = 0; k < 6; k++) this.world.parked.push({ x: l.x0 + 8 + k * 6, y: y + 0.03, z: l.z0 + 8 + (k % 2) * 9, rot: (k % 2) ? 0 : Math.PI, lot: true });
    for (let k = 0; k < 3; k++) P.place('flagpole', l.x0 + 6 + k * 9, y, l.z0 + 1.5, 0, 0.7);
    this.world.poi.lodge = { x: (hall.x0 + hall.x1) / 2, z: hall.z1 + 6, name: 'Alder Peak Lodge', icon: 'food' };
    for (let k = 0; k < 5; k++) this.world.veg.tree(hall.x0 - 4 + rng.f() * 44, y, hall.z0 - 14 - rng.f() * 3, rng.chance(0.5) ? 'pine' : 'conifer', rng, rng.range(0.8, 1.1));
  }

  chapel(B) {
    const G = this.gen, rng = this.rng, y = B.raise, l = B.lot;
    B.special = 'chapel';
    const nave = this.lot(B, 9, 16);
    const stone = C('#9a9892');
    G.walls('brick', nave, y, y + 5.6, stone, 3, 3);
    G.gableRoof(nave, y + 5.6, 4.6, false, C('#e6e9ee'), stone, false);
    this.collide(nave, y, 9, 'concrete');
    const tw = { x0: (nave.x0 + nave.x1) / 2 - 2.2, x1: (nave.x0 + nave.x1) / 2 + 2.2, z0: nave.z1, z1: nave.z1 + 4.4 };
    G.walls('brick', tw, y, y + 11, stone, 3, 3);
    this.collide(tw, y, 14, 'concrete');
    const cx = (tw.x0 + tw.x1) / 2, cz = (tw.z0 + tw.z1) / 2;
    G.g('paint', cx, cz).addGeo(new THREE.ConeGeometry(3.4, 8.5, 4), cx, y + 15.2, cz, Math.PI / 4, 1, 1, 1, C('#3b3d42'));
    G.g('paint', cx, cz).box(cx, y + 20.6, cz, 0.18, 1.8, 0.18, C('#d9d6cc'), 0, 1, false);
    G.g('paint', cx, cz).box(cx, y + 20.9, cz, 1.0, 0.18, 0.18, C('#d9d6cc'), 0, 1, false);
    const fs = G.sides(nave).find((s) => s.key === 's');
    G.wallQuad('windows', fs, 4.5, y + 1.2, 1.6, 2.4, windowUV('door', 2));
    for (const s of G.sides(nave)) { if (s.key === 's' || s.key === 'n') continue; const L = G.sideLen(s); for (let u = 3; u < L - 2; u += 3.4) G.wallQuad('windows', s, u, y + 3.0, 1.1, 2.2, windowUV('sash', G.windowState(rng, 0.5))); }
    for (let k = 0; k < 6; k++) this.world.veg.tree(l.x0 + 3 + rng.f() * (l.x1 - l.x0 - 6), y, l.z0 + 3 + rng.f() * 8, 'pine', rng, rng.range(0.8, 1.1));
    this.world.poi.chapel = { x: cx, z: nave.z1 + 8, name: 'Alder Peak Chapel', icon: 'civic' };
  }

  alpineStore(B) {
    const G = this.gen, rng = this.rng, y = B.raise, l = B.lot;
    B.special = 'alpstore';
    const r = this.lot(B, 16, 10);
    const wood = C('#8a6240');
    G.walls('siding', r, y, y + 4.2, wood, 2.4, 2.4);
    G.gableRoof(r, y + 4.2, 3.6, true, C('#e6e9ee'), wood, false);
    this.collide(r, y, 9);
    const fs = G.sides(r).find((s) => s.key === 's'), L = G.sideLen(fs);
    G.wallQuad('windows', fs, L * 0.3, y + 1.6, 6, 2.6, windowUV('shop', 1));
    G.wallQuad('windows', fs, L * 0.78, y + 1.1, 1.1, 2.15, windowUV('door', 1));
    G.wallQuad('signs', fs, L * 0.5, y + 3.7, 8, 0.9, signUV(rng.int(0, 20)), 0.12);
    G.parkingLot({ x0: l.x0 + 2, x1: l.x1 - 2, z0: l.z0 + 2, z1: r.z0 - 3 }, y);
    for (let k = 0; k < 3; k++) this.world.parked.push({ x: l.x0 + 10 + k * 7, y: y + 0.03, z: l.z0 + 8, rot: Math.PI / 2 * (k % 2 ? 1 : -1), lot: true });
    this.world.props.place('picnicTable', r.x1 + 3, y, r.z1 - 2, 0.3);
    this.world.poi.alpStore = { x: (r.x0 + r.x1) / 2, z: r.z1 + 5, name: 'Peak Provisions', icon: 'food' };
  }

  // ---- Dry Springs
  dryGas(B) {
    const keep = this.world.poi.gas;
    this.world.specials.gasStation(B);
    this.world.poi.dryGas = { ...this.world.poi.gas, name: 'Dry Springs Fuel' };
    this.world.poi.gas = keep;
  }

  diner(B) {
    const G = this.gen, rng = this.rng, y = B.raise, l = B.lot, P = this.world.props;
    B.special = 'diner';
    this.world.terrain.paintRect(l.x0, l.z0, l.x1, l.z1, SURF.ASPHALT);
    G.g('parkingLot', l.x0, l.z0).quad([l.x0, y + 0.012, l.z1], [l.x1, y + 0.012, l.z1], [l.x1, y + 0.012, l.z0], [l.x0, y + 0.012, l.z0], C('#ffffff'), [l.x0 / 7, l.z1 / 7, l.x1 / 7, l.z0 / 7]);
    const r = { x0: (l.x0 + l.x1) / 2 - 11, x1: (l.x0 + l.x1) / 2 + 11, z0: l.z0 + 4, z1: l.z0 + 13 };
    G.walls('wallConcrete', r, y, y + 3.6, C('#e8e4da'), 4, 4);
    G.g('metal', r.x0, r.z0).box((r.x0 + r.x1) / 2, y + 1.0, r.z1 + 0.04, r.x1 - r.x0, 0.35, 0.08, C('#c8362f'), 0, 1, false);
    G.top('roof', r, y + 3.6, C('#c9c6bf'));
    G.parapet('wallConcrete', r, y + 3.6, 0.5, 0.25, C('#c8362f'));
    this.collide(r, y, 4, 'concrete');
    const fs = G.sides(r).find((s) => s.key === 's'), L = G.sideLen(fs);
    G.wallQuad('windows', fs, L * 0.42, y + 1.7, L - 7, 1.7, windowUV('shop', 1));
    G.wallQuad('windows', fs, L - 2.5, y + 1.1, 1.1, 2.15, windowUV('door', 0));
    // neon pole sign
    const sx = r.x0 - 4, sz = r.z1 + 4;
    G.g('metal', sx, sz).box(sx, y + 4.5, sz, 0.35, 9, 0.35, C('#8e969b'), 0, 1, false);
    G.g('signs', sx, sz).box(sx, y + 9.6, sz, 0.4, 2.4, 4.4, null, 0, 0, true);
    this.world.colliders.circle(sx, sz, 0.35, y - 1, y + 10, { kind: 'pole' });
    for (let k = 0; k < 5; k++) this.world.parked.push({ x: l.x0 + 8 + k * 6.2, y: y + 0.03, z: l.z1 - 7, rot: Math.PI, lot: true });
    this.world.poi.diner = { x: (r.x0 + r.x1) / 2, z: r.z1 + 8, name: 'Route 40 Diner', icon: 'food' };
    P.place('bench', r.x0 + 4, y, r.z1 + 1.4, Math.PI);
  }

  dryStore(B) {
    const G = this.gen, rng = this.rng, y = B.raise, l = B.lot;
    B.special = 'drystore';
    const r = this.lot(B, 20, 12, 'n');
    const col = C('#d8bd92');
    G.walls('stucco', r, y, y + 4.4, col, 4, 4);
    G.top('roof', r, y + 4.4, C('#bfae92'));
    G.parapet('wallConcrete', r, y + 4.4, 0.8, 0.3, C('#cfae7c'));
    this.collide(r, y, 5, 'stucco');
    const fs = G.sides(r).find((s) => s.key === 'n'), L = G.sideLen(fs);
    G.storefronts(fs, y, rng, null, 0.9, 6.5);
    G.g('wood', r.x0, r.z0).box((r.x0 + r.x1) / 2, y + 3.2, r.z0 - 1.4, L, 0.2, 2.8, C('#7a5a3c'), 0, 1, false);
    for (const px of [r.x0 + 1, r.x1 - 1, (r.x0 + r.x1) / 2]) G.g('wood', px, r.z0 - 2.6).box(px, y + 1.55, r.z0 - 2.6, 0.25, 3.1, 0.25, C('#6b4c32'), 0, 1, false);
    G.parkingLot({ x0: l.x0 + 3, x1: l.x1 - 3, z0: r.z1 + 4, z1: l.z1 - 3 }, y);
    for (let k = 0; k < 3; k++) this.world.parked.push({ x: l.x0 + 9 + k * 7, y: y + 0.03, z: r.z1 + 8, rot: 0, lot: true });
    this.world.poi.dryStore = { x: (r.x0 + r.x1) / 2, z: r.z0 - 6, name: 'Dry Springs General Store', icon: 'food' };
  }

  motel(B) {
    const G = this.gen, rng = this.rng, y = B.raise, l = B.lot;
    B.special = 'motel';
    const r = this.lot(B, 40, 9, 's');
    const col = C('#e9d7b4');
    G.walls('stucco', r, y, y + 6.4, col, 4, 4);
    G.top('roof', r, y + 6.4, C('#bdb3a2'));
    G.parapet('wallConcrete', r, y + 6.4, 0.7, 0.3, C('#c46a3f'));
    this.collide(r, y, 7, 'stucco');
    const fs = G.sides(r).find((s) => s.key === 's'), L = G.sideLen(fs);
    for (let u = 3; u < L - 2; u += 4.4) { G.wallQuad('windows', fs, u, y + 1.15, 1.0, 2.1, windowUV('door', rng.int(0, 3))); G.wallQuad('windows', fs, u + 1.5, y + 1.6, 1.3, 1.2, windowUV('modern', G.windowState(rng, 0.5))); G.wallQuad('windows', fs, u, y + 4.4, 1.0, 2.1, windowUV('door', rng.int(0, 3))); G.wallQuad('windows', fs, u + 1.5, y + 4.8, 1.3, 1.2, windowUV('modern', G.windowState(rng, 0.45))); }
    G.g('metal', r.x0, r.z1).box((r.x0 + r.x1) / 2, y + 3.2, r.z1 + 1.1, L, 0.15, 2.2, C('#7b6c5a'), 0, 1, false);
    G.g('metal', r.x0, r.z1).box((r.x0 + r.x1) / 2, y + 3.95, r.z1 + 2.15, L, 0.9, 0.06, C('#c46a3f'), 0, 1, false);
    const sx = r.x0 - 3, sz = r.z1 + 3.5;
    G.g('metal', sx, sz).box(sx, y + 5, sz, 0.35, 10, 0.35, C('#8e969b'), 0, 1, false);
    G.g('signs', sx, sz).box(sx, y + 10.4, sz, 0.4, 2.6, 4.2, null, 0, 0, true);
    this.world.colliders.circle(sx, sz, 0.35, y - 1, y + 11, { kind: 'pole' });
    const pool = { x0: r.x0 + 6, x1: r.x0 + 18, z0: r.z0 - 14, z1: r.z0 - 4 };
    G.g('pavers', pool.x0, pool.z0).quad([pool.x0 - 1.5, y + 0.02, pool.z1 + 1.5], [pool.x1 + 1.5, y + 0.02, pool.z1 + 1.5], [pool.x1 + 1.5, y + 0.02, pool.z0 - 1.5], [pool.x0 - 1.5, y + 0.02, pool.z0 - 1.5], C('#e8e0d0'), [0, 0, 6, 4]);
    G.g('glassLight', pool.x0, pool.z0).quad([pool.x0, y + 0.05, pool.z1], [pool.x1, y + 0.05, pool.z1], [pool.x1, y + 0.05, pool.z0], [pool.x0, y + 0.05, pool.z0], C('#7fd0e0'), [0, 0, 1, 1]);
    for (let k = 0; k < 5; k++) this.world.parked.push({ x: r.x0 + 4 + k * 6.5, y: y + 0.03, z: r.z1 + 7, rot: Math.PI, lot: true });
    this.world.poi.motel = { x: (r.x0 + r.x1) / 2, z: r.z1 + 10, name: 'Mesa Motel', icon: 'home' };
  }

  // ---- everything outside the grids
  buildOuter() {
    this.bridge();
    this.moorings();
    this.lighthouse();
    this.observatory();
    this.skiLift();
    this.desertLandmarks();
    this.guardrails();
    this.curveSigns();
    this.pois();
  }

  bridge() {
    const G = this.gen, W = this.world, z0 = BRIDGE.z, concrete = C('#cfcdc6'), steel = C('#9ba0a5');
    const deck = BRIDGE.deck, top = BRIDGE.h;
    for (const tx of BRIDGE.towers) {
      for (const sg of [-1, 1]) {
        const lz = z0 + sg * 14.5;
        G.g('wallConcrete', tx, lz).box(tx, (top - 12) / 2 + 4, lz, 3.4, top + 12, 3.4, concrete, 0, 3, false);
        W.colliders.box(tx, lz, 1.7, 1.7, 0, -20, top, { kind: 'pier', mat: 'concrete' });
        // stay cables fanning to the deck on both sides of the tower
        for (let k = 1; k <= 9; k++) {
          const ay = top - 3 - k * 2.6, dx = 18 + k * 22;
          for (const dir of [-1, 1]) strut(G.g('metal', tx, lz), tx, ay, lz, tx + dir * dx, deck + 0.6, lz, 0.11, steel, 4);
        }
      }
      for (const cy of [deck + 14, top - 2]) G.g('wallConcrete', tx, z0).box(tx, cy, z0, 3.0, 2.6, 29, concrete, 0, 3, false);
      W.beacons?.push({ x: tx, y: top + 4, z: z0 - 14.5 }, { x: tx, y: top + 4, z: z0 + 14.5 });
    }
    // piers carry the shore spans; the pylons above stand on the bay floor
    this.world.poi.bridge = { x: -1380, z: BRIDGE.z, name: 'Bayline Bridge', icon: 'view' };
  }

  // mooring buoys; the boats themselves are placed by the boat yard
  moorings() {
    const G = this.gen, red = C('#d9432f'), white = C('#f1efe6'), y = WATER_LEVEL;
    for (const [x, z] of MOORINGS) {
      const g = G.g('paint', x, z);
      g.addGeo(new THREE.SphereGeometry(0.34, 10, 8), x, y + 0.06, z, 0, 1, 1, 1, red);
      g.addGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5), x, y + 0.55, z, 0, 1, 1, 1, white);
    }
  }

  lighthouse() {
    const G = this.gen, T = this.world.terrain, x = ISLE.x + 20, z = ISLE.z - 520;
    const y = Math.max(2.4, T.height(x, z));
    T.flattenRect(x - 12, z - 12, x + 12, z + 12, y, 18);
    const g = G.g('paint', x, z);
    const stack = [[5.2, 4.2, 0, 8, '#f3f1ec'], [4.2, 3.6, 8, 16, '#c63b32'], [3.6, 3.2, 16, 24, '#f3f1ec'], [3.2, 2.9, 24, 29, '#c63b32']];
    for (const [r0, r1, y0, y1, col] of stack) g.addGeo(new THREE.CylinderGeometry(r1, r0, y1 - y0, 20), x, y + (y0 + y1) / 2, z, 0, 1, 1, 1, C(col));
    g.addGeo(new THREE.CylinderGeometry(4.0, 4.0, 0.4, 20), x, y + 29.2, z, 0, 1, 1, 1, C('#3a3d42'));
    G.g('glow', x, z).addGeo(new THREE.CylinderGeometry(1.7, 1.7, 3.2, 14), x, y + 31, z, 0, 1, 1, 1, null);
    g.addGeo(new THREE.ConeGeometry(2.4, 2.4, 14), x, y + 33.6, z, 0, 1, 1, 1, C('#3a3d42'));
    G.g('metal', x, z).addGeo(new THREE.TorusGeometry(3.9, 0.07, 5, 24), x, y + 30.0, z, 0, 1, 1, 1, C('#2a2c2e'), Math.PI / 2);
    this.world.colliders.circle(x, z, 4.8, y - 2, y + 34, { kind: 'building', mat: 'concrete' });
    this.world.beacons?.push({ x, y: y + 35.4, z });
    this.world.poi.isleLight = { x, z: z + 10, name: 'Marin Point Light', icon: 'view' };
  }

  observatory() {
    const G = this.gen, x = 170, z = -1740, y = TOWN_Y.alder;
    const g = G.g('paint', x, z);
    g.addGeo(new THREE.CylinderGeometry(6.4, 6.8, 5, 20), x, y + 2.5, z, 0, 1, 1, 1, C('#e9ecef'));
    g.addGeo(new THREE.SphereGeometry(6.6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), x, y + 5, z, 0, 1, 1, 1, C('#f2f4f6'));
    G.g('glow', x, z).box(x, y + 8.4, z - 5.6, 1.2, 5, 1.4, null, 0, 0, true);
    G.g('metal', x, z).box(x, y + 1.2, z + 6.6, 1.2, 2.4, 0.2, C('#3a3d42'), 0, 1, false);
    this.world.colliders.circle(x, z, 6.8, y - 2, y + 11, { kind: 'building', mat: 'concrete' });
    for (let k = 0; k < 3; k++) this.world.parked.push({ x: x - 14 + k * 5, y: y + 0.03, z: z + 13, rot: Math.PI, lot: true });
    this.world.poi.observatory = { x, z: z + 12, name: 'Alder Peak Observatory', icon: 'view' };
  }

  skiLift() {
    const G = this.gen, T = this.world.terrain, P = this.world.props;
    const a = { x: -150, z: -1936 }, b = { x: -260, z: -2380 };
    const N = 12;
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = T.height(x, z);
      P.place('skiPole', x, y, z, Math.atan2(b.x - a.x, b.z - a.z), 1);
      if (prev) strut(G.g('metal', x, z), prev.x, prev.y + 9.3, prev.z, x, y + 9.3, z, 0.04, C('#3a3d42'), 4);
      prev = { x, y, z };
    }
    const st = { x0: a.x - 6, x1: a.x + 6, z0: a.z - 14, z1: a.z - 2 };
    G.walls('siding', st, T.height(a.x, a.z - 8), T.height(a.x, a.z - 8) + 5, C('#6e4b30'), 2.4, 2.4);
    this.world.poi.skiLift = { x: a.x, z: a.z - 18, name: 'Alder Peak Ski Lift', icon: 'view' };
  }

  desertLandmarks() {
    const P = this.world.props, T = this.world.terrain, y = TOWN_Y.dry;
    P.place('waterTower', DRY.xs[1] + 14, y, DRY.zs[2] + 26, 0.4, 1);
    for (const [dx, dz] of [[330, -40], [-220, 60]]) { const x = 2900 + dx, z = 150 + dz; P.place('windmill', x, T.height(x, z), z, 0.6, 1); }
    this.world.poi.waterTower = { x: DRY.xs[1] + 14, z: DRY.zs[2] + 26, name: 'Dry Springs Water Tower', icon: 'view' };
  }

  // yellow curve warnings 25 m before each tight bend, for both directions of travel
  curveSigns() {
    const W = this.world, R = W.roads, T = W.terrain, P = W.props;
    for (const e of R.edges) {
      if (!['Route 12', 'Route 40', 'Marin Coast Road'].includes(e.name)) continue;
      const pl = e.pl, len = pl.len;
      for (const dir of [1, -1]) {
        let last = -1e9;
        for (let s = 10; s < len - 55; s += 5) {
          const a = dir > 0 ? s : len - s, b = dir > 0 ? s + 45 : len - s - 45, pa = pl.at(a), pb = pl.at(b);
          const ha = Math.atan2(pa.dx * dir, pa.dz * dir), hb = Math.atan2(pb.dx * dir, pb.dz * dir);
          let dh = hb - ha; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
          if (Math.abs(dh) < 1.1 || s - last < 110) continue;
          last = s;
          const ps = pl.at(dir > 0 ? Math.max(2, s - 25) : Math.min(len - 2, len - s + 25)), hd = Math.atan2(ps.dx * dir, ps.dz * dir);
          const off = e.halfW + 1.5, x = ps.x + Math.cos(hd) * -off, z = ps.z + Math.sin(hd) * off;
          P.place('signCurve', x, T.height(x, z), z, hd + Math.PI);
        }
      }
    }
  }

  // guardrails where the road runs along a drop
  guardrails() {
    const W = this.world, R = W.roads, T = W.terrain, P = W.props;
    for (const e of R.edges) {
      if (!['Route 12', 'Route 40', 'Marin Coast Road'].includes(e.name)) continue;
      const pl = e.pl, off = e.halfW + 0.9;
      for (let s = 6; s < pl.len - 6; s += 4) {
        const p = pl.at(s + 2);
        for (const sg of [1, -1]) {
          const x = p.x - p.dz * off * sg, z = p.z + p.dx * off * sg;
          const drop = p.y - T.height(x - p.dz * 5 * sg, z + p.dx * 5 * sg);
          if (drop > 3.2) P.place('guardrail', x, p.y, z, Math.atan2(-p.dz, p.dx), 1, { noCollide: false });
        }
      }
    }
  }

  pois() {
    const poi = this.world.poi;
    poi.alderPeak = { x: -40, z: -1745, name: 'Alder Peak', icon: 'view' };
    poi.drySprings = { x: 2900, z: 150, name: 'Dry Springs', icon: 'civic' };
    poi.marinVillage = { x: -1920, z: -420, name: 'Marin Village', icon: 'civic' };
    poi.calderOverlook = { x: 430, z: -790, name: 'Calder Pass Overlook', icon: 'view' };
    poi.mesaOverlook = { x: 3470, z: 80, name: 'Mesa Overlook', icon: 'view' };
  }

  // ---- vegetation and rocks for the new regions
  scatter(V, P, T, rng, clear) {
    const near = (x, z) => this.world.roads.nearest(x, z, null, 22);
    const open = (x, z, pad) => clear(x, z, pad) && !near(x, z);
    // alpine forest below the snow line, thinning with altitude
    V.scatter(rng, -1500, -2400, 1800, -1000, 9000, ['pine', 'conifer', 'conifer', 'pine', 'birch'], (x, z) => {
      const y = T.height(x, z);
      return y < 262 && rng.f() < (1 - smoothstep(190, 262, y)) * 0.9 + 0.04 && T.normal(x, z).y > 0.62 && open(x, z, 5);
    });
    for (let k = 0; k < 500; k++) { const x = rng.range(-1500, 1800), z = rng.range(-2400, -1000), y = T.height(x, z); if (y > 120 && open(x, z, 4)) P.place('rock', x, y - 0.3, z, rng.f() * 6, rng.range(0.8, 3.0)); }
    // desert: cacti, scrub, rocks
    const dx0 = 1900, dx1 = 3600;
    V.scatter(rng, dx0, -1200, dx1, 1700, 2600, ['cactus', 'cactus', 'scrub', 'scrub', 'scrub'], (x, z) => rng.f() < smoothstep(1950, 2400, x) && T.normal(x, z).y > 0.7 && open(x, z, 4));
    V.scatter(rng, dx0, -1200, dx1, 1700, 3800, ['scrub', 'scrub', 'scrub', 'cactus'], (x, z) => rng.f() < smoothstep(2100, 2700, x) && T.normal(x, z).y > 0.6 && open(x, z, 4));
    for (let k = 0; k < 900; k++) { const x = rng.range(dx0, dx1), z = rng.range(-1200, 1700); if (x > 2000 && open(x, z, 4)) P.place('rock', x, T.height(x, z) - 0.3, z, rng.f() * 6, rng.range(0.7, 3.4)); }
    // island: palms and shrubs
    V.scatter(rng, ISLE.x - ISLE.rx, ISLE.z - ISLE.rz, ISLE.x + ISLE.rx * 0.9, ISLE.z + ISLE.rz, 3200, ['palm', 'palm', 'yard', 'park'], (x, z) => {
      const y = T.height(x, z);
      return y > 1.4 && y < 70 && open(x, z, 4) && rng.f() < 0.9;
    });
    for (let k = 0; k < 260; k++) { const x = rng.range(ISLE.x - ISLE.rx, ISLE.x + ISLE.rx), z = rng.range(ISLE.z - ISLE.rz, ISLE.z + ISLE.rz), y = T.height(x, z); if (y > 1.4 && open(x, z, 3)) P.place('rock', x, y - 0.3, z, rng.f() * 6, rng.range(0.6, 2.2)); }
  }
}

export { WATER_LEVEL, MARIN, ALDER };
