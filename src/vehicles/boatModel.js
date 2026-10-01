import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { convexHull } from '../world/collision.js';
import { makeLightsMaterial, makePaintMaterial, makeGlassMaterial } from './carModel.js';
import { makeSails } from './sailModel.js';
import { sailBuilders } from './sailBoats.js';

// Procedural boats. Local frame matches the cars: +z bow, +y up, +x port (left); y = 0 is the static waterline.
const C = (h) => new THREE.Color(h);
const K = {
  white: C('#ffffff'), anti: C('#182430'), dark: C('#17181a'), grey: C('#6b7076'), light: C('#c9ccd0'), cream: C('#d9d3c0'), teak: C('#a07a4c'),
  seat: C('#e9e4d6'), black: C('#0e0f11'), red: C('#b3151b'), blue: C('#1d3f73'), liner: C('#e6e2d6'), wood: C('#8a6a44'),
};
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const STATIONS = [0, 0.012, 0.03, 0.06, 0.1, 0.15, 0.2, 0.26, 0.32, 0.38, 0.44, 0.5, 0.56, 0.62, 0.68, 0.74, 0.8, 0.85, 0.9, 0.94, 0.97, 0.99, 1];

// ---------------------------------------------------------------- small geometry helpers
function quadN(gb, a, b, c, d, col, hint) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
  if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) gb.quad(a, d, c, b, col); else gb.quad(a, b, c, d, col);
}
const avg = (pts) => { const o = [0, 0, 0]; for (const p of pts) { o[0] += p[0]; o[1] += p[1]; o[2] += p[2]; } return [o[0] / pts.length, o[1] / pts.length, o[2] / pts.length]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// hexahedron from a bottom ring (rear +x, rear -x, front -x, front +x) and a top ring in the same order
function hexa(gb, c, col, bottom = false) {
  const cen = avg(c);
  const face = (i, j, k, l) => quadN(gb, c[i], c[j], c[k], c[l], col, sub(avg([c[i], c[j], c[k], c[l]]), cen));
  face(4, 5, 6, 7); face(0, 4, 7, 3); face(1, 5, 6, 2); face(3, 7, 6, 2); face(0, 4, 5, 1);
  if (bottom) face(0, 1, 2, 3);
}
const bx = (gb, x, y, z, sx, sy, sz, col, rotY = 0) => gb.box(x, y, z, sx, sy, sz, col, rotY, 0, true);

const cylCache = new Map();
const unitCyl = (r, seg) => { const k = r + '|' + seg; if (!cylCache.has(k)) cylCache.set(k, new THREE.CylinderGeometry(r, r, 1, seg)); return cylCache.get(k); };
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _s = new THREE.Vector3();
function tube(gb, a, b, r, col, seg = 5) {
  const A = v3(a), B = v3(b), d = B.clone().sub(A), len = d.length();
  if (len < 1e-4) return;
  _q.setFromUnitVectors(_up, d.normalize());
  _m.compose(A.add(B).multiplyScalar(0.5), _q, _s.set(1, len, 1));
  gb.add(unitCyl(r, seg), _m, col);
}
function lamp(gb, kind, x, y, z, sx, sy, sz, col) {
  const s = gb.count; gb.box(x, y, z, sx, sy, sz, col, 0, 0, false);
  for (let i = s; i < gb.count; i++) gb.u[i * 2] = kind + 0.25;
}
// glass pane on a face with a dark backing so the openings read as deep windows
function pane(ctx, f, u0, u1, v0, v1, out) {
  const P = (u, v) => mix(mix(f.bl, f.br, u), mix(f.tl, f.tr, u), v);
  const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1);
  const n = f.n;
  const off = (p, k) => [p[0] + n[0] * k, p[1] + n[1] * k, p[2] + n[2] * k];
  quadN(ctx.glass, off(a, out), off(b, out), off(c, out), off(d, out), null, n);
  quadN(ctx.trim, off(a, out - 0.03), off(b, out - 0.03), off(c, out - 0.03), off(d, out - 0.03), K.black, n);
}
function faceOf(c, name) {
  const cen = avg(c);
  const mk = (bl, br, tr, tl) => { const m = avg([bl, br, tr, tl]); const n = sub(m, cen); const e1 = sub(br, bl), e2 = sub(tl, bl); let nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; if (nn[0] * n[0] + nn[1] * n[1] + nn[2] * n[2] < 0) nn = nn.map((q) => -q); const l = Math.hypot(...nn) || 1; return { bl, br, tr, tl, n: nn.map((q) => q / l) }; };
  if (name === 'L') return mk(c[0], c[3], c[7], c[4]);
  if (name === 'R') return mk(c[1], c[2], c[6], c[5]);
  if (name === 'F') return mk(c[3], c[2], c[6], c[7]);
  return mk(c[1], c[0], c[4], c[5]);
}
// superstructure block with windows: o = { y0, y1, z0, z1, hw0, hw1, rb, rf, side: [[u0,u1,v0,v1]..], front: [...], back: [...], col }
function cabin(ctx, o) {
  const { y0, y1, z0, z1, hw0, hw1 } = o, rb = o.rb || 0, rf = o.rf || 0;
  const c = [[hw0, y0, z0], [-hw0, y0, z0], [-hw0, y0, z1], [hw0, y0, z1], [hw1, y1, z0 + rb], [-hw1, y1, z0 + rb], [-hw1, y1, z1 - rf], [hw1, y1, z1 - rf]];
  hexa(ctx.paint, c, K.white);
  for (const s of ['L', 'R']) { const f = faceOf(c, s); for (const w of o.side || []) pane(ctx, f, w[0], w[1], w[2], w[3], 0.012); }
  if (o.front) { const f = faceOf(c, 'F'); for (const w of o.front) pane(ctx, f, w[0], w[1], w[2], w[3], 0.012); }
  if (o.back) { const f = faceOf(c, 'B'); for (const w of o.back) pane(ctx, f, w[0], w[1], w[2], w[3], 0.012); }
  return c;
}
function rail(ctx, pts, h, col = K.light, post = 0.9) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    tube(ctx.chrome, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.017, col, 5);
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / post));
    for (let k = 0; k <= n; k++) { const p = mix(a, b, k / n); tube(ctx.chrome, [p[0], p[1], p[2]], [p[0], p[1] + h, p[2]], 0.014, col, 5); }
    tube(ctx.chrome, [a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.011, col, 4);
  }
}
function seat(ctx, x, y, z, w, d, baseH, backH, col = K.seat, rake = 0.15) {
  bx(ctx.trim, x, y + baseH / 2, z, w, baseH, d, K.dark);
  bx(ctx.trim, x, y + baseH + 0.055, z, w * 0.96, 0.11, d * 0.98, col);
  if (backH > 0) {
    const gb = ctx.trim;
    gb.addGeo(new THREE.BoxGeometry(w * 0.96, backH, 0.09), x, y + baseH + 0.11 + backH / 2, z - d / 2 + 0.05, 0, 1, 1, 1, col, -rake);
  }
}

