import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { lerp } from '../core/math.js';

const C = (h) => new THREE.Color(h);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

// Separates hinged panels from a built car: front doors (with mirrors, handles, glass), hood and trunk lid.
// The triangles are cut out of the body meshes, so a closed panel fits its hole exactly.
export function hasDoors(def) {
  const s = def.body.style;
  return s !== 'bus' && s !== 'truck' && s !== 'bike';
}

function panelSpecs(def, geo) {
  const b = def.body, P = geo.P, L = b.L;
  const { zF, zR } = geo.layout;
  const twoDoor = b.style === 'coupe' || b.style === 'sports' || b.style === 'supercar' || b.style === 'muscle';
  const pillarB = (b.tA - b.ws + b.tR + b.rw) / 2;
  const zB = -L / 2 + pillarB * L;
  const z1 = zF - (b.wr + 0.16);
  const z0 = twoDoor ? zR + b.wr + 0.16 : Math.min(zB, z1 - 0.8);
  const zW = -L / 2 + (b.tA - b.ws) * L;
  const zWs = -L / 2 + b.tA * L;
  const hoodZ0 = zWs + 0.02, hoodZ1 = L / 2 - 0.03;
  const trunkZ0 = -L / 2 + 0.03, trunkZ1 = -L / 2 + (b.tR + b.rw * 0.4) * L;
  return { z0, z1, zB, zW, hoodZ0, hoodZ1, trunkZ0, trunkZ1, twoDoor };
}

function geometryTriangles(g) {
  const ix = g.index.array, out = [];
  for (let k = 0; k < ix.length; k += 3) out.push({ a: ix[k], b: ix[k + 1], c: ix[k + 2] });
  return out;
}

function subGeometry(src, tris, shift, thickness = 0) {
  if (!tris.length) return null;
  const map = new Map(), pos = [], nor = [], uv = [], col = [], idx = [];
  const sp = src.attributes.position, sn = src.attributes.normal, su = src.attributes.uv, sc = src.attributes.color;
  const vert = (i) => {
    if (map.has(i)) return map.get(i);
    const n = pos.length / 3;
    pos.push(sp.getX(i) - shift.x, sp.getY(i) - shift.y, sp.getZ(i) - shift.z);
    nor.push(sn.getX(i), sn.getY(i), sn.getZ(i));
    uv.push(su ? su.getX(i) : 0, su ? su.getY(i) : 0);
    col.push(sc ? sc.getX(i) : 1, sc ? sc.getY(i) : 1, sc ? sc.getZ(i) : 1);
    map.set(i, n);
    return n;
  };
  for (const t of tris) idx.push(vert(t.a), vert(t.b), vert(t.c));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  void thickness;
  return g;
}

function withoutTriangles(src, keep) {
  const g = src.clone();
  const idx = [];
  for (const t of keep) idx.push(t.a, t.b, t.c);
  g.setIndex(idx);
  return g;
}

// dark inner skin behind a panel (so an open door has a back side)
function innerSkin(src, tris, shift, depth, dir, color) {
  const b = new GeoBuilder();
  const sp = src.attributes.position, sn = src.attributes.normal;
  for (const t of tris) {
    const base = b.count;
    for (const i of [t.a, t.c, t.b]) {
      const nx = sn.getX(i), ny = sn.getY(i), nz = sn.getZ(i);
      b.v(sp.getX(i) - shift.x - nx * depth * dir.x, sp.getY(i) - shift.y - ny * depth * dir.y, sp.getZ(i) - shift.z - nz * depth * dir.z, -nx, -ny, -nz, 0, 0, color.r, color.g, color.b);
    }
    b.tri(base, base + 1, base + 2);
  }
  return b.count ? b.build() : null;
}

