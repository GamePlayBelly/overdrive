import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { RNG } from '../core/rng.js';
import { makeTowerFacade, windowUV, signUV } from './textures.js';
import { brandsOfType, BRANDS } from '../data/brands.js';
import { splitRect } from './blocks.js';
import { coastMethods } from './coast.js';
import { regionMethods } from './regions.js';

const C = (h) => new THREE.Color(h);
const PALETTE = {
  brick: ['#b0624c', '#9c5440', '#a8705a', '#c08a6a', '#8e4b3b', '#b98b74', '#c9a48a'],
  stucco: ['#efe6d2', '#e8d3b0', '#d9c3a0', '#e7d9c4', '#d6d0c2', '#e9c9a8', '#cfd6c4', '#e6d0c8'],
  siding: ['#f1efe8', '#d9d4c8', '#b9c4c9', '#9fb0a6', '#d8c8a8', '#c7cfd6', '#e6dcc6', '#8f9ea8', '#b8a58a'],
  roof: ['#4a4a4c', '#5b4a42', '#3d4246', '#6a5a4c', '#4f5559', '#7a4a3c'],
  metal: ['#b8bcc0', '#9fb4c4', '#c9c3b5', '#9aa6a0', '#d0d2d2', '#b8b1a0', '#8f9aa3'],
  glass: ['#dce8ee', '#c8dce6', '#e8ecef', '#c4d4d0', '#d8dce8', '#bcd0e0'],
  stone: ['#d8d0c0', '#cfc6b4', '#e0d8c8', '#c4bcae'],
};
const pick = (rng, arr) => C(rng.pick(arr));
const FLAT = new Set(['parkingLot', 'lotLines', 'pavers', 'concrete', 'grass', 'gravel', 'water', 'asphalt', 'sand']);
const PROXY_BASE = {
  facade_glass: [0.36, 0.45, 0.52], facade_glass2: [0.36, 0.45, 0.52], facade_glassBand: [0.72, 0.7, 0.66], facade_concrete: [0.7, 0.68, 0.64],
  facade_apartment: [0.82, 0.79, 0.72], facade_brickTower: [0.6, 0.36, 0.28], brick: [0.8, 0.72, 0.66], corrugated: [0.78, 0.78, 0.78], siding: [0.9, 0.9, 0.9], stucco: [0.95, 0.94, 0.92],
};
const _pc = new THREE.Color();

export class BuildingGen {
  constructor(world) {
    this.world = world;
    this.M = world.M;
    this.store = world.store;
    this.rng = new RNG('riverton-buildings');
    this.facades = world.M._facades;
    this.parked = [];
    this.poi = {};
  }

  g(mat, x, z) { return this.store.b(FLAT.has(mat) ? 'flat' : 'bldg', mat, x, z); }