// ---------------------------------------------------------------- hull
function hullFns(H) {
  const { L, W } = H;
  const ys = (t) => lerp(H.fbS, H.fbB, Math.pow(t, H.sheerPow ?? 2.2)) - H.sheerSag * Math.sin(Math.PI * t);
  const hw = (t) => {
    const u = clamp((t - H.beamT) / (1 - H.beamT), 0, 1);
    const taper = Math.pow(Math.max(0, 1 - Math.pow(u, H.bowExp)), H.bowRound);
    return (W / 2) * taper * lerp(H.sternW, 1, smoothstep(0, 0.24, t));
  };
  const yk = (t) => {
    const u = clamp((t - H.keelT) / (1 - H.keelT), 0, 1);
    return lerp(-H.draft, ys(1) * 0.9, Math.pow(u, H.keelPow));
  };
  const ring = (t) => {
    const w = hw(t), k = yk(t), s = ys(t), f = H.flare * smoothstep(0.3, 1, t);
    if (H.round) {
      const ym = k + (s - k) * 0.46;
      return [[0, k], [w * 0.4, k + (ym - k) * 0.06], [w * 0.74, k + (ym - k) * 0.27], [w * 0.94, k + (ym - k) * 0.62], [w, ym], [w * (1 + f * 0.5), lerp(ym, s, 0.6)], [w * (1 + f), s]];
    }
    const yc = k + (s - k) * H.chine;
    return [[0, k], [w * 0.5, lerp(k, yc, 0.42)], [w, yc], [w * (1 + f * 0.4), lerp(yc, s, 0.55)], [w * (1 + f), s]];
  };
  return { ys, hw, yk, ring, L, W };
}

function loftShell(gb, ts, rings, L, col = K.white) {
  const Kp = rings[0].length - 1;
  for (const side of [1, -1]) for (let j = 0; j < Kp; j++) {
    const base = gb.count;
    for (let k = 0; k < ts.length; k++) {
      const z = -L / 2 + ts[k] * L, a = rings[k][j], b = rings[k][j + 1];
      gb.v(side * a[0], a[1], z, 0, 1, 0, ts[k], j / Kp, col.r, col.g, col.b);
      gb.v(side * b[0], b[1], z, 0, 1, 0, ts[k], (j + 1) / Kp, col.r, col.g, col.b);
    }
    for (let k = 0; k < ts.length - 1; k++) {
      const i = base + k * 2;
      if (side > 0) gb.i.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); else gb.i.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  }
  // transom
  const r = rings[0], z = -L / 2, pts = [];
  for (let j = 0; j < r.length; j++) pts.push([r[j][0], r[j][1], z]);
  for (let j = r.length - 2; j >= 0; j--) pts.push([-r[j][0], r[j][1], z]);
  const c = avg(pts);
  for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1]; const i0 = gb.count; gb.v(c[0], c[1], c[2], 0, 0, -1, 0.5, 0.5, col.r, col.g, col.b); gb.v(a[0], a[1], a[2], 0, 0, -1, 0, 0, col.r, col.g, col.b); gb.v(b[0], b[1], b[2], 0, 0, -1, 1, 0, col.r, col.g, col.b); const e1 = sub(a, c), e2 = sub(b, c); if (e1[0] * e2[1] - e1[1] * e2[0] > 0) gb.i.push(i0, i0 + 2, i0 + 1); else gb.i.push(i0, i0 + 1, i0 + 2); }
}

