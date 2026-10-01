import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { windowUV, signUV } from './textures.js';
import { BRAND_INDEX } from '../data/brands.js';
import { BAY_X, WATER_LEVEL, RIDGE_ROAD } from '../data/world.js';
import { SURF } from './terrain.js';
import { Polyline, catmull } from '../core/math.js';
import { Regions } from './regions.js';

const C = (h) => new THREE.Color(h);

export class Specials {
  constructor(world, gen) {
    this.world = world;
    this.gen = gen;
    this.rng = new RNG('specials');
    this.region = new Regions(world, gen);
  }

  handle(B) {
    const cx = (B.cell.x0 + B.cell.x1) / 2, cz = (B.cell.z0 + B.cell.z1) / 2;
    switch (B.zone) {
      case 'park': return this.park(B), true;
      case 'police': return this.police(B), true;
      case 'hotel': return this.hotel(B), true;
      case 'garage': return this.garage(B), true;
      case 'school': return this.school(B), true;
      case 'plaza': return this.plaza(B), true;
      case 'cityhall': return this.cityHall(B), true;
      case 'lodge': case 'chapel': case 'alpstore': case 'drygas': case 'diner': case 'drystore': case 'motel': return this.region.zone(B);
      case 'commercial':
        if (cx < 395 && cz < 165) return this.gasStation(B), true;
        if (cx < 395 && cz < 220) return this.dealership(B), true;
        if (cx < 395) return this.supermarket(B), true;
        if (cz < 220) return this.stripMall(B), true;
        return this.motorClub(B), true;
    }
    return false;
  }

  pave(mat, r, y, col = C('#ffffff'), uv = 3) {
    this.world.terrain.paintRect(r.x0, r.z0, r.x1, r.z1, mat === 'asphalt' ? SURF.ASPHALT : SURF.CONCRETE);
    const b = this.gen.g(mat, r.x0, r.z0);
    b.quad([r.x0, y, r.z1], [r.x1, y, r.z1], [r.x1, y, r.z0], [r.x0, y, r.z0], col, [r.x0 / uv, r.z1 / uv, r.x1 / uv, r.z0 / uv]);
  }