  // four walls of an axis-aligned prism with tiled UVs (u meters / uS, v meters / vS)
  walls(mat, r, y0, y1, col, uS = 3, vS = 3, vBase = y0, uOff = 0) {
    const pb = PROXY_BASE[mat];
    if (pb && y1 - y0 > 2.5 && r.x1 - r.x0 > 3 && r.z1 - r.z0 > 3) { _pc.setRGB(pb[0] * (col ? col.r : 1), pb[1] * (col ? col.g : 1), pb[2] * (col ? col.b : 1)); this.store.proxy(r.x0, r.x1, r.z0, r.z1, y0, y1, _pc); }
    else if (!pb && y1 - y0 > 2.5 && r.x1 - r.x0 > 3 && r.z1 - r.z0 > 3 && col) this.store.proxy(r.x0, r.x1, r.z0, r.z1, y0, y1, col);
    const b = this.g(mat, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    const V0 = (y0 - vBase) / vS, V1 = (y1 - vBase) / vS;
    const W = r.x1 - r.x0, D = r.z1 - r.z0;
    b.quad([r.x0, y0, r.z1], [r.x1, y0, r.z1], [r.x1, y1, r.z1], [r.x0, y1, r.z1], col, [uOff, V0, uOff + W / uS, V1]);
    b.quad([r.x1, y0, r.z1], [r.x1, y0, r.z0], [r.x1, y1, r.z0], [r.x1, y1, r.z1], col, [uOff + W / uS, V0, uOff + (W + D) / uS, V1]);
    b.quad([r.x1, y0, r.z0], [r.x0, y0, r.z0], [r.x0, y1, r.z0], [r.x1, y1, r.z0], col, [uOff + (W + D) / uS, V0, uOff + (2 * W + D) / uS, V1]);
    b.quad([r.x0, y0, r.z0], [r.x0, y0, r.z1], [r.x0, y1, r.z1], [r.x0, y1, r.z0], col, [uOff + (2 * W + D) / uS, V0, uOff + (2 * W + 2 * D) / uS, V1]);
  }
  top(mat, r, y, col, uS = 8) {
    const b = this.g(mat, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    b.quad([r.x0, y, r.z1], [r.x1, y, r.z1], [r.x1, y, r.z0], [r.x0, y, r.z0], col, [r.x0 / uS, r.z1 / uS, r.x1 / uS, r.z0 / uS]);
  }
  prism(mat, r, y0, y1, col, uS = 3, topMat = 'roof', topCol = null) {
    this.walls(mat, r, y0, y1, col, uS, uS);
    if (topMat) this.top(topMat, r, y1, topCol || C('#9a9a98'));
  }
  // parapet ring
  parapet(mat, r, y, h, t, col) {
    const b = this.g(mat, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    const segs = [
      [r.x0, r.z0, r.x1, r.z0 + t], [r.x0, r.z1 - t, r.x1, r.z1], [r.x0, r.z0 + t, r.x0 + t, r.z1 - t], [r.x1 - t, r.z0 + t, r.x1, r.z1 - t],
    ];
    for (const [x0, z0, x1, z1] of segs) b.box((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0, col, 0, 3, true);
  }

  // wall sides as [P0, P1, nx, nz] with outward normals, in CCW order for rect
  sides(r) {
    return [
      { a: [r.x0, r.z1], b: [r.x1, r.z1], n: [0, 1], key: 's' },
      { a: [r.x1, r.z1], b: [r.x1, r.z0], n: [1, 0], key: 'e' },
      { a: [r.x1, r.z0], b: [r.x0, r.z0], n: [0, -1], key: 'n' },
      { a: [r.x0, r.z0], b: [r.x0, r.z1], n: [-1, 0], key: 'w' },
    ];
  }

  // quad attached to a wall side: u = distance along side (center), y center
  wallQuad(mat, side, u, y, w, h, uv, off = 0.06, col = null) {
    const [ax, az] = side.a, [bx, bz] = side.b;
    const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
    const nx = side.n[0] * off, nz = side.n[1] * off;
    const x0 = ax + tx * (u - w / 2) + nx, z0 = az + tz * (u - w / 2) + nz;
    const x1 = ax + tx * (u + w / 2) + nx, z1 = az + tz * (u + w / 2) + nz;
    const b = this.g(mat, x0, z0);
    b.quad([x0, y - h / 2, z0], [x1, y - h / 2, z1], [x1, y + h / 2, z1], [x0, y + h / 2, z0], col, uv);
  }
  wallBox(mat, side, u, y, w, h, depth, col) {
    const [ax, az] = side.a, [bx, bz] = side.b;
    const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
    const cx = ax + tx * u + side.n[0] * depth / 2, cz = az + tz * u + side.n[1] * depth / 2;
    const rot = Math.atan2(-tz, tx);
    this.g(mat, cx, cz).box(cx, y, cz, w, h, depth, col, rot, 2, false);
  }
  sideLen(s) { return Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); }
  windowState(rng, lit = 0.35) {
    const r = rng.f();
    return r < lit * 0.7 ? 1 : r < lit ? 2 : r < lit + 0.25 ? 3 : 0;
  }

  storefronts(side, y, rng, types = null, awningChance = 0.5, bay = 6.5) {
    const L = this.sideLen(side);
    const n = Math.max(1, Math.floor(L / bay));
    const bw = L / n;
    const brands = types ? brandsOfType(...types) : BRANDS.map((b, i) => ({ ...b, i })).filter((b) => !['industrial', 'police', 'garage', 'club', 'civic', 'hotel', 'gas', 'auto'].includes(b.type));
    for (let k = 0; k < n; k++) {
      const u = bw * (k + 0.5);
      const shop = rng.f() < 0.82;
      if (shop) {
        this.wallQuad('windows', side, u, y + 1.75, bw - 1.1, 3.1, windowUV('shop', rng.chance(0.75) ? 1 : 0));
        const br = rng.pick(brands);
        this.wallQuad('signs', side, u, y + 3.85, Math.min(bw - 1.2, 5.2), 0.75, signUV(br.i), 0.12);
        if (rng.chance(awningChance)) {
          const col = C(rng.pick(['#1f3b57', '#6b1f1f', '#2d4a33', '#3a3a3a', '#7a5a2a', '#1d4f91', '#8c2a1e']));
          const [ax, az] = side.a, [bx, bz] = side.b;
          const Lx = (bx - ax) / L, Lz = (bz - az) / L;
          const cx = ax + Lx * u + side.n[0] * 0.9, cz = az + Lz * u + side.n[1] * 0.9;
          const rot = Math.atan2(-Lz, Lx);
          this.g('paint', cx, cz).addGeo(awningGeo(bw - 1.3), cx, y + 3.25, cz, rot, 1, 1, 1, col);
        }
      } else {
        this.wallQuad('windows', side, u, y + 1.35, 1.6, 2.6, windowUV('door', rng.int(0, 3)));
        this.wallQuad('windows', side, u - 2.2, y + 1.7, 1.4, 2.0, windowUV('modern', 0));
        this.wallQuad('windows', side, u + 2.2, y + 1.7, 1.4, 2.0, windowUV('modern', 1));
      }
    }
  }

  // ---------------- CBD ----------------
  cbdBlock(B) {
    const rng = this.rng, l = B.lot;
    const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
    const core = Math.max(0, 1 - Math.hypot(cx - 0, cz + 60) / 420);
    const plan = rng.f();
    let parcels;
    if (plan < 0.25) parcels = [l];
    else if (plan < 0.6) parcels = splitRect(l, rng, l.x1 - l.x0 > l.z1 - l.z0 ? 36 : 36, 48);
    else {
      const mx = (l.x0 + l.x1) / 2 + rng.range(-8, 8), mz = (l.z0 + l.z1) / 2 + rng.range(-8, 8);
      parcels = [{ x0: l.x0, x1: mx, z0: l.z0, z1: mz }, { x0: mx, x1: l.x1, z0: l.z0, z1: mz }, { x0: l.x0, x1: mx, z0: mz, z1: l.z1 }, { x0: mx, x1: l.x1, z0: mz, z1: l.z1 }];
    }
    let parkingUsed = false;
    for (const p of parcels) {
      const w = p.x1 - p.x0, d = p.z1 - p.z0;
      if (!parkingUsed && parcels.length >= 2 && rng.chance(0.14)) { this.parkingLot(p, B.raise); parkingUsed = true; continue; }
      if (parcels.length >= 2 && rng.chance(0.08)) { this.plaza(p, B.raise); continue; }
      const r = rng.f();
      const tall = core * 150 + 30;
      let kind, H;
      if (r < 0.32) { kind = rng.chance(0.5) ? 'glass' : 'glass2'; H = rng.range(0.55, 1.2) * tall + 40; }
      else if (r < 0.5) { kind = 'glassBand'; H = rng.range(0.4, 0.9) * tall + 25; }
      else if (r < 0.68) { kind = 'concrete'; H = rng.range(0.3, 0.8) * tall + 18; }
      else if (r < 0.84) { kind = 'apartment'; H = rng.range(0.3, 0.7) * tall + 20; }
      else { kind = 'brickTower'; H = rng.range(14, 42); }
      if (Math.min(w, d) < 30) H = Math.min(H, 70);
      this.tower(p, kind, H, B.raise, rng);
    }
  }

  tower(p, kind, H, base, rng) {
    const podH = kind === 'brickTower' ? 4.4 : rng.chance(0.5) ? 9 : 4.8;
    const f = this.facades[kind];
    const tint = kind.startsWith('glass') ? pick(rng, PALETTE.glass) : kind === 'brickTower' ? C(rng.pick(['#ffffff', '#e8d0c0', '#d8b0a0'])) : C(rng.pick(['#ffffff', '#f0ece4', '#e4e0d8', '#dcd8d0']));
    const y0 = base;
    const stoneCol = pick(rng, PALETTE.stone);
    // podium
    const pod = { ...p };
    this.walls('wallConcrete', pod, y0, y0 + podH, stoneCol, 4, 4);
    for (const s of this.sides(pod)) if (this.sideLen(s) > 8) this.storefronts(s, y0, rng, null, 0.45);
    if (podH > 6) for (const s of this.sides(pod)) {
      const L = this.sideLen(s), n = Math.floor(L / 3);
      for (let k = 0; k < n; k++) this.wallQuad('windows', s, (L / n) * (k + 0.5), y0 + 6.9, L / n - 0.5, 2.6, windowUV('modern', this.windowState(rng, 0.4)));
    }
    this.world.colliders.box((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, (p.x1 - p.x0) / 2, (p.z1 - p.z0) / 2, 0, -1, y0 + H, { kind: 'building' });
    // tower body with setbacks
    const inset = kind === 'brickTower' ? 0 : rng.range(1, 4.5);
    let r = { x0: p.x0 + inset, x1: p.x1 - inset, z0: p.z0 + inset, z1: p.z1 - inset };
    if (inset > 0) this.top('roof', p, y0 + podH, C('#8d8d8a'));
    let yb = y0 + podH;
    const tiers = H > 90 && rng.chance(0.55) ? 2 : 1;
    for (let t = 0; t < tiers; t++) {
      const yt = t === tiers - 1 ? y0 + H : y0 + podH + (H - podH) * rng.range(0.55, 0.72);
      this.walls('facade_' + kind, r, yb, yt, tint, f.tileW, f.tileH, y0 + podH, rng.f() * 4);
      if (t < tiers - 1) {
        this.top('roof', r, yt, C('#8d8d8a'));
        const k = rng.range(3, 6);
        r = { x0: r.x0 + k, x1: r.x1 - k, z0: r.z0 + k, z1: r.z1 - k };
      }
      yb = yt;
    }
    const top = y0 + H;
    this.top('roof', r, top, C('#9a9a98'));
    const pc = kind.startsWith('glass') ? C('#8a9095') : stoneCol;
    this.parapet(kind.startsWith('glass') ? 'metal' : 'wallConcrete', r, top, kind.startsWith('glass') ? 1.6 : 1.1, 0.35, pc);
    // mechanical penthouse & props
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (w > 12 && d > 12) {
      const pw = w * rng.range(0.3, 0.5), pd = d * rng.range(0.3, 0.5);
      const px = r.x0 + rng.range(3, w - pw - 3), pz = r.z0 + rng.range(3, d - pd - 3);
      const ph = rng.range(3.5, 6);
      this.prism('wallConcrete', { x0: px, x1: px + pw, z0: pz, z1: pz + pd }, top, top + ph, C('#b8b5ad'), 4);
      const props = this.world.props;
      for (let k = 0; k < rng.int(2, 6); k++) {
        const ax = r.x0 + rng.range(2, w - 2), az = r.z0 + rng.range(2, d - 2);
        if (ax > px - 1.5 && ax < px + pw + 1.5 && az > pz - 1.5 && az < pz + pd + 1.5) continue;
        props.place('acUnit', ax, top, az, rng.pick([0, Math.PI / 2]), 1, { noCollide: true });
      }
      if (kind === 'brickTower' || (kind === 'apartment' && rng.chance(0.4))) props.place('waterTank', px + pw / 2, top + ph, pz + pd / 2, 0, 0.9, { noCollide: true });
      if (H > 110 && rng.chance(0.6)) props.place('antenna', px + pw / 2, top + ph, pz + pd / 2, 0, rng.range(1.5, 3), { noCollide: true });
    }
    if (H > 60) this.world.beacons.push({ x: (r.x0 + r.x1) / 2, y: top + 2, z: (r.z0 + r.z1) / 2 });
  }

  parkingLot(p, base) {
    const b = this.g('parkingLot', p.x0, p.z0);
    const y = base + 0.01;
    b.quad([p.x0, y, p.z1], [p.x1, y, p.z1], [p.x1, y, p.z0], [p.x0, y, p.z0], null, [p.x0 / 7, p.z1 / 7, p.x1 / 7, p.z0 / 7]);
    const rows = [];
    const along = p.x1 - p.x0 > p.z1 - p.z0 ? 'x' : 'z';
    const lines = this.g('lotLines', p.x0, p.z0);
    const L = along === 'x' ? p.x1 - p.x0 : p.z1 - p.z0, D = along === 'x' ? p.z1 - p.z0 : p.x1 - p.x0;
    const nRows = Math.max(1, Math.floor((D - 2) / 16));
    for (let rI = 0; rI < nRows; rI++) {
      const off = 1 + rI * 16 + 8;
      const n = Math.floor((L - 4) / 2.6);
      for (let k = 0; k < n; k++) for (const sd of [-1, 1]) {
        const u = 2 + k * 2.6 + 1.3, v = off + sd * 3;
        const x = along === 'x' ? p.x0 + u : p.x0 + v, z = along === 'x' ? p.z0 + v : p.z0 + u;
        rows.push({ x, z, rot: along === 'x' ? (sd > 0 ? 0 : Math.PI) : sd > 0 ? Math.PI / 2 : -Math.PI / 2 });
      }
      // stall lines texture strips
      const yy = y + 0.02;
      const uA = 2, uB = L - 2, vA = off - 6, vB = off + 6;
      if (along === 'x') lines.quad([p.x0 + uA, yy, p.z0 + vB], [p.x0 + uB, yy, p.z0 + vB], [p.x0 + uB, yy, p.z0 + vA], [p.x0 + uA, yy, p.z0 + vA], null, [0, 0, (uB - uA) / 10.4, 1]);
      else lines.quad([p.x0 + vA, yy, p.z0 + uB], [p.x0 + vB, yy, p.z0 + uB], [p.x0 + vB, yy, p.z0 + uA], [p.x0 + vA, yy, p.z0 + uA], null, [0, 0, 1, (uB - uA) / 10.4]);
    }
    for (const s of rows) if (this.rng.chance(0.55)) this.parked.push({ x: s.x, y, z: s.z, rot: s.rot, lot: true });
    const props = this.world.props;
    props.place('lampCobra', p.x0 + 2, y, (p.z0 + p.z1) / 2, Math.PI / 2);
    props.place('lampCobra', p.x1 - 2, y, (p.z0 + p.z1) / 2, -Math.PI / 2);
    this.world.terrainPaint?.(p, 'parking');
  }

  plaza(p, base) {
    const y = base + 0.012;
    const b = this.g('pavers', p.x0, p.z0);
    b.quad([p.x0, y, p.z1], [p.x1, y, p.z1], [p.x1, y, p.z0], [p.x0, y, p.z0], C('#ffffff'), [p.x0 / 2.4, p.z1 / 2.4, p.x1 / 2.4, p.z0 / 2.4]);
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, props = this.world.props, rng = this.rng;
    for (let k = 0; k < 4; k++) this.world.veg.tree(p.x0 + 5 + rng.f() * (p.x1 - p.x0 - 10), y, p.z0 + 5 + rng.f() * (p.z1 - p.z0 - 10), 'street', rng);
    for (let k = 0; k < 4; k++) props.place('bench', cx + rng.range(-10, 10), y, cz + rng.range(-10, 10), rng.f() * 6);
    props.place('planter', cx, y, cz, 0, 1.4);
    props.place('trashCity', cx + 3, y, cz + 2, 0);
  }

  // ---------------- OLD TOWN ----------------
  oldtownBlock(B) {
    const rng = this.rng, l = B.lot;
    const depthMin = 10, depthMax = 15;
    const W = l.x1 - l.x0, D = l.z1 - l.z0;
    const dN = rng.range(depthMin, depthMax), dS = rng.range(depthMin, depthMax);
    const dW = Math.min(rng.range(depthMin, depthMax), W / 2 - 1), dE = Math.min(rng.range(depthMin, depthMax), W / 2 - 1);
    // rows: north & south span full width, east & west in between
    const rows = [
      { r: { x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z0 + dN }, axis: 'x', front: 'n' },
      { r: { x0: l.x0, x1: l.x1, z0: l.z1 - dS, z1: l.z1 }, axis: 'x', front: 's' },
    ];
    if (D - dN - dS > 8) {
      rows.push({ r: { x0: l.x0, x1: l.x0 + dW, z0: l.z0 + dN, z1: l.z1 - dS }, axis: 'z', front: 'w' });
      rows.push({ r: { x0: l.x1 - dE, x1: l.x1, z0: l.z0 + dN, z1: l.z1 - dS }, axis: 'z', front: 'e' });
    }
    for (const row of rows) {
      const parcels = splitRect(row.r, rng, 7, 13, row.axis);
      for (const p of parcels) this.rowHouse(p, row.front, B.raise, rng);
    }
    // courtyard: gravel/asphalt
    const ci = { x0: l.x0 + dW, x1: l.x1 - dE, z0: l.z0 + dN, z1: l.z1 - dS };
    if (ci.x1 - ci.x0 > 2 && ci.z1 - ci.z0 > 2) {
      const b = this.g('concrete', ci.x0, ci.z0), y = B.raise + 0.01;
      b.quad([ci.x0, y, ci.z1], [ci.x1, y, ci.z1], [ci.x1, y, ci.z0], [ci.x0, y, ci.z0], C('#9a9790'), [0, 0, (ci.x1 - ci.x0) / 3, (ci.z1 - ci.z0) / 3]);
      if (rng.chance(0.5)) this.world.veg.tree((ci.x0 + ci.x1) / 2, y, (ci.z0 + ci.z1) / 2, 'street', rng);
    }
  }

  rowHouse(p, front, base, rng) {
    const floors = rng.int(3, 6);
    const gf = 4.3, fh = 3.3;
    const H = gf + (floors - 1) * fh;
    const matKind = rng.f();
    const mat = matKind < 0.5 ? 'brick' : matKind < 0.85 ? 'stucco' : 'wallConcrete';
    const col = mat === 'brick' ? pick(rng, PALETTE.brick) : mat === 'stucco' ? pick(rng, PALETTE.stucco) : pick(rng, PALETTE.stone);
    const y0 = base;
    this.walls(mat, p, y0, y0 + H, col, mat === 'brick' ? 3.2 : 4, mat === 'brick' ? 3.2 : 4);
    this.top('roof', p, y0 + H, C('#8a8784'));
    this.world.colliders.box((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, (p.x1 - p.x0) / 2, (p.z1 - p.z0) / 2, 0, -1, y0 + H, { kind: 'building', mat: 'brick' });
    const trim = mat === 'brick' ? C('#e6e0d4') : C('#f4f0e8');
    this.parapet('wallConcrete', p, y0 + H, 0.9, 0.3, trim);
    const sides = this.sides(p);
    const fs = sides.find((s) => s.key === front);
    const L = this.sideLen(fs);
    // cornice
    this.wallBox('wallConcrete', fs, L / 2, y0 + H - 0.2, L, 0.45, 0.45, trim);
    this.wallBox('wallConcrete', fs, L / 2, y0 + gf - 0.1, L, 0.3, 0.25, trim);
    // shopfront
    if (rng.chance(0.78)) this.storefronts(fs, y0, rng, null, 0.7, Math.max(5.5, L));
    else {
      this.wallQuad('windows', fs, L / 2, y0 + 1.4, 1.5, 2.7, windowUV('door', rng.int(0, 3)));
      this.wallQuad('windows', fs, L / 2 - 2.4, y0 + 1.9, 1.3, 2.0, windowUV('sash', this.windowState(rng)));
      if (L > 7) this.wallQuad('windows', fs, L / 2 + 2.4, y0 + 1.9, 1.3, 2.0, windowUV('sash', this.windowState(rng)));
    }
    const nWin = Math.max(1, Math.floor(L / 2.9));
    const style = rng.chance(0.75) ? 'sash' : 'casement';
    for (let f = 1; f < floors; f++) {
      const yc = y0 + gf + (f - 1) * fh + 1.7;
      for (let k = 0; k < nWin; k++) {
        const u = (L / nWin) * (k + 0.5);
        this.wallQuad('windows', fs, u, yc, 1.2, 1.95, windowUV(style, this.windowState(rng, 0.4)));
        this.wallBox('wallConcrete', fs, u, yc - 1.05, 1.45, 0.12, 0.14, trim);
        if (mat === 'brick') this.wallBox('wallConcrete', fs, u, yc + 1.08, 1.4, 0.2, 0.06, trim);
      }
    }
    // other sides: a few windows
    for (const s of sides) {
      if (s === fs) continue;
      const Ls = this.sideLen(s);
      if (Ls < 6) continue;
      const n = Math.floor(Ls / 4);
      for (let f = 1; f < floors; f++) for (let k = 0; k < n; k++) if (rng.chance(0.5)) this.wallQuad('windows', s, (Ls / n) * (k + 0.5), y0 + gf + (f - 1) * fh + 1.7, 1.1, 1.8, windowUV('sash', this.windowState(rng, 0.3)));
    }
    // fire escape
    if (mat === 'brick' && floors >= 4 && rng.chance(0.35) && L > 7) this.fireEscape(fs, L, y0 + gf, floors - 1, fh);
    // roof bits
    const props = this.world.props;
    if (rng.chance(0.6)) {
      const cx = p.x0 + rng.range(1.2, p.x1 - p.x0 - 1.2), cz = p.z0 + rng.range(1.2, p.z1 - p.z0 - 1.2);
      this.g('brick', cx, cz).box(cx, y0 + H + 0.8, cz, 0.9, 1.6, 0.7, col, 0, 1, false);
    }
    if (rng.chance(0.25)) props.place('acUnit', p.x0 + (p.x1 - p.x0) / 2, y0 + H, p.z0 + (p.z1 - p.z0) / 2, 0, 0.8, { noCollide: true });
    if (floors >= 5 && rng.chance(0.18)) props.place('waterTank', (p.x0 + p.x1) / 2, y0 + H, (p.z0 + p.z1) / 2, 0, 0.7, { noCollide: true });
  }

  fireEscape(side, L, y0, floors, fh) {
    const u = L / 2, w = Math.min(L - 1, 5.5);
    const col = C('#2a2b2d');
    for (let f = 0; f < floors; f++) {
      const y = y0 + f * fh + 0.1;
      this.wallBox('metal', side, u, y, w, 0.08, 1.3, col);
      this.wallBox('metal', side, u, y + 0.9, w, 0.05, 0.05, col);
      const [ax, az] = side.a, [bx, bz] = side.b;
      const Ls = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / Ls, tz = (bz - az) / Ls;
      const px = ax + tx * u + side.n[0] * 1.28, pz = az + tz * u + side.n[1] * 1.28;
      const rot = Math.atan2(-tz, tx);
      this.g('metal', px, pz).box(px, y + 0.45, pz, w, 0.9, 0.04, col, rot, 1, false);
      if (f < floors - 1) {
        const g = new THREE.BoxGeometry(0.6, 0.06, Math.hypot(w * 0.7, fh));
        const sx = ax + tx * (u + (f % 2 ? 0.8 : -0.8)) + side.n[0] * 0.7, sz = az + tz * (u + (f % 2 ? 0.8 : -0.8)) + side.n[1] * 0.7;
        this.g('metal', sx, sz).addGeo(g, sx, y + fh / 2, sz, rot + Math.PI / 2, 1, 1, 1, col, (f % 2 ? 1 : -1) * Math.atan2(fh, w * 0.7));
      }
    }
  }

  // ---------------- SUBURB ----------------
  suburbBlock(B) {
    const rng = this.rng, l = B.lot;
    const W = l.x1 - l.x0, D = l.z1 - l.z0;
    const along = W >= D ? 'x' : 'z';
    const half = along === 'x' ? [{ x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z0 + D / 2, front: 'n' }, { x0: l.x0, x1: l.x1, z0: l.z0 + D / 2, z1: l.z1, front: 's' }]
      : [{ x0: l.x0, x1: l.x0 + W / 2, z0: l.z0, z1: l.z1, front: 'w' }, { x0: l.x0 + W / 2, x1: l.x1, z0: l.z0, z1: l.z1, front: 'e' }];
    for (const row of half) {
      const lots = splitRect(row, rng, 17, 23, along);
      lots.forEach((lot, i) => this.house(lot, row.front, rng, B, i, lots.length));
      // backyard fence along the middle line
      const fy = 0.04 + (B.elev || 0);
      const col = C(rng.pick(['#9a7a55', '#b8a07a', '#8a8a8a']));
      if (along === 'x') {
        const z = row.front === 'n' ? row.z1 - 0.3 : row.z0 + 0.3;
        this.fence(row.x0 + 1, z, row.x1 - 1, z, 1.7, col, fy);
      }
    }
  }

  fence(ax, az, bx, bz, h, col, y = 0, collide = true) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L / 2.4));
    const rot = Math.atan2(-(bz - az), bx - ax);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const b = this.g('wood', cx, cz);
      b.box(cx, y + h / 2, cz, L / n - 0.05, h, 0.05, col, rot, 1.5, false);
      b.box(x0, y + h / 2 + 0.05, z0, 0.1, h + 0.1, 0.1, col, rot, 1, false);
    }
    if (collide) this.world.colliders.seg(ax, az, bx, bz, 0.2, y - 0.5, y + h, { kind: 'fence', mat: 'wood', solid: true });
  }

  house(lot, front, rng, B, idx, count) {
    const y0 = 0.05 + (B.elev || 0);
    const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
    const frontX = front === 'e' || front === 'w';
    const LW = frontX ? d : w, LD = frontX ? w : d;
    // local frame: u along frontage, v depth away from street
    const hw = Math.min(LW - 7, rng.range(9, 12.5)), hd = Math.min(LD - 9, rng.range(7.5, 10));
    const setback = rng.range(5.5, 7.5);
    const floors = rng.chance(0.45) ? 2 : 1;
    const garageLeft = rng.chance(0.5);
    const garW = rng.chance(0.6) ? 6.4 : 3.8;
    const uHouse = garageLeft ? garW + (LW - hw - garW) / 2 : (LW - hw - garW) / 2;
    const toWorld = (u, v) => {
      if (front === 'n') return [lot.x0 + u, lot.z0 + v];
      if (front === 's') return [lot.x1 - u, lot.z1 - v];
      if (front === 'w') return [lot.x0 + v, lot.z1 - u];
      return [lot.x1 - v, lot.z0 + u];
    };
    const rectUV = (u0, v0, u1, v1) => {
      const [ax, az] = toWorld(u0, v0), [bx, bz] = toWorld(u1, v1);
      return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) };
    };
    const matR = rng.f();
    const th = B.style;
    const mat = th === 'alpine' ? (matR < 0.65 ? 'siding' : 'brick') : th === 'desert' ? 'stucco' : matR < 0.6 ? 'siding' : matR < 0.82 ? 'brick' : 'stucco';
    const col = th === 'alpine' ? (mat === 'siding' ? pick(rng, ['#7b5a3c', '#8c6a46', '#6a4c33', '#a07850']) : pick(rng, ['#8a8a86', '#7c7c78', '#9a9890']))
      : th === 'desert' ? pick(rng, ['#d9b98c', '#cfa97a', '#e6d2a8', '#c99a6b', '#dcc3a0'])
      : mat === 'siding' ? pick(rng, PALETTE.siding) : mat === 'brick' ? pick(rng, PALETTE.brick) : pick(rng, PALETTE.stucco);
    const trim = C('#f3f1ec');
    const main = rectUV(uHouse, setback, uHouse + hw, setback + hd);
    const H = floors * 2.9;
    this.walls(mat, main, y0, y0 + H, col, mat === 'brick' ? 3.2 : mat === 'siding' ? 2.4 : 4, mat === 'brick' ? 3.2 : mat === 'siding' ? 2.4 : 4);
    this.world.colliders.box((main.x0 + main.x1) / 2, (main.z0 + main.z1) / 2, (main.x1 - main.x0) / 2, (main.z1 - main.z0) / 2, 0, -1, y0 + H + 3, { kind: 'building', mat: 'wood' });
    const roofCol = th === 'alpine' ? (rng.chance(0.55) ? C(pick(rng, ['#e8eaee', '#dfe3e8'])) : pick(rng, ['#4a3a30', '#3d3d40', '#5a463a']))
      : th === 'desert' ? pick(rng, ['#a8553a', '#b5683f', '#8f4a32', '#c9b79a']) : pick(rng, PALETTE.roof);
    const ridgeAlongX = !frontX;
    this.gableRoof(main, y0 + H, th === 'alpine' ? rng.range(3.8, 5.4) : th === 'desert' ? rng.range(1.0, 1.7) : rng.range(2.2, 3.4), ridgeAlongX, roofCol, col, th === 'desert' ? true : rng.chance(0.3));
    // garage
    const gU0 = garageLeft ? uHouse - garW : uHouse + hw;
    const gar = rectUV(gU0, setback + 0.8, gU0 + garW, setback + 0.8 + Math.min(hd, 6.8));
    this.walls(mat, gar, y0, y0 + 2.8, col, 2.4, 2.4);
    this.world.colliders.box((gar.x0 + gar.x1) / 2, (gar.z0 + gar.z1) / 2, (gar.x1 - gar.x0) / 2, (gar.z1 - gar.z0) / 2, 0, -1, y0 + 4, { kind: 'building', mat: 'wood' });
    this.gableRoof(gar, y0 + 2.8, 1.4, ridgeAlongX, roofCol, col, false);
    const S = this.sides(main);
    const fs = S.find((s) => s.key === front), gs = this.sides(gar).find((s) => s.key === front);
    const Lf = this.sideLen(fs), Lg = this.sideLen(gs);
    this.wallQuad('windows', gs, Lg / 2, y0 + 1.15, garW - 1.0, 2.2, windowUV('garage', rng.int(0, 3)));
    // front door & windows
    const doorU = Lf * rng.range(0.35, 0.65);
    this.wallQuad('windows', fs, doorU, y0 + 1.1, 1.0, 2.15, windowUV('door', rng.int(0, 3)));
    const wins = [];
    for (let u = 1.6; u < Lf - 1.2; u += 2.6) if (Math.abs(u - doorU) > 1.6) wins.push(u);
    for (const u of wins) this.wallQuad('windows', fs, u, y0 + 1.55, 1.3, 1.45, windowUV(rng.chance(0.7) ? 'sash' : 'casement', this.windowState(rng, 0.45)));
    if (floors === 2) for (let u = 1.6; u < Lf - 1.2; u += 2.6) this.wallQuad('windows', fs, u, y0 + 4.4, 1.25, 1.4, windowUV('sash', this.windowState(rng, 0.4)));
    for (const s of S) {
      if (s === fs) continue;
      const L = this.sideLen(s);
      for (let u = 2; u < L - 1.5; u += 3.2) if (rng.chance(0.6)) this.wallQuad('windows', s, u, y0 + 1.55, 1.2, 1.3, windowUV('sash', this.windowState(rng, 0.3)));
    }
    // porch
    if (rng.chance(0.45)) {
      const pr = rectUV(uHouse + 0.5, setback - 2.2, uHouse + hw - 0.5, setback);
      this.g('wood', pr.x0, pr.z0).box((pr.x0 + pr.x1) / 2, y0 + 0.2, (pr.z0 + pr.z1) / 2, pr.x1 - pr.x0, 0.4, pr.z1 - pr.z0, C('#b8a890'), 0, 1.5, false);
      this.g('paint', pr.x0, pr.z0).box((pr.x0 + pr.x1) / 2, y0 + 2.75, (pr.z0 + pr.z1) / 2, pr.x1 - pr.x0 + 0.3, 0.15, pr.z1 - pr.z0 + 0.3, trim, 0, 1, false);
      for (const t of [0.05, 0.95]) {
        const [px, pz] = toWorld(uHouse + 0.5 + (hw - 1) * t, setback - 2.0);
        this.g('paint', px, pz).box(px, y0 + 1.5, pz, 0.18, 2.5, 0.18, trim, 0, 1, false);
      }
    }
    // chimney
    if (rng.chance(th === 'alpine' ? 0.85 : 0.4)) {
      const [cx, cz] = toWorld(uHouse + hw * 0.8, setback + hd * 0.5);
      this.g('brick', cx, cz).box(cx, y0 + H + 1.6, cz, 0.8, 3.2, 0.8, pick(rng, PALETTE.brick), 0, 1, false);
    }
    // driveway
    const [d0x, d0z] = toWorld(gU0 + 0.4, -B.sw - B.verge - 0.2), [d1x, d1z] = toWorld(gU0 + garW - 0.4, setback + 0.8);
    const dr = { x0: Math.min(d0x, d1x), x1: Math.max(d0x, d1x), z0: Math.min(d0z, d1z), z1: Math.max(d0z, d1z) };
    const b = this.g('concrete', dr.x0, dr.z0), yd = y0 + 0.045;
    b.quad([dr.x0, yd, dr.z1], [dr.x1, yd, dr.z1], [dr.x1, yd, dr.z0], [dr.x0, yd, dr.z0], C('#d4d2cc'), [dr.x0 / 3, dr.z1 / 3, dr.x1 / 3, dr.z0 / 3]);
    this.world.terrain.paintRect(dr.x0, dr.z0, dr.x1, dr.z1, 2);
    const props = this.world.props;
    const fwdRot = { n: Math.PI, s: 0, w: -Math.PI / 2, e: Math.PI / 2 }[front];
    if (rng.chance(0.55)) {
      const [px, pz] = toWorld(gU0 + garW / 2, setback - 3.2);
      this.parked.push({ x: px, y: y0 + 0.05, z: pz, rot: fwdRot + (rng.chance(0.5) ? Math.PI : 0), driveway: true });
    }
    const [mx, mz] = toWorld(gU0 - 0.8, -0.5);
    props.place('mailboxRes', mx, y0, mz, fwdRot + Math.PI, 1, { rnd: rng.f() });
    if (rng.chance(0.5)) { const [tx, tz] = toWorld(gU0 + garW + 0.8, 0.8); props.place('trashBin', tx, y0, tz, fwdRot + Math.PI, 1, { rnd: rng.f() }); }
    // yard vegetation
    const veg = this.world.veg;
    const kindA = th === 'alpine' ? 'pine' : th === 'desert' ? (rng.chance(0.5) ? 'cactus' : 'scrub') : rng.chance(0.2) ? 'conifer' : 'yard';
    const kindB = th === 'alpine' ? 'conifer' : th === 'desert' ? 'scrub' : rng.chance(0.3) ? 'conifer' : 'yard';
    if (rng.chance(0.75)) { const [tx, tz] = toWorld(rng.range(1.5, LW - 1.5), rng.range(1.5, setback - 1.5)); veg.tree(tx, y0, tz, kindA, rng); }
    if (rng.chance(0.7)) { const [tx, tz] = toWorld(rng.range(1.5, LW - 1.5), LD - rng.range(1.5, 4)); veg.tree(tx, y0, tz, kindB, rng); }
    for (let k = 0; k < rng.int(1, 4); k++) {
      const [sx, sz] = toWorld(uHouse + rng.range(0.5, hw - 0.5), setback - 0.9);
      props.place('shrub', sx, y0, sz, rng.f() * 6, rng.range(0.6, 1.0));
    }
    if (rng.chance(0.3)) {
      const [hx0, hz0] = toWorld(0.3, 0.6), [hx1, hz1] = toWorld(0.3, setback + hd);
      this.fence(hx0, hz0, hx1, hz1, 1.0, C('#f0eee8'), y0, false);
    }
  }

  gableRoof(r, y, h, alongX, col, wallCol, hip = false) {
    const b = this.g('shingles', r.x0, r.z0);
    const o = 0.45;
    const x0 = r.x0 - o, x1 = r.x1 + o, z0 = r.z0 - o, z1 = r.z1 + o;
    const w = this.g(hip ? 'shingles' : 'siding', r.x0, r.z0);
    if (alongX) {
      const zm = (z0 + z1) / 2, yt = y + h;
      const ix0 = hip ? x0 + (z1 - z0) / 2 : x0, ix1 = hip ? x1 - (z1 - z0) / 2 : x1;
      b.quad([x0, y, z1], [x1, y, z1], [ix1, yt, zm], [ix0, yt, zm], col, [0, 0, (x1 - x0) / 3, Math.hypot(h, (z1 - z0) / 2) / 3]);
      b.quad([x1, y, z0], [x0, y, z0], [ix0, yt, zm], [ix1, yt, zm], col, [0, 0, (x1 - x0) / 3, Math.hypot(h, (z1 - z0) / 2) / 3]);
      if (hip) {
        b.tri(...triIdx(b, [x0, y, z0], [x0, y, z1], [ix0, yt, zm], col));
        b.tri(...triIdx(b, [x1, y, z1], [x1, y, z0], [ix1, yt, zm], col));
      } else {
        w.tri(...triIdx(w, [r.x0, y, r.z0], [r.x0, y, r.z1], [r.x0, yt, zm], wallCol));
        w.tri(...triIdx(w, [r.x1, y, r.z1], [r.x1, y, r.z0], [r.x1, yt, zm], wallCol));
      }
    } else {
      const xm = (x0 + x1) / 2, yt = y + h;
      const iz0 = hip ? z0 + (x1 - x0) / 2 : z0, iz1 = hip ? z1 - (x1 - x0) / 2 : z1;
      b.quad([x1, y, z1], [x1, y, z0], [xm, yt, iz0], [xm, yt, iz1], col, [0, 0, (z1 - z0) / 3, Math.hypot(h, (x1 - x0) / 2) / 3]);
      b.quad([x0, y, z0], [x0, y, z1], [xm, yt, iz1], [xm, yt, iz0], col, [0, 0, (z1 - z0) / 3, Math.hypot(h, (x1 - x0) / 2) / 3]);
      if (hip) {
        b.tri(...triIdx(b, [x1, y, z0], [x0, y, z0], [xm, yt, iz0], col));
        b.tri(...triIdx(b, [x0, y, z1], [x1, y, z1], [xm, yt, iz1], col));
      } else {
        w.tri(...triIdx(w, [r.x1, y, r.z0], [r.x0, y, r.z0], [xm, yt, r.z0], wallCol));
        w.tri(...triIdx(w, [r.x0, y, r.z1], [r.x1, y, r.z1], [xm, yt, r.z1], wallCol));
      }
    }
  }

  // ---------------- INDUSTRIAL ----------------
  industrialBlock(B) {
    const rng = this.rng, l = B.lot, y0 = B.raise;
    const W = l.x1 - l.x0, D = l.z1 - l.z0;
    const yard = this.g('concrete', l.x0, l.z0), yy = y0 + 0.01;
    yard.quad([l.x0, yy, l.z1], [l.x1, yy, l.z1], [l.x1, yy, l.z0], [l.x0, yy, l.z0], C('#a8a59e'), [l.x0 / 3, l.z1 / 3, l.x1 / 3, l.z0 / 3]);
    const parcels = splitRect(l, rng, 50, 80, 'x');
    const props = this.world.props;
    for (const p of parcels) {
      const pw = p.x1 - p.x0, pd = p.z1 - p.z0;
      const bw = pw - rng.range(6, 14), bd = pd * rng.range(0.45, 0.7);
      const frontN = rng.chance(0.5);
      const bz0 = frontN ? p.z1 - bd - 3 : p.z0 + 3;
      const r = { x0: p.x0 + (pw - bw) / 2, x1: p.x0 + (pw + bw) / 2, z0: bz0, z1: bz0 + bd };
      const H = rng.range(8, 14);
      const col = pick(rng, PALETTE.metal);
      this.walls('corrugated', r, y0, y0 + H, col, 3.2, 3.2);
      this.top('roof', r, y0 + H, C('#a0a0a0'));
      this.parapet('corrugated', r, y0 + H, 0.6, 0.2, col.clone().multiplyScalar(0.85));
      this.world.colliders.box((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, bw / 2, bd / 2, 0, -1, y0 + H, { kind: 'building', mat: 'metal' });
      const dockSide = this.sides(r).find((s) => s.key === (frontN ? 'n' : 's'));
      const L = this.sideLen(dockSide);
      const nd = Math.floor(L / 7);
      for (let k = 0; k < nd; k++) {
        const u = (L / nd) * (k + 0.5);
        if (k % 3 === 1) { this.wallQuad('windows', dockSide, u, y0 + 1.2, 1.0, 2.2, windowUV('door', 3)); continue; }
        this.wallQuad('windows', dockSide, u, y0 + 2.4, 4.0, 4.6, windowUV('garage', rng.pick([0, 1, 2])));
        this.wallBox('wallConcrete', dockSide, u, y0 + 0.6, 4.4, 1.2, 1.5, C('#8c8a86'));
      }
      for (let k = 0; k < Math.floor(L / 5); k++) this.wallQuad('windows', dockSide, (L / Math.floor(L / 5)) * (k + 0.5), y0 + H - 1.4, 3.2, 1.1, windowUV('warehouse', this.windowState(rng, 0.2)));
      const br = rng.pick(brandsOfType('industrial'));
      this.wallQuad('signs', dockSide, L * 0.5, y0 + H - 3.2, Math.min(L * 0.5, 14), 2.0, signUV(br.i), 0.1);
      // office annex
      if (rng.chance(0.6)) {
        const ow = Math.min(16, bw * 0.3), od = 8;
        const oz0 = frontN ? r.z0 - od : r.z1;
        const orr = { x0: r.x0, x1: r.x0 + ow, z0: oz0, z1: oz0 + od };
        this.walls('wallConcrete', orr, y0, y0 + 7, C('#d8d4cc'), 4, 4);
        this.top('roof', orr, y0 + 7, C('#9a9a98'));
        this.world.colliders.box((orr.x0 + orr.x1) / 2, (orr.z0 + orr.z1) / 2, ow / 2, od / 2, 0, -1, y0 + 7, { kind: 'building' });
        for (const s of this.sides(orr)) { const Ls = this.sideLen(s); for (let u = 1.5; u < Ls - 1; u += 2.2) for (const yy2 of [1.7, 5.0]) this.wallQuad('windows', s, u, y0 + yy2, 1.6, 1.3, windowUV('modern', this.windowState(rng, 0.3))); }
      }
      for (let k = 0; k < rng.int(2, 5); k++) props.place('roofVent', r.x0 + rng.range(3, bw - 3), y0 + H, r.z0 + rng.range(3, bd - 3), 0, 1, { noCollide: true });
      // yard contents
      const yz0 = frontN ? p.z0 + 2 : r.z1 + 3, yz1 = frontN ? r.z0 - 3 : p.z1 - 2;
      const yd = yz1 - yz0;
      if (yd > 10) {
        const kind = rng.f();
        if (kind < 0.35) {
          for (let k = 0; k < rng.int(2, 6); k++) {
            const cx = p.x0 + rng.range(6, pw - 6), cz = yz0 + rng.range(3, yd - 3);
            const stack = rng.int(1, 2);
            const rot = rng.chance(0.5) ? 0 : Math.PI / 2;
            for (let s = 0; s < stack; s++) props.place('container', cx, y0 + s * 2.6, cz, rot, 1, { rnd: rng.f(), noCollide: s > 0 });
          }
        } else if (kind < 0.6) {
          for (let k = 0; k < rng.int(4, 12); k++) props.place(rng.chance(0.6) ? 'pallet' : 'crate', p.x0 + rng.range(4, pw - 4), y0, yz0 + rng.range(2, yd - 2), rng.f() * 3);
          props.place('forklift', p.x0 + rng.range(5, pw - 5), y0, yz0 + rng.range(3, yd - 3), rng.f() * 6);
        } else if (kind < 0.8) {
          const n = rng.int(1, 3);
          for (let k = 0; k < n; k++) {
            const tx = p.x0 + 8 + k * 9, tz = yz0 + yd / 2, tr = rng.range(2.8, 4);
            const b = this.g('metal', tx, tz);
            b.addGeo(new THREE.CylinderGeometry(tr, tr, 9, 18), tx, y0 + 4.5, tz, 0, 1, 1, 1, C('#d8d8d4'));
            b.addGeo(new THREE.SphereGeometry(tr, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), tx, y0 + 9, tz, 0, 1, 0.3, 1, C('#d0d0cc'));
            this.world.colliders.circle(tx, tz, tr, -1, y0 + 9.5, { kind: 'building', mat: 'metal' });
          }
        } else {
          const lot = { x0: p.x0 + 3, x1: p.x1 - 3, z0: yz0, z1: yz1 };
          this.parkingLot(lot, y0);
        }
        if (rng.chance(0.4)) this.world.trucks.push({ x: p.x0 + rng.range(6, pw - 6), y: y0, z: frontN ? r.z0 - 9 : r.z1 + 9, rot: frontN ? 0 : Math.PI });
      }
      if (rng.chance(0.3)) {
        const sx = r.x1 - 4, sz = (r.z0 + r.z1) / 2;
        const b = this.g('wallConcrete', sx, sz);
        b.addGeo(new THREE.CylinderGeometry(1.1, 1.5, 26, 14), sx, y0 + 13, sz, 0, 1, 1, 1, C('#a8a29a'));
        b.addGeo(new THREE.CylinderGeometry(1.15, 1.15, 1.2, 14), sx, y0 + 24, sz, 0, 1, 1, 1, C('#8c2a1e'));
      }
    }
    // perimeter fence with gates on street sides
    const fcol = C('#9aa0a4');
    for (const s of this.sides(l)) {
      const L = this.sideLen(s);
      const gate = L * rng.range(0.3, 0.7);
      const [ax, az] = s.a, [bx, bz] = s.b;
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      this.chainFence(ax, az, ax + tx * (gate - 6), az + tz * (gate - 6), y0, fcol);
      this.chainFence(ax + tx * (gate + 6), az + tz * (gate + 6), bx, bz, y0, fcol);
    }
  }

  chainFence(ax, az, bx, bz, y0, col) {
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1) return;
    const n = Math.max(1, Math.round(L / 3));
    const rot = Math.atan2(-(bz - az), bx - ax);
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      this.g('metal', x, z).box(x, y0 + 1.1, z, 0.07, 2.2, 0.07, col, rot, 1, false);
    }
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    this.g('fence', cx, cz).box(cx, y0 + 1.1, cz, L, 2.1, 0.02, col, rot, 1, true, true);
    this.world.colliders.seg(ax, az, bx, bz, 0.15, y0 - 0.5, y0 + 2.2, { kind: 'fence', mat: 'metal' });
  }

  build(blocks) {
    for (const B of blocks) {
      const special = this.world.specials?.handle(B);
      if (special) continue;
      if (B.style === 'alpine' || B.style === 'desert') this.suburbBlock(B);
      else if (B.style === 'isle') this.isleBlock(B);
      else if (B.style === 'cbd') this.cbdBlock(B);
      else if (B.style === 'oldtown') this.oldtownBlock(B);
      else if (B.style === 'suburb') this.suburbBlock(B);
      else if (B.style === 'industrial') this.industrialBlock(B);
      else if (B.style === 'coast') this.coastBlock(B);
    }
  }

}
Object.assign(BuildingGen.prototype, coastMethods, regionMethods);