function xAtY(ring, y) {
  for (let i = 0; i < ring.length - 1; i++) { const a = ring[i], b = ring[i + 1]; if (b[1] > a[1] && a[1] <= y && b[1] >= y) return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1])); }
  return null;
}
// polyline of the hull section between two heights (resampled to n points)
function sectionBetween(ring, y0, y1, n) {
  const pts = [];
  const top = ring[ring.length - 1][1], bot = ring[0][1];
  const a = Math.max(y0, bot), b = Math.min(y1, top);
  if (b <= a + 1e-4) { const p = [xAtY(ring, clamp(y0, bot, top)) ?? 0, clamp(y0, bot, top)]; for (let i = 0; i < n; i++) pts.push(p); return pts; }
  const raw = [[xAtY(ring, a) ?? 0, a]];
  for (const p of ring) if (p[1] > a && p[1] < b) raw.push(p);
  raw.push([xAtY(ring, b) ?? ring[ring.length - 1][0], b]);
  const lens = [0];
  for (let i = 1; i < raw.length; i++) lens.push(lens[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const tot = lens[lens.length - 1] || 1;
  for (let k = 0; k < n; k++) {
    const d = (k / (n - 1)) * tot;
    let i = 1; while (i < raw.length - 1 && lens[i] < d) i++;
    const f = (d - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
    pts.push([lerp(raw[i - 1][0], raw[i][0], f), lerp(raw[i - 1][1], raw[i][1], f)]);
  }
  return pts;
}
// coloured band painted on the hull surface between two height functions
function hullBand(gb, F, ts, y0, y1, n, off, col) {
  const secs = ts.map((t) => {
    const ring = F.ring(t), s = sectionBetween(ring, y0(t), y1(t), n);
    return s.map((p, i) => {
      const q = s[Math.min(n - 1, i + 1)], p0 = s[Math.max(0, i - 1)];
      let tx = q[0] - p0[0], ty = q[1] - p0[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      return [p[0] + ty * off, p[1] - tx * off, tx, ty];
    });
  });
  for (let k = 0; k < ts.length - 1; k++) {
    const z0 = -F.L / 2 + ts[k] * F.L, z1 = -F.L / 2 + ts[k + 1] * F.L;
    for (let i = 0; i < n - 1; i++) {
      const a = secs[k][i], b = secs[k][i + 1], c = secs[k + 1][i + 1], d = secs[k + 1][i];
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(d[0] - c[0]) + Math.abs(d[1] - c[1]) < 1e-5) continue;
      for (const side of [1, -1]) {
        const hint = [side * (a[3] + b[3]) / 2, -(a[2] + b[2]) / 2, 0];
        quadN(gb, [side * a[0], a[1], z0], [side * b[0], b[1], z0], [side * c[0], c[1], z1], [side * d[0], d[1], z1], col, hint);
      }
    }
  }
}
// deck strips on both sides between |x| = wIn(t) and wOut(t)
function sideDeck(gb, F, t0, t1, wOut, wIn, y, col, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = lerp(t0, t1, i / n), b = lerp(t0, t1, (i + 1) / n), za = -F.L / 2 + a * F.L, zb = -F.L / 2 + b * F.L;
    for (const s of [1, -1]) quadN(gb, [s * wOut(a), y(a), za], [s * wIn(a), y(a), za], [s * wIn(b), y(b), zb], [s * wOut(b), y(b), zb], col, [0, 1, 0]);
  }
}
// horizontal strip of deck between x = ±w(t) at height y(t)
function deckBand(gb, F, t0, t1, w, y, col, n = 14) {
  const ts = []; for (let i = 0; i <= n; i++) ts.push(lerp(t0, t1, i / n));
  for (let i = 0; i < n; i++) {
    const a = ts[i], b = ts[i + 1], za = -F.L / 2 + a * F.L, zb = -F.L / 2 + b * F.L;
    const wa = w(a), wb = w(b);
    if (wa < 0.02 && wb < 0.02) continue;
    quadN(gb, [wa, y(a), za], [-wa, y(a), za], [-wb, y(b), zb], [wb, y(b), zb], col, [0, 1, 0]);
  }
}
// smooth cap over a deck area: stations along t, an arch from the left edge over the top to the right edge
function dome(gb, F, t0, t1, yBase, hFn, wFn, n = 14, m = 9) {
  const base = gb.count;
  for (let k = 0; k <= n; k++) {
    const t = lerp(t0, t1, k / n), z = -F.L / 2 + t * F.L, w = wFn(t), h = hFn(t), y0 = yBase(t);
    for (let j = 0; j <= m; j++) {
      const a = (j / m) * Math.PI, x = w * Math.cos(a), y = y0 + h * Math.pow(Math.sin(a), 0.8);
      gb.v(x, y, z, 0, 1, 0, k / n, j / m);
    }
  }
  for (let k = 0; k < n; k++) for (let j = 0; j < m; j++) {
    const i0 = base + k * (m + 1) + j, i1 = i0 + 1, i2 = i0 + (m + 1), i3 = i2 + 1;
    gb.i.push(i0, i1, i2, i1, i3, i2);
  }
}
function hullBuild(ctx, H, o = {}) {
  const F = hullFns(H);
  const rings = STATIONS.map((t) => F.ring(t));
  loftShell(o.shell ? ctx.trim : ctx.paint, STATIONS, rings, H.L, o.shell || K.white);
  const ts = STATIONS.filter((t) => t < 0.985 || t === 1);
  // antifouling below the boot stripe, boot stripe, sheer stripe
  hullBand(ctx.trim, F, ts, () => -10, () => 0.005, 6, 0.006, o.anti || K.anti);
  hullBand(ctx.trim, F, ts, () => 0.005, () => 0.06, 2, 0.007, o.boot || K.white);
  if (o.stripe) hullBand(ctx.trim, F, ts, (t) => F.ys(t) - 0.27 - 0.06 * t, (t) => F.ys(t) - 0.17 - 0.05 * t, 2, 0.007, o.stripe);
  return F;
}

// ---------------------------------------------------------------- moving parts (merged per material, geometry shared between boats)
const rigCache = {};
const rigGeo = (key, build) => rigCache[key] || (rigCache[key] = build());
const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; return m; };

export function rigWheel(mats) {
  const geo = rigGeo('wheel', () => {
    const gb = new GeoBuilder();
    gb.add(new THREE.TorusGeometry(0.16, 0.013, 6, 16), null, K.black);
    for (let i = 0; i < 3; i++) gb.addGeo(new THREE.BoxGeometry(0.3, 0.014, 0.014), 0, 0, 0, 0, 1, 1, 1, K.black, 0, (i * Math.PI) / 3);
    gb.addGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8).rotateX(Math.PI / 2), 0, 0, 0, 0, 1, 1, 1, K.light);
    return gb.build();
  });
  const g = new THREE.Group(); g.add(mesh(geo, mats.trim, false));
  return g;
}

export function rigOutboard(scale, mats, big) {
  const geos = rigGeo('outboard', () => {
    const cowl = new GeoBuilder(), body = new GeoBuilder(), prop = new GeoBuilder();
    cowl.addGeo(new THREE.SphereGeometry(0.5, 14, 10), 0, 0.06, -0.22, 0, 0.46, 0.5, 0.78);
    bx(body, 0, -0.2, -0.22, 0.34, 0.06, 0.6, K.dark);
    bx(body, 0, -0.56, -0.16, 0.17, 0.72, 0.36, K.dark);
    body.addGeo(new THREE.SphereGeometry(0.5, 10, 8), 0, -0.98, -0.12, 0, 0.2, 0.2, 0.62, K.grey);
    bx(body, 0, -1.1, -0.1, 0.03, 0.14, 0.26, K.grey);
    bx(body, 0, -0.84, -0.1, 0.4, 0.02, 0.5, K.grey);
    for (let i = 0; i < 3; i++) prop.addGeo(new THREE.BoxGeometry(0.06, 0.24, 0.012), 0, 0, 0, 0.5, 1, 1, 1, K.light, 0, (i * Math.PI * 2) / 3);
    prop.addGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8).rotateX(Math.PI / 2), 0, 0, 0, 0, 1, 1, 1, K.light);
    return { cowl: cowl.build(true), body: body.build(true), prop: prop.build(true) };
  });
  const g = new THREE.Group();
  g.add(mesh(geos.cowl, mats.paint), mesh(geos.body, mats.trim));
  const pr = new THREE.Group(); pr.position.set(0, -0.98, -0.47); pr.add(mesh(geos.prop, mats.chrome, false));
  g.add(pr);
  g.userData.prop = pr;
  g.scale.setScalar(scale * (big ? 1.2 : 1));
  return g;
}

export function rigRadar(mats) {
  const geo = rigGeo('radar', () => { const gb = new GeoBuilder(); bx(gb, 0, 0, 0, 0.9, 0.05, 0.1, K.black); bx(gb, 0, -0.08, 0, 0.12, 0.12, 0.2, K.black); return gb.build(); });
  const g = new THREE.Group(); g.add(mesh(geo, mats.trim, false));
  return g;
}

export function rigNozzle(mats) {
  const geo = rigGeo('nozzle', () => { const gb = new GeoBuilder(); gb.addGeo(new THREE.CylinderGeometry(0.11, 0.15, 0.3, 12, 1, true).rotateX(-Math.PI / 2), 0, 0, -0.1, 0, 1, 1, 1, K.light); return gb.build(); });
  const g = new THREE.Group(); g.add(mesh(geo, mats.chrome, false));
  return g;
}

