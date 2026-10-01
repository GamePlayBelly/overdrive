import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { windowUV, signUV } from './textures.js';
import { splitRect } from './blocks.js';
import { SURF } from './terrain.js';
import { WATER_LEVEL, MARLOW, POI, BAY_X } from '../data/world.js';

const C = (h) => new THREE.Color(h);
const PASTEL = ['#f6ead0', '#efd2b8', '#d3e6e4', '#f2cfc6', '#e5e2c9', '#cfe0ef', '#f4dfe0', '#e8d8b8', '#f0ecdf'];
const ROOF = ['#b4573a', '#a8482f', '#c4664a', '#6d7a80', '#8a6a52'];
const AWN = ['#1f8a8c', '#e0684f', '#e6b84a', '#f4f0e6', '#2f6ea6', '#b5417a'];
const pickC = (rng, a) => C(rng.pick(a));

// ---------------------------------------------------------------- Marlow Bay blocks (methods mixed into BuildingGen)
export const coastMethods = {
  coastBlock(B) {
    const rng = this.rng, l = B.lot, c = B.cell;
    const row = c.z0 < 2080 ? 0 : c.z0 < 2170 ? 1 : 2;
    const y0 = B.raise;
    const halves = [{ x0: l.x0, x1: l.x1, z0: l.z0, z1: (l.z0 + l.z1) / 2 - 2, front: 'n' }, { x0: l.x0, x1: l.x1, z0: (l.z0 + l.z1) / 2 + 2, z1: l.z1, front: 's' }];
    // service alley between the two halves
    const alley = this.g('concrete', l.x0, l.z0), ay = y0 + 0.012;
    alley.quad([l.x0, ay, (l.z0 + l.z1) / 2 + 2], [l.x1, ay, (l.z0 + l.z1) / 2 + 2], [l.x1, ay, (l.z0 + l.z1) / 2 - 2], [l.x0, ay, (l.z0 + l.z1) / 2 - 2], C('#b9b6ad'), [0, 0, (l.x1 - l.x0) / 4, 1]);
    for (const h of halves) {
      const parcels = splitRect(h, rng, row === 2 ? 22 : 13, row === 2 ? 40 : 24, 'x');
      for (const p of parcels) {
        const r = rng.f();
        const inset = { x0: p.x0 + 0.6, x1: p.x1 - 0.6, z0: p.z0, z1: p.z1 };
        if (row === 0) { if (r < 0.7) this.beachHouse(inset, h.front, rng, y0); else this.pastelBuilding(inset, h.front, rng, y0, { floors: rng.int(2, 3), shop: false, motel: true }); }
        else if (row === 1) { if (r < 0.6) this.pastelBuilding(inset, h.front, rng, y0, { floors: rng.int(2, 4), shop: true }); else if (r < 0.85) this.pastelBuilding(inset, h.front, rng, y0, { floors: rng.int(3, 5), shop: false }); else this.plazaLot(inset, y0, rng); }
        else if (h.front === 's') { if (r < 0.5) this.hotelTower(inset, h.front, rng, y0); else if (r < 0.8) this.beachRestaurant(inset, h.front, rng, y0); else this.pastelBuilding(inset, h.front, rng, y0, { floors: rng.int(2, 3), shop: true }); }
        else if (r < 0.55) this.pastelBuilding(inset, h.front, rng, y0, { floors: rng.int(3, 6), shop: false, balcony: true }); else this.hotelTower({ ...inset, z0: inset.z0 + 2 }, h.front, rng, y0, true);
      }
    }
  },

  hotelTower(p, front, rng, y0, small = false) {
    const H = small ? rng.range(18, 26) : rng.range(24, 42);
    if (Math.min(p.x1 - p.x0, p.z1 - p.z0) < 14) return this.pastelBuilding(p, front, rng, y0, { floors: 4, shop: false, balcony: true });
    this.tower(p, rng.chance(0.5) ? 'apartment' : 'concrete', H, y0, rng);
    const P = this.world.props;
    for (let k = 0; k < 3; k++) P.place('planter', p.x0 + 3 + k * 4, y0, p.z1 + 0.6, 0, 1.2, { noCollide: false });
  },

  pastelBuilding(p, front, rng, y0, o = {}) {
    const floors = o.floors ?? 3, gf = o.shop ? 4.2 : 3.4, fh = 3.2;
    const H = gf + (floors - 1) * fh;
    const col = pickC(rng, PASTEL), trim = C('#fbf8f0');
    this.walls('stucco', p, y0, y0 + H, col, 4, 4);
    this.top('roof', p, y0 + H, C('#9a9894'));
    this.parapet('wallConcrete', p, y0 + H, 0.9, 0.3, trim);
    this.world.colliders.box((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, (p.x1 - p.x0) / 2, (p.z1 - p.z0) / 2, 0, -1, y0 + H, { kind: 'building', mat: 'stucco' });
    const sides = this.sides(p), fs = sides.find((s) => s.key === front), L = this.sideLen(fs);
    this.wallBox('wallConcrete', fs, L / 2, y0 + gf - 0.15, L, 0.3, 0.3, trim);
    if (o.shop) this.storefronts(fs, y0, rng, null, 0.9, Math.max(5.2, Math.min(L, 8)));
    else { this.wallQuad('windows', fs, L / 2, y0 + 1.15, 1.6, 2.3, windowUV('door', rng.int(0, 3))); for (let u = 2.2; u < L - 1.5; u += 3.2) if (Math.abs(u - L / 2) > 1.8) this.wallQuad('windows', fs, u, y0 + 1.7, 1.6, 1.8, windowUV('modern', this.windowState(rng, 0.4))); }
    const n = Math.max(1, Math.floor(L / 3.1));
    for (let f = 1; f < floors; f++) {
      const yc = y0 + gf + (f - 1) * fh + 1.6;
      for (let k = 0; k < n; k++) {
        const u = (L / n) * (k + 0.5);
        this.wallQuad('windows', fs, u, yc, 1.5, 2.0, windowUV('modern', this.windowState(rng, 0.42)));
        if (o.balcony || rng.chance(0.4)) { this.wallBox('wallConcrete', fs, u, yc - 1.15, 2.1, 0.18, 1.1, trim); this.wallBox('metal', fs, u, yc - 0.55, 2.1, 0.9, 0.05, C('#e8e8e4')); }
      }
    }
    for (const s of sides) { if (s === fs) continue; const Ls = this.sideLen(s); if (Ls < 6) continue; const m = Math.floor(Ls / 3.8); for (let f = 1; f < floors; f++) for (let k = 0; k < m; k++) if (rng.chance(0.55)) this.wallQuad('windows', s, (Ls / m) * (k + 0.5), y0 + gf + (f - 1) * fh + 1.6, 1.3, 1.8, windowUV('modern', this.windowState(rng, 0.3))); }
    // roof terrace + props
    const P = this.world.props;
    if (rng.chance(0.45)) P.place('acUnit', (p.x0 + p.x1) / 2, y0 + H, (p.z0 + p.z1) / 2, 0, 0.8, { noCollide: true });
    if (rng.chance(0.3)) this.world.veg.tree(p.x0 + 2, y0 + H, p.z0 + 2, 'palm', rng, 0.35);
    if (o.motel) { for (let k = 0; k < 3; k++) this.parked.push({ x: p.x0 + 3 + k * 4.5, y: y0 + 0.05, z: p.z1 + (front === 's' ? 5 : -5), rot: front === 's' ? Math.PI : 0, lot: true }); }
    // sidewalk palm
    if (rng.chance(0.5)) { const px = p.x0 + rng.range(2, p.x1 - p.x0 - 2); this.world.veg.tree(px, y0, front === 's' ? p.z1 + 1.2 : p.z0 - 1.2, 'palm', rng, rng.range(0.9, 1.2)); }
  },

  beachHouse(p, front, rng, y0) {
    const w = p.x1 - p.x0, d = p.z1 - p.z0;
    const bw = Math.min(w - 4, rng.range(9, 13)), bd = Math.min(d - 12, rng.range(8, 11));
    if (bw < 7 || bd < 6) return;
    const fz = front === 's' ? p.z1 - 3.5 - bd : p.z0 + 3.5;
    const main = { x0: p.x0 + (w - bw) / 2, x1: p.x0 + (w - bw) / 2 + bw, z0: fz, z1: fz + bd };
    const floors = rng.chance(0.4) ? 2 : 1, H = floors * 3.0;
    const col = pickC(rng, PASTEL), trim = C('#fbf8f0');
    this.walls('stucco', main, y0, y0 + H, col, 4, 4);
    if (rng.chance(0.5)) this.gableRoof(main, y0 + H, rng.range(1.8, 2.6), true, pickC(rng, ROOF), col, true);
    else { this.top('roof', main, y0 + H, C('#9a9894')); this.parapet('wallConcrete', main, y0 + H, 0.5, 0.25, trim); }
    this.world.colliders.box((main.x0 + main.x1) / 2, (main.z0 + main.z1) / 2, bw / 2, bd / 2, 0, -1, y0 + H + 2, { kind: 'building', mat: 'stucco' });
    const S = this.sides(main), fs = S.find((s) => s.key === front), L = this.sideLen(fs);
    this.wallQuad('windows', fs, L * 0.5, y0 + 1.1, 1.0, 2.1, windowUV('door', rng.int(0, 3)));
    for (let u = 1.6; u < L - 1.2; u += 2.8) if (Math.abs(u - L * 0.5) > 1.5) this.wallQuad('windows', fs, u, y0 + 1.6, 1.5, 1.5, windowUV('modern', this.windowState(rng, 0.4)));
    if (floors === 2) for (let u = 1.6; u < L - 1.2; u += 2.8) this.wallQuad('windows', fs, u, y0 + 4.5, 1.5, 1.5, windowUV('modern', this.windowState(rng, 0.4)));
    for (const s of S) { if (s === fs) continue; const Ls = this.sideLen(s); for (let u = 2; u < Ls - 1.5; u += 3.2) if (rng.chance(0.55)) this.wallQuad('windows', s, u, y0 + 1.6, 1.3, 1.4, windowUV('modern', this.windowState(rng, 0.3))); }
    // deck
    const dz = front === 's' ? main.z1 : main.z0 - 3;
    this.g('wood', main.x0, dz).box((main.x0 + main.x1) / 2, y0 + 0.2, dz + 1.5, bw, 0.4, 3, C('#b89a72'), 0, 1.5, false);
    const veg = this.world.veg;
    veg.tree(p.x0 + 2, y0, front === 's' ? p.z1 - 1.5 : p.z0 + 1.5, 'palm', rng, rng.range(0.9, 1.25));
    if (rng.chance(0.5)) veg.tree(p.x1 - 2, y0, front === 's' ? p.z1 - 2 : p.z0 + 2, 'palm', rng, rng.range(0.8, 1.15));
    if (rng.chance(0.5)) this.parked.push({ x: (p.x0 + p.x1) / 2 + 3, y: y0 + 0.05, z: front === 's' ? p.z1 - 1.5 : p.z0 + 1.5, rot: front === 's' ? 0 : Math.PI, driveway: true });
    for (let k = 0; k < rng.int(1, 3); k++) this.world.props.place('shrub', main.x0 + rng.range(0.5, bw - 0.5), y0, front === 's' ? main.z1 + 3.4 : main.z0 - 0.7, rng.f() * 6, rng.range(0.6, 1.0));
  },

  beachRestaurant(p, front, rng, y0) {
    const w = p.x1 - p.x0, d = p.z1 - p.z0;
    const bd = Math.min(d - 10, 10), bw = Math.min(w, 20);
    const b = { x0: p.x0 + (w - bw) / 2, x1: p.x0 + (w - bw) / 2 + bw, z0: front === 's' ? p.z1 - bd : p.z0, z1: front === 's' ? p.z1 : p.z0 + bd };
    const col = pickC(rng, PASTEL);
    this.walls('stucco', b, y0, y0 + 4.6, col, 4, 4);
    this.top('roof', b, y0 + 4.6, C('#9a9894'));
    this.parapet('wallConcrete', b, y0 + 4.6, 0.6, 0.25, C('#fbf8f0'));
    this.world.colliders.box((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, bw / 2, bd / 2, 0, -1, y0 + 4.6, { kind: 'building', mat: 'stucco' });
    const fs = this.sides(b).find((s) => s.key === front), L = this.sideLen(fs);
    for (let u = 2.5; u < L - 1.5; u += 4.4) this.wallQuad('windows', fs, u, y0 + 2.0, 3.4, 2.8, windowUV('shop', 1));
    this.wallQuad('signs', fs, L / 2, y0 + 4.05, Math.min(L - 3, 6), 0.9, signUV(rng.int(0, 20)), 0.12);
    // terrace with umbrellas
    const tz = front === 's' ? b.z0 - 5 : b.z1;
    this.g('wood', b.x0, tz).box((b.x0 + b.x1) / 2, y0 + 0.15, tz + 2.5, bw, 0.3, 5, C('#b89a72'), 0, 1.5, false);
    for (let u = 2; u < bw - 1; u += 4.5) this.umbrella(b.x0 + u, y0 + 0.3, tz + 2.5, rng);
  },

  plazaLot(p, y0, rng) {
    const b = this.g('pavers', p.x0, p.z0), y = y0 + 0.012;
    b.quad([p.x0, y, p.z1], [p.x1, y, p.z1], [p.x1, y, p.z0], [p.x0, y, p.z0], C('#f0e6d2'), [p.x0 / 2.4, p.z1 / 2.4, p.x1 / 2.4, p.z0 / 2.4]);
    const P = this.world.props, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    for (let k = 0; k < 4; k++) this.world.veg.tree(p.x0 + 3 + rng.f() * (p.x1 - p.x0 - 6), y0, p.z0 + 3 + rng.f() * (p.z1 - p.z0 - 6), 'palm', rng, rng.range(1, 1.3));
    for (let k = 0; k < 3; k++) P.place('bench', cx + rng.range(-5, 5), y0, cz + rng.range(-6, 6), rng.f() * 6);
  },

  umbrella(x, y, z, rng, h = 2.3) {
    const g = this.g('paint', x, z);
    g.addGeo(new THREE.CylinderGeometry(0.04, 0.04, h, 5), x, y + h / 2, z, 0, 1, 1, 1, C('#d9d6cc'));
    const cone = new THREE.ConeGeometry(1.35, 0.55, 10, 1, true);
    g.addGeo(cone, x, y + h + 0.18, z, 0, 1, 1, 1, C(rng.pick(['#e0684f', '#f4f0e6', '#1f8a8c', '#e6b84a', '#2f6ea6'])));
  },
};

// ---------------------------------------------------------------- beach, boardwalk, pier, marina, lighthouse
export function buildCoastAreas(world, gen) {
  const W = world, G = gen, rng = new RNG('coast'), P = W.props, T = W.terrain;
  const M = MARLOW;
  const wood = C('#b39a74'), dark = C('#5b4b3a'), white = C('#f4f2ea');
  const y = 0.2;
  // ---- boardwalk along Ocean Boulevard
  const bw = G.g('wood', 0, M.boardZ);
  const bz0 = M.boardZ - 6, bz1 = M.boardZ + 7;
  bw.quad([M.x0 - 20, y, bz1], [M.x1 + 20, y, bz1], [M.x1 + 20, y, bz0], [M.x0 - 20, y, bz0], wood, [0, 0, (M.x1 - M.x0 + 40) / 2.4, (bz1 - bz0) / 2.4]);
  T.paintRect(M.x0 - 20, bz0, M.x1 + 20, bz1, SURF.CONCRETE);
  W.raised.addRect(M.x0 - 20, bz0, M.x1 + 20, bz1, y);
  // edge beam and railing on the beach side
  const rail = G.g('metal', 0, bz1);
  for (let x = M.x0 - 20; x <= M.x1 + 20; x += 3) { rail.box(x, y + 0.55, bz1 - 0.15, 0.08, 1.1, 0.08, white, 0, 1, false); }
  rail.box((M.x0 + M.x1) / 2, y + 1.05, bz1 - 0.15, M.x1 - M.x0 + 40, 0.07, 0.08, white, 0, 1, false);
  W.colliders.seg(M.x0 - 20, bz1 - 0.1, M.x1 + 20, bz1 - 0.1, 0.25, -1, 1.4, { kind: 'wall', mat: 'metal' });
  for (let x = M.x0; x <= M.x1; x += 40) P.place('lampPost', x, y, bz1 - 1, 0, 1.2, { noCollide: false });
  for (let x = M.x0 + 12; x <= M.x1; x += 34) P.place('bench', x, y, bz0 + 3.5, 0, 1, {});
  // ---- beach: umbrellas, loungers, lifeguard towers, volleyball
  const bx0 = M.x0 - 10, bx1 = M.x1 + 10;
  for (let k = 0; k < 90; k++) {
    const x = rng.range(bx0, bx1), z = rng.range(M.beachZ + 4, M.beachZ + 44), gy = T.height(x, z);
    if (gy < WATER_LEVEL + 0.8) continue;
    G.umbrella(x, gy, z, rng);
    const lg = G.g('paint', x, z);
    for (const dx of [-0.9, 0.9]) lg.box(x + dx, gy + 0.18, z + 1.4, 0.65, 0.12, 1.7, C(rng.pick(['#f4f0e6', '#e0684f', '#1f8a8c'])), 0, 1, false);
  }
  for (const lx of [-240, -20, 150, 300]) {
    const lz = M.beachZ + 32, gy = T.height(lx, lz), b = G.g('wood', lx, lz);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) b.box(lx + dx * 1.1, gy + 1.4, lz + dz * 1.1, 0.15, 2.8, 0.15, wood, 0, 1, false);
    b.box(lx, gy + 2.9, lz, 3.2, 1.6, 3.2, C('#e5383b'), 0, 1, false);
    b.box(lx, gy + 3.85, lz, 3.6, 0.25, 3.6, white, 0, 1, false);
    W.colliders.box(lx, lz, 1.7, 1.7, 0, gy - 1, gy + 4, { kind: 'wall', mat: 'wood' });
  }
  { const vx = -110, vz = M.beachZ + 36, gy = T.height(vx, vz), b = G.g('metal', vx, vz); for (const s of [-1, 1]) b.box(vx + s * 4.5, gy + 1.3, vz, 0.12, 2.6, 0.12, white, 0, 1, false); b.box(vx, gy + 2.1, vz, 9, 1.0, 0.03, C('#f0f0f0'), 0, 1, false); }
  // ---- sea wall and rock groynes
  for (let x = M.x0 - 20; x < M.x1 + 20; x += 24) { if (rng.chance(0.55)) for (let k = 0; k < 5; k++) P.place('rock', x + rng.range(-3, 3), T.height(x, M.beachZ + 12 + k * 3) - 0.4, M.beachZ + 12 + k * 3.4 + rng.range(-1, 1), rng.f() * 6, rng.range(0.8, 1.7), { noCollide: false }); }
  // ---- pier
  const px = POI.pier.x, pz0 = M.beachZ - 2, pz1 = 2450, pw = 9, deck = 1.8;
  const pd = G.g('wood', px, pz0);
  pd.quad([px - pw / 2, deck, pz1], [px + pw / 2, deck, pz1], [px + pw / 2, deck, pz0], [px - pw / 2, deck, pz0], wood, [0, 0, pw / 2.4, (pz1 - pz0) / 2.4]);
  pd.box(px, deck - 0.35, (pz0 + pz1) / 2, pw, 0.5, pz1 - pz0, dark, 0, 2, false);
  const pm = G.g('metal', px, pz0);
  for (let z = pz0; z <= pz1; z += 6) for (const s of [-1, 1]) { const pile = new THREE.CylinderGeometry(0.28, 0.32, deck + 8, 6); pm.addGeo(pile, px + s * (pw / 2 - 0.5), (deck - 8) / 2 + 0.5, z, 0, 1, 1, 1, dark); }
  for (const s of [-1, 1]) { for (let z = pz0; z <= pz1; z += 3) pm.box(px + s * (pw / 2 - 0.1), deck + 0.55, z, 0.08, 1.1, 0.08, white, 0, 1, false); pm.box(px + s * (pw / 2 - 0.1), deck + 1.05, (pz0 + pz1) / 2, 0.07, 0.07, pz1 - pz0, white, 0, 1, false); W.colliders.seg(px + s * (pw / 2 - 0.1), pz0, px + s * (pw / 2 - 0.1), pz1, 0.2, deck - 1, deck + 1.3, { kind: 'wall', mat: 'metal' }); }
  W.raised.addRect(px - pw / 2, pz0, px + pw / 2, pz1, deck);
  for (let z = pz0 + 10; z < pz1 - 10; z += 24) for (const s of [-1, 1]) P.place('lampPost', px + s * (pw / 2 - 0.6), deck, z, 0, 1.2, { noCollide: false });
  // pier end pavilion
  const pv = { x0: px - 6, x1: px + 6, z0: pz1 - 16, z1: pz1 - 2 };
  G.walls('stucco', pv, deck, deck + 5, C('#f4f0e6'), 4, 4); G.top('roof', pv, deck + 5, C('#9a9894')); G.parapet('wallConcrete', pv, deck + 5, 0.6, 0.25, C('#e0684f'));
  W.colliders.box(px, (pv.z0 + pv.z1) / 2, 6, 7, 0, deck - 1, deck + 5, { kind: 'building' });
  for (const s of G.sides(pv)) { const L = G.sideLen(s); for (let u = 2; u < L - 1; u += 3) G.wallQuad('windows', s, u, deck + 2.3, 1.8, 2.4, windowUV('shop', 1)); }
  // ---- ferris wheel at the pier root
  const fw = buildFerrisWheel(px - 34, 0.2, M.beachZ + 12, 15);
  W.group.add(fw.group); W.animated.push(fw.update);
  W.colliders.circle(px - 34, M.beachZ + 12, 3, -1, 8, { kind: 'building', mat: 'metal' });
  // ---- marina: floating docks over a dredged basin at the waterline, berths between the fingers
  const MY = WATER_LEVEL + 1.0;
  const mx0 = -320, mx1 = -170, mz0 = M.beachZ + 48;
  const spine = { x0: mx0, x1: mx1, z0: mz0 + 22, z1: mz0 + 25.5 };
  const fingerEnd = mz0 + 72;
  T.carve(mx0 - 12, spine.z1, mx1 + 12, mz0 + 98, WATER_LEVEL - 3.3, 12);
  const dk = G.g('wood', mx0, mz0), mm = G.g('metal', mx0, mz0), float = G.g('paint', mx0, mz0);
  const pontoon = C('#4d5963'), cleat = C('#cfd2d6');
  const dockRect = (x0, z0, x1, z1) => {
    dk.quad([x0, MY, z1], [x1, MY, z1], [x1, MY, z0], [x0, MY, z0], wood, [0, 0, (x1 - x0) / 2.4, (z1 - z0) / 2.4]);
    float.box((x0 + x1) / 2, MY - 0.6, (z0 + z1) / 2, x1 - x0, 1.2, z1 - z0, pontoon, 0, 2, false);
    W.addPlatform(x0, z0, x1, z1, MY);
    W.colliders.box((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, WATER_LEVEL - 3, MY + 0.02, { kind: 'pier', mat: 'wood' });
  };
  dockRect(spine.x0, spine.z0, spine.x1, spine.z1);
  // apron from the sand up onto the spine
  dk.quad([mx0, MY, spine.z0], [mx1, MY, spine.z0], [mx1, MY - 0.3, spine.z0 - 7], [mx0, MY - 0.3, spine.z0 - 7], wood, [0, 0, (mx1 - mx0) / 2.4, 3]);
  W.addPlatform(mx0, spine.z0 - 7, mx1, spine.z0, MY - 0.3, MY);
  const fingers = [];
  for (let x = mx0 + 10; x <= mx1 - 10; x += 32) fingers.push(x);
  const berths = [];
  for (const fx of fingers) {
    dockRect(fx - 1.1, spine.z1, fx + 1.1, fingerEnd);
    for (let z = spine.z1 + 3; z < fingerEnd; z += 6) for (const s of [-1, 1]) mm.box(fx + s * 1.0, MY + 0.06, z, 0.22, 0.12, 0.12, cleat, 0, 1, false);
    for (const s of [-1, 1]) for (const z of [spine.z1 + 1, fingerEnd - 0.4]) { mm.addGeo(new THREE.CylinderGeometry(0.2, 0.22, 9, 6), fx + s * 1.5, MY - 3.4, z, 0, 1, 1, 1, dark); W.colliders.circle(fx + s * 1.5, z, 0.25, WATER_LEVEL - 4, MY + 1.8, { kind: 'pier', mat: 'wood' }); }
    for (const s of [-1, 1]) berths.push({ x: fx + s * 4.6, z: fingerEnd - 10, dir: s, fx });
  }
  for (let x = mx0; x <= mx1; x += 8) for (const z of [spine.z0 + 0.3, spine.z1 - 0.3]) mm.addGeo(new THREE.CylinderGeometry(0.22, 0.25, 9, 6), x, MY - 3.4, z, 0, 1, 1, 1, dark);
  // harbor master house + boat storage shed stay on the sand
  const hm = { x0: mx0 + 60, x1: mx0 + 82, z0: M.beachZ - 22, z1: M.beachZ - 4 };
  G.walls('stucco', hm, 0.1, 6, C('#e9d2b5'), 4, 4); G.gableRoof(hm, 6, 2.6, true, C('#b4573a'), C('#e9d2b5'), true);
  W.colliders.box((hm.x0 + hm.x1) / 2, (hm.z0 + hm.z1) / 2, 11, 9, 0, -1, 9, { kind: 'building' });
  for (const s of G.sides(hm)) { const L = G.sideLen(s); for (let u = 2.4; u < L - 1.5; u += 3.6) G.wallQuad('windows', s, u, 2.2, 1.6, 1.8, windowUV('modern', G.windowState(rng, 0.4))); }
  // breakwater of rock
  for (let k = 0; k < 44; k++) { const zz = mz0 - 20 + k * 2.9, xx = mx1 + 34 + Math.sin(k * 0.12) * 4; P.place('rock', xx + rng.range(-1, 1), Math.min(WATER_LEVEL - 0.6, T.height(xx, zz) + 0.2), zz, rng.f() * 6, rng.range(1.6, 3), { noCollide: false }); }
  // lighthouse
  const lx = POI.lighthouse.x, lz = POI.lighthouse.z, lh = 30;
  const lg = G.g('paint', lx, lz);
  for (let s = 0; s < 6; s++) lg.addGeo(new THREE.CylinderGeometry(3.4 - s * 0.32 - 0.3, 3.4 - s * 0.32, lh / 6, 16), lx, 0.5 + s * (lh / 6) + lh / 12, lz, 0, 1, 1, 1, s % 2 ? C('#e5383b') : white);
  lg.addGeo(new THREE.CylinderGeometry(3.4, 3.4, 0.6, 16), lx, lh + 0.8, lz, 0, 1, 1, 1, C('#2b2d30'));
  lg.addGeo(new THREE.ConeGeometry(2.4, 1.6, 12), lx, lh + 4.1, lz, 0, 1, 1, 1, C('#2b2d30'));
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.55, 0.3), toneMapped: false });
  const lampMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 10), lampMat);
  lampMesh.position.set(lx, lh + 2.2, lz); lampMesh.matrixAutoUpdate = false; lampMesh.updateMatrix();
  W.group.add(lampMesh);
  W.animated.push((dt, sky) => { const n = sky ? sky.night : 0; const k = 0.5 + 3.4 * n * (0.65 + 0.35 * Math.sin(performance.now() / 500)); lampMat.color.setRGB(k * 1.0, k * 0.9, k * 0.5); });
  W.colliders.circle(lx, lz, 3.4, -1, lh, { kind: 'building', mat: 'concrete' });
  W.beacons.push({ x: lx, y: lh + 5.5, z: lz });
  // pier: walkable deck over the water, approach ramp from the sand, piles the hulls can hit
  W.addPlatform(px - pw / 2, pz0, px + pw / 2, pz1, deck);
  W.addPlatform(px - pw / 2, pz0 - 14, px + pw / 2, pz0, 0.05, deck);
  pd.quad([px - pw / 2, 0.05, pz0 - 14], [px + pw / 2, 0.05, pz0 - 14], [px + pw / 2, deck, pz0], [px - pw / 2, deck, pz0], wood, [0, 0, pw / 2.4, 14 / 2.4]);
  for (let z = pz0 + 18; z <= pz1; z += 6) for (const s of [-1, 1]) W.colliders.circle(px + s * (pw / 2 - 0.5), z, 0.34, WATER_LEVEL - 5, 0.6, { kind: 'pier', mat: 'wood' });
  // registered berths (used by the boat yard)
  W.marina = { berths, spine, x0: mx0, x1: mx1, z0: mz0, deckY: MY };
  W.poi.marina = { ...W.poi.marina, x: -250, z: spine.z0 - 10 };
  W.poi.pier = { ...W.poi.pier, x: px, z: M.beachZ + 6 };
  buildSmallCraftDocks(W, G);
  T.paintRect(M.x0 - 200, M.beachZ + 2, M.x1 + 200, 2362, SURF.SAND);
}

