import * as THREE from 'three';
import { fbm, ridged, noise2 } from '../core/rng.js';
import { smoothstep, clamp, segClosest, lerp } from '../core/math.js';
import { BAY_X, WATER_LEVEL } from '../data/world.js';
import { WORLD, ISLE, CORRIDOR_SPECS, PADS } from '../data/routes.js';
import { carveCorridors, ensureCorridors } from './corridors.js';

export const SURF = { GRASS: 0, ASPHALT: 1, CONCRETE: 2, GRAVEL: 3, DIRT: 4, SAND: 5, WATER: 6, ROCK: 7, PARKING: 8, FIELD: 9 };
export const GRIP = [0.58, 1.0, 0.96, 0.66, 0.6, 0.48, 0.3, 0.8, 1.0, 0.55];
export const SURF_NAMES = ['grass', 'asphalt', 'concrete', 'gravel', 'dirt', 'sand', 'water', 'rock', 'asphalt', 'field'];

const _dirtC = new THREE.Color(0.42, 0.36, 0.27), _rockC = new THREE.Color(0.47, 0.46, 0.44), _snowC = new THREE.Color(0.9, 0.92, 0.95);

export function naturalHeight(x, z) {
  let h = 0;
  const north = smoothstep(-470, -1150, z);
  if (north > 0) h += north * (55 + 45 * fbm(x / 450, z / 450, 4)) + smoothstep(-1000, -1750, z) * (170 + 170 * ridged(x / 800 + 3, z / 800, 5));
  const east = smoothstep(1010, 1320, x);
  if (east > 0) h += east * (7 + 9 * fbm(x / 380 + 10, z / 380, 3)) + smoothstep(1450, 2550, x) * (120 + 130 * ridged(x / 700, z / 700 + 7, 4));
  const south = smoothstep(495, 820, z);
  if (south > 0) {
    const rolling = south * (5 + 10 * fbm(x / 400 - 4, z / 400, 3));
    const forest = smoothstep(880, 1160, z) * (1 - smoothstep(1760, 1985, z)) * (26 + 44 * fbm(x / 320 + 5, z / 320, 4) + 38 * Math.max(0, ridged(x / 640 - 2, z / 560, 4)));
    h += rolling * (1 - smoothstep(1700, 1985, z)) + forest;
  }
  const outside = Math.max(north, east, south * (1 - smoothstep(1930, 1990, z)));
  if (outside > 0) h += outside * 1.4 * noise2(x / 55, z / 55);
  if (z > 1930) h *= 1 - smoothstep(1930, 1995, z);
  if (z > 2290) { const t = smoothstep(2290, 2440, z); h = h * (1 - t) + (WATER_LEVEL - 2.6 - 9 * smoothstep(2400, 2800, z)) * t; }
  if (x < BAY_X + 30) {
    const harbor = z > -310 && z < 310;
    const shore = harbor ? smoothstep(BAY_X, BAY_X - 6, x) : smoothstep(BAY_X + 30, BAY_X - 70, x);
    h = h * (1 - shore) + (WATER_LEVEL - 3 - 9 * smoothstep(BAY_X, BAY_X - 400, x)) * shore;
  }
  return withIsle(h, x, z);
}

// Isla Marin: a beach ring, hills inside and a peak, rising out of the western sea floor
function withIsle(h, x, z) {
  if (x > BAY_X - 500 || x < ISLE.x - ISLE.rx * 1.6) return h;
  const dx = (x - ISLE.x) / ISLE.rx, dz = (z - ISLE.z) / ISLE.rz;
  const r = Math.hypot(dx, dz) + noise2(x / 210, z / 210) * 0.14 + noise2(x / 90, z / 90) * 0.05;
  const k = 1 - smoothstep(1.05, 1.4, r);
  if (k <= 0) return h;
  let ih;
  if (r < 0.56) { const t = 1 - smoothstep(0, 0.56, r); ih = 2.6 + 58 * Math.pow(t, 1.5) * (0.55 + 0.45 * (fbm(x / 260 + 3, z / 260, 3) * 0.5 + 0.5)); }
  else ih = 2.6 - 5.8 * smoothstep(0.56, 0.84, r) - 7 * smoothstep(0.84, 1.1, r);
  const pk = ISLE.peak, pd = Math.hypot(x - pk.x, z - pk.z) / pk.r;
  ih += pk.h * Math.exp(-pd * pd * 2.2) * (1 - smoothstep(0.7, 1.0, r));
  return lerp(h, ih, k);
}