// ---------------------------------------------------------------- individual boats
const BUILD = {
  rib(ctx, def) {
    const b = def.body, L = b.L, hullW = 1.66;
    const H = { L, W: hullW, draft: b.draft, fbS: 0.4, fbB: 0.66, beamT: 0.5, bowExp: 1.5, bowRound: 0.9, sternW: 1, keelT: 0.4, keelPow: 2.0, flare: 0.03, sheerSag: 0.02, sheerPow: 2, chine: 0.36 };
    // fibreglass hull is grey; the tubes carry the body colour
    const F = hullBuild(ctx, H, { anti: K.anti, boot: K.light, shell: C('#7d838b') });
    const r = 0.27, tubeY = (t) => F.ys(t) + 0.04, tubeX = (t) => Math.max(0, F.hw(t) - 0.12);
    const ring = 10, tsT = [0.004, 0.02, 0.05, 0.1, 0.16, 0.22, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.77, 0.83, 0.88, 0.92, 0.95, 0.975, 0.99];
    for (const side of [1, -1]) {
      const base = ctx.paint.count;
      tsT.forEach((t, k) => {
        const cz = -L / 2 + t * L, cx = tubeX(t), cy = tubeY(t);
        const rr = r * Math.sqrt(Math.max(0.02, 1 - Math.pow(Math.max(0, (0.06 - t) / 0.06), 2))) * (1 - 0.55 * smoothstep(0.9, 1, t));
        for (let i = 0; i < ring; i++) { const a = (i / ring) * Math.PI * 2, nx = Math.cos(a), ny = Math.sin(a); ctx.paint.v(side * (cx + nx * rr), cy + ny * rr * 1.02, cz, side * nx, ny, 0, t, i / ring); }
      });
      for (let k = 0; k < tsT.length - 1; k++) for (let i = 0; i < ring; i++) {
        const a = base + k * ring + i, bb = base + k * ring + ((i + 1) % ring), c = base + (k + 1) * ring + ((i + 1) % ring), d = base + (k + 1) * ring + i;
        if (side > 0) ctx.paint.i.push(a, c, bb, a, d, c); else ctx.paint.i.push(a, bb, c, a, c, d);
      }
      // stern cap
      const cz = -L / 2 + tsT[0] * L, cc = ctx.paint.v(side * tubeX(tsT[0]), tubeY(tsT[0]), cz - 0.03, 0, 0, -1, 0.5, 0.5);
      for (let i = 0; i < ring; i++) { const a = base + i, bb = base + ((i + 1) % ring); if (side > 0) ctx.paint.i.push(cc, bb, a); else ctx.paint.i.push(cc, a, bb); }
    }
    // floor, console, seat
    const fl = 0.19;
    deckBand(ctx.trim, F, 0.03, 0.84, (t) => Math.max(0, F.hw(t) - 0.4), () => fl, K.cream, 14);
    bx(ctx.trim, 0, 0.3, -L / 2 + 0.03, 1.0, 0.25, 0.04, K.dark);
    cabin(ctx, { y0: fl, y1: fl + 0.72, z0: -0.05, z1: 0.6, hw0: 0.3, hw1: 0.27, rf: 0.14, side: [], col: K.white });
    bx(ctx.trim, 0, fl + 0.73, 0.4, 0.56, 0.03, 0.4, K.dark);
    const ws = [[0.3, fl + 0.73, 0.22], [-0.3, fl + 0.73, 0.22], [-0.27, fl + 1.05, 0.12], [0.27, fl + 1.05, 0.12]];
    quadN(ctx.glass, ws[0], ws[1], ws[2], ws[3], null, [0, 0.4, 1]);
    tube(ctx.chrome, ws[3], ws[2], 0.012, K.light); tube(ctx.chrome, ws[0], ws[3], 0.012, K.light); tube(ctx.chrome, ws[1], ws[2], 0.012, K.light);
    seat(ctx, 0, fl, -1.0, 0.95, 0.42, 0.34, 0.26, K.dark, 0.25);
    seat(ctx, 0, fl, -1.6, 0.95, 0.34, 0.3, 0.0, K.dark);
    tube(ctx.chrome, [-0.38, fl + 0.8, -0.05], [0.38, fl + 0.8, -0.05], 0.014, K.light);
    if (def.lightbar) {
      tube(ctx.chrome, [0, fl + 0.72, 0.1], [0, fl + 1.22, 0.1], 0.03, K.dark);
      bx(ctx.trim, 0, fl + 1.24, 0.1, 0.62, 0.05, 0.16, K.dark);
      lamp(ctx.lights, 6, 0.17, fl + 1.3, 0.1, 0.26, 0.07, 0.12, C('#5a1010')); lamp(ctx.lights, 7, -0.17, fl + 1.3, 0.1, 0.26, 0.07, 0.12, C('#10105a'));
    }
    lamp(ctx.lights, 0, 0, tubeY(0.97) + 0.12, L / 2 - 0.22, 0.12, 0.08, 0.08, K.white);
    tube(ctx.chrome, [0, fl, -L / 2 + 0.3], [0, fl + 1.1, -L / 2 + 0.3], 0.012, K.light, 4);
    lamp(ctx.lights, 1, 0, fl + 1.14, -L / 2 + 0.3, 0.08, 0.06, 0.06, C('#5a0f0f'));
    return {
      H, F, seat: { x: 0, y: fl - 0.04, z: -0.95, pose: 'drive' }, eye: { x: 0, y: fl + 1.0, z: -0.85 },
      rig: [{ type: 'wheel', x: 0, y: fl + 0.66, z: 0.09, tilt: 0.85 }, { type: 'outboard', x: 0, y: 0.62, z: -L / 2 - 0.02, scale: 0.85 }],
      exhaust: [[0, 0.1, -L / 2 - 0.4]], bow: L / 2 - 0.15, stern: -L / 2, prop: [0, -0.6, -L / 2 - 0.5],
    };
  },

  jetski(ctx, def) {
    const b = def.body, L = b.L;
    const H = { L, W: b.W, draft: b.draft, fbS: 0.3, fbB: 0.56, beamT: 0.46, bowExp: 1.4, bowRound: 0.8, sternW: 0.9, keelT: 0.45, keelPow: 2, flare: 0.05, sheerSag: 0.03, sheerPow: 2, chine: 0.3 };
    const F = hullBuild(ctx, H, { anti: C('#4a4f55'), boot: K.white, stripe: K.black });
    const gw = (t) => F.hw(t) * (1 + H.flare * smoothstep(0.3, 1, t));
    const deckY = (t) => F.ys(t) + 0.02 + 0.05 * Math.sin(Math.PI * t);
    // painted deck, raised hood over the nose, dark saddle and foot wells
    deckBand(ctx.paint, F, 0, 1, gw, deckY, K.white, 18);
    dome(ctx.paint, F, 0.5, 0.99, (t) => deckY(t), (t) => 0.3 * Math.pow(Math.sin(Math.PI * clamp((t - 0.46) / 0.56, 0, 1)), 0.7), (t) => gw(t) * 0.86);
    const zs = -L / 2 + 0.24 * L;
    bx(ctx.trim, 0, deckY(0.3) + 0.12, -0.55, 0.38, 0.24, 1.0, K.black);
    bx(ctx.trim, 0, deckY(0.3) + 0.25, -0.5, 0.3, 0.04, 0.92, K.dark);
    for (const s of [1, -1]) bx(ctx.trim, s * 0.4, deckY(0.3) + 0.03, -0.45, 0.22, 0.03, 1.1, K.dark);
    bx(ctx.trim, 0, deckY(0.05) + 0.06, -L / 2 + 0.18, 0.8, 0.12, 0.3, K.dark);
    // steering pole, bars, grips, mirrors, windshield
    const zp = 0.22, yp = deckY(0.6) + 0.3;
    tube(ctx.chrome, [0, yp - 0.1, zp + 0.1], [0, yp + 0.2, zp - 0.06], 0.024, K.light);
    tube(ctx.chrome, [-0.32, yp + 0.22, zp - 0.07], [0.32, yp + 0.22, zp - 0.07], 0.02, K.dark);
    for (const s of [1, -1]) { bx(ctx.trim, s * 0.34, yp + 0.22, zp - 0.07, 0.12, 0.05, 0.05, K.black); tube(ctx.chrome, [s * 0.36, yp + 0.22, zp - 0.07], [s * 0.36, yp + 0.3, zp - 0.12], 0.012, K.dark, 4); bx(ctx.trim, s * 0.3, yp + 0.34, zp + 0.05, 0.08, 0.05, 0.03, K.black); }
    const ws = [[0.2, yp - 0.02, zp + 0.34], [-0.2, yp - 0.02, zp + 0.34], [-0.15, yp + 0.22, zp + 0.14], [0.15, yp + 0.22, zp + 0.14]];
    quadN(ctx.glass, ws[0], ws[1], ws[2], ws[3], null, [0, 0.6, 1]);
    lamp(ctx.lights, 0, 0, deckY(0.9) + 0.14, L / 2 - 0.4, 0.14, 0.05, 0.05, K.white);
    lamp(ctx.lights, 1, 0, deckY(0.03) + 0.06, -L / 2 + 0.04, 0.12, 0.05, 0.04, C('#5a0f0f'));
    void zs;
    return {
      H, F, seat: { x: 0, y: deckY(0.3) - 0.2, z: -0.45, pose: 'ride' }, eye: { x: 0, y: deckY(0.3) + 1.15, z: -0.42 },
      rig: [{ type: 'nozzle', x: 0, y: 0.05, z: -L / 2 + 0.02 }], exhaust: [[0, 0.06, -L / 2 - 0.1]], bow: L / 2 - 0.2, stern: -L / 2, prop: [0, -0.05, -L / 2 - 0.1], ski: true,
    };
  },

  sport(ctx, def) {
    const b = def.body, L = b.L;
    const H = { L, W: b.W, draft: b.draft, fbS: 0.74, fbB: 1.1, beamT: 0.46, bowExp: 1.7, bowRound: 0.9, sternW: 0.96, keelT: 0.38, keelPow: 2.2, flare: 0.09, sheerSag: 0.05, sheerPow: 2.2, chine: 0.3 };
    const F = hullBuild(ctx, H, { anti: K.anti, boot: K.white, stripe: K.blue });
    const inset = 0.2, fl = 0.3, tc1 = 0.5;
    const gw = (t) => F.hw(t) * (1 + H.flare * smoothstep(0.3, 1, t));
    // foredeck + side decks, cockpit well
    deckBand(ctx.trim, F, tc1, 0.995, (t) => gw(t), (t) => F.ys(t) + 0.02, K.cream, 12);
    deckBand(ctx.paint, F, tc1 + 0.06, 0.96, (t) => gw(t) * 0.22, (t) => F.ys(t) + 0.045, K.white, 10);
    sideDeck(ctx.trim, F, 0, tc1, gw, (t) => Math.max(0.05, gw(t) - inset), (t) => F.ys(t) + 0.02, K.cream, 10);
    // cockpit: clear the centre by drawing liner walls and a lower floor
    const wallIn = (t) => Math.max(0.05, gw(t) - inset);
    deckBand(ctx.trim, F, 0.02, tc1, (t) => wallIn(t), () => fl, K.cream, 10);
    for (const s of [1, -1]) for (let i = 0; i < 10; i++) {
      const t0 = lerp(0.02, tc1, i / 10), t1 = lerp(0.02, tc1, (i + 1) / 10), z0 = -L / 2 + t0 * L, z1 = -L / 2 + t1 * L;
      quadN(ctx.trim, [s * wallIn(t0), fl, z0], [s * wallIn(t1), fl, z1], [s * wallIn(t1), F.ys(t1) + 0.02, z1], [s * wallIn(t0), F.ys(t0) + 0.02, z0], K.liner, [-s, 0, 0]);
    }
    quadN(ctx.trim, [wallIn(0.02), fl, -L / 2 + 0.02 * L], [-wallIn(0.02), fl, -L / 2 + 0.02 * L], [-wallIn(0.02), F.ys(0.02) + 0.02, -L / 2 + 0.02 * L], [wallIn(0.02), F.ys(0.02) + 0.02, -L / 2 + 0.02 * L], K.liner, [0, 0, 1]);
    quadN(ctx.trim, [wallIn(tc1), fl, -L / 2 + tc1 * L], [-wallIn(tc1), fl, -L / 2 + tc1 * L], [-wallIn(tc1), F.ys(tc1) + 0.02, -L / 2 + tc1 * L], [wallIn(tc1), F.ys(tc1) + 0.02, -L / 2 + tc1 * L], K.liner, [0, 0, -1]);
    // helm console and windscreen
    const zc = -L / 2 + tc1 * L, yd = F.ys(tc1) + 0.02;
    cabin(ctx, { y0: fl, y1: yd + 0.28, z0: zc - 0.95, z1: zc, hw0: 0.78, hw1: 0.72, rb: 0.1, rf: 0, col: K.white });
    bx(ctx.trim, 0.42, yd + 0.3, zc - 0.5, 0.5, 0.04, 0.42, K.dark);
    const wy0 = yd + 0.28, wy1 = wy0 + 0.62, zb = zc - 0.05, zt = zc - 0.42;
    quadN(ctx.glass, [wallIn(tc1), wy0, zb], [-wallIn(tc1), wy0, zb], [-wallIn(tc1) * 0.94, wy1, zt], [wallIn(tc1) * 0.94, wy1, zt], null, [0, 0.6, 1]);
    quadN(ctx.trim, [wallIn(tc1), wy0, zb + 0.0], [-wallIn(tc1), wy0, zb + 0.0], [-wallIn(tc1), wy0 - 0.02, zb + 0.0], [wallIn(tc1), wy0 - 0.02, zb + 0.0], K.dark, [0, 0, 1]);
    const fr = [[wallIn(tc1), wy0, zb], [wallIn(tc1) * 0.94, wy1, zt], [-wallIn(tc1) * 0.94, wy1, zt], [-wallIn(tc1), wy0, zb]];
    for (let i = 0; i < 3; i++) tube(ctx.chrome, fr[i], fr[i + 1], 0.02, K.light);
    tube(ctx.chrome, [0, wy0, zb], [0, wy1, zt], 0.014, K.light);
    // seats
    seat(ctx, 0.42, fl, zc - 1.25, 0.6, 0.5, 0.26, 0.42, K.seat, 0.18);
    seat(ctx, -0.42, fl, zc - 1.25, 0.6, 0.5, 0.26, 0.42, K.seat, 0.18);
    seat(ctx, 0, fl, -L / 2 + 0.45, 1.5, 0.6, 0.3, 0.45, K.seat, 0.12);
    bx(ctx.trim, 0, fl + 0.02, zc - 2.0, 1.5, 0.03, 2.6, K.teak);
    // bow rail, cleats, hatch
    const rp = []; for (let i = 0; i <= 9; i++) { const t = lerp(0.56, 0.93, i / 9); rp.push([gw(t) * 0.92, F.ys(t) + 0.02, -L / 2 + t * L]); }
    rail(ctx, rp, 0.3, K.light, 0.8); rail(ctx, rp.map((p) => [-p[0], p[1], p[2]]), 0.3, K.light, 0.8);
    bx(ctx.trim, 0, F.ys(0.7) + 0.06, -L / 2 + 0.7 * L, 0.5, 0.03, 0.55, K.light);
    // swim platform, outboard
    bx(ctx.trim, 0, 0.24, -L / 2 - 0.22, F.hw(0) * 1.7, 0.04, 0.42, K.teak);
    bx(ctx.trim, 0, F.ys(0) + 0.05, -L / 2 + 0.02, F.hw(0) * 1.9, 0.14, 0.05, K.dark);
    for (const s of [1, -1]) { lamp(ctx.lights, 1, s * 0.6, F.ys(0) + 0.05, -L / 2 - 0.01, 0.12, 0.06, 0.04, C('#5a0f0f')); }
    lamp(ctx.lights, 0, 0, F.ys(0.9) + 0.1, -L / 2 + 0.9 * L, 0.12, 0.08, 0.08, K.white);
    return {
      H, F, seat: { x: 0.42, y: fl - 0.04, z: zc - 1.25, pose: 'drive' }, eye: { x: 0.42, y: fl + 1.05, z: zc - 1.05 },
      rig: [{ type: 'wheel', x: 0.42, y: yd + 0.44, z: zc - 0.7, tilt: 0.9 }, { type: 'outboard', x: 0, y: F.ys(0) + 0.1, z: -L / 2 - 0.44, scale: 1.05, big: true }],
      exhaust: [[0, 0.1, -L / 2 - 0.9]], bow: L / 2 - 0.3, stern: -L / 2, prop: [0, -0.8, -L / 2 - 0.95],
    };
  },

  fisher(ctx, def) {
    const b = def.body, L = b.L;
    const H = { L, W: b.W, draft: b.draft, fbS: 0.95, fbB: 1.7, beamT: 0.55, bowExp: 1.6, bowRound: 0.8, sternW: 0.9, keelT: 0.62, keelPow: 2.0, flare: 0.06, sheerSag: 0.08, sheerPow: 2.4, round: true };
    const F = hullBuild(ctx, H, { anti: C('#6b1d1d'), boot: K.white, stripe: C('#1d3f73') });
    const gw = (t) => F.hw(t) * (1 + H.flare * smoothstep(0.3, 1, t));
    const tw = 0.44, tb = 0.8; // wheelhouse span
    deckBand(ctx.trim, F, 0.02, 0.995, gw, (t) => F.ys(t) + 0.02, K.wood, 16);
    // bulwarks
    for (const s of [1, -1]) for (let i = 0; i < 20; i++) {
      const t0 = lerp(0.02, 0.96, i / 20), t1 = lerp(0.02, 0.96, (i + 1) / 20), z0 = -L / 2 + t0 * L, z1 = -L / 2 + t1 * L, h = 0.6;
      quadN(ctx.paint, [s * gw(t0), F.ys(t0), z0], [s * gw(t1), F.ys(t1), z1], [s * gw(t1), F.ys(t1) + h, z1], [s * gw(t0), F.ys(t0) + h, z0], K.white, [s, 0, 0]);
      quadN(ctx.trim, [s * (gw(t0) - 0.07), F.ys(t0) + 0.02, z0], [s * (gw(t1) - 0.07), F.ys(t1) + 0.02, z1], [s * (gw(t1) - 0.07), F.ys(t1) + h, z1], [s * (gw(t0) - 0.07), F.ys(t0) + h, z0], K.liner, [-s, 0, 0]);
      quadN(ctx.trim, [s * gw(t0), F.ys(t0) + h, z0], [s * gw(t1), F.ys(t1) + h, z1], [s * (gw(t1) - 0.07), F.ys(t1) + h, z1], [s * (gw(t0) - 0.07), F.ys(t0) + h, z0], K.dark, [0, 1, 0]);
    }
    quadN(ctx.paint, [gw(0.02), F.ys(0.02), -L / 2 + 0.02 * L], [-gw(0.02), F.ys(0.02), -L / 2 + 0.02 * L], [-gw(0.02), F.ys(0.02) + 0.6, -L / 2 + 0.02 * L], [gw(0.02), F.ys(0.02) + 0.6, -L / 2 + 0.02 * L], K.white, [0, 0, -1]);
    // wheelhouse
    const z0 = -L / 2 + tw * L, z1 = -L / 2 + tb * L, yd = F.ys(0.6) + 0.02;
    const hw0 = 1.22, win = [[0.06, 0.3, 0.42, 0.86], [0.34, 0.58, 0.42, 0.86], [0.62, 0.94, 0.42, 0.86]];
    cabin(ctx, { y0: yd, y1: yd + 2.2, z0, z1, hw0, hw1: 1.14, rb: 0.08, rf: 0.42, side: win, front: [[0.08, 0.46, 0.4, 0.88], [0.54, 0.92, 0.4, 0.88]], back: [[0.12, 0.42, 0.45, 0.85], [0.58, 0.88, 0.45, 0.85]], col: K.white });
    bx(ctx.paint, 0, yd + 2.3, (z0 + z1) / 2 - 0.1, 2.6, 0.12, z1 - z0 + 0.15, K.white);
    bx(ctx.trim, 0, yd + 2.39, (z0 + z1) / 2 - 0.1, 2.1, 0.04, z1 - z0 - 0.3, K.grey);
    // mast, boom, winch
    tube(ctx.chrome, [0, yd + 2.36, z0 + 0.7], [0, yd + 5.0, z0 + 0.7], 0.06, K.light, 6);
    tube(ctx.chrome, [0, yd + 4.2, z0 + 0.7], [0, yd + 3.0, z0 - 1.6], 0.035, K.light, 5);
    tube(ctx.chrome, [0, yd + 4.9, z0 + 0.7], [0, yd + 4.9, z0 + 0.7 + 0.001], 0.02, K.light);
    tube(ctx.chrome, [0, yd + 3.4, z0 + 0.7], [0.0, yd + 2.36, z0 + 1.4], 0.012, K.light, 4);
    bx(ctx.paint, 0.0, yd + 0.4, z0 - 1.3, 0.8, 0.8, 0.8, K.white);
    bx(ctx.trim, 0.0, yd + 0.85, z0 - 1.3, 0.85, 0.06, 0.85, K.dark);
    for (const s of [1, -1]) { tube(ctx.chrome, [s * 0.25, yd + 0.85, z0 - 1.3], [s * 0.25, yd + 1.1, z0 - 1.3], 0.03, K.light); }
    // foredeck anchor winch
    tube(ctx.chrome, [0, F.ys(0.88) + 0.03, -L / 2 + 0.88 * L], [0, F.ys(0.88) + 0.45, -L / 2 + 0.88 * L], 0.09, K.dark, 8);
    bx(ctx.trim, 0, F.ys(0.88) + 0.02, -L / 2 + 0.88 * L, 0.5, 0.05, 0.5, K.dark);
    // lights, exhaust stack
    lamp(ctx.lights, 0, 0, yd + 2.5, z1 - 0.3, 0.3, 0.12, 0.1, K.white);
    for (const s of [1, -1]) lamp(ctx.lights, 1, s * 1.0, F.ys(0) + 0.35, -L / 2 + 0.02, 0.14, 0.1, 0.05, C('#5a0f0f'));
    tube(ctx.trim, [-0.7, yd + 2.2, z0 + 0.5], [-0.7, yd + 3.1, z0 + 0.5], 0.09, K.dark, 8);
    return {
      H, F, seat: { x: 0.45, y: yd - 0.02, z: z1 - 0.72, pose: 'helm' }, eye: { x: 0.45, y: yd + 1.6, z: z1 - 0.62 },
      rig: [{ type: 'wheel', x: 0.45, y: yd + 1.0, z: z1 - 0.32, tilt: 0.25 }, { type: 'radar', x: 0, y: yd + 5.15, z: z0 + 0.7 }],
      exhaust: [[-0.7, yd + 3.1, z0 + 0.5]], bow: L / 2 - 0.2, stern: -L / 2, prop: [0, -0.6, -L / 2 + 0.35], inboard: true,
    };
  },

  yacht(ctx, def) {
    const b = def.body, L = b.L;
    const H = { L, W: b.W, draft: b.draft, fbS: 1.1, fbB: 1.75, beamT: 0.5, bowExp: 1.7, bowRound: 0.88, sternW: 0.94, keelT: 0.5, keelPow: 2.3, flare: 0.08, sheerSag: 0.1, sheerPow: 2.2, round: true };
    const F = hullBuild(ctx, H, { anti: K.anti, boot: K.white, stripe: K.dark });
    const gw = (t) => F.hw(t) * (1 + H.flare * smoothstep(0.3, 1, t));
    deckBand(ctx.trim, F, 0.02, 0.995, gw, (t) => F.ys(t) + 0.02, K.cream, 18);
    const Z = (t) => -L / 2 + t * L;
    // aft cockpit teak, swim platform
    deckBand(ctx.trim, F, 0.02, 0.2, (t) => gw(t) - 0.15, (t) => F.ys(t) + 0.04, K.teak, 6);
    bx(ctx.trim, 0, F.ys(0) - 0.45, Z(0) - 0.5, F.hw(0) * 1.6, 0.06, 1.0, K.teak);
    // main salon
    const yd = F.ys(0.3) + 0.03, zs0 = Z(0.22), zs1 = Z(0.62);
    const side = [[0.04, 0.24, 0.3, 0.82], [0.27, 0.47, 0.3, 0.82], [0.5, 0.7, 0.3, 0.82], [0.73, 0.94, 0.3, 0.82]];
    cabin(ctx, { y0: yd, y1: yd + 2.3, z0: zs0, z1: zs1, hw0: 1.85, hw1: 1.7, rb: 0.25, rf: 1.1, side, front: [[0.1, 0.9, 0.35, 0.85]], back: [[0.1, 0.9, 0.3, 0.85]], col: K.white });
    bx(ctx.paint, 0, yd + 2.36, (zs0 + zs1) / 2 - 0.3, 3.7, 0.14, zs1 - zs0 + 0.3, K.white);
    // flybridge
    const fy = yd + 2.43, fz0 = Z(0.3), fz1 = Z(0.56);
    cabin(ctx, { y0: fy, y1: fy + 1.05, z0: fz0, z1: fz1, hw0: 1.5, hw1: 1.42, rb: 0.2, rf: 0.5, side: [[0.3, 0.7, 0.4, 0.85]], front: [[0.08, 0.92, 0.42, 0.85]], col: K.white });
    bx(ctx.paint, 0, fy + 1.1, (fz0 + fz1) / 2 - 0.1, 3.0, 0.1, fz1 - fz0 + 0.3, K.white);
    // open flybridge deck with rail, radar arch
    const rp = [[1.5, fy, fz0 - 1.4], [1.5, fy, fz1 + 0.3], [-1.5, fy, fz1 + 0.3], [-1.5, fy, fz0 - 1.4]];
    rail(ctx, rp, 0.8, K.light, 1.1);
    bx(ctx.trim, 0, fy + 0.02, fz0 - 0.65, 2.9, 0.03, 1.5, K.teak);
    seat(ctx, 0, fy, fz0 - 0.3, 1.8, 0.5, 0.35, 0.45, K.seat, 0.12);
    for (const s of [1, -1]) tube(ctx.chrome, [s * 1.3, yd + 2.4, (zs0 + zs1) / 2 - 0.8], [s * 1.3, yd + 3.5 + 1.6, (zs0 + zs1) / 2 - 0.8], 0.05, K.light, 6);
    tube(ctx.chrome, [1.3, yd + 5.1, (zs0 + zs1) / 2 - 0.8], [-1.3, yd + 5.1, (zs0 + zs1) / 2 - 0.8], 0.05, K.light, 6);
    tube(ctx.chrome, [0, yd + 5.1, (zs0 + zs1) / 2 - 0.8], [0, yd + 5.6, (zs0 + zs1) / 2 - 0.8], 0.03, K.light, 5);
    // foredeck: sun pad, rails
    bx(ctx.trim, 0, F.ys(0.76) + 0.12, Z(0.76), 2.0, 0.16, 2.2, K.seat);
    const bp = []; for (let i = 0; i <= 10; i++) { const t = lerp(0.64, 0.96, i / 10); bp.push([gw(t) * 0.94, F.ys(t) + 0.02, Z(t)]); }
    rail(ctx, bp, 0.75, K.light, 1.2); rail(ctx, bp.map((p) => [-p[0], p[1], p[2]]), 0.75, K.light, 1.2);
    // side walkways bulwark
    for (const s of [1, -1]) for (let i = 0; i < 16; i++) {
      const t0 = lerp(0.02, 0.64, i / 16), t1 = lerp(0.02, 0.64, (i + 1) / 16);
      quadN(ctx.trim, [s * gw(t0), F.ys(t0), Z(t0)], [s * gw(t1), F.ys(t1), Z(t1)], [s * gw(t1), F.ys(t1) + 0.42, Z(t1)], [s * gw(t0), F.ys(t0) + 0.42, Z(t0)], K.white, [s, 0, 0]);
      quadN(ctx.trim, [s * gw(t0), F.ys(t0) + 0.42, Z(t0)], [s * gw(t1), F.ys(t1) + 0.42, Z(t1)], [s * (gw(t1) - 0.08), F.ys(t1) + 0.42, Z(t1)], [s * (gw(t0) - 0.08), F.ys(t0) + 0.42, Z(t0)], K.teak, [0, 1, 0]);
    }
    lamp(ctx.lights, 0, 0, yd + 5.75, (zs0 + zs1) / 2 - 0.8, 0.14, 0.12, 0.14, K.white);
    for (const s of [1, -1]) lamp(ctx.lights, 1, s * 1.6, F.ys(0) + 0.45, Z(0) - 0.01, 0.2, 0.1, 0.05, C('#5a0f0f'));
    return {
      H, F, seat: { x: 0.6, y: yd - 0.02, z: zs1 - 1.1, pose: 'helm' }, eye: { x: 0.6, y: yd + 1.65, z: zs1 - 1.05 },
      rig: [{ type: 'wheel', x: 0.6, y: yd + 1.0, z: zs1 - 0.72, tilt: 0.3 }, { type: 'radar', x: 0, y: yd + 5.65, z: (zs0 + zs1) / 2 - 0.8 }],
      exhaust: [[0.9, -0.05, Z(0) - 0.05], [-0.9, -0.05, Z(0) - 0.05]], bow: L / 2 - 0.3, stern: -L / 2, prop: [0, -0.8, -L / 2 + 0.6], inboard: true,
    };
  },
};