// floating fingers off the Port of Riverton quay for small craft
function buildSmallCraftDocks(W, G) {
  const T = W.terrain, P = W.props;
  void P;
  const MY = WATER_LEVEL + 1.0, qx = BAY_X, y = 0.12;
  const wood = C('#b39a74'), dark = C('#3f4850'), pontoon = C('#4d5963'), cleat = C('#cfd2d6');
  const dk = G.g('wood', qx - 20, 170), fl = G.g('paint', qx - 20, 170), pm = G.g('metal', qx - 20, 170);
  T.carve(qx - 62, 138, qx - 2, 218, WATER_LEVEL - 3.2, 10);
  const berths = [];
  for (const cz of [152, 176, 200]) {
    // stair ramp from the quay top down to the float
    dk.quad([qx, y, cz + 1.3], [qx, y, cz - 1.3], [qx - 12, MY, cz - 1.3], [qx - 12, MY, cz + 1.3], wood, [0, 0, 1, 6]);
    W.addPlatform(qx - 12, cz - 1.3, qx - 0.2, cz + 1.3, MY, y);
    const x0 = qx - 44, x1 = qx - 12;
    dk.quad([x1, MY, cz + 1.2], [x1, MY, cz - 1.2], [x0, MY, cz - 1.2], [x0, MY, cz + 1.2], wood, [0, 0, 1, 14]);
    fl.box((x0 + x1) / 2, MY - 0.6, cz, x1 - x0, 1.2, 2.4, pontoon, 0, 2, false);
    W.addPlatform(x0, cz - 1.2, x1, cz + 1.2, MY);
    W.colliders.box((x0 + x1) / 2, cz, (x1 - x0) / 2, 1.2, 0, WATER_LEVEL - 3, MY + 0.02, { kind: 'pier', mat: 'wood' });
    for (let x = x0 + 3; x < x1; x += 6) for (const s of [-1, 1]) pm.box(x, MY + 0.06, cz + s * 1.05, 0.12, 0.12, 0.22, cleat, 0, 1, false);
    for (const s of [-1, 1]) { pm.addGeo(new THREE.CylinderGeometry(0.2, 0.22, 9, 6), x0 + 0.5, MY - 3.4, cz + s * 1.5, 0, 1, 1, 1, dark); W.colliders.circle(x0 + 0.5, cz + s * 1.5, 0.25, WATER_LEVEL - 4, MY + 1.8, { kind: 'pier', mat: 'wood' }); }
    for (const s of [-1, 1]) berths.push({ x: x0 + 8 + 14, z: cz + s * 5.4, dir: s, yaw: -Math.PI / 2 });
  }
  W.harborDocks = { berths, deckY: MY };
  W.poi.harborDocks = { ...W.poi.harborDocks, x: qx + 6, z: 176 };
}

