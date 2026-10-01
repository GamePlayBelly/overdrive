import * as THREE from 'three';
import { DISTRICTS, ZONES } from '../data/world.js';
import { GeoBuilder } from '../core/geo.js';
import { SURF } from './terrain.js';

const RAISE = { cbd: 0.15, oldtown: 0.15, suburb: 0.08, industrial: 0.12, commercial: 0.12 };

export function zoneAt(x, z, fallback) {
  for (const [x0, x1, z0, z1, zone] of ZONES) if (x > x0 && x < x1 && z > z0 && z < z1) return zone;
  return fallback;
}

export function computeBlocks(roads) {
  const blocks = [];
  for (const D of DISTRICTS) {
    if (!D.xs) continue;
    for (let i = 0; i < D.xs.length - 1; i++) for (let j = 0; j < D.zs.length - 1; j++) {
      const x0 = D.xs[i], x1 = D.xs[i + 1], z0 = D.zs[j], z1 = D.zs[j + 1];
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (cx < D.x0 || cx > D.x1 || cz < D.z0 || cz > D.z1) continue;
      const side = (px, pz) => {
        const n = roads.nearest(px, pz, null, 3);
        return n ? { hw: n.e.halfW, edge: n.e, name: n.e.name } : { hw: 0, edge: null, name: '' };
      };
      const sides = { n: side(cx, z0), s: side(cx, z1), w: side(x0, cz), e: side(x1, cz) };
      const zone = zoneAt(cx, cz, D.style);
      const style = D.style;
      const sw = zone === 'commercial' ? 2.4 : D.sidewalk;
      const verge = D.verge || 0;
      const curb = { x0: x0 + sides.w.hw, x1: x1 - sides.e.hw, z0: z0 + sides.n.hw, z1: z1 - sides.s.hw };
      const inset = sw + verge;
      const lot = { x0: curb.x0 + inset, x1: curb.x1 - inset, z0: curb.z0 + inset, z1: curb.z1 - inset };
      blocks.push({
        id: blocks.length, district: D.id, style, zone, cell: { x0, x1, z0, z1 }, curb, lot, sides, sw, verge, elev: D.elev || 0,
        raise: (RAISE[zone] ?? RAISE[style] ?? 0.12) + (D.elev || 0), cornerR: style === 'suburb' || style === 'alpine' || style === 'desert' ? 4.5 : 3.2,
      });
    }
  }
  return blocks;
}

export class RaisedIndex {
  constructor(blocks) {
    this.cell = 60;
    this.grid = new Map();
    for (const b of blocks) {
      const c = b.curb;
      for (let i = Math.floor(c.x0 / this.cell); i <= Math.floor(c.x1 / this.cell); i++)
        for (let j = Math.floor(c.z0 / this.cell); j <= Math.floor(c.z1 / this.cell); j++) {
          const k = `${i},${j}`;
          let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(b);
        }
    }
    this.extra = [];
  }
  addRect(x0, z0, x1, z1, raise) { this.extra.push({ x0, z0, x1, z1, raise }); }
  blockAt(x, z) {
    const a = this.grid.get(`${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`);
    if (!a) return null;
    for (const b of a) {
      const c = b.curb;
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
      const R = b.cornerR;
      const cx = x < c.x0 + R ? c.x0 + R : x > c.x1 - R ? c.x1 - R : x;
      const cz = z < c.z0 + R ? c.z0 + R : z > c.z1 - R ? c.z1 - R : z;
      if ((x - cx) ** 2 + (z - cz) ** 2 > R * R) continue;
      return b;
    }
    return null;
  }
  raiseAt(x, z) {
    const b = this.blockAt(x, z);
    this.lastElev = b ? b.elev : 0;
    if (b) {
      if (b.style === 'suburb' || b.style === 'alpine' || b.style === 'desert') {
        const l = b.lot;
        if (x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1) return 0;
        const c = b.curb, dEdge = Math.min(x - c.x0, c.x1 - x, z - c.z0, c.z1 - z);
        return dEdge < b.verge ? 0.05 + b.elev : b.raise;
      }
      return b.raise;
    }
    for (const r of this.extra) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) { this.lastElev = 0; return r.raise; }
    return 0;
  }
}

function roundRect(r, R, seg = 5) {
  const pts = [];
  const corners = [
    [r.x1 - R, r.z0 + R, -Math.PI / 2], [r.x1 - R, r.z1 - R, 0], [r.x0 + R, r.z1 - R, Math.PI / 2], [r.x0 + R, r.z0 + R, Math.PI],
  ];
  for (const [cx, cz, a0] of corners) for (let k = 0; k <= seg; k++) {
    const a = a0 + (k / seg) * (Math.PI / 2);
    pts.push({ x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R });
  }
  return pts;
}