Object.assign(BUILD, sailBuilders({ hullBuild, deckBand, sideDeck, cabin, rail, bx, tube, lamp, quadN, hexa, K, C }));

// ---------------------------------------------------------------- public
const cache = new Map();
export function boatGeometry(def) {
  if (cache.has(def.id)) return cache.get(def.id);
  const ctx = { paint: new GeoBuilder(), glass: new GeoBuilder(), trim: new GeoBuilder(), chrome: new GeoBuilder(), lights: new GeoBuilder() };
  const info = (BUILD[def.boat] || BUILD.sport)(ctx, def);
  const b = def.body;
  const out = {};
  for (const k of ['paint', 'glass', 'trim', 'chrome', 'lights']) out[k] = ctx[k].count ? ctx[k].build(k !== 'glass') : null;
  out.plates = null;
  out.wheels = [];
  out.layout = { zF: b.L / 2, zR: -b.L / 2, track: b.W * 0.6, wr: 0.3, ww: 0.2 };
  out.dims = { L: b.L, W: b.W, H: b.H };
  out.seat = info.seat; out.eye = info.eye; out.rig = info.rig; out.P = null; out.boat = info;
  // hull outline for collisions, scaled so the widest point matches the overall beam
  const F = info.F, pts = []; let wmax = 0.01;
  for (const t of STATIONS) wmax = Math.max(wmax, F.hw(t));
  const k = b.W / 2 / wmax;
  for (const t of STATIONS) { const w = Math.max(0.12, F.hw(t) * k * 0.98), z = -b.L / 2 + t * b.L; pts.push([w, z], [-w, z]); }
  out.outline = convexHull(pts);
  cache.set(def.id, out);
  return out;
}