export class Terrain {
  constructor() {
    ensureCorridors(naturalHeight, CORRIDOR_SPECS, PADS);
    this.x0 = WORLD.x0; this.z0 = WORLD.z0; this.res = 4;
    this.nx = Math.round((WORLD.x1 - WORLD.x0) / this.res) + 1; this.nz = Math.round((WORLD.z1 - WORLD.z0) / this.res) + 1;
    this.h = new Float32Array(this.nx * this.nz);
    const nx = this.nx, nz = this.nz, H = this.h;
    for (let j = 0; j < nz; j += 2) for (let i = 0; i < nx; i += 2) H[j * nx + i] = this.base(this.x0 + i * this.res, this.z0 + j * this.res);
    for (let j = 0; j < nz; j += 2) for (let i = 1; i < nx; i += 2) H[j * nx + i] = i + 1 < nx ? (H[j * nx + i - 1] + H[j * nx + i + 1]) / 2 : H[j * nx + i - 1];
    for (let j = 1; j < nz; j += 2) for (let i = 0; i < nx; i++) H[j * nx + i] = j + 1 < nz ? (H[(j - 1) * nx + i] + H[(j + 1) * nx + i]) / 2 : H[(j - 1) * nx + i];
    // restore exact values near the bay edge where the shoreline is sharp
    const ib0 = Math.max(0, Math.floor((BAY_X - 12 - this.x0) / this.res)), ib1 = Math.min(nx - 1, Math.ceil((BAY_X + 34 - this.x0) / this.res));
    for (let j = 0; j < nz; j++) for (let i = ib0; i <= ib1; i++) H[j * nx + i] = this.base(this.x0 + i * this.res, this.z0 + j * this.res);
    this.sres = 2;
    this.snx = (nx - 1) * 2; this.snz = (nz - 1) * 2;
    this.surf = new Uint8Array(this.snx * this.snz);
    this.initSurface();
  }

  base(x, z) { return carveCorridors(naturalHeight(x, z), x, z); }

  idx(i, j) { return j * this.nx + i; }