function buildFerrisWheel(x, y, z, R) {
  const group = new THREE.Group(); group.position.set(x, y + R + 3, z);
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.55, metalness: 0.4 });
  const parts = [];
  const add = (geo, px, py, pz, rz = 0, rx = 0) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1)); const g = geo.clone(); g.applyMatrix4(m); parts.push(g); };
  const torus = new THREE.TorusGeometry(R, 0.22, 6, 40), spoke = new THREE.CylinderGeometry(0.1, 0.1, R * 2, 5);
  add(torus, 0, 0, -1.4); add(torus, 0, 0, 1.4);
  for (let i = 0; i < 6; i++) for (const zz of [-1.4, 1.4]) add(spoke, 0, 0, zz, (i * Math.PI) / 6);
  const rim = new THREE.Mesh(mergeGeos(parts), mat);
  const rimGroup = new THREE.Group(); rimGroup.add(rim); group.add(rimGroup);
  const legParts = [];
  const leg = new THREE.CylinderGeometry(0.28, 0.4, R + 4, 6);
  for (const s of [-1, 1]) for (const zz of [-2.2, 2.2]) { const g = leg.clone(); g.rotateZ(s * 0.3); g.translate(s * R * 0.16, -R / 2 - 1.2, zz); legParts.push(g); }
  const legs = new THREE.Mesh(mergeGeos(legParts), mat); group.add(legs);
  const cabG = new THREE.BoxGeometry(2.2, 1.7, 2.6);
  const N = 12, cabs = new THREE.InstancedMesh(cabG, new THREE.MeshStandardMaterial({ roughness: 0.6 }), N);
  const cols = [0xe0684f, 0x1f8a8c, 0xe6b84a, 0xf4f0e6, 0x2f6ea6];
  for (let i = 0; i < N; i++) cabs.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  cabs.frustumCulled = false; group.add(cabs);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const m4 = new THREE.Matrix4();
  let ang = 0;
  const update = (dt) => {
    ang += dt * 0.09;
    rimGroup.rotation.z = ang;
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2 + ang; m4.makeTranslation(Math.cos(a) * R, Math.sin(a) * R - 1.2, 0); cabs.setMatrixAt(i, m4); }
    cabs.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { group, update };
}

function mergeGeos(list) {
  const pos = [], nor = [], idx = [];
  let off = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (g.index) for (const k of g.index.array) idx.push(k + off); else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setIndex(idx);
  return out;
}