export function splitPanels(def, geo) {
  const b = def.body, P = geo.P, L = b.L;
  const S = panelSpecs(def, geo);
  const parts = { paint: geo.paint, glass: geo.glass, trim: geo.trim, chrome: geo.chrome };
  const body = {}, doors = [{}, {}], hood = {}, trunk = {};
  const triCache = {};
  for (const k in parts) if (parts[k]) triCache[k] = geometryTriangles(parts[k]);
  const vd = (g, i) => ({ x: g.attributes.position.getX(i), y: g.attributes.position.getY(i), z: g.attributes.position.getZ(i), nx: g.attributes.normal.getX(i), ny: g.attributes.normal.getY(i) });
  const okDoor = (v, sgn) => {
    if (v.z < S.z0 - 1e-4 || v.z > S.z1 + 1e-4) return false;
    const tt = P.tOf(v.z), w = P.halfW(tt);
    if (sgn * v.x < w * 0.74 || v.y < P.bottom(tt) + 0.09) return false;
    return sgn * v.x > w * 0.97 || sgn * v.nx > 0.4;
  };
  const okHood = (v) => {
    if (v.z < S.hoodZ0 - 1e-4 || v.z > S.hoodZ1 + 1e-4) return false;
    const tt = P.tOf(v.z), w = P.halfW(tt);
    return Math.abs(v.x) <= w * 0.92 && v.ny > 0.45 && v.y > P.top(tt) - 0.08;
  };
  const okTrunk = (v) => {
    if (v.z < S.trunkZ0 - 1e-4 || v.z > S.trunkZ1 + 1e-4) return false;
    const tt = P.tOf(v.z), w = P.halfW(tt);
    return Math.abs(v.x) <= w * 0.92 && v.ny > 0.4 && v.y > P.top(tt) - 0.1;
  };
  const all3 = (g, t, f) => f(vd(g, t.a)) && f(vd(g, t.b)) && f(vd(g, t.c));
  const doorHinge = [1, -1].map((sgn) => ({ x: sgn * P.halfW(P.tOf(S.z1)) * 0.985, y: 0, z: S.z1 }));
  const hoodHinge = { x: 0, y: P.top(P.tOf(S.hoodZ0)) - 0.02, z: S.hoodZ0 };
  const trunkHinge = { x: 0, y: P.top(P.tOf(S.trunkZ1)) - 0.02, z: S.trunkZ1 };
  const inner = [null, null];
  const dark = C('#0c0d0f');
  for (const k in parts) {
    if (!parts[k]) { body[k] = null; continue; }
    const tris = triCache[k];
    const keep = [], dl = [[], []], hd = [], tk = [];
    for (const t of tris) {
      if (all3(parts[k], t, (v) => okDoor(v, 1))) dl[0].push(t);
      else if (all3(parts[k], t, (v) => okDoor(v, -1))) dl[1].push(t);
      else if (k === 'paint' && all3(parts[k], t, okHood)) hd.push(t);
      else if (k === 'paint' && all3(parts[k], t, okTrunk)) tk.push(t);
      else keep.push(t);
    }
    body[k] = withoutTriangles(parts[k], keep);
    for (let s = 0; s < 2; s++) {
      doors[s][k] = subGeometry(parts[k], dl[s], doorHinge[s]);
      if (k === 'paint') {
        const skin = dl[s].filter((t) => Math.abs(parts[k].attributes.normal.getX(t.a)) > 0.6);
        inner[s] = innerSkin(parts[k], skin, doorHinge[s], 0.07, { x: s === 0 ? 1 : -1, y: 0, z: 0 }, dark);
      }
    }
    if (k === 'paint') {
      hood.paint = subGeometry(parts[k], hd, hoodHinge);
      trunk.paint = subGeometry(parts[k], tk, trunkHinge);
      hood.inner = innerSkin(parts[k], hd, hoodHinge, 0.05, { x: 0, y: 1, z: 0 }, dark);
      trunk.inner = innerSkin(parts[k], tk, trunkHinge, 0.05, { x: 0, y: 1, z: 0 }, dark);
    }
  }
  doors[0].inner = inner[0]; doors[1].inner = inner[1];
  return { body, doors, hood, trunk, hinges: { doors: doorHinge, hood: hoodHinge, trunk: trunkHinge }, spec: S, interior: buildInterior(def, geo, S) };
}