export function createBoatMesh(def, custom = {}) {
  const geo = boatGeometry(def);
  const group = new THREE.Group();
  const base = custom.color || def.colors[0];
  const paint = makePaintMaterial({ color: base, finish: custom.finish || 'gloss' });
  const glass = makeGlassMaterial(custom.tint ?? 0.45);
  const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.08 });
  const chrome = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 1, envMapIntensity: 1.4 });
  const lights = makeLightsMaterial(false);
  const mats = { paint, glass, trim, chrome, lights, plates: trim, rim: trim, tire: trim };
  const meshes = {};
  for (const k of ['paint', 'trim', 'chrome', 'lights', 'glass']) {
    if (!geo[k]) continue;
    const m = new THREE.Mesh(geo[k], mats[k]);
    m.castShadow = k === 'paint' || k === 'trim';
    m.receiveShadow = k === 'paint' || k === 'trim';
    if (k === 'glass') m.renderOrder = 2;
    meshes[k] = m; group.add(m);
  }
  const rig = {};
  for (const r of geo.rig) {
    let g;
    if (r.type === 'wheel') { const pv = new THREE.Group(); pv.position.set(r.x, r.y, r.z); pv.rotation.x = r.tilt ?? 0.8; g = rigWheel(mats); if (r.scale) pv.scale.setScalar(r.scale); pv.add(g); group.add(pv); rig.wheel = g; continue; }
    if (r.type === 'outboard') { g = rigOutboard(r.scale, mats, r.big); rig.engine = g; rig.prop = g.userData.prop; }
    else if (r.type === 'radar') { g = rigRadar(mats); rig.radar = g; }
    else if (r.type === 'nozzle') { g = rigNozzle(mats); rig.nozzle = g; }
    else if (r.type === 'tiller') {
      g = new THREE.Group();
      const geo = rigGeo('tiller' + r.len, () => { const gb = new GeoBuilder(); tube(gb, [0, 0, 0], [0, 0.08, r.len], 0.016, K.wood, 6); tube(gb, [0, 0, 0], [0, -0.38, 0.02], 0.02, K.dark, 5); return gb.build(); });
      g.add(mesh(geo, mats.trim, false)); rig.tiller = g;
    } else if (r.type === 'sails') { g = makeSails(r); rig.sails = g.userData; rig.sailMat = g.userData.cloth; group.add(g); continue; }
    if (g) { g.position.set(r.x, r.y, r.z); group.add(g); }
  }
  return { group, meshes, panels: null, split: null, mats, wheels: [], geo, def, map: null, rig };
}