function triIdx(b, A, B2, Cc, col) {
  const e1 = [B2[0] - A[0], B2[1] - A[1], B2[2] - A[2]], e2 = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
  let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const r = col ? col.r : 1, g = col ? col.g : 1, bb = col ? col.b : 1;
  const i0 = b.v(A[0], A[1], A[2], nx, ny, nz, 0, 0, r, g, bb);
  b.v(B2[0], B2[1], B2[2], nx, ny, nz, Math.hypot(e1[0], e1[2]) / 2.4, 0, r, g, bb);
  b.v(Cc[0], Cc[1], Cc[2], nx, ny, nz, 0.5, Cc[1] - A[1], r, g, bb);
  return [i0, i0 + 1, i0 + 2];
}

let _awning = new Map();
function awningGeo(w) {
  const k = Math.round(w * 4) / 4;
  if (_awning.has(k)) return _awning.get(k);
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(1.6, -0.7); s.lineTo(1.6, -0.95); s.lineTo(1.5, -0.95); s.lineTo(1.5, -0.75); s.lineTo(0, -0.1);
  const g = new THREE.ExtrudeGeometry(s, { depth: k, bevelEnabled: false });
  g.translate(0, 0, -k / 2); g.rotateY(-Math.PI / 2); g.translate(0, 0.5, -0.9);
  _awning.set(k, g);
  return g;
}