// cabin visible through windows and open doors: an inward-facing room following the roof line, plus seats, dashboard, steering wheel
function buildInterior(def, geo, S) {
  const b = def.body, P = geo.P, L = b.L;
  const g = new GeoBuilder();
  const dark = C('#23252a'), seat = C('#3b3d44'), dash = C('#30323a'), trim = C('#464951'), leather = C('#565961'), roof = C('#6a6e77');
  const sill = P.bottom(0.5) + 0.1, belt = b.beltY;
  const zA = -L / 2 + (b.tR + 0.02) * L, zB = S.zW - 0.02;
  const qd = (p0, p1, p2, p3, face, color) => {
    const e1 = _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), e2 = _b.set(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
    const n = _c.crossVectors(e1, e2);
    if (n.x * face[0] + n.y * face[1] + n.z * face[2] < 0) g.quad(p3, p2, p1, p0, color); else g.quad(p0, p1, p2, p3, color);
  };
  const ring = (z) => {
    const t = P.tOf(z), w = P.halfW(t) * 0.9, r = P.roofAt(t), yR = (r ? r.y : b.roofY) - 0.07, wT = w * Math.min(0.92, b.gh + 0.08);
    return [[-w, sill], [w, sill], [w, belt], [wT, yR], [-wT, yR], [-w, belt]];
  };
  const N = 7, zs = [];
  for (let i = 0; i <= N; i++) zs.push(lerp(zA, zB, i / N));
  const rings = zs.map(ring);
  const cols = [dark, trim, trim, roof, trim, trim];
  const cy = (sill + belt + 0.3) / 2;
  for (let k = 0; k < N; k++) {
    for (let e = 0; e < 6; e++) {
      const a = rings[k][e], c = rings[k][(e + 1) % 6], a2 = rings[k + 1][e], c2 = rings[k + 1][(e + 1) % 6];
      const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
      qd([a[0], a[1], zs[k]], [c[0], c[1], zs[k]], [c2[0], c2[1], zs[k + 1]], [a2[0], a2[1], zs[k + 1]], [-mx, cy - my, 0], cols[e]);
    }
  }
  const capA = rings[0], capB = rings[N];
  for (const [cap, z, face, col] of [[capA, zA, [0, 0, 1], dark], [capB, zB, [0, 0, -1], dash]]) {
    // only the wall below the belt line: above it the windshield and rear glass stay open
    qd([cap[0][0], cap[0][1], z], [cap[1][0], cap[1][1], z], [cap[2][0], cap[2][1], z], [cap[5][0], cap[5][1], z], face, col);
  }
  const bx = (cx, cy2, cz, sx, sy, sz, color, rotX = 0) => {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, c = Math.cos(rotX), s = Math.sin(rotX);
    const T = (x, y, z) => [cx + x, cy2 + y * c - z * s, cz + y * s + z * c];
    qd(T(-hx, -hy, hz), T(hx, -hy, hz), T(hx, hy, hz), T(-hx, hy, hz), [0, 0, 1], color);
    qd(T(hx, -hy, -hz), T(-hx, -hy, -hz), T(-hx, hy, -hz), T(hx, hy, -hz), [0, 0, -1], color);
    qd(T(hx, -hy, hz), T(hx, -hy, -hz), T(hx, hy, -hz), T(hx, hy, hz), [1, 0, 0], color);
    qd(T(-hx, -hy, -hz), T(-hx, -hy, hz), T(-hx, hy, hz), T(-hx, hy, -hz), [-1, 0, 0], color);
    qd(T(-hx, hy, hz), T(hx, hy, hz), T(hx, hy, -hz), T(-hx, hy, -hz), [0, 1, 0], color);
  };
  const w0 = P.halfW(0.5) * 0.9;
  const sz = geo.seat.z, sx = geo.seat.x * (b.W / 1.84);
  const rtop = (z) => { const r = P.roofAt(P.tOf(z)); return (r ? r.y : b.roofY) - 0.1; };
  for (const s of [1, -1]) {
    const hb = Math.max(0.3, Math.min(0.6, rtop(sz - 0.3) - (sill + 0.26) - 0.16));
    bx(s * sx, sill + 0.24, sz, 0.48, 0.16, 0.52, seat);
    bx(s * sx, sill + 0.26 + hb / 2, sz - 0.3, 0.46, hb, 0.11, seat, -0.16);
    bx(s * sx, sill + 0.26 + hb + 0.06, sz - 0.34, 0.24, 0.14, 0.09, leather, -0.16);
  }
  const rear = b.style === 'sedan' || b.style === 'hatch' || b.style === 'suv' || b.style === 'muscle' || b.style === 'offroad' || b.style === 'van' || b.style === 'pickup' || b.style === 'utility';
  if (rear) {
    const rt = P.roofAt(P.tOf(sz - 1.26)), hMax = Math.max(0.2, (rt ? rt.y : b.roofY) - 0.18 - (sill + 0.3));
    bx(0, sill + 0.24, sz - 0.98, w0 * 1.8, 0.16, 0.5, seat);
    bx(0, sill + 0.3 + Math.min(0.55, hMax) / 2, sz - 1.26, w0 * 1.8, Math.min(0.55, hMax), 0.1, seat, -0.14);
  }
  bx(0, belt - 0.06, zB - 0.2, w0 * 2, 0.24, 0.36, dash);
  bx(0, sill + 0.2, sz + 0.2, 0.2, 0.22, 0.85, trim);
  // engine bay under the hood and load well under the trunk lid
  {
    const cyl = def.sound?.cyl || 4, metal = C('#3a3d42'), rubber = C('#111214'), red = C('#8a1c1c'), yel = C('#b58a1e');
    const yb = P.bottom(0.9) + 0.16, yt = P.top(0.9) - 0.03;
    const z0 = S.hoodZ0 + 0.02, z1 = S.hoodZ1 - 0.28, wb = P.halfW(0.9) * 0.84;
    qd([-wb, yb, z0], [wb, yb, z0], [wb, yb, z1], [-wb, yb, z1], [0, 1, 0], dark);
    for (const sg of [1, -1]) qd([sg * wb, yb, z0], [sg * wb, yb, z1], [sg * wb, yt, z1], [sg * wb, yt, z0], [-sg, 0, 0], trim);
    qd([-wb, yb, z1], [wb, yb, z1], [wb, yt, z1], [-wb, yt, z1], [0, 0, -1], rubber);
    qd([-wb, yb, z0], [wb, yb, z0], [wb, yt, z0], [-wb, yt, z0], [0, 0, 1], dark);
    const ez = (z0 + z1) / 2;
    bx(0, yb + 0.22, ez, Math.min(0.62, wb * 1.2), 0.3, Math.min(0.6, (z1 - z0) * 0.5), metal);
    bx(0, yb + 0.43, ez, Math.min(0.5, wb), 0.1, Math.min(0.5, (z1 - z0) * 0.44), rubber);
    for (let i = 0; i < Math.min(cyl, 8); i++) bx(-Math.min(0.2, wb * 0.4) + (i % 2) * Math.min(0.4, wb * 0.8), yb + 0.5, ez - 0.2 + Math.floor(i / 2) * (0.4 / Math.max(1, Math.ceil(cyl / 2) - 1 || 1)) , 0.07, 0.07, 0.07, i % 2 ? red : yel);
    bx(wb * 0.7, yb + 0.25, z1 - 0.12, 0.14, 0.2, 0.12, C('#6a7480'));
    bx(-wb * 0.7, yb + 0.22, z0 + 0.15, 0.22, 0.16, 0.14, C('#22252a'));
    const tb = P.bottom(0.06) + 0.2, tt = P.top(0.06) - 0.04, tz0 = S.trunkZ0 + 0.06, tz1 = S.trunkZ1 - 0.04, tw = P.halfW(0.06) * 0.82;
    qd([-tw, tb, tz0], [tw, tb, tz0], [tw, tb, tz1], [-tw, tb, tz1], [0, 1, 0], C('#1f2024'));
    for (const sg of [1, -1]) qd([sg * tw, tb, tz0], [sg * tw, tb, tz1], [sg * tw, tt, tz1], [sg * tw, tt, tz0], [-sg, 0, 0], trim);
    qd([-tw, tb, tz0], [tw, tb, tz0], [tw, tt, tz0], [-tw, tt, tz0], [0, 0, 1], dark);
    qd([-tw, tb, tz1], [tw, tb, tz1], [tw, tt, tz1], [-tw, tt, tz1], [0, 0, -1], dark);
    g.addGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 16), 0, tb + 0.09, (tz0 + tz1) / 2, 0, 1, 1, 1, C('#18191c'));
  }
  g.addGeo(new THREE.TorusGeometry(0.17, 0.017, 6, 20), sx, belt + 0.02, sz + 0.42, 0, 1, 1, 1, C('#1a1b1e'), -0.32);
  g.addGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 6), sx, belt - 0.06, sz + 0.55, 0, 1, 1, 1, C('#202226'), Math.PI / 2 - 0.32);
  return g.build();
}

export function lerpDoor(cur, target, dt, speed = 5) {
  return cur + (target - cur) * (1 - Math.exp(-dt * speed));
}
export { lerp };