  height(x, z) {
    const fx = (x - this.x0) / this.res, fz = (z - this.z0) / this.res;
    if (fx < 0 || fz < 0 || fx >= this.nx - 1 || fz >= this.nz - 1) return this.base(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const k = j * this.nx + i, h = this.h;
    const a = h[k], b = h[k + 1], c = h[k + this.nx], d = h[k + this.nx + 1];
    // split along diagonal to match mesh triangulation
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }

  normal(x, z, out = new THREE.Vector3()) {
    const e = 1.5;
    const hx = this.height(x + e, z) - this.height(x - e, z), hz = this.height(x, z + e) - this.height(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  // flatten terrain under a polyline road (pts with y)
  stamp(pts, halfW, fall = 10, onlyBelow = null) {
    const r = halfW + 1.5 + fall;
    const best = new Map();
    for (let s = 0; s < pts.length - 1; s++) {
      const A = pts[s], B = pts[s + 1];
      if (onlyBelow !== null && (A.y > onlyBelow || B.y > onlyBelow)) continue;
      const i0 = Math.max(0, Math.floor((Math.min(A.x, B.x) - r - this.x0) / this.res));
      const i1 = Math.min(this.nx - 1, Math.ceil((Math.max(A.x, B.x) + r - this.x0) / this.res));
      const j0 = Math.max(0, Math.floor((Math.min(A.z, B.z) - r - this.z0) / this.res));
      const j1 = Math.min(this.nz - 1, Math.ceil((Math.max(A.z, B.z) + r - this.z0) / this.res));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = this.x0 + i * this.res, z = this.z0 + j * this.res;
        const c = segClosest(x, z, A.x, A.z, B.x, B.z);
        if (c.d > r) continue;
        const k = j * this.nx + i;
        const prev = best.get(k);
        if (!prev || c.d < prev.d) best.set(k, { d: c.d, y: A.y + (B.y - A.y) * c.t });
      }
    }
    for (const [k, v] of best) {
      const w = 1 - smoothstep(halfW + 1.5, r, v.d);
      this.h[k] = this.h[k] * (1 - w) + (v.y - 0.13) * w;
    }
  }

  // dredge: only ever lowers the ground; the northern edge stays untouched so a shore walkway can meet it
  carve(x0, z0, x1, z1, y, fall = 8) {
    const i0 = Math.max(0, Math.floor((x0 - fall - this.x0) / this.res)), i1 = Math.min(this.nx - 1, Math.ceil((x1 + fall - this.x0) / this.res));
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / this.res)), j1 = Math.min(this.nz - 1, Math.ceil((z1 + fall - this.z0) / this.res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.x0 + i * this.res, z = this.z0 + j * this.res;
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(0, z - z1);
      const w = 1 - smoothstep(0, fall, Math.hypot(dx, dz));
      const k = j * this.nx + i;
      if (w > 0) this.h[k] = Math.min(this.h[k], this.h[k] * (1 - w) + y * w);
    }
  }

  flattenRect(x0, z0, x1, z1, y, fall = 6) {
    const i0 = Math.max(0, Math.floor((x0 - fall - this.x0) / this.res)), i1 = Math.min(this.nx - 1, Math.ceil((x1 + fall - this.x0) / this.res));
    const j0 = Math.max(0, Math.floor((z0 - fall - this.z0) / this.res)), j1 = Math.min(this.nz - 1, Math.ceil((z1 + fall - this.z0) / this.res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.x0 + i * this.res, z = this.z0 + j * this.res;
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
      const w = 1 - smoothstep(0, fall, Math.hypot(dx, dz));
      const k = j * this.nx + i;
      this.h[k] = this.h[k] * (1 - w) + y * w;
    }
  }

  // ---- surface raster ----
  initSurface() {
    const { snx, snz, nx, h } = this;
    for (let j = 0; j < snz; j++) {
      const z = this.z0 + j * this.sres, hj = (j >> 1) * nx;
      const row = j * snx;
      for (let i = 0; i < snx; i++) {
        const x = this.x0 + i * this.sres, hh = h[hj + (i >> 1)];
        let v = SURF.GRASS;
        if (hh < WATER_LEVEL - 0.1 || (x < BAY_X && x > BAY_X - 1 && z < 2362)) v = SURF.WATER;
        else if (z > 2295 && z <= 2362 && x > -1000 && x < 1000) v = SURF.SAND;
        else if (hh < WATER_LEVEL + 1.3 && (x < BAY_X + 40 || z > 2200)) v = SURF.SAND;
        this.surf[row + i] = v;
      }
    }
  }
  surfAt(x, z) {
    const i = Math.floor((x - this.x0) / this.sres), j = Math.floor((z - this.z0) / this.sres);
    if (i < 0 || j < 0 || i >= this.snx || j >= this.snz) return SURF.GRASS;
    return this.surf[j * this.snx + i];
  }
  paintRect(x0, z0, x1, z1, s) {
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / this.sres)), i1 = Math.min(this.snx - 1, Math.floor((x1 - this.x0) / this.sres));
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / this.sres)), j1 = Math.min(this.snz - 1, Math.floor((z1 - this.z0) / this.sres));
    for (let j = j0; j <= j1; j++) this.surf.fill(s, j * this.snx + i0, j * this.snx + i1 + 1);
  }
  paintPoly(pts, halfW, s) {
    for (let k = 0; k < pts.length - 1; k++) {
      const A = pts[k], B = pts[k + 1];
      const i0 = Math.max(0, Math.floor((Math.min(A.x, B.x) - halfW - this.x0) / this.sres)), i1 = Math.min(this.snx - 1, Math.ceil((Math.max(A.x, B.x) + halfW - this.x0) / this.sres));
      const j0 = Math.max(0, Math.floor((Math.min(A.z, B.z) - halfW - this.z0) / this.sres)), j1 = Math.min(this.snz - 1, Math.ceil((Math.max(A.z, B.z) + halfW - this.z0) / this.sres));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * this.sres, z = this.z0 + (j + 0.5) * this.sres;
        if (segClosest(x, z, A.x, A.z, B.x, B.z).d <= halfW) this.surf[j * this.snx + i] = s;
      }
    }
  }
  paintConvex(poly, s) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / this.sres)), i1 = Math.min(this.snx - 1, Math.ceil((x1 - this.x0) / this.sres));
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / this.sres)), j1 = Math.min(this.snz - 1, Math.ceil((z1 - this.z0) / this.sres));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.x0 + (i + 0.5) * this.sres, z = this.z0 + (j + 0.5) * this.sres;
      if (pointInPoly(x, z, poly)) this.surf[j * this.snx + i] = s;
    }
  }

  // ---- render meshes: one BatchedMesh; LOD0-2 geometry lives in recycled slot pools, LOD3 is permanent ----
  static lodCounts(CH, step) {
    const nw = Math.floor(CH / step), nd = nw;
    const ring = 2 * (nw + nd) + 1;
    return { v: (nw + 1) * (nd + 1) + ring, i: nw * nd * 6 + (ring - 1) * 6 };
  }

  buildMeshes(material) {
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    this.chunks = [];
    this.mat = material;
    const CH = 64;
    const POOL = [22, 44, 100];
    const cnt = [0, 1, 2, 3].map((l) => Terrain.lodCounts(CH, 1 << l));
    for (let cj = 0; cj < this.nz - 1; cj += CH) for (let ci = 0; ci < this.nx - 1; ci += CH) {
      const cx = this.x0 + (ci + CH / 2) * this.res, cz = this.z0 + (cj + CH / 2) * this.res;
      this.chunks.push({ ci, cj, CH, cx, cz, slots: [null, null, null, null], show: -1, want: 3, queued: false, y: this.h[Math.min(this.nz - 1, cj + CH / 2) * this.nx + Math.min(this.nx - 1, ci + CH / 2)] });
    }
    let V = 0, I = 0;
    for (let l = 0; l < 3; l++) { V += POOL[l] * cnt[l].v; I += POOL[l] * cnt[l].i; }
    V += this.chunks.length * cnt[3].v; I += this.chunks.length * cnt[3].i;
    const n = POOL[0] + POOL[1] + POOL[2] + this.chunks.length;
    const bm = new THREE.BatchedMesh(n + 4, V + 64, I + 64, material);
    bm.perObjectFrustumCulled = false; bm.sortObjects = false; bm.frustumCulled = false; bm.receiveShadow = true; bm.castShadow = false; bm.name = 'terrain'; bm.renderOrder = 10;
    const dummy = new THREE.BufferGeometry();
    const proto = this.chunkGeometry(0, 0, CH, 8);
    this.pools = [];
    for (let l = 0; l < 3; l++) {
      const slots = [];
      for (let k = 0; k < POOL[l]; k++) {
        const id = bm.addGeometry(proto, cnt[l].v, cnt[l].i);
        bm.addInstance(id); bm.setVisibleAt(id, false);
        slots.push({ id, chunk: null, lod: l, built: false });
      }
      this.pools.push(slots);
    }
    for (const c of this.chunks) {
      const g = this.chunkGeometry(c.ci, c.cj, CH, 8);
      const id = bm.addGeometry(g, cnt[3].v, cnt[3].i);
      bm.addInstance(id);
      c.slots[3] = { id, chunk: c, lod: 3, built: true };
      c.show = 3;
      g.dispose();
    }
    proto.dispose(); dummy.dispose();
    this.bm = bm;
    group.add(bm);
    this.group = group;
    this.queue = [];
    this.lodStats = [0, 0, 0, 0];
    return group;
  }

  updateLOD(view, budgetMs = 2.5, scale = 1) {
    const T = [170 * scale, 420 * scale, 950 * scale];
    const cam = view.pos, bm = this.bm;
    const half = 128 * 1.42 * 0.7;
    this.lodStats.fill(0);
    for (const c of this.chunks) {
      const dx = c.cx - cam.x, dz = c.cz - cam.z;
      const dc = Math.sqrt(dx * dx + dz * dz);
      const b = dc < 200 ? 1 : view.bias(c.cx, c.y, c.cz);
      const d = Math.max(0, dc - half) / b;
      const want = d < T[0] ? 0 : d < T[1] ? 1 : d < T[2] ? 2 : 3;
      c.want = want;
      c.dist = dc;
      c.inView = dc < 190 || view.sphere(c.cx, c.y + 20, c.cz, 195);
      let show = 3;
      for (let l = want; l < 3; l++) { const sl = c.slots[l]; if (sl && sl.built && sl.chunk === c) { show = l; break; } }
      if (want < 3 && show > want && !(c.slots[want] && c.slots[want].chunk === c) && !c.queued) { c.queued = true; this.queue.push(c); }
      const showKey = c.inView ? show : -1;
      if (showKey !== c.show) {
        const old = c.slots[c.show]; if (old) bm.setVisibleAt(old.id, false);
        if (showKey >= 0) bm.setVisibleAt(c.slots[showKey].id, true);
        c.show = showKey;
      }
      this.lodStats[show]++;
    }
    if (this.queue.length) {
      this.queue.sort((p, q) => p.dist - q.dist);
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < budgetMs) {
        const c = this.queue.shift();
        c.queued = false;
        const l = c.want;
        if (l >= 3 || (c.slots[l] && c.slots[l].chunk === c)) continue;
        const pool = this.pools[l];
        let slot = pool.find((s) => !s.chunk);
        if (!slot) {
          let far = null, fd = -1;
          for (const s of pool) if (s.chunk.want !== l && s.chunk.dist > fd) { fd = s.chunk.dist; far = s; }
          if (!far || fd < c.dist) continue;
          slot = far;
          slot.chunk.slots[l] = null; slot.chunk = null;
        }
        const g = this.chunkGeometry(c.ci, c.cj, c.CH, 1 << l);
        bm.setGeometryAt(slot.id, g);
        g.dispose();
        slot.chunk = c; slot.built = true; c.slots[l] = slot;
      }
    }
  }

  chunkGeometry(ci, cj, CH, step) {
    return this.chunkMesh(ci, cj, CH, step, null);
  }

  chunkMesh(ci, cj, CH, step, material) {
    const w = Math.min(CH, this.nx - 1 - ci), d = Math.min(CH, this.nz - 1 - cj);
    const nw = Math.floor(w / step), nd = Math.floor(d / step);
    const pos = [], nor = [], uv = [], cc = [], ww = [], idx = [];
    const col = new THREE.Color();
    const H = this.h, NX = this.nx, NZ = this.nz;
    const hAt = (i, j) => H[Math.min(NZ - 1, Math.max(0, j)) * NX + Math.min(NX - 1, Math.max(0, i))];
    const half = step >> 1;
    const hMin = (i, j) => {
      if (step === 1) return hAt(i, j);
      let m = Infinity;
      for (let dj = -half; dj <= half; dj++) for (let di = -half; di <= half; di++) { const v = hAt(i + di, j + dj); if (v < m) m = v; }
      return m;
    };
    const vert = (gi, gj, drop) => {
      const x = this.x0 + gi * this.res, z = this.z0 + gj * this.res;
      let y = hMin(gi, gj);
      if (x > -1062 && x < 1010 && z > -470 && z < 495 && Math.abs(y) < 0.2) y -= 0.06;
      const hx = hAt(gi + step, gj) - hAt(gi - step, gj), hz = hAt(gi, gj + step) - hAt(gi, gj - step);
      const nx = -hx, ny = 4 * this.res * step / 2, nz = -hz, l = Math.hypot(nx, ny, nz);
      pos.push(x, y - drop, z); nor.push(nx / l, ny / l, nz / l); uv.push(x / 5, z / 5);
      this.terrainColor(x, y, z, ny / l, col);
      cc.push(col.r, col.g, col.b);
      ww.push(this._w[0], this._w[1], this._w[2], this._w[3]);
      return pos.length / 3 - 1;
    };
    for (let j = 0; j <= nd; j++) for (let i = 0; i <= nw; i++) vert(ci + i * step, cj + j * step, 0);
    for (let j = 0; j < nd; j++) for (let i = 0; i < nw; i++) {
      const a = j * (nw + 1) + i, b = a + 1, c = a + (nw + 1), e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
    const ring = [];
    for (let i = 0; i <= nw; i++) ring.push([i, 0]);
    for (let j = 1; j <= nd; j++) ring.push([nw, j]);
    for (let i = nw - 1; i >= 0; i--) ring.push([i, nd]);
    for (let j = nd - 1; j > 0; j--) ring.push([0, j]);
    ring.push([0, 0]);
    let prevTop = null, prevBot = null;
    for (const [i, j] of ring) {
      const top = j * (nw + 1) + i;
      const bot = vert(ci + i * step, cj + j * step, 3 * step);
      if (prevTop !== null) idx.push(prevTop, top, prevBot, top, bot, prevBot);
      prevTop = top; prevBot = bot;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(ww, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  terrainColor(x, y, z, ny, out) {
    const n1 = noise2(x / 140, z / 140) * 0.5 + 0.5, n2 = noise2(x / 23, z / 23);
    const s = this.surfAt(x, z);
    const W = this._w || (this._w = [1, 0, 0, 0]);
    W[0] = 1; W[1] = 0; W[2] = 0; W[3] = 0;
    const sl = 1 - ny;
    const dirtW = smoothstep(0.1, 0.28, sl) * (1 - smoothstep(0.32, 0.5, sl)), rockW = smoothstep(0.3, 0.5, sl);
    W[1] = dirtW; W[3] = rockW; W[0] = Math.max(0, 1 - dirtW - rockW);
    if (z > 880 && z < 2000 && n2 > 0.3) { const f = Math.min(0.5, (n2 - 0.3) * 0.9) * smoothstep(880, 1000, z); W[1] = Math.max(W[1], f); W[0] = Math.max(0, 1 - W[1] - W[3]); }
    const beach = z > 2280 && y < 1.0;
    if (beach) { const k = Math.min(1, smoothstep(1.0, 0.1, y)); W[2] = k; W[0] *= 1 - k; W[1] *= 1 - k; W[3] *= 1 - k; }
    if (s === SURF.DIRT) { W[1] = 1; W[0] = W[2] = W[3] = 0; }
    else if (s === SURF.GRAVEL) { W[3] = 1; W[0] = W[1] = W[2] = 0; }
    else if (s === SURF.SAND && !(x < BAY_X + 40 || z > 2200)) { W[2] = 1; W[0] = W[1] = W[3] = 0; }
    else if (s === SURF.ROCK) { W[3] = 1; W[0] = W[1] = W[2] = 0; }
    else if (s === SURF.FIELD) { W[1] = Math.max(W[1], 0.35); W[0] = Math.max(0, 1 - W[1] - W[3]); }
    out.setRGB(0.36 + n1 * 0.07 + n2 * 0.03, 0.46 + n1 * 0.08, 0.22 + n1 * 0.03);
    if (z < -470) out.setRGB(0.3 + n1 * 0.06, 0.4 + n1 * 0.07, 0.2);
    if (x > 1010) { const dry = n1; out.setRGB(0.42 + dry * 0.12, 0.47 + dry * 0.05, 0.23); }
    if (z > 880 && z < 2000) { const f = smoothstep(880, 1000, z) * (1 - smoothstep(1890, 1990, z)); out.lerp(new THREE.Color(0.2 + n1 * 0.06 + n2 * 0.03, 0.32 + n1 * 0.07, 0.14), f * 0.85); if (n2 > 0.35) out.lerp(new THREE.Color(0.3, 0.24, 0.16), f * 0.35 * (n2 - 0.35)); }
    const slope = 1 - ny;
    if (slope > 0.12) out.lerp(_dirtC, smoothstep(0.12, 0.3, slope));
    if (slope > 0.3) out.lerp(_rockC, smoothstep(0.3, 0.5, slope));
    if (y > 250) out.lerp(_snowC, smoothstep(250, 330, y + n2 * 20));
    if (x < BAY_X + 40 || z > 2200) out.lerp(new THREE.Color(0.66, 0.6, 0.47), smoothstep(1.5, 0.2, y));
    if (z > 2280 && y < 0.9) out.lerp(new THREE.Color(0.74, 0.68, 0.54), smoothstep(0.9, 0.1, y));
    if (s === SURF.DIRT) out.setRGB(0.45, 0.37, 0.27);
    if (s === SURF.GRAVEL) out.setRGB(0.5, 0.48, 0.45);
    if (s === SURF.FIELD) {
      const row = Math.sin(x * 1.3) * 0.5 + 0.5;
      out.setRGB(0.5 + n2 * 0.05 - row * 0.08, 0.46 + row * 0.06, 0.24);
    }
    return out;
  }

  buildFar(material) {
    // coarse grid around the heightmap for the horizon
    const S = 100, N = 160, H = (N * S) / 2;
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    const X1 = this.x0 + (this.nx - 1) * this.res, Z1 = this.z0 + (this.nz - 1) * this.res;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = -H + i * S, z = -H + j * S;
      let y = this.base(x, z);
      const rr = Math.hypot(x, z);
      const inside = x >= this.x0 && x <= X1 && z >= this.z0 && z <= Z1;
      if (!inside && x > BAY_X - 100 && z < 2300) y += smoothstep(2300, 6000, rr) * (200 + 420 * ridged(x / 1500, z / 1500, 5));
      if (x < BAY_X - 50 || (z > 2400 && !inside)) y = Math.min(y, WATER_LEVEL - 3);
      pos.push(x, y - (inside ? 3 : 0.8), z);
      this.terrainColor(x, y, z, 0.95 - Math.min(0.45, Math.abs(y) / 1200), c);
      c.lerp(new THREE.Color(0.47, 0.52, 0.55), smoothstep(2500, 8000, rr) * 0.45);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -H + i * S, z = -H + j * S;
      if (x >= this.x0 && x + S <= X1 && z >= this.z0 && z + S <= Z1) continue;
      const a = j * (N + 1) + i, b = a + 1, cc = a + N + 1, e = cc + 1;
      idx.push(a, cc, b, b, cc, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false; m.renderOrder = 10;
    return m;
  }
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