  // ---------------- parks ----------------
  park(B) {
    const l = B.lot, y = B.raise, rng = this.rng, P = this.world.props, V = this.world.veg;
    B.special = 'park';
    const big = l.x1 - l.x0 > 60 && l.z1 - l.z0 > 60;
    const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
    const g = this.gen.g('grass', cx, cz);
    g.quad([l.x0, y - 0.02, l.z1], [l.x1, y - 0.02, l.z1], [l.x1, y - 0.02, l.z0], [l.x0, y - 0.02, l.z0], C('#ffffff'), [l.x0 / 5, l.z1 / 5, l.x1 / 5, l.z0 / 5]);
    this.world.terrain.paintRect(l.x0, l.z0, l.x1, l.z1, SURF.GRASS);
    // diagonal + cross paths
    const pw = 3.2;
    this.pave('pavers', { x0: cx - pw / 2, x1: cx + pw / 2, z0: l.z0, z1: l.z1 }, y + 0.005);
    this.pave('pavers', { x0: l.x0, x1: l.x1, z0: cz - pw / 2, z1: cz + pw / 2 }, y + 0.006);
    if (big) {
      // central fountain plaza
      const R = 11;
      this.pave('pavers', { x0: cx - R, x1: cx + R, z0: cz - R, z1: cz + R }, y + 0.008);
      const f = this.gen.g('wallConcrete', cx, cz);
      f.addGeo(new THREE.CylinderGeometry(6, 6.2, 0.7, 32, 1, true), cx, y + 0.35, cz, 0, 1, 1, 1, C('#d8d2c4'));
      f.addGeo(new THREE.TorusGeometry(6.1, 0.25, 6, 32), cx, y + 0.72, cz, 0, 1, 1, 1, C('#d8d2c4'), Math.PI / 2);
      f.addGeo(new THREE.CylinderGeometry(0.8, 1.1, 2.6, 16), cx, y + 1.3, cz, 0, 1, 1, 1, C('#cfc8b8'));
      f.addGeo(new THREE.CylinderGeometry(2.2, 1.2, 0.4, 20), cx, y + 2.7, cz, 0, 1, 1, 1, C('#cfc8b8'));
      const w = this.gen.g('water', cx, cz);
      w.addGeo(new THREE.CircleGeometry(5.9, 32), cx, y + 0.55, cz, 0, 1, 1, 1, null, -Math.PI / 2);
      this.world.colliders.circle(cx, cz, 6.3, y - 1, y + 1.2, { kind: 'wall', mat: 'concrete' });
      this.world.fountains = this.world.fountains || [];
      this.world.fountains.push({ x: cx, y: y + 3, z: cz });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        P.place('bench', cx + Math.cos(a) * 9.2, y, cz + Math.sin(a) * 9.2, -a - Math.PI / 2);
      }
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; P.place('lampHeritage', cx + Math.cos(a) * 10.5, y, cz + Math.sin(a) * 10.5, 0); }
      // statue
      f.box(cx + 18, y + 0.9, cz - 18, 2.4, 1.8, 2.4, C('#bfb7a6'), 0, 2, false);
      f.addGeo(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 10), cx + 18, y + 3.1, cz - 18, 0, 1, 1, 1, C('#5c6b62'));
      f.addGeo(new THREE.SphereGeometry(0.35, 10, 8), cx + 18, y + 4.6, cz - 18, 0, 1, 1, 1, C('#5c6b62'));
      this.world.colliders.box(cx + 18, cz - 18, 1.2, 1.2, 0, y - 1, y + 5, { kind: 'wall', mat: 'concrete' });
    } else {
      P.place('playground', cx + 18, y, cz, 0);
      const court = { x0: l.x0 + 4, x1: l.x0 + 32, z0: cz - 8, z1: cz + 8 };
      this.pave('asphalt', court, y + 0.01, C('#7d8c7a'), 7);
      P.place('hoop', court.x0 + 1, y, cz, Math.PI / 2);
      P.place('hoop', court.x1 - 1, y, cz, -Math.PI / 2);
      for (let k = 0; k < 3; k++) P.place('picnicTable', cx + rng.range(-10, 30), y, cz + rng.range(-12, 12), rng.f() * 3);
    }
    for (let k = 0; k < (big ? 26 : 12); k++) {
      const x = rng.range(l.x0 + 4, l.x1 - 4), z = rng.range(l.z0 + 4, l.z1 - 4);
      if (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5 || (big && Math.hypot(x - cx, z - cz) < 16)) continue;
      V.tree(x, y, z, rng.chance(0.6) ? 'park' : rng.pick(['yard', 'birch', 'conifer']), rng);
    }
    for (let k = 0; k < 10; k++) {
      const along = rng.chance(0.5);
      const x = along ? cx + (rng.chance(0.5) ? 2.6 : -2.6) : rng.range(l.x0 + 4, l.x1 - 4);
      const z = along ? rng.range(l.z0 + 4, l.z1 - 4) : cz + (rng.chance(0.5) ? 2.6 : -2.6);
      if (big && Math.hypot(x - cx, z - cz) < 14) continue;
      P.place('bench', x, y, z, along ? (x > cx ? -Math.PI / 2 : Math.PI / 2) : z > cz ? Math.PI : 0);
    }
    for (let z = l.z0 + 8; z < l.z1 - 4; z += 22) { P.place('lampPost', cx + 2.4, y, z, 0); P.place('lampPost', cx - 2.4, y, z + 11, 0); }
    for (let k = 0; k < 14; k++) P.place('shrub', rng.range(l.x0 + 2, l.x1 - 2), y, rng.range(l.z0 + 2, l.z1 - 2), rng.f() * 6, rng.range(0.7, 1.3));
    P.place('trashCity', cx + 3, y, cz + 13, 0);
    P.place('trashCity', cx - 3, y, cz - 13, 0);
  }

  // ---------------- civic ----------------
  civicBuilding(r, y, floors, col, signName, columns = true) {
    const G = this.gen, H = 4.6 + (floors - 1) * 3.8;
    G.walls('wallConcrete', r, y, y + H, col, 4, 4);
    G.top('roof', r, y + H, C('#8a8784'));
    G.parapet('wallConcrete', r, y + H, 1.4, 0.4, col.clone().multiplyScalar(0.92));
    this.world.colliders.box((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, (r.x1 - r.x0) / 2, (r.z1 - r.z0) / 2, 0, -1, y + H, { kind: 'building' });
    for (const s of G.sides(r)) {
      const L = G.sideLen(s), n = Math.floor(L / 3.4);
      G.wallBox('wallConcrete', s, L / 2, y + H - 0.4, L, 0.6, 0.5, col.clone().multiplyScalar(1.05));
      for (let f = 0; f < floors; f++) for (let k = 0; k < n; k++) {
        const u = (L / n) * (k + 0.5);
        const yc = y + (f === 0 ? 2.3 : 4.6 + (f - 1) * 3.8 + 1.9);
        G.wallQuad('windows', s, u, yc, 1.5, f === 0 ? 2.8 : 2.3, windowUV('sash', G.windowState(this.rng, 0.35)));
      }
    }
    const front = G.sides(r)[0];
    const L = G.sideLen(front);
    if (signName != null) G.wallQuad('signs', front, L / 2, y + 5.6, Math.min(16, L * 0.5), 1.4, signUV(BRAND_INDEX[signName]), 0.3);
    if (columns) {
      for (let k = 0; k < 6; k++) {
        const u = L / 2 - 7.5 + k * 3;
        const [ax, az] = front.a, [bx, bz] = front.b;
        const tx = (bx - ax) / L, tz = (bz - az) / L;
        const px = ax + tx * u + front.n[0] * 2.4, pz = az + tz * u + front.n[1] * 2.4;
        G.g('wallConcrete', px, pz).addGeo(new THREE.CylinderGeometry(0.42, 0.48, 4.4, 14), px, y + 2.2, pz, 0, 1, 1, 1, col);
        this.world.colliders.circle(px, pz, 0.5, y - 1, y + 4.6, { kind: 'pole', mat: 'concrete' });
      }
      G.wallBox('wallConcrete', front, L / 2, y + 4.6, 17, 0.7, 3.0, col);
      // steps
      G.wallBox('wallConcrete', front, L / 2, y + 0.15, 18, 0.3, 4.2, col.clone().multiplyScalar(0.95));
    }
    return H;
  }

  police(B) {
    const l = B.lot, y = B.raise, P = this.world.props;
    B.special = 'police';
    const bw = (l.x1 - l.x0) * 0.62;
    const r = { x0: l.x0 + 4, x1: l.x0 + 4 + bw, z0: l.z0 + 30, z1: l.z1 - 4 };
    const G = this.gen;
    G.walls('brick', r, y, y + 15, C('#b98b74'), 3.2, 3.2);
    G.top('roof', r, y + 15, C('#8a8784'));
    G.parapet('wallConcrete', r, y + 15, 1.2, 0.4, C('#e0d8c8'));
    this.world.colliders.box((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, bw / 2, (r.z1 - r.z0) / 2, 0, -1, y + 15, { kind: 'building', mat: 'brick' });
    const sides = G.sides(r);
    for (const s of sides) {
      const L = G.sideLen(s), n = Math.floor(L / 3.2);
      for (let f = 0; f < 4; f++) for (let k = 0; k < n; k++) G.wallQuad('windows', s, (L / n) * (k + 0.5), y + 2 + f * 3.6, 1.4, 2.0, windowUV('casement', G.windowState(this.rng, 0.55)));
      G.wallBox('wallConcrete', s, L / 2, y + 14.6, L, 0.5, 0.35, C('#e0d8c8'));
    }
    const north = sides.find((s) => s.key === 'n');
    const Ln = G.sideLen(north);
    G.wallQuad('signs', north, Ln / 2, y + 4.2, 14, 1.3, signUV(BRAND_INDEX['RCPD Central Precinct']), 0.2);
    G.wallQuad('windows', north, Ln / 2, y + 1.4, 2.4, 2.7, windowUV('door', 1));
    // parking lot with patrol cars (east part)
    const lot = { x0: r.x1 + 3, x1: l.x1, z0: l.z0 + 4, z1: l.z1 - 4 };
    this.pave('parkingLot', lot, y + 0.01, C('#ffffff'), 7);
    for (let k = 0; k < 7; k++) this.world.parked.push({ x: (lot.x0 + lot.x1) / 2, y: y + 0.02, z: lot.z0 + 6 + k * 3.2, rot: Math.PI / 2, model: 'police' });
    // front yard + flags
    this.pave('concrete', { x0: l.x0, x1: r.x1 + 3, z0: l.z0, z1: r.z0 }, y + 0.01, C('#d0cdc6'));
    for (const [dx, col] of [[-5, '#1d4f91'], [0, '#e8e8e8'], [5, '#2d4a33']]) {
      const inst = P.place('flagpole', (r.x0 + r.x1) / 2 + dx, y, l.z0 + 12, 0);
      void inst; void col;
    }
    P.place('bench', r.x0 + 6, y, l.z0 + 6, Math.PI);
    this.world.poi.police = { ...this.world.poi.police, x: (r.x0 + r.x1) / 2, z: l.z0 - 2.5, door: { x: (r.x0 + r.x1) / 2, z: r.z0 - 1 }, heading: Math.PI };
  }

  hotel(B) {
    const l = B.lot, y = B.raise, G = this.gen, P = this.world.props;
    B.special = 'hotel';
    const r = { x0: l.x0 + 8, x1: l.x1 - 8, z0: l.z0 + 14, z1: l.z1 - 8 };
    G.tower(r, 'brickTower', 96, y, this.rng);
    const s = G.sides(r).find((q) => q.key === 'n');
    G.wallQuad('signs', s, G.sideLen(s) / 2, y + 7.2, 18, 1.8, signUV(BRAND_INDEX['Grand Meridian Hotel']), 0.12);
    // porte-cochere
    const cx = (r.x0 + r.x1) / 2;
    G.g('metal', cx, r.z0).box(cx, y + 5.2, r.z0 - 6, 16, 0.6, 12, C('#2b2b2b'), 0, 2, false);
    for (const dx of [-7, 7]) for (const dz of [-11, -2]) {
      G.g('metal', cx + dx, r.z0 + dz).box(cx + dx, y + 2.6, r.z0 + dz, 0.4, 5.2, 0.4, C('#c9a55a'), 0, 1, false);
      this.world.colliders.circle(cx + dx, r.z0 + dz, 0.3, y - 1, y + 5, { kind: 'pole' });
    }
    this.pave('pavers', { x0: l.x0, x1: l.x1, z0: l.z0, z1: r.z0 }, y + 0.01);
    for (let k = 0; k < 6; k++) P.place('planter', l.x0 + 6 + k * ((l.x1 - l.x0 - 12) / 5), y, l.z0 + 2, 0);
    this.world.parked.push({ x: cx - 3, y: y + 0.02, z: r.z0 - 6, rot: Math.PI / 2, model: 'taxi' }, { x: cx + 5, y: y + 0.02, z: r.z0 - 6, rot: Math.PI / 2 });
  }

  cityHall(B) {
    const l = B.lot, y = B.raise;
    B.special = 'civic';
    const r = { x0: l.x0 + 10, x1: l.x1 - 10, z0: l.z0 + 22, z1: l.z1 - 8 };
    this.pave('pavers', { x0: l.x0, x1: l.x1, z0: l.z0, z1: r.z0 }, y + 0.01);
    const G = this.gen;
    const H = this.civicBuilding(r, y, 4, C('#e2dccd'), null, false);
    const s = G.sides(r).find((q) => q.key === 'n');
    const L = G.sideLen(s);
    G.wallQuad('signs', s, L / 2, y + 5.4, 12, 1.3, signUV(BRAND_INDEX['City Hall']), 0.9);
    for (let k = 0; k < 8; k++) {
      const u = L / 2 - 10.5 + k * 3;
      const [ax, az] = s.a, [bx, bz] = s.b;
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      const px = ax + tx * u + s.n[0] * 2.6, pz = az + tz * u + s.n[1] * 2.6;
      G.g('wallConcrete', px, pz).addGeo(new THREE.CylinderGeometry(0.5, 0.56, 9, 16), px, y + 4.5, pz, 0, 1, 1, 1, C('#ece6d8'));
      this.world.colliders.circle(px, pz, 0.6, y - 1, y + 9, { kind: 'pole', mat: 'concrete' });
    }
    G.wallBox('wallConcrete', s, L / 2, y + 9.4, 25, 0.9, 3.4, C('#ece6d8'));
    // pediment
    const [ax, az] = s.a, [bx, bz] = s.b;
    const cx = (ax + bx) / 2 + s.n[0] * 1.8, cz = (az + bz) / 2 + s.n[1] * 1.8;
    const sh = new THREE.Shape(); sh.moveTo(-12.5, 0); sh.lineTo(12.5, 0); sh.lineTo(0, 3.6); sh.closePath();
    const pg = new THREE.ExtrudeGeometry(sh, { depth: 3.2, bevelEnabled: false }); pg.translate(0, 0, -1.6);
    G.g('wallConcrete', cx, cz).addGeo(pg, cx, y + 9.85, cz, 0, 1, 1, 1, C('#ece6d8'));
    // dome
    const dx = (r.x0 + r.x1) / 2, dz = (r.z0 + r.z1) / 2;
    G.g('wallConcrete', dx, dz).addGeo(new THREE.CylinderGeometry(7, 7, 6, 24), dx, y + H + 3, dz, 0, 1, 1, 1, C('#e2dccd'));
    G.g('metal', dx, dz).addGeo(new THREE.SphereGeometry(7.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), dx, y + H + 6, dz, 0, 1, 0.8, 1, C('#6f8f86'));
    this.world.props.place('flagpole', dx - 14, y, l.z0 + 8, 0);
    this.world.props.place('flagpole', dx + 14, y, l.z0 + 8, 0);
    for (let k = 0; k < 6; k++) this.world.veg.tree(l.x0 + 6 + k * ((l.x1 - l.x0 - 12) / 5), y, l.z0 + 4, 'street', this.rng, 0.9);
  }

  plaza(B) {
    const l = B.lot, y = B.raise, P = this.world.props;
    B.special = 'plaza';
    this.pave('pavers', l, y + 0.01);
    const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
    const G = this.gen;
    G.g('wallConcrete', cx, cz).addGeo(new THREE.CylinderGeometry(3.2, 3.4, 0.6, 24), cx, y + 0.3, cz, 0, 1, 1, 1, C('#cfc6b4'));
    G.g('wallConcrete', cx, cz).addGeo(new THREE.CylinderGeometry(0.5, 0.7, 2.2, 12), cx, y + 1.4, cz, 0, 1, 1, 1, C('#cfc6b4'));
    this.world.colliders.circle(cx, cz, 3.4, y - 1, y + 2, { kind: 'wall' });
    this.world.fountains = this.world.fountains || [];
    this.world.fountains.push({ x: cx, y: y + 2.4, z: cz, small: true });
    // market stalls
    for (let k = 0; k < 6; k++) {
      const sx = l.x0 + 8 + k * ((l.x1 - l.x0 - 16) / 5), sz = l.z0 + 6;
      const col = C(['#b3261e', '#1d4f91', '#2d4a33', '#d98c1f', '#f2f2f2', '#6b1f1f'][k]);
      G.g('wood', sx, sz).box(sx, y + 0.5, sz, 3, 1, 1.6, C('#8a6a45'), 0, 1, false);
      G.g('paint', sx, sz).box(sx, y + 2.5, sz, 3.4, 0.12, 2.2, col, 0, 1, false);
      for (const ddx of [-1.5, 1.5]) G.g('metal', sx + ddx, sz).box(sx + ddx, y + 1.25, sz - 0.9, 0.06, 2.5, 0.06, C('#333333'), 0, 1, false);
      this.world.colliders.box(sx, sz, 1.6, 0.9, 0, y - 1, y + 2.6, { kind: 'prop' });
    }
    for (let k = 0; k < 6; k++) this.world.veg.tree(l.x0 + 5 + k * ((l.x1 - l.x0 - 10) / 5), y, l.z1 - 4, 'street', this.rng, 0.9);
    for (let k = 0; k < 6; k++) P.place('bench', cx + Math.cos(k) * 7, y, cz + Math.sin(k) * 7, -k - Math.PI / 2);
    for (const [dx, dz] of [[-12, -8], [12, -8], [-12, 8], [12, 8]]) P.place('lampHeritage', cx + dx, y, cz + dz, 0);
  }

  // ---------------- player garage ----------------
  garage(B) {
    const l = B.lot, y = B.raise, G = this.gen, P = this.world.props;
    B.special = 'garage';
    const bx1 = l.x1 - 18, bx0 = bx1 - 36;
    const r = { x0: bx0, x1: bx1, z0: -12, z1: 12 };
    G.walls('brick', r, y, y + 8.5, C('#8e4b3b'), 3.2, 3.2);
    G.top('roof', r, y + 8.5, C('#8a8784'));
    G.parapet('wallConcrete', r, y + 8.5, 0.9, 0.35, C('#d8d0c0'));
    this.world.colliders.box((r.x0 + r.x1) / 2, 0, 18, 12, 0, -1, y + 8.5, { kind: 'building', mat: 'brick' });
    const east = G.sides(r).find((s) => s.key === 'e');
    const L = G.sideLen(east);
    for (let k = 0; k < 3; k++) {
      const u = L / 2 + (k - 1) * 7;
      G.wallQuad('windows', east, u, y + 2.2, 5, 4.4, windowUV('garage', 2));
    }
    G.wallQuad('signs', east, L / 2, y + 6.4, 13, 1.6, signUV(BRAND_INDEX["Nora's Garage"]), 0.15);
    G.wallQuad('windows', east, 2.2, y + 1.3, 1, 2.3, windowUV('door', 3));
    for (const s of G.sides(r)) if (s.key !== 'e') { const Ls = G.sideLen(s); for (let u = 3; u < Ls - 2; u += 5) G.wallQuad('windows', s, u, y + 6, 3.4, 1.3, windowUV('warehouse', G.windowState(this.rng, 0.4))); }
    // forecourt
    this.pave('concrete', { x0: bx1, x1: l.x1, z0: l.z0, z1: l.z1 }, y + 0.01, C('#bdb9b0'));
    // back yard: tires, parts, a car lift, parked project cars
    this.pave('gravel', { x0: l.x0, x1: bx0, z0: l.z0, z1: l.z1 }, y + 0.01, C('#ffffff'));
    for (let k = 0; k < 8; k++) P.place(this.rng.chance(0.5) ? 'pallet' : 'crate', l.x0 + 4 + this.rng.f() * (bx0 - l.x0 - 8), y, l.z0 + 4 + this.rng.f() * 12, this.rng.f() * 3);
    for (let k = 0; k < 3; k++) this.world.parked.push({ x: l.x0 + 12 + k * 8, y: y + 0.02, z: l.z1 - 8, rot: 0, project: true });
    G.fence(bx0 - 0.5, l.z0, bx0 - 0.5, -12, 2.2, C('#7a7d80'), y);
    G.fence(bx0 - 0.5, 12, bx0 - 0.5, l.z1, 2.2, C('#7a7d80'), y);
    G.chainFence(l.x0, l.z0, bx0, l.z0, y, C('#9aa0a4'));
    G.chainFence(l.x0, l.z1, bx0, l.z1, y, C('#9aa0a4'));
    G.chainFence(l.x0, l.z0, l.x0, l.z1, y, C('#9aa0a4'));
    P.place('lampCobra', l.x1 - 2, y, l.z0 + 2, Math.PI / 2);
    P.place('lampCobra', l.x1 - 2, y, l.z1 - 2, Math.PI / 2);
    P.place('vending', bx1 + 0.6, y, -10, Math.PI / 2, 1, { color: '#c62828' });
    this.world.poi.garage = { ...this.world.poi.garage, x: bx1 + 6, z: 0, heading: Math.PI / 2, door: { x: bx1 + 1.5, z: 0 }, r };
  }

  school(B) {
    const l = B.lot, y = B.raise, G = this.gen, P = this.world.props;
    B.special = 'school';
    const r = { x0: l.x0 + 4, x1: l.x0 + 60, z0: l.z0 + 4, z1: l.z1 - 4 };
    G.walls('brick', r, y, y + 8, C('#c08a6a'), 3.2, 3.2);
    G.top('roof', r, y + 8, C('#8a8784'));
    G.parapet('wallConcrete', r, y + 8, 0.8, 0.3, C('#e6e0d4'));
    this.world.colliders.box((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, (r.x1 - r.x0) / 2, (r.z1 - r.z0) / 2, 0, -1, y + 8, { kind: 'building', mat: 'brick' });
    for (const s of G.sides(r)) { const L = G.sideLen(s); for (let u = 2.5; u < L - 2; u += 3.2) for (const yy of [2, 5.6]) G.wallQuad('windows', s, u, y + yy, 2.2, 1.8, windowUV('loft', G.windowState(this.rng, 0.2))); }
    const field = { x0: r.x1 + 4, x1: l.x1 - 3, z0: l.z0 + 3, z1: l.z1 - 3 };
    this.pave('grass', field, y + 0.01, C('#ffffff'), 5);
    P.place('hoop', field.x0 + 2, y, (field.z0 + field.z1) / 2, Math.PI / 2);
    P.place('flagpole', r.x0 + 5, y, l.z0 + 1, 0);
    this.gen.chainFence(field.x0, field.z0, field.x1, field.z0, y, C('#9aa0a4'));
    this.gen.chainFence(field.x0, field.z1, field.x1, field.z1, y, C('#9aa0a4'));
    this.gen.chainFence(field.x1, field.z0, field.x1, field.z1, y, C('#9aa0a4'));
  }

  // ---------------- commercial ----------------
  commercialBox(r, y, H, col, brand, glassFront = 'n') {
    const G = this.gen;
    G.walls('wallConcrete', r, y, y + H, col, 4, 4);
    G.top('roof', r, y + H, C('#9a9a98'));
    G.parapet('wallConcrete', r, y + H, 1.4, 0.3, col.clone().multiplyScalar(0.9));
    this.world.colliders.box((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, (r.x1 - r.x0) / 2, (r.z1 - r.z0) / 2, 0, -1, y + H, { kind: 'building' });
    const s = G.sides(r).find((q) => q.key === glassFront);
    const L = G.sideLen(s);
    if (brand != null) G.wallQuad('signs', s, L / 2, y + H - 1.2, Math.min(L * 0.6, 22), 2.2, signUV(BRAND_INDEX[brand]), 0.15);
    return s;
  }

  gasStation(B) {
    const l = B.lot, y = B.raise, G = this.gen, P = this.world.props;
    B.special = 'gas';
    this.pave('parkingLot', l, y + 0.01, C('#ffffff'), 7);
    const cx = (l.x0 + l.x1) / 2 - 8, cz = (l.z0 + l.z1) / 2;
    // canopy
    G.g('paint', cx, cz).box(cx, y + 5.6, cz, 26, 1.0, 14, C('#f2f2f2'), 0, 2, false);
    G.g('paint', cx, cz).box(cx, y + 6.15, cz, 26.2, 0.3, 14.2, C('#1e88e5'), 0, 2, false);
    G.g('glow', cx, cz).box(cx, y + 5.08, cz, 24, 0.04, 12, null, 0, 1, false);
    for (const dx of [-9, 0, 9]) for (const dz of [-4, 4]) {
      G.g('paint', cx + dx, cz + dz).box(cx + dx, y + 2.6, cz + dz, 0.5, 5.2, 0.5, C('#e8e8e8'), 0, 1, false);
      this.world.colliders.box(cx + dx, cz + dz, 0.3, 0.3, 0, y - 1, y + 5.5, { kind: 'pole' });
    }
    for (const dx of [-9, 0, 9]) for (const dz of [-4, 4]) P.place('fuelPump', cx + dx + 1.4, y, cz + dz, Math.PI / 2);
    const shop = { x0: l.x1 - 16, x1: l.x1 - 2, z0: l.z0 + 4, z1: l.z0 + 22 };
    const s = this.commercialBox(shop, y, 4.5, C('#e8e4dc'), 'Fuel Point', 'w');
    G.wallQuad('windows', s, G.sideLen(s) / 2, y + 1.6, G.sideLen(s) - 3, 2.8, windowUV('shop', 1));
    const pole = { x: l.x0 + 3, z: l.z0 + 3 };
    G.g('paint', pole.x, pole.z).box(pole.x, y + 4, pole.z, 0.5, 8, 0.5, C('#8e969b'), 0, 1, false);
    G.g('signs', pole.x, pole.z).box(pole.x, y + 8.8, pole.z, 0.3, 1.8, 3.2, null, 0, 0, true);
    this.world.colliders.circle(pole.x, pole.z, 0.35, y - 1, y + 9, { kind: 'pole' });
    this.world.poi.gas = { x: cx, z: cz, name: 'Fuel Point', icon: 'gas' };
    this.world.parked.push({ x: cx - 7.6, y: y + 0.02, z: cz - 4, rot: Math.PI / 2 }, { x: shop.x0 - 4, y: y + 0.02, z: shop.z1 - 3, rot: -Math.PI / 2 });
  }

  dealership(B) {
    const l = B.lot, y = B.raise, G = this.gen, P = this.world.props;
    B.special = 'dealer';
    this.pave('parkingLot', l, y + 0.01, C('#ffffff'), 7);
    const r = { x0: l.x0 + 6, x1: l.x0 + 46, z0: l.z0 + 6, z1: l.z1 - 6 };
    // glass showroom
    const H = 7.5;
    G.g('metal', r.x0, r.z0).box((r.x0 + r.x1) / 2, y + H + 0.3, (r.z0 + r.z1) / 2, r.x1 - r.x0 + 1, 0.6, r.z1 - r.z0 + 1, C('#2a2c2e'), 0, 2, false);
    const floor = { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 };
    this.pave('pavers', floor, y + 0.03, C('#e8e8e8'), 1.5);
    const gl = G.g('glassLight', r.x0, r.z0);
    gl.box((r.x0 + r.x1) / 2, y + H / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, H, r.z1 - r.z0, null, 0, 0, true, true);
    for (const s of G.sides(r)) {
      const L = G.sideLen(s);
      for (let u = 0; u <= L; u += 5) {
        const [ax, az] = s.a, [bx, bz] = s.b;
        const px = ax + ((bx - ax) * u) / L, pz = az + ((bz - az) * u) / L;
        G.g('metal', px, pz).box(px, y + H / 2, pz, 0.2, H, 0.2, C('#2a2c2e'), 0, 1, false);
      }
      const [ax, az] = s.a, [bx, bz] = s.b;
      this.world.colliders.seg(ax, az, bx, bz, 0.3, y - 1, y + H, { kind: 'wall', mat: 'glass' });
    }
    const east = G.sides(r).find((s) => s.key === 'e');
    G.wallQuad('signs', east, G.sideLen(east) / 2, y + H + 1.6, 16, 1.8, signUV(BRAND_INDEX['Westwind Motors']), 0.4);
    // cars on display inside & on the lot
    for (let k = 0; k < 4; k++) this.world.parked.push({ x: r.x0 + 8 + (k % 2) * 20, y: y + 0.05, z: r.z0 + 8 + Math.floor(k / 2) * 14, rot: Math.PI / 4 + k, display: true });
    for (let k = 0; k < 9; k++) this.world.parked.push({ x: r.x1 + 10 + (k % 3) * 9, y: y + 0.02, z: l.z0 + 6 + Math.floor(k / 3) * 9, rot: -Math.PI / 2, display: true });
    for (let k = 0; k < 5; k++) P.place('flagpole', r.x1 + 4 + k * 8, y, l.z0 + 1, 0, 0.7);
    this.world.poi.dealer = { ...this.world.poi.dealer, x: r.x1 + 3, z: (r.z0 + r.z1) / 2 };
  }

  supermarket(B) {
    const l = B.lot, y = B.raise, G = this.gen, P = this.world.props;
    B.special = 'market';
    this.pave('parkingLot', l, y + 0.01, C('#ffffff'), 7);
    const r = { x0: l.x0 + 4, x1: l.x0 + 58, z0: l.z1 - 26, z1: l.z1 - 3 };
    const s = this.commercialBox(r, y, 8, C('#e6e1d6'), 'Parkline Grocers', 'n');
    const L = G.sideLen(s);
    G.wallQuad('windows', s, L / 2, y + 1.8, 14, 3.2, windowUV('shop', 1));
    G.g('paint', (r.x0 + r.x1) / 2, r.z0).box((r.x0 + r.x1) / 2, y + 3.8, r.z0 - 1.6, 20, 0.3, 3.2, C('#2e7d32'), 0, 1, false);
    const lot = { x0: l.x0 + 3, x1: l.x1 - 3, z0: l.z0 + 3, z1: r.z0 - 6 };
    this.gen.parkingLot(lot, y);
    P.place('lampCobra', r.x1 + 8, y, r.z0 + 2, 0);
  }

  stripMall(B) {
    const l = B.lot, y = B.raise, G = this.gen;
    B.special = 'mall';
    this.pave('parkingLot', l, y + 0.01, C('#ffffff'), 7);
    const r = { x0: l.x0 + 4, x1: l.x1 - 4, z0: l.z1 - 18, z1: l.z1 - 3 };
    G.walls('wallConcrete', r, y, y + 6, C('#ddd6c8'), 4, 4);
    G.top('roof', r, y + 6, C('#9a9a98'));
    G.parapet('wallConcrete', r, y + 6, 1.4, 0.3, C('#cbbfa8'));
    this.world.colliders.box((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, (r.x1 - r.x0) / 2, (r.z1 - r.z0) / 2, 0, -1, y + 6, { kind: 'building' });
    const s = G.sides(r).find((q) => q.key === 'n');
    G.storefronts(s, y, this.rng, null, 0.8, 9);
    G.g('paint', (r.x0 + r.x1) / 2, r.z0).box((r.x0 + r.x1) / 2, y + 4.6, r.z0 - 1.5, r.x1 - r.x0, 0.25, 3, C('#b8a78a'), 0, 1, false);
    this.gen.parkingLot({ x0: l.x0 + 3, x1: l.x1 - 3, z0: l.z0 + 3, z1: r.z0 - 5 }, y);
  }

  motorClub(B) {
    const l = B.lot, y = B.raise, G = this.gen, P = this.world.props;
    B.special = 'club';
    this.pave('parkingLot', l, y + 0.01, C('#ffffff'), 7);
    const r = { x0: l.x1 - 30, x1: l.x1 - 3, z0: l.z1 - 20, z1: l.z1 - 3 };
    const s = this.commercialBox(r, y, 6.5, C('#2e3134'), 'Riverton Motor Club', 'n');
    G.wallQuad('windows', s, G.sideLen(s) / 2, y + 2, 16, 3.2, windowUV('shop', 1));
    for (let k = 0; k < 6; k++) this.world.parked.push({ x: l.x0 + 8 + k * 6.5, y: y + 0.02, z: l.z0 + 12, rot: 0, meet: true });
    for (let k = 0; k < 4; k++) P.place('lampCobra', l.x0 + 6 + k * 20, y, l.z1 - 2, Math.PI);
    this.world.poi.motorClub = { ...this.world.poi.motorClub, x: (l.x0 + l.x1) / 2 - 10, z: (l.z0 + l.z1) / 2 };
    this.world.poi.meet = { ...this.world.poi.meet, x: l.x0 + 25, z: l.z0 + 20, y, lot: { x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z1 }, hall: r };
  }

  // ---------------- open areas: harbor, greenbelt, hills, farms ----------------
  buildOpenAreas() {
    this.harbor();
    this.greenbelt();
    this.hills();
    this.farms();
    this.airfield();
    this.region.buildOuter();
  }

  harbor() {
    const G = this.gen, P = this.world.props, rng = new RNG('harbor'), W = this.world;
    const y = 0.12;
    const r = { x0: BAY_X, x1: -882.2, z0: -268, z1: 290 };
    this.pave('concrete', r, y, C('#b0ada6'), 3);
    W.terrain.paintRect(r.x0, r.z0, r.x1, r.z1, SURF.CONCRETE);
    W.raised.addRect(r.x0, r.z0, r.x1, r.z1, y);
    // quay wall
    const q = G.g('wallConcrete', BAY_X, 0);
    q.quad([BAY_X, WATER_LEVEL - 3, r.z0], [BAY_X, WATER_LEVEL - 3, r.z1], [BAY_X, y, r.z1], [BAY_X, y, r.z0], C('#9a968e'), [0, 0, (r.z1 - r.z0) / 4, 1.5]);
    q.box(BAY_X + 0.4, y + 0.15, (r.z0 + r.z1) / 2, 0.8, 0.3, r.z1 - r.z0, C('#d8d4cc'), 0, 3, false);
    for (let z = r.z0 + 6; z < r.z1; z += 14) P.place('bollard', BAY_X + 1.2, y, z, 0, 1.4);
    W.colliders.seg(BAY_X + 0.3, r.z0, BAY_X + 0.3, r.z1, 0.3, y - 1, y + 0.35, { kind: 'curb', mat: 'concrete', solid: false });
    // gantry cranes
    for (const cz of [-150, -10, 130]) this.crane(BAY_X + 18, y, cz);
    // container stacks
    for (let bx = -1015; bx < -905; bx += 22) for (let bz = r.z0 + 20; bz < r.z1 - 40; bz += 42) {
      if (Math.abs(bz + 20) < 25) continue;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
        const h = rng.int(1, 4);
        for (let s = 0; s < h; s++) P.place('container', bx + i * 2.6, y + s * 2.6, bz + j * 12.4, 0, 1, { rnd: rng.f(), noCollide: s > 0 });
      }
    }
    // transit shed + port office
    const shed = { x0: -1030, x1: -950, z0: 220, z1: 282 };
    G.walls('corrugated', shed, y, y + 12, C('#9fb4c4'), 3.2, 3.2);
    G.top('roof', shed, y + 12, C('#a0a0a0'));
    W.colliders.box(-990, 251, 40, 31, 0, -1, y + 12, { kind: 'building', mat: 'metal' });
    const ss = G.sides(shed).find((s) => s.key === 'n');
    for (let k = 0; k < 6; k++) G.wallQuad('windows', ss, 7 + k * 13, y + 2.6, 6, 5, windowUV('garage', 2));
    G.wallQuad('signs', ss, 40, y + 9.5, 20, 2.2, signUV(BRAND_INDEX['Bayline Logistics']), 0.1);
    const off = { x0: -915, x1: -893, z0: -60, z1: -40 };
    G.walls('wallConcrete', off, y, y + 9, C('#e0dcd2'), 4, 4);
    G.top('roof', off, y + 9, C('#9a9a98'));
    W.colliders.box(-904, -50, 11, 10, 0, -1, y + 9, { kind: 'building' });
    for (const s of G.sides(off)) { const L = G.sideLen(s); for (let u = 2; u < L - 1; u += 2.4) for (const yy of [2, 5.6]) G.wallQuad('windows', s, u, y + yy, 1.8, 1.6, windowUV('modern', G.windowState(rng, 0.4))); }
    // gate booth + fence along Dock Street with openings
    for (const [z0, z1] of [[r.z0, -32], [-8, 150], [172, r.z1]]) G.chainFence(-884, z0, -884, z1, y, C('#9aa0a4'));
    G.chainFence(r.x0, r.z1, -884, r.z1, y, C('#9aa0a4'));
    G.g('paint', -890, -20).box(-890, y + 1.4, -20, 2.4, 2.8, 2.4, C('#e8e4dc'), 0, 1, false);
    W.colliders.box(-890, -20, 1.2, 1.2, 0, -1, y + 3, { kind: 'building' });
    for (let z = r.z0 + 30; z < r.z1; z += 90) P.place('lampDouble', -960, y, z, 0, 1.6, { noCollide: false });
    for (let k = 0; k < 5; k++) W.trucks.push({ x: -930 + rng.range(-10, 10), y, z: 175 + k * 9, rot: -Math.PI / 2 });
    this.ship(BAY_X - 22, WATER_LEVEL, -40);
    W.poi.harborGate = { ...W.poi.harborGate, x: -878, z: -20 };
  }

  crane(x, y, z) {
    const G = this.gen, col = C('#c9471f'), W = this.world;
    const b = G.g('metal', x, z);
    for (const dx of [-8, 8]) for (const dz of [-7, 7]) {
      b.box(x + dx, y + 16, z + dz, 1.4, 32, 1.4, col, 0, 2, false);
      W.colliders.box(x + dx, z + dz, 0.9, 0.9, 0, y - 1, y + 32, { kind: 'pole', mat: 'metal' });
    }
    for (const dz of [-7, 7]) b.box(x, y + 31, z + dz, 18, 1.8, 1.6, col, 0, 2, false);
    for (const dx of [-8, 8]) b.box(x + dx, y + 31, z, 1.6, 1.8, 15.5, col, 0, 2, false);
    b.box(x - 20, y + 36, z, 76, 2.2, 3, col, 0, 2, false);
    b.box(x + 10, y + 37.5, z, 10, 5, 6, C('#d8d8d4'), 0, 2, false);
    b.box(x - 30, y + 34.2, z, 3, 2.2, 3.6, C('#d8d8d4'), 0, 1, false);
    const cab = new THREE.CylinderGeometry(0.05, 0.05, 20, 4);
    b.addGeo(cab, x - 30, y + 24, z, 0, 1, 1, 1, C('#333333'));
    for (let k = 0; k < 3; k++) { const g = new THREE.CylinderGeometry(0.25, 0.25, 22, 6); g.rotateZ(0.9); b.addGeo(g, x + 2 + k * 0.1, y + 44, z + (k - 1) * 1.2, 0, 1, 1, 1, col); }
    b.box(x + 2, y + 45, z, 1.4, 16, 1.4, col, 0, 2, false);
  }

  ship(x, y, z) {
    const G = this.gen, b = G.g('paint', x, z);
    const L = 180, Bm = 28;
    const hull = new THREE.Shape();
    hull.moveTo(-Bm / 2, 0); hull.lineTo(Bm / 2, 0); hull.lineTo(Bm / 2, 14); hull.lineTo(-Bm / 2, 14); hull.closePath();
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, zz = -L / 2 + t * L;
      const taper = t > 0.85 ? 1 - ((t - 0.85) / 0.15) ** 1.6 * 0.95 : t < 0.06 ? 0.75 + t * 4 : 1;
      pts.push({ zz, w: (Bm / 2) * taper });
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      for (const s of [-1, 1]) {
        const p0 = [x + s * a.w, y - 6, z + a.zz], p1 = [x + s * c.w, y - 6, z + c.zz], p2 = [x + s * c.w, y + 12, z + c.zz], p3 = [x + s * a.w, y + 12, z + a.zz];
        if (s > 0) b.quad(p1, p0, p3, p2, C('#1f2a36'), [0, 0, 1, 1]); else b.quad(p0, p1, p2, p3, C('#1f2a36'), [0, 0, 1, 1]);
      }
      b.quad([x + a.w, y + 12, z + a.zz], [x - a.w, y + 12, z + a.zz], [x - c.w, y + 12, z + c.zz], [x + c.w, y + 12, z + c.zz], C('#7a2a22'), [0, 0, 1, 1]);
    }
    b.box(x, y + 4, z - L / 2 + 0.5, pts[0].w * 2, 16, 1, C('#1f2a36'), 0, 1, false);
    // red boot topping stripe
    b.box(x, y + 0.6, z, Bm + 0.2, 1.2, L * 0.82, C('#8e2438'), 0, 1, false);
    // superstructure
    b.box(x, y + 24, z - L / 2 + 18, 22, 24, 14, C('#f2f2f0'), 0, 3, false);
    b.box(x, y + 36.5, z - L / 2 + 16, 30, 1.5, 6, C('#f2f2f0'), 0, 3, false);
    b.box(x + 4, y + 42, z - L / 2 + 24, 3, 10, 3, C('#b3261e'), 0, 1, false);
    const w = G.g('windows', x, z);
    for (let k = 0; k < 7; k++) w.box(x, y + 16 + k * 3, z - L / 2 + 25.1, 18, 1.2, 0.05, null, 0, 0, false);
    // deck containers
    const P = this.world.props, rng = new RNG('ship');
    for (let zz = z - L / 2 + 35; zz < z + L / 2 - 30; zz += 12.6) for (let i = -4; i <= 4; i++) {
      const h = rng.int(2, 5);
      for (let s = 0; s < h; s++) P.place('container', x + i * 2.6, y + 12 + s * 2.6, zz, 0, 1, { rnd: rng.f(), noCollide: true });
    }
    this.world.colliders.box(x, z, Bm / 2, L / 2, 0, y - 10, y + 40, { kind: 'building', mat: 'metal' });
  }

  greenbelt() {
    const G = this.gen, W = this.world, P = W.props;
    // electrical substation
    const r = { x0: 150, x1: 210, z0: -360, z1: -320 };
    this.pave('gravel', r, 0.02, C('#ffffff'));
    G.chainFence(r.x0, r.z0, r.x1, r.z0, 0, C('#9aa0a4')); G.chainFence(r.x0, r.z1, r.x1, r.z1, 0, C('#9aa0a4'));
    G.chainFence(r.x0, r.z0, r.x0, r.z1, 0, C('#9aa0a4')); G.chainFence(r.x1, r.z0, r.x1, r.z1, 0, C('#9aa0a4'));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const x = r.x0 + 10 + i * 13, z = r.z0 + 12 + j * 16;
      G.g('metal', x, z).box(x, 1.6, z, 4, 3.2, 3, C('#8e969b'), 0, 1, false);
      G.g('metal', x, z).box(x, 6, z, 0.3, 8, 0.3, C('#a4a8ab'), 0, 1, false);
      G.g('metal', x, z).box(x, 9.5, z, 6, 0.3, 0.3, C('#a4a8ab'), 0, 1, false);
      W.colliders.box(x, z, 2, 1.5, 0, -1, 4, { kind: 'building', mat: 'metal' });
    }
    // billboards facing the freeway
    const bb = G.g('billboards', 0, -400);
    const frame = G.g('metal', 0, -400);
    let i = 0;
    for (const x of [-620, -200, 320, 560]) {
      const z = -388, h = 14;
      frame.box(x, h / 2, z, 0.6, h, 0.6, C('#6d7073'), 0, 1, false);
      frame.box(x, h + 2.2, z + 0.3, 13, 5.2, 0.4, C('#3a3c3f'), 0, 1, false);
      const uv = [(i % 2) / 2, 1 - (Math.floor(i / 2) + 1) / 4, (i % 2 + 1) / 2, 1 - Math.floor(i / 2) / 4];
      bb.quad([x + 6.2, h + 0.1, z], [x - 6.2, h + 0.1, z], [x - 6.2, h + 4.3, z], [x + 6.2, h + 4.3, z], null, uv);
      W.colliders.circle(x, z, 0.5, -1, h, { kind: 'pole' });
      i++;
      void P;
    }
  }

  hills() {
    const W = this.world, G = this.gen, rng = new RNG('hills'), P = W.props;
    // luxury houses along Ridge Road
    const ridge = W.roads.edges.filter((e) => e.name === RIDGE_ROAD.name);
    let count = 0;
    for (const e of ridge) {
      for (let s = 40; s < e.pl.len - 40; s += 70) {
        if (!rng.chance(0.55)) continue;
        const p = e.pl.at(s);
        const side = rng.sign();
        const off = e.halfW + 16;
        const hx = p.x - p.dz * off * side, hz = p.z + p.dx * off * side;
        const hy = W.terrain.height(hx, hz);
        if (Math.abs(hy - p.y) > 9) continue;
        const pad = 12;
        W.terrain.flattenRect(hx - pad, hz - pad, hx + pad, hz + pad, p.y + 0.3, 8);
        const lot = { x0: hx - 11, x1: hx + 11, z0: hz - 11, z1: hz + 11 };
        const front = Math.abs(p.dx) > Math.abs(p.dz) ? (side > 0 ? 'n' : 's') : side > 0 ? 'e' : 'w';
        const fr = front === 'n' ? (p.dx > 0 ? 'n' : 's') : front;
        this.villa(lot, p.y + 0.3, fr, rng);
        count++;
        // driveway
        const b = G.g('concrete', hx, hz);
        const dx0 = p.x - p.dz * (e.halfW - 0.5) * side, dz0 = p.z + p.dx * (e.halfW - 0.5) * side;
        const w = 1.8, nx = p.dx, nz = p.dz;
        const yy = p.y + 0.06;
        b.quad([dx0 - nx * w, yy, dz0 - nz * w], [dx0 + nx * w, yy, dz0 + nz * w], [hx + nx * w, p.y + 0.36, hz + nz * w], [hx - nx * w, p.y + 0.36, hz - nz * w], C('#d0cdc6'), [0, 0, 1, 4]);
      }
    }
    void count;
    // overlook
    const vp = W.poi.viewpoint;
    const vy = W.terrain.height(vp.x, vp.z);
    const n = W.roads.nearest(vp.x, vp.z, null, 60);
    if (n) {
      const ox = n.x + n.dz * 18, oz = n.z - n.dx * 18;
      W.terrain.flattenRect(ox - 14, oz - 10, ox + 14, oz + 10, n.y, 6);
      this.pave('parkingLot', { x0: ox - 14, x1: ox + 14, z0: oz - 10, z1: oz + 10 }, n.y + 0.03, C('#ffffff'), 7);
      for (let k = 0; k < 4; k++) P.place('bench', ox - 9 + k * 6, n.y, oz + 8, 0);
      P.place('trashCity', ox + 12, n.y, oz + 7, 0);
      W.poi.viewpoint = { ...vp, x: ox, z: oz };
    }
    void vy;
  }

  villa(r, y, front, rng) {
    const G = this.gen, W = this.world;
    const mat = rng.chance(0.5) ? 'stucco' : 'wallConcrete';
    const col = mat === 'stucco' ? C(rng.pick(['#efe6d2', '#e8e2d8', '#f4f0e8'])) : C('#d8d2c6');
    const a = { x0: r.x0 + 2, x1: r.x1 - 6, z0: r.z0 + 3, z1: r.z1 - 3 };
    const b = { x0: r.x1 - 12, x1: r.x1 - 1, z0: r.z0 + 6, z1: r.z1 - 8 };
    for (const [rr, h] of [[a, 3.4], [b, 6.8]]) {
      G.walls(mat, rr, y, y + h, col, 4, 4);
      G.top('roof', rr, y + h, C('#6d6a66'));
      G.parapet('wallConcrete', rr, y + h, 0.5, 0.25, C('#f0ede6'));
      W.colliders.box((rr.x0 + rr.x1) / 2, (rr.z0 + rr.z1) / 2, (rr.x1 - rr.x0) / 2, (rr.z1 - rr.z0) / 2, 0, y - 2, y + h, { kind: 'building' });
      for (const s of G.sides(rr)) {
        const L = G.sideLen(s);
        for (let u = 2; u < L - 1.5; u += 3.5) G.wallQuad('windows', s, u, y + 1.7, 2.6, 2.4, windowUV('modern', G.windowState(rng, 0.5)));
        if (h > 5) for (let u = 2; u < L - 1.5; u += 3.5) G.wallQuad('windows', s, u, y + 5.1, 2.6, 2.2, windowUV('modern', G.windowState(rng, 0.5)));
      }
    }
    void front;
    W.veg.tree(r.x0 - 3, y - 0.2, r.z0 - 2, 'conifer', rng);
    W.parked.push({ x: (r.x0 + r.x1) / 2, y: y + 0.02, z: r.z1 + 3, rot: Math.PI / 2, driveway: true });
  }


  // ---------------- Riverton Airfield: runway, taxiway, apron, hangars, terminal and tower on the meadow east of Marlow Bay ----------------
  airfield() {
    const W = this.world, G = this.gen, T = W.terrain, P = W.props;
    T.flattenRect(600, 1990, 1540, 2178, 0.05, 12);
    const y = 0.06, white = C('#f2f2f0'), yellow = C('#f2c230');
    const rwy = { x0: 640, x1: 1500, z0: 2118, z1: 2152 };
    this.pave('asphalt', rwy, y, C('#d0d0d0'), 8);
    this.pave('asphalt', { x0: 700, x1: 1440, z0: 2082, z1: 2094 }, y, C('#c4c4c4'), 8);
    for (const x of [704, 1030, 1430]) this.pave('asphalt', { x0: x, x1: x + 12, z0: 2094, z1: 2118 }, y, C('#c4c4c4'), 8);
    this.pave('asphalt', { x0: 820, x1: 1090, z0: 2020, z1: 2082 }, y, C('#bdbdbd'), 8);
    const mark = (cx, cz, sx, sz, col = white) => G.g('paint', cx, cz).box(cx, y + 0.01, cz, sx, 0.012, sz, col, 0, 1, false);
    for (let x = 700; x < 1440; x += 36) mark(x + 9, 2135, 18, 0.7);
    for (const s of [1, -1]) { const ex = s > 0 ? 652 : 1488; for (let k = -6; k <= 6; k++) if (k) mark(ex, 2135 + k * 2.4, 22, 0.9); mark(s > 0 ? 646 : 1494, 2135, 0.8, 34, white); }
    mark(1000, 2093, 740, 0.35, yellow); mark(1000, 2083, 740, 0.35, yellow);
    for (let x = 650; x < 1495; x += 42) for (const z of [2119, 2151]) G.g('glow', x, z).box(x, y + 0.05, z, 0.5, 0.1, 0.5, C('#9fe3ff'), 0, 1, false);
    // helipad
    const pad = { x0: 940, x1: 968, z0: 2030, z1: 2058 };
    this.pave('concrete', pad, y + 0.01, C('#dcdcdc'), 6);
    mark(954, 2044, 1.2, 10, yellow); mark(949, 2044, 1.2, 10, yellow); mark(951.5, 2044, 6, 1.2, yellow);
    // hangars
    for (let i = 0; i < 3; i++) {
      const r = { x0: 852 + i * 52, x1: 896 + i * 52, z0: 1998, z1: 2022 };
      this.commercialBox(r, 0.05, 10, C(['#8d98a4', '#9aa3ad', '#7f8a96'][i]), null, 's');
      G.g('paint', r.x0 + 22, r.z1).box(r.x0 + 22, 4, r.z1 + 0.15, 30, 7.5, 0.3, C('#3a4350'), 0, 1, false);
    }
    // terminal and tower
    const term = { x0: 1010, x1: 1090, z0: 2000, z1: 2030 };
    this.commercialBox(term, 0.05, 9, C('#d8dce0'), null, 's');
    G.g('paint', 1050, 2031).box(1050, 6.2, 2031.5, 82, 0.6, 4, C('#2b6cb0'), 0, 1, false);
    G.g('paint', 1110, 2010).box(1110, 8, 2010, 5, 16, 5, C('#c9ced4'), 0, 1, false);
    G.g('paint', 1110, 2010).box(1110, 17.5, 2010, 9, 3.2, 9, C('#2a3340'), 0, 1, false);
    G.g('paint', 1110, 2010).box(1110, 19.4, 2010, 10, 0.5, 10, C('#c9ced4'), 0, 1, false);
    W.colliders.box(1110, 2010, 2.5, 2.5, 0, 0, 19, { kind: 'building' });
    // windsock
    G.g('paint', 1000, 2160).box(1000, 4, 2160, 0.2, 8, 0.2, C('#cfd3d8'), 0, 1, false);
    G.g('paint', 1000, 2160).box(1001.8, 7.6, 2160, 3.6, 0.9, 0.9, C('#ff7a1a'), 0, 1, false);
    this.world.poi.airfield = { x: 1050, z: 2060, name: 'Riverton Airfield', icon: 'plane' };
    this.world.airfield = { runway: rwy, apron: { x0: 820, x1: 1090, z0: 2020, z1: 2082 }, pad, spots: { plane: [[690, 2135], [870, 2050], [905, 2050], [1040, 2050]], jet: [[1010, 2058]], heli: [[954, 2044], [985, 2036]] } };
    void P;
  }

  farms() {
    const W = this.world, G = this.gen, rng = new RNG('farms'), P = W.props, T = W.terrain;
    const farms = [[1110, -300], [1150, -60], [1120, 180], [1180, 330]];
    for (const [fx, fz] of farms) {
      const y = T.height(fx, fz);
      T.flattenRect(fx - 40, fz - 30, fx + 40, fz + 30, y, 10);
      const yy = T.height(fx, fz);
      // barn (gambrel)
      const barn = { x0: fx + 8, x1: fx + 30, z0: fz - 10, z1: fz + 8 };
      G.walls('wood', barn, yy, yy + 6, C('#8e2a20'), 2, 2);
      W.colliders.box(fx + 19, fz - 1, 11, 9, 0, yy - 2, yy + 11, { kind: 'building', mat: 'wood' });
      const s = new THREE.Shape();
      s.moveTo(-9.5, 0); s.lineTo(-7, 3.5); s.lineTo(0, 5.5); s.lineTo(7, 3.5); s.lineTo(9.5, 0); s.closePath();
      const rg = new THREE.ExtrudeGeometry(s, { depth: 22.6, bevelEnabled: false });
      rg.translate(0, 0, -11.3); rg.rotateY(Math.PI / 2);
      G.g('shingles', fx + 19, fz).addGeo(rg, fx + 19, yy + 6, fz - 1, 0, 1, 1, 1, C('#5b5b5b'));
      const bs = G.sides(barn).find((q) => q.key === 'w');
      G.wallQuad('windows', bs, 9, yy + 2.6, 5, 5, windowUV('garage', 3));
      // silo
      G.g('metal', fx + 36, fz - 6).addGeo(new THREE.CylinderGeometry(3.2, 3.2, 16, 18), fx + 36, yy + 8, fz - 6, 0, 1, 1, 1, C('#c8ccd0'));
      G.g('metal', fx + 36, fz - 6).addGeo(new THREE.SphereGeometry(3.2, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), fx + 36, yy + 16, fz - 6, 0, 1, 0.6, 1, C('#b8bcc0'));
      W.colliders.circle(fx + 36, fz - 6, 3.2, yy - 2, yy + 18, { kind: 'building', mat: 'metal' });
      // farmhouse
      const house = { x0: fx - 26, x1: fx - 12, z0: fz - 18, z1: fz - 8 };
      G.walls('siding', house, yy, yy + 5.8, C('#f1efe8'), 2.4, 2.4);
      G.gableRoof(house, yy + 5.8, 3, true, C('#4a4a4c'), C('#f1efe8'), false);
      W.colliders.box(fx - 19, fz - 13, 7, 5, 0, yy - 2, yy + 9, { kind: 'building', mat: 'wood' });
      for (const q of G.sides(house)) { const L = G.sideLen(q); for (let u = 2; u < L - 1; u += 3) { G.wallQuad('windows', q, u, yy + 1.6, 1.2, 1.4, windowUV('sash', G.windowState(rng, 0.5))); G.wallQuad('windows', q, u, yy + 4.3, 1.1, 1.2, windowUV('sash', G.windowState(rng, 0.4))); } }
      // fields + fences
      for (let k = 0; k < 2; k++) {
        const x0 = fx + 45 + k * 110, z0 = fz - 70, x1 = x0 + 100, z1 = fz + 70;
        T.paintRect(x0, z0, x1, z1, SURF.FIELD);
        for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x1, z0, x1, z1]]) this.railFence(ax, az, bx, bz);
        for (let h = 0; h < 6; h++) { const hx = rng.range(x0 + 5, x1 - 5), hz = rng.range(z0 + 5, z1 - 5); P.place('hayBale', hx, T.height(hx, hz), hz, rng.f() * 3); }
      }
      W.trucks.push({ x: fx, y: yy, z: fz + 14, rot: 0, tractor: true });
      W.veg.tree(fx - 30, yy, fz + 4, 'park', rng); W.veg.tree(fx - 8, yy, fz - 24, 'yard', rng);
    }
  }

  railFence(ax, az, bx, bz) {
    const G = this.gen, T = this.world.terrain;
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 3.2);
    const col = C('#8a7458');
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n, y = T.height(x, z);
      G.g('wood', x, z).box(x, y + 0.6, z, 0.14, 1.2, 0.14, col, 0, 1, false);
      if (k < n) {
        const x2 = ax + ((bx - ax) * (k + 1)) / n, z2 = az + ((bz - az) * (k + 1)) / n, y2 = T.height(x2, z2);
        const rot = Math.atan2(-(z2 - z), x2 - x);
        for (const hh of [0.5, 1.0]) G.g('wood', x, z).box((x + x2) / 2, (y + y2) / 2 + hh, (z + z2) / 2, L / n, 0.1, 0.05, col, rot, 1, false);
      }
    }
    this.world.colliders.seg(ax, az, bx, bz, 0.2, -50, 400, { kind: 'fence', mat: 'wood' });
  }
}