// ring between outer (rounded) and inner rectangle
function ringMesh(b, outer, inner, y, col, uvScale) {
  const n = outer.length;
  const innerPts = outer.map((p) => ({
    x: Math.min(inner.x1, Math.max(inner.x0, p.x)),
    z: Math.min(inner.z1, Math.max(inner.z0, p.z)),
  }));
  const base = b.count;
  for (let i = 0; i < n; i++) {
    b.v(outer[i].x, y, outer[i].z, 0, 1, 0, outer[i].x / uvScale, outer[i].z / uvScale, col.r, col.g, col.b);
    b.v(innerPts[i].x, y, innerPts[i].z, 0, 1, 0, innerPts[i].x / uvScale, innerPts[i].z / uvScale, col.r, col.g, col.b);
  }
  for (let i = 0; i < n; i++) {
    const a = base + i * 2, c = base + ((i + 1) % n) * 2;
    b.i.push(a, a + 1, c, c, a + 1, c + 1);
  }
}

function curbFace(b, outer, y0, y1, col) {
  const n = outer.length;
  for (let i = 0; i < n; i++) {
    const p = outer[i], q = outer[(i + 1) % n];
    b.quad([q.x, y0, q.z], [p.x, y0, p.z], [p.x, y1, p.z], [q.x, y1, q.z], col, [0, 0, Math.hypot(q.x - p.x, q.z - p.z) / 3, 0.05]);
  }
}

export function buildBlockSurfaces(blocks, store, terrain) {
  const cSide = new THREE.Color(0.98, 0.97, 0.95), cCurb = new THREE.Color(0.9, 0.89, 0.86), cGrass = new THREE.Color(1, 1, 1), cA = new THREE.Color(1, 1, 1);
  for (const B of blocks) {
    const c = B.curb, R = B.cornerR, y = B.raise;
    const mx = (c.x0 + c.x1) / 2, mz = (c.z0 + c.z1) / 2;
    const side = store.b('side', 'sidewalk', mx, mz), curbs = store.b('curb', 'curb', mx, mz), grass = store.b('side', B.style === 'desert' ? 'sand' : B.style === 'alpine' ? 'gravel' : 'grass', mx, mz), fill = store.b('road', 'asphalt', mx, mz);
    const outer = roundRect(c, R);
    const e = B.elev || 0;
    curbFace(curbs, outer, e - 0.05, y, cCurb);
    // asphalt fillets at rounded corners
    for (const [sx, sz] of [[c.x0, c.z0], [c.x1, c.z0], [c.x1, c.z1], [c.x0, c.z1]]) {
      const cx = sx === c.x0 ? c.x0 + R : c.x1 - R, cz = sz === c.z0 ? c.z0 + R : c.z1 - R;
      const a0 = Math.atan2(sz - cz, sx - cx);
      const base = fill.count;
      fill.v(sx, e + 0.018, sz, 0, 1, 0, sx / 7, sz / 7);
      for (let k = 0; k <= 6; k++) {
        const a = a0 - Math.PI / 4 + (k / 6) * (Math.PI / 2);
        const px = cx + Math.cos(a) * R, pz = cz + Math.sin(a) * R;
        fill.v(px, e + 0.018, pz, 0, 1, 0, px / 7, pz / 7);
      }
      for (let k = 0; k < 6; k++) fill.tri(base, base + 1 + k, base + 2 + k);
    }
    const rural = B.style === 'suburb' || B.style === 'alpine' || B.style === 'desert';
    if (rural) {
      const vInner = { x0: c.x0 + B.verge, x1: c.x1 - B.verge, z0: c.z0 + B.verge, z1: c.z1 - B.verge };
      ringMesh(grass, outer, vInner, e + 0.05, cGrass, 5);
      const vOuter = roundRect(vInner, Math.max(0.5, R - B.verge), 3);
      ringMesh(side, vOuter, B.lot, y, cSide, 3);
      curbFace(curbs, vOuter, e + 0.05, y, cCurb);
    } else {
      ringMesh(side, outer, B.lot, y, cSide, 3);
    }
    const tp = rural ? SURF.GRASS : SURF.CONCRETE;
    terrain.paintRect(c.x0, c.z0, c.x1, c.z1, SURF.CONCRETE);
    if (rural) terrain.paintRect(B.lot.x0, B.lot.z0, B.lot.x1, B.lot.z1, tp);
  }
}

// split a lot rectangle into parcels along its long axis
export function splitRect(r, rng, minW, maxW, axis = null) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const ax = axis || (w >= d ? 'x' : 'z');
  const L = ax === 'x' ? w : d;
  const out = [];
  let p = ax === 'x' ? r.x0 : r.z0;
  const end = p + L;
  while (end - p > 0.5) {
    let s = rng.range(minW, maxW);
    if (end - p - s < minW) s = end - p;
    out.push(ax === 'x' ? { x0: p, x1: p + s, z0: r.z0, z1: r.z1 } : { x0: r.x0, x1: r.x1, z0: p, z1: p + s });
    p += s;
  }
  return out;
}
