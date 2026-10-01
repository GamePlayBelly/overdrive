import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { smoothstep, clamp, lerp } from '../core/math.js';

// Procedural car body (cars, SUVs, pickups, vans). Car-local frame: +z forward, +y up, +x = driver's LEFT, ground at y = 0.
// A lofted shell (rings along the length) gives the body; lights, grille, intakes, mirrors and panel lines are mounted on its surface.
const C = (h) => new THREE.Color(h);

export function carLayout(b) {
  const zF = b.L / 2 - b.ohF, zR = zF - b.wb;
  return { zF, zR, track: b.trk, wr: b.wr, ww: b.ww };
}

// per-style shaping: nose/tail closure length (fraction of L), face rake and edge radius (m), plan waist, upper body lean, shoulder ridge
const STYLE = {
  hatch: { noseLen: 0.13, tailLen: 0.1, waist: 0.012, rakeF: 0.1, rakeR: 0.07, noseDive: 0.12, tailDive: 0.05, tumble: 0.03, ridge: 0.004, rF: 0.05, rR: 0.045, lens: 'round', grille: 'bar' },
  sedan: { noseLen: 0.13, tailLen: 0.11, waist: 0.016, rakeF: 0.11, rakeR: 0.07, noseDive: 0.15, tailDive: 0.06, tumble: 0.04, ridge: 0.005, rF: 0.055, rR: 0.05, lens: 'swoop', grille: 'bar' },
  coupe: { noseLen: 0.15, tailLen: 0.12, waist: 0.022, rakeF: 0.14, rakeR: 0.09, noseDive: 0.17, tailDive: 0.07, tumble: 0.045, ridge: 0.006, rF: 0.055, rR: 0.05, lens: 'swoop', grille: 'wide' },
  sports: { noseLen: 0.17, tailLen: 0.13, waist: 0.028, rakeF: 0.17, rakeR: 0.1, noseDive: 0.19, tailDive: 0.08, tumble: 0.05, ridge: 0.008, rF: 0.06, rR: 0.05, lens: 'swoop', grille: 'wide' },
  supercar: { noseLen: 0.2, tailLen: 0.14, waist: 0.034, rakeF: 0.24, rakeR: 0.12, noseDive: 0.22, tailDive: 0.09, tumble: 0.06, ridge: 0.01, rF: 0.06, rR: 0.05, lens: 'slit', grille: 'intake' },
  muscle: { noseLen: 0.1, tailLen: 0.08, waist: 0.02, rakeF: 0.06, rakeR: 0.04, noseDive: 0.1, tailDive: 0.05, tumble: 0.03, ridge: 0.012, rF: 0.04, rR: 0.035, lens: 'round', grille: 'bar' },
  suv: { noseLen: 0.1, tailLen: 0.07, waist: 0.01, rakeF: 0.06, rakeR: 0.03, noseDive: 0.07, tailDive: 0.03, tumble: 0.03, ridge: 0.004, rF: 0.06, rR: 0.05, lens: 'swoop', grille: 'tall' },
  pickup: { noseLen: 0.08, tailLen: 0.05, waist: 0.01, rakeF: 0.04, rakeR: 0.02, noseDive: 0.06, tailDive: 0.02, tumble: 0.025, ridge: 0.004, rF: 0.05, rR: 0.04, lens: 'square', grille: 'tall' },
  van: { noseLen: 0.1, tailLen: 0.05, waist: 0.008, rakeF: 0.08, rakeR: 0.02, noseDive: 0.1, tailDive: 0.02, tumble: 0.02, ridge: 0.002, rF: 0.06, rR: 0.04, lens: 'square', grille: 'bar' },
  offroad: { noseLen: 0.06, tailLen: 0.04, waist: 0.006, rakeF: 0.02, rakeR: 0.02, noseDive: 0.04, tailDive: 0.02, tumble: 0.02, ridge: 0.003, rF: 0.045, rR: 0.04, lens: 'round', grille: 'tall' },
};
STYLE.utility = STYLE.pickup;
export const styleOf = (b) => STYLE[b.style] || STYLE.sedan;

export function profile(b) {
  const L = b.L, W2 = b.W / 2, st = styleOf(b);
  const { zF, zR } = carLayout(b);
  const tOf = (z) => (z + L / 2) / L;
  const tFw = tOf(zF), tRw = tOf(zR), tMid = (tFw + tRw) / 2, tSpan = (tFw - tRw) / 2;
  const halfW = (t) => {
    let w = W2;
    const kf = smoothstep(1 - st.noseLen, 1.0, t), kr = smoothstep(st.tailLen, 0.0, t);
    w *= 1 - b.noseR * Math.pow(kf, 2.2) * 0.9;
    w *= 1 - b.tailR * Math.pow(kr, 2.2) * 0.9;
    const q = (t - tMid) / (tSpan * 0.8);
    w *= 1 - st.waist * Math.exp(-q * q);
    return w;
  };
  const bottom = (t) => b.clr + 0.12 * smoothstep(0.9, 1, t) + 0.1 * smoothstep(0.1, 0, t);
  const top = (t) => {
    const tA = b.tA, tR = b.tR;
    let y;
    if (t >= tA) {
      const u = (t - tA) / (1 - tA);
      y = lerp(b.beltY + 0.02, b.hoodY, smoothstep(0, 0.55, u));
      y -= st.noseDive * Math.pow(clamp((u - 0.45) / 0.55, 0, 1), 1.55);
    } else if (t <= tR) {
      const u = tR > 0.001 ? t / tR : 1;
      y = lerp(b.deckY - st.tailDive, b.deckY, smoothstep(0, 0.35, u));
      if (b.style === 'pickup' || b.style === 'utility') y = b.deckY;
    } else y = b.beltY;
    return y;
  };
  const shoulder = (t) => Math.min(top(t) - 0.06, b.shoulder + 0.03 * Math.sin(t * Math.PI));
  const archY = (z) => {
    let y = -1;
    for (const za of [zF, zR]) {
      const dz = z - za, R = b.wr + 0.06;
      if (Math.abs(dz) < R) y = Math.max(y, b.wr + Math.sqrt(R * R - dz * dz));
    }
    return y;
  };
  const lin = (x) => { const c = clamp(x, 0, 1); return c * 0.7 + c * c * (3 - 2 * c) * 0.3; };
  const roofAt = (t) => {
    const tA = b.tA, tR = b.tR, ws = b.ws, rw = b.rw;
    if (t > tA || t < tR) return null;
    const belt = t < tR + rw && (b.style === 'sedan' || b.style === 'coupe' || b.style === 'sports' || b.style === 'muscle' || b.style === 'supercar') ? Math.max(top(t), b.deckY) : top(t);
    const f = lin((tA - t) / ws), r = lin((t - tR) / rw);
    return { y: lerp(belt, b.roofY, Math.min(f, r)), belt, f, r };
  };
  return { halfW, bottom, top, shoulder, archY, roofAt, tOf, zF, zR };
}

function stationList(b, P, LOD = 0) {
  const st = styleOf(b), set = new Set();
  const N = LOD === 2 ? 8 : LOD === 1 ? 18 : 30;
  for (let i = 0; i <= N; i++) set.add(i / N);
  const K = LOD === 2 ? 0 : LOD === 1 ? 4 : 7;
  if (K) for (const za of [P.zF, P.zR]) {
    const R = b.wr + 0.06;
    for (let k = -K; k <= K; k++) set.add(clamp(P.tOf(za + (k / K) * R * 1.02), 0, 1));
  }
  const KE = LOD === 2 ? 2 : LOD === 1 ? 3 : 5;
  for (const [rad, end] of [[st.rF, 1], [st.rR, 0]]) for (let k = 0; k <= KE; k++) {
    const a = (k / KE) * Math.PI / 2, d = rad * (1 - Math.sin(a));
    set.add(end ? 1 - d / b.L : d / b.L);
  }
  return [...set].sort((a, c) => a - c).filter((t, i, arr) => i === 0 || t - arr[i - 1] > 0.0006);
}

// smooth shading that keeps hard edges: a corner only averages the faces around it that lean less than `angle` from its own face
function creased(geo, angle = 0.66) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = g.attributes.position, n = pos.count / 3;
  const fn = new Float32Array(n * 3), ar = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const a = f * 3, b = a + 1, c = a + 2;
    const ux = pos.getX(b) - pos.getX(a), uy = pos.getY(b) - pos.getY(a), uz = pos.getZ(b) - pos.getZ(a);
    const vx = pos.getX(c) - pos.getX(a), vy = pos.getY(c) - pos.getY(a), vz = pos.getZ(c) - pos.getZ(a);
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    ar[f] = l; if (l > 1e-12) { nx /= l; ny /= l; nz /= l; }
    fn[f * 3] = nx; fn[f * 3 + 1] = ny; fn[f * 3 + 2] = nz;
  }
  const key = (i) => Math.round(pos.getX(i) * 2000) + ',' + Math.round(pos.getY(i) * 2000) + ',' + Math.round(pos.getZ(i) * 2000);
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) { const k = key(i); let a = groups.get(k); if (!a) groups.set(k, (a = [])); a.push(i); }
  const out = new Float32Array(pos.count * 3), ca = Math.cos(angle);
  for (const list of groups.values()) {
    for (const i of list) {
      const f = (i / 3) | 0;
      let sx = 0, sy = 0, sz = 0;
      for (const j of list) {
        const f2 = (j / 3) | 0;
        if (fn[f * 3] * fn[f2 * 3] + fn[f * 3 + 1] * fn[f2 * 3 + 1] + fn[f * 3 + 2] * fn[f2 * 3 + 2] >= ca) { sx += fn[f2 * 3] * ar[f2]; sy += fn[f2 * 3 + 1] * ar[f2]; sz += fn[f2 * 3 + 2] * ar[f2]; }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      out[i * 3] = sx / l; out[i * 3 + 1] = sy / l; out[i * 3 + 2] = sz / l;
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  const idx = new Array(pos.count); for (let i = 0; i < idx.length; i++) idx[i] = i;
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- surface ray caster (mounting details on the shell)
function makeCaster(geos) {
  const tris = [];
  for (const g of geos) {
    const pos = g.attributes.position, nor = g.attributes.normal, ix = g.index.array;
    for (let k = 0; k < ix.length; k += 3) {
      const a = ix[k], b = ix[k + 1], c = ix[k + 2];
      tris.push([pos.getX(a), pos.getY(a), pos.getZ(a), pos.getX(b), pos.getY(b), pos.getZ(b), pos.getX(c), pos.getY(c), pos.getZ(c),
        nor.getX(a), nor.getY(a), nor.getZ(a), nor.getX(b), nor.getY(b), nor.getZ(b), nor.getX(c), nor.getY(c), nor.getZ(c)]);
    }
  }
  // returns { p: [x,y,z], n: [x,y,z] } of the nearest hit along the ray (origin o, unit direction d)
  return (ox, oy, oz, dx, dy, dz) => {
    let best = Infinity, hu = 0, hv = 0, ht = null;
    for (const T of tris) {
      const e1x = T[3] - T[0], e1y = T[4] - T[1], e1z = T[5] - T[2], e2x = T[6] - T[0], e2y = T[7] - T[1], e2z = T[8] - T[2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-9 && det < 1e-9) continue;
      const inv = 1 / det, tx = ox - T[0], ty = oy - T[1], tz = oz - T[2];
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-5 && t < best) { best = t; hu = u; hv = v; ht = T; }
    }
    if (!ht) return null;
    const w = 1 - hu - hv;
    let nx = w * ht[9] + hu * ht[12] + hv * ht[15], ny = w * ht[10] + hu * ht[13] + hv * ht[16], nz = w * ht[11] + hu * ht[14] + hv * ht[17];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
    return { p: [ox + dx * best, oy + dy * best, oz + dz * best], n: [nx, ny, nz], t: best };
  };
}

// ---------------------------------------------------------------- small geometry helpers
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _p = new THREE.Vector3();
function frame(p, n, embed = 0, up = [0, 1, 0]) {
  _z.set(n[0], n[1], n[2]).normalize();
  _x.set(up[0], up[1], up[2]).cross(_z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize(); _y.crossVectors(_z, _x);
  _p.set(p[0], p[1], p[2]).addScaledVector(_z, -embed);
  return _m.makeBasis(_x, _y, _z).setPosition(_p);
}

function rrShape(w, h, r, sx = 1, skew = 0) {
  const s = new THREE.Shape(), x0 = -w / 2, y0 = -h / 2;
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
  const P = (x, y) => [sx * (x + skew * (y - y0)), y];
  const m = (x, y) => { const q = P(x, y); return [q[0], q[1]]; };
  s.moveTo(...m(x0 + r, y0)); s.lineTo(...m(x0 + w - r, y0)); s.quadraticCurveTo(...m(x0 + w, y0), ...m(x0 + w, y0 + r));
  s.lineTo(...m(x0 + w, y0 + h - r)); s.quadraticCurveTo(...m(x0 + w, y0 + h), ...m(x0 + w - r, y0 + h));
  s.lineTo(...m(x0 + r, y0 + h)); s.quadraticCurveTo(...m(x0, y0 + h), ...m(x0, y0 + h - r));
  s.lineTo(...m(x0, y0 + r)); s.quadraticCurveTo(...m(x0, y0), ...m(x0 + r, y0));
  return s;
}
const extrude = (shape, depth, bevel = 0.003) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 5 });

// thin ribbon following a polyline lying on the surface: pts = [{ p, n }], closed optional
function ribbon(gb, pts, width, color, lift = 0.0014, closed = false) {
  const n = pts.length;
  if (n < 2) return;
  const base = gb.count;
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), S = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i + n - 1) % n : Math.max(0, i - 1)], c = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    T.set(c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]).normalize();
    Nn.set(pts[i].n[0], pts[i].n[1], pts[i].n[2]);
    S.crossVectors(Nn, T).normalize().multiplyScalar(width / 2);
    const px = pts[i].p[0] + Nn.x * lift, py = pts[i].p[1] + Nn.y * lift, pz = pts[i].p[2] + Nn.z * lift;
    gb.v(px + S.x, py + S.y, pz + S.z, Nn.x, Nn.y, Nn.z, 0, 0, color.r, color.g, color.b);
    gb.v(px - S.x, py - S.y, pz - S.z, Nn.x, Nn.y, Nn.z, 0, 0, color.r, color.g, color.b);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = base + i * 2, c = base + ((i + 1) % n) * 2;
    // winding so the front face looks along the normal
    const ax = gb.p[a * 3], ay = gb.p[a * 3 + 1], az = gb.p[a * 3 + 2];
    const e1 = [gb.p[(a + 1) * 3] - ax, gb.p[(a + 1) * 3 + 1] - ay, gb.p[(a + 1) * 3 + 2] - az], e2 = [gb.p[c * 3] - ax, gb.p[c * 3 + 1] - ay, gb.p[c * 3 + 2] - az];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    const flip = cx * gb.n[a * 3] + cy * gb.n[a * 3 + 1] + cz * gb.n[a * 3 + 2] < 0;
    if (!flip) gb.i.push(a, a + 1, c, a + 1, c + 1, c); else gb.i.push(a, c, a + 1, a + 1, c, c + 1);
  }
}

// ---------------------------------------------------------------- body
export function buildShell(def, opts = {}) {
  const b = def.body, L = b.L, st = styleOf(b);
  const LOD = opts.lod ?? 0;
  const P = profile(b);
  if (LOD === 2) P.archY = () => -1;
  const ts = stationList(b, P, LOD);
  const parts = { paint: new GeoBuilder(), glass: new GeoBuilder(), trim: new GeoBuilder(), chrome: new GeoBuilder(), lights: null };
  const dark = C('#0d0e10'), rubber = C('#131416'), chromeC = C('#c9ccd0'), trimC = C('#16171a');

  // ---- lower body loft (indexed grid, smooth normals) ----
  const lower = new GeoBuilder();
  const IDX = LOD === 2 ? [0, 2, 4, 6, 8, 10] : LOD === 1 ? [0, 2, 3, 4, 5, 6, 8, 10] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const RING = IDX.length;
  const half = (t, z) => {
    const w = P.halfW(t), yb = P.bottom(t), yt = P.top(t), ys = Math.max(yb + 0.1, P.shoulder(t));
    const cr = b.crown, tu = st.tumble * w, rg = st.ridge * w;
    const pts = [
      [0, yb], [0.55 * w, yb], [0.9 * w, yb + 0.012], [0.975 * w, yb + 0.07 * (ys - yb)], [w, yb + 0.3 * (ys - yb)],
      [w + rg * 0.35, yb + 0.66 * (ys - yb)], [w + rg - 0.012 * w, ys], [0.945 * w - tu * 0.45, ys + 0.45 * (yt - ys)], [0.885 * w - tu, yt - 0.015], [0.6 * w - tu * 0.6, yt + cr * 0.7], [0, yt + cr],
    ];
    const ay = P.archY(z);
    if (ay > 0) {
      const cap = ys - 0.02, base = Math.min(ay, cap - 0.03), span = Math.max(0.05, ys - yb);
      for (let i = 1; i <= 5; i++) if (pts[i][1] < base) pts[i][1] = lerp(base, cap, clamp((pts[i][1] - yb) / span, 0, 1) * 0.6);
    }
    return { pts, yb, yt: yt + cr, w };
  };
  const rows = [];
  for (const t of ts) {
    const z = -L / 2 + t * L;
    const H = half(t, z);
    const dF = (1 - t) * L, dR = t * L;
    let inset = 0;
    if (dF < st.rF) inset = st.rF * (1 - Math.sqrt(Math.max(0, 1 - Math.pow(1 - dF / st.rF, 2))));
    else if (dR < st.rR) inset = st.rR * (1 - Math.sqrt(Math.max(0, 1 - Math.pow(1 - dR / st.rR, 2))));
    const cyc = (H.yb + H.yt) / 2, hh = Math.max(0.05, (H.yt - H.yb) / 2);
    const kF = smoothstep(1 - 0.07, 1, t), kR = smoothstep(0.07, 0, t);
    const sh = (y) => { const yr = clamp((y - H.yb) / (H.yt - H.yb), 0, 1); return -st.rakeF * kF * yr + st.rakeR * kR * yr; };
    const mapPt = (x, y) => {
      let X = x, Y = y;
      if (inset > 0) { X = x * Math.max(0.05, 1 - inset / Math.max(0.2, H.w)); Y = cyc + (y - cyc) * Math.max(0.05, 1 - inset / hh); }
      return [X, Y, z + sh(y)];
    };
    const pp = H.pts.map((q) => mapPt(q[0], q[1]));
    const ring = [];
    for (let i = RING - 1; i >= 0; i--) ring.push(pp[IDX[i]]);
    for (let i = 1; i < RING; i++) ring.push([-pp[IDX[i]][0], pp[IDX[i]][1], pp[IDX[i]][2]]);
    rows.push({ z, t, ring });
  }
  const RL = rows[0].ring.length;
  for (const r of rows) for (let m = 0; m < RL; m++) lower.v(r.ring[m][0], r.ring[m][1], r.ring[m][2], 0, 1, 0, r.t, m / (RL - 1));
  const lowIdx = { paint: [], trim: [] };
  const beltySeg = (m) => { const a = Math.min(m, RL - 2 - m); return a >= RING - 3; };   // segments touching the belly (ring indices 0..2)
  for (let k = 0; k < rows.length - 1; k++) for (let m = 0; m < RL - 1; m++) {
    const a = k * RL + m, bb = (k + 1) * RL + m, c = (k + 1) * RL + m + 1, d = k * RL + m + 1;
    (beltySeg(m) ? lowIdx.trim : lowIdx.paint).push(a, bb, c, a, c, d);
  }
  // end caps
  const capIdx = { paint: [] };
  for (const [k, sgn] of [[0, -1], [rows.length - 1, 1]]) {
    const r = rows[k];
    let cx = 0, cy = 0, cz = 0;
    for (const p of r.ring) { cy += p[1]; cz += p[2]; } cy /= r.ring.length; cz /= r.ring.length;
    const base = lower.count;
    lower.v(cx, cy, cz, 0, 0, sgn, 0.5, 0.5);
    for (let m = 0; m < RL; m++) lower.v(r.ring[m][0], r.ring[m][1], r.ring[m][2], 0, 0, sgn, r.t, m / (RL - 1));
    for (let m = 0; m < RL - 1; m++) {
      if (sgn > 0) capIdx.paint.push(base, base + 1 + m + 1, base + 1 + m); else capIdx.paint.push(base, base + 1 + m, base + 1 + m + 1);
    }
  }
  const lowerFull = lower.build();
  lowerFull.setIndex([...lowIdx.paint, ...lowIdx.trim, ...capIdx.paint]);
  lowerFull.computeVertexNormals();
  const lowerPaint = lowerFull.clone(); lowerPaint.setIndex([...lowIdx.paint, ...capIdx.paint]);
  parts.paint.add(LOD === 2 ? lowerPaint : creased(lowerPaint, 0.7));
  if (lowIdx.trim.length) { const g = lowerFull.clone(); g.setIndex(lowIdx.trim); parts.trim.add(g, null, C('#101114')); }

  // ---- greenhouse ----
  const gh = new GeoBuilder();
  const gRows = [];
  const tA = b.tA, tR = b.tR;
  const gN = LOD === 2 ? 5 : LOD === 1 ? 11 : 20;
  const pillarB = (b.tA - b.ws + b.tR + b.rw) / 2;
  const glassSides = b.style === 'hatch' || b.style === 'suv' || b.style === 'van' || b.style === 'offroad' || b.style === 'utility' || b.style === 'pickup';
  for (let i = 0; i <= gN; i++) {
    const t = tR + ((tA - tR) * i) / gN;
    const z = -L / 2 + t * L;
    const r = P.roofAt(t);
    if (!r) continue;
    const w = P.halfW(t) * (1 - st.tumble * 0.4);
    const wBase = w * 0.935, wTop = w * b.gh;
    const yB = r.belt, yT = r.y;
    const hgt = Math.max(0.001, yT - yB);
    const pts = [[wBase, yB], [lerp(wBase, wTop, 0.55) + 0.01, yB + hgt * 0.55], [wTop, yT - 0.035 * Math.min(1, hgt * 4)], [wTop * 0.78, yT], [0, yT + b.crown * 0.5 * Math.min(1, hgt * 3)]];
    const ring = [...pts.map((p) => p), ...pts.slice(0, -1).reverse().map((p) => [-p[0], p[1]])];
    gRows.push({ z, t, ring, r });
  }
  const GL = gRows[0].ring.length;
  for (const r of gRows) for (let m = 0; m < GL; m++) gh.v(r.ring[m][0], r.ring[m][1], r.z, 0, 1, 0, r.t, 0.012);
  const gIdx = { paint: [], glass: [], trim: [] };
  for (let k = 0; k < gRows.length - 1; k++) {
    const r0 = gRows[k], r1 = gRows[k + 1];
    const tm = (r0.t + r1.t) / 2;
    const inWS = tm > tA - b.ws, inRW = tm < tR + b.rw;
    const inB = Math.abs(tm - pillarB) < 0.011 && !inWS && !inRW;
    const inC = !glassSides && tm < tR + b.rw + 0.025 && tm >= tR + b.rw;
    for (let m = 0; m < GL - 1; m++) {
      const side = m < 2 || m >= GL - 3, edge = m === 2 || m === GL - 4, topF = !side && !edge;
      let mat = 'paint';
      if (inWS) mat = edge ? 'paint' : side ? 'paint' : 'glass';
      else if (inRW) mat = topF || (edge && !glassSides) ? 'glass' : side ? (glassSides ? 'glass' : 'paint') : 'paint';
      else mat = side ? (inB ? 'trim' : 'glass') : 'paint';
      if (inWS && side) mat = 'glass';
      if (inC && side) mat = 'paint';
      const a = k * GL + m, bb = (k + 1) * GL + m, c = (k + 1) * GL + m + 1, d = k * GL + m + 1;
      gIdx[mat].push(a, c, bb, a, d, c);
    }
  }
  const ghPos = gh.build();
  const full = ghPos.clone(); full.setIndex([...gIdx.paint, ...gIdx.glass, ...gIdx.trim]); full.computeVertexNormals();
  for (const k of ['paint', 'glass', 'trim']) {
    if (!gIdx[k].length) continue;
    const g = full.clone(); g.setIndex(gIdx[k]);
    parts[k].add(k === 'paint' && LOD < 2 ? creased(g, 0.7) : g, null, k === 'trim' ? C('#0f1012') : null);
  }

  // ---- dark cabin interior so glass never shows an empty shell ----
  if (!opts.noFiller) {
    const z0 = -L / 2 + (tR + 0.02) * L, z1 = -L / 2 + (tA - 0.03) * L;
    const w = P.halfW(0.5) * 0.86, y0 = b.beltY - 0.35, y1 = Math.min(b.roofY - 0.1, b.beltY + 0.4);
    const dk = C('#0b0c0e'), seat = C('#1a1b1e');
    parts.trim.box(0, (y0 + y1) / 2, (z0 + z1) / 2, w * 2, y1 - y0, z1 - z0, dk, 0, 0, false);
    const sz = lerp(P.zR, P.zF, 0.42);
    for (const s of [0.37, -0.37]) {
      const topY = Math.min(b.roofY - 0.14, b.beltY + 0.42);
      parts.trim.box(s * (b.W / 1.84), (b.beltY - 0.2 + topY - 0.14) / 2, sz - 0.25, 0.46, topY - 0.14 - (b.beltY - 0.2), 0.12, seat, 0, 0, false);
      parts.trim.box(s * (b.W / 1.84), topY - 0.06, sz - 0.28, 0.24, 0.14, 0.1, seat, 0, 0, false);
    }
  }

  // ---- details mounted on the surface ----
  const DET = LOD < 2;
  const lights = new GeoBuilder();
  const surf = DET ? makeCaster([lowerFull, full]) : null;
  const zFront = L / 2, zRear = -L / 2;
  const yBelt = b.beltY;
  const colorOf = (kind) => ({ 0: C('#6f777e'), 1: C('#7a1010'), 2: C('#c78a2a'), 3: C('#c78a2a'), 4: C('#dddddd'), 5: C('#5a0f0f') })[kind] || C('#ffffff');
  const lensCol = (g, col) => { const s = g.attributes.position.count; const a = new Float32Array(s * 3); for (let i = 0; i < s; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const addLens = (kind, geo, mat) => { const s = lights.count; lights.add(lensCol(geo, colorOf(kind)), mat, null); for (let i = s; i < lights.count; i++) lights.u[i * 2] = kind + 0.25; };

  const tFront = 0.997, tRear = 0.003;
  const wFront = P.halfW(tFront), wRear = P.halfW(tRear);
  const ysF = P.shoulder(0.97), ytF = P.top(0.985), ysR = P.shoulder(0.03), ytR = P.top(0.015);
  if (DET) {
    const face = (x, y, dir) => surf(x, y, dir > 0 ? zFront + 2 : zRear - 2, 0, 0, dir > 0 ? -1 : 1);
    const nose = {}, tail = {};
    const faceH = ytF - P.bottom(1);
    const fy = (f) => P.bottom(1) + f * faceH;
    const ty0 = P.bottom(0), tH = ytR - ty0;
    const ty = (f) => ty0 + f * tH;

    // headlights
    const hx = wFront * 0.66, hy = fy(st.lens === 'slit' ? 0.82 : st.lens === 'round' ? 0.7 : 0.78);
    for (const s of [1, -1]) {
      const h = face(s * hx, hy, 1);
      if (!h) continue;
      const w = st.lens === 'slit' ? wFront * 0.62 : st.lens === 'square' ? wFront * 0.4 : st.lens === 'round' ? 0.2 : wFront * 0.5;
      const ht = st.lens === 'slit' ? 0.055 : st.lens === 'round' ? 0.2 : st.lens === 'square' ? 0.16 : 0.09 + faceH * 0.08;
      const skew = st.lens === 'swoop' || st.lens === 'slit' ? 0.22 * s : 0;
      const F = frame(h.p, h.n, 0.012);
      parts.trim.add(extrude(rrShape(w + 0.035, ht + 0.035, st.lens === 'round' ? ht / 2 : 0.03, s, skew * 0.9), 0.02, 0.002), F, C('#0a0a0c'));
      const F2 = frame(h.p, h.n, 0.003);
      addLens(0, extrude(rrShape(w, ht, st.lens === 'round' ? ht / 2 : 0.026, s, skew), 0.012, 0.002), F2);
      if (st.lens !== 'slit') {
        const F3 = frame([h.p[0] + h.n[0] * 0.012, h.p[1] + h.n[1] * 0.012, h.p[2] + h.n[2] * 0.012], h.n, 0);
        const rr = st.lens === 'round' ? ht * 0.36 : ht * 0.3;
        const Fi = F3.clone().multiply(new THREE.Matrix4().makeTranslation(st.lens === 'round' ? 0 : -s * w * 0.2, 0, 0));
        parts.trim.add(new THREE.CylinderGeometry(rr, rr, 0.01, 16).rotateX(Math.PI / 2), Fi, C('#2a2d31'));
        parts.chrome.add(new THREE.TorusGeometry(rr * 1.05, 0.006, 4, 18), Fi, chromeC);
      }
      const Fd = frame([h.p[0] + h.n[0] * 0.012, h.p[1] + h.n[1] * 0.012, h.p[2] + h.n[2] * 0.012], h.n, 0).clone().multiply(new THREE.Matrix4().makeTranslation(0, ht * 0.38, 0));
      if (st.lens !== 'round') addLens(0, new THREE.BoxGeometry(w * 0.86, 0.012, 0.006), Fd);
      // indicator
      const hi = face(s * wFront * 0.84, fy(0.38), 1);
      if (hi && st.lens !== 'round') addLens(s > 0 ? 2 : 3, extrude(rrShape(0.12, 0.03, 0.012, s, 0), 0.01, 0.001), frame(hi.p, hi.n, 0.004));
    }
    // grille and intakes
    const gy = fy(st.grille === 'tall' ? 0.52 : 0.46), gw = wFront * (st.grille === 'wide' ? 0.74 : st.grille === 'intake' ? 0.7 : st.grille === 'tall' ? 0.5 : 0.52), gh2 = st.grille === 'tall' ? faceH * 0.42 : st.grille === 'intake' ? faceH * 0.26 : faceH * 0.2;
    const g0 = face(0, gy, 1);
    if (g0) {
      const Fg = frame(g0.p, g0.n, 0.012);
      parts.chrome.add(extrude(rrShape(gw + 0.04, gh2 + 0.04, 0.025), 0.016, 0.002), Fg, chromeC);
      parts.trim.add(extrude(rrShape(gw, gh2, 0.02), 0.03, 0.002), frame(g0.p, g0.n, 0.003), dark);
      const nSl = st.grille === 'intake' ? 0 : st.grille === 'tall' ? 6 : 4;
      for (let i = 0; i < nSl; i++) {
        const yy = (i + 0.5) / nSl - 0.5;
        const Ms = frame([g0.p[0] + g0.n[0] * 0.012, g0.p[1] + g0.n[1] * 0.012, g0.p[2] + g0.n[2] * 0.012], g0.n, 0).clone().multiply(new THREE.Matrix4().makeTranslation(0, yy * gh2 * 0.9, 0));
        parts.chrome.add(new THREE.BoxGeometry(gw * 0.92, 0.008, 0.01), Ms, C('#7d8187'));
      }
    }
    const lowY = fy(st.grille === 'tall' ? 0.14 : 0.18);
    const l0 = face(0, lowY, 1);
    if (l0) {
      const lw = wFront * (st.grille === 'wide' || st.grille === 'intake' ? 1.2 : 0.95), lh = faceH * (st.grille === 'intake' ? 0.2 : 0.16);
      parts.trim.add(extrude(rrShape(lw, lh, 0.03), 0.03, 0.002), frame(l0.p, l0.n, 0.012), dark);
    }
    if (st.grille !== 'tall') for (const s of [1, -1]) {
      const f = face(s * wFront * 0.82, lowY, 1);
      if (f) parts.trim.add(extrude(rrShape(wFront * 0.28, faceH * 0.12, 0.025, s, 0.2 * s), 0.03, 0.002), frame(f.p, f.n, 0.012), dark);
    }
    // splitter lip
    const sl = face(0, P.bottom(1) + 0.025, 1);
    if (sl) parts.trim.add(new THREE.BoxGeometry(wFront * 1.7, 0.03, 0.06), frame([sl.p[0], sl.p[1], sl.p[2] - 0.02], [0, 0, 1], 0), dark);

    // taillights
    const rx = wRear * 0.7, ry = ty(st.lens === 'slit' ? 0.74 : 0.7);
    for (const s of [1, -1]) {
      const h = face(s * rx, ry, -1);
      if (!h) continue;
      const bar = def.tail === 'bar';
      const w = bar ? wRear * 0.62 : wRear * 0.42, ht = bar ? 0.07 : 0.1 + tH * 0.05;
      const F = frame(h.p, h.n, 0.012, [0, 1, 0]);
      parts.trim.add(extrude(rrShape(w + 0.03, ht + 0.03, 0.025, -s, 0.12 * s), 0.02, 0.002), F, C('#0a0a0c'));
      addLens(1, extrude(rrShape(w, ht, 0.022, -s, 0.12 * s), 0.012, 0.002), frame(h.p, h.n, 0.003));
      const hr = face(s * wRear * 0.42, ty(0.3), -1);
      if (hr) addLens(4, extrude(rrShape(0.07, 0.035, 0.012, -s, 0), 0.01, 0.001), frame(hr.p, hr.n, 0.004));
      const hs = face(s * wRear * 0.9, ty(0.34), -1);
      if (hs) addLens(s > 0 ? 2 : 3, extrude(rrShape(0.1, 0.03, 0.012, -s, 0), 0.01, 0.001), frame(hs.p, hs.n, 0.004));
    }
    if (def.tail === 'bar') {
      const h = face(0, ry, -1);
      if (h) addLens(1, extrude(rrShape(wRear * 0.5, 0.03, 0.012, 1, 0), 0.01, 0.001), frame(h.p, h.n, 0.004));
    }
    // rear diffuser panel
    const dfp = face(0, ty(0.08), -1);
    if (dfp) parts.trim.add(extrude(rrShape(wRear * 1.25, tH * 0.2, 0.03), 0.03, 0.002), frame(dfp.p, dfp.n, 0.012), dark);
    // third brake light
    const rr = P.roofAt(tR + b.rw);
    addLens(5, new THREE.BoxGeometry(0.3, 0.03, 0.04), new THREE.Matrix4().makeTranslation(0, ((b.style === 'sedan' || b.style === 'coupe' ? rr?.y : b.roofY) ?? b.roofY) - 0.06, -L / 2 + (tR + 0.002) * L));
  } else {
    // very low detail: plain lights
    const addLight = (kind, x, y, z, sx, sy, sz, col) => { const s = lights.count; lights.box(x, y, z, sx, sy, sz, col, 0, 0, false); for (let i = s; i < lights.count; i++) lights.u[i * 2] = kind + 0.25; };
    const hy = Math.min(ytF - 0.05, ysF + 0.05), ty = Math.min(ytR - 0.05, ysR + 0.06);
    for (const s of [1, -1]) {
      addLight(0, s * wFront * 0.66, hy, zFront - 0.02, wFront * 0.42, 0.15, 0.08, C('#dde4ea'));
      addLight(1, s * wRear * 0.74, ty, zRear + 0.02, wRear * 0.42, 0.14, 0.08, C('#5a0f0f'));
    }
  }

  // ---- plates ----
  const plates = new GeoBuilder();
  if (DET && LOD === 0) {
    for (const [dir, z, yf] of [[1, zFront, P.bottom(1) + (ytF - P.bottom(1)) * 0.2], [-1, zRear, P.bottom(0) + (ytR - P.bottom(0)) * 0.34]]) {
      const h = surf(0, yf, dir > 0 ? z + 2 : z - 2, 0, 0, dir > 0 ? -1 : 1);
      if (!h) continue;
      const Fm = frame(h.p, h.n, -0.004);
      const e = new THREE.Vector3(1, 0, 0).transformDirection(Fm), u = new THREE.Vector3(0, 1, 0).transformDirection(Fm), n = new THREE.Vector3(0, 0, 1).transformDirection(Fm);
      const o = new THREE.Vector3().setFromMatrixPosition(Fm);
      const pt = (sx, sy) => [o.x + e.x * sx * 0.26 + u.x * sy * 0.07, o.y + e.y * sx * 0.26 + u.y * sy * 0.07, o.z + e.z * sx * 0.26 + u.z * sy * 0.07];
      if (dir > 0) plates.quad(pt(1, -1), pt(-1, -1), pt(-1, 1), pt(1, 1), null, [0, 0, 1, 1]); else plates.quad(pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1), null, [0, 0, 1, 1]);
      void n;
      parts.trim.add(extrude(rrShape(0.56, 0.16, 0.012), 0.012, 0.001), frame(h.p, h.n, 0.01), C('#141517'));
    }
  } else if (DET) {
    plates.quad([-0.26, P.bottom(1) + 0.14, zFront + 0.03], [0.26, P.bottom(1) + 0.14, zFront + 0.03], [0.26, P.bottom(1) + 0.26, zFront + 0.03], [-0.26, P.bottom(1) + 0.26, zFront + 0.03], null, [0, 0, 1, 1]);
    plates.quad([0.26, P.bottom(0) + 0.24, zRear - 0.03], [-0.26, P.bottom(0) + 0.24, zRear - 0.03], [-0.26, P.bottom(0) + 0.36, zRear - 0.03], [0.26, P.bottom(0) + 0.36, zRear - 0.03], null, [0, 0, 1, 1]);
  }

  // ---- side details ----
  const zDoorF = P.zF - (b.wr + 0.16);
  const twoDoor = b.style === 'coupe' || b.style === 'sports' || b.style === 'supercar' || b.style === 'muscle';
  const zB = -L / 2 + pillarB * L;
  const zDoorR = twoDoor ? P.zR + b.wr + 0.16 : Math.min(zB, zDoorF - 0.8);
  if (DET && LOD === 0) {
    const side = (s, z, y) => surf(s * 3, y, z, -s, 0, 0);
    for (const s of [1, -1]) {
      // door shut lines
      const yBot = P.bottom(0.5) + 0.09, yTop = yBelt;
      const loop = [];
      const stp = 0.05;
      for (let z = zDoorR; z <= zDoorF; z += stp) { const h = side(s, z, yBot); if (h) loop.push(h); }
      for (let y = yBot; y <= yTop; y += stp) { const h = side(s, zDoorF, y); if (h) loop.push(h); }
      for (let z = zDoorF; z >= zDoorR; z -= stp) { const h = side(s, z, yTop - 0.005); if (h) loop.push(h); }
      for (let y = yTop; y >= yBot; y -= stp) { const h = side(s, zDoorR, y); if (h) loop.push(h); }
      ribbon(parts.trim, loop, 0.006, C('#08090a'), 0.0012, true);
      // rear door line for four-door bodies
      if (!twoDoor) {
        const pts = [];
        for (let y = yBot; y <= yTop; y += stp) { const h = side(s, P.zR + b.wr + 0.12, y); if (h) pts.push(h); }
        void pts;
      }
      // belt moulding and handle
      const belt = [];
      for (let z = zDoorR - 0.35; z <= zDoorF + 0.3; z += 0.06) { const h = side(s, z, yBelt - 0.015); if (h) belt.push(h); }
      ribbon(parts.chrome, belt, 0.012, C('#a9adb2'), 0.002, false);
      const hz = lerp(zDoorR, zDoorF, 0.3), hh = side(s, hz, yBelt - 0.1);
      if (hh) parts.chrome.add(new THREE.CapsuleGeometry(0.012, 0.1, 3, 6).rotateZ(Math.PI / 2), frame(hh.p, hh.n, 0.004, [0, 1, 0]), chromeC);
      // mirrors
      const mz = -L / 2 + (tA - 0.012) * L, mh = side(s, mz, yBelt + 0.06);
      const mc = opts.mirrorColor ? C(opts.mirrorColor) : null;
      const mx = (mh ? mh.p[0] : s * P.halfW(tA)) + s * 0.07;
      const house = new THREE.SphereGeometry(0.5, 12, 8);
      (mc ? parts.trim : parts.paint).addGeo(house, mx, yBelt + 0.1, mz + 0.02, 0, 0.1, 0.09, 0.17, mc || C('#ffffff'));
      parts.trim.addGeo(new THREE.BoxGeometry(1, 1, 1), mx, yBelt + 0.1, mz - 0.06, 0, 0.085, 0.07, 0.012, C('#1b1d20'));
      parts.trim.addGeo(new THREE.BoxGeometry(1, 1, 1), mx - s * 0.05, yBelt + 0.06, mz + 0.02, 0, 0.06, 0.03, 0.06, trimC);
      // side marker and fender vent
      const f = side(s, P.zF + b.wr * 0.9 + 0.05, P.bottom(0.9) + faceHDefault(b) * 0.5);
      if (f && (b.style === 'sports' || b.style === 'supercar' || b.style === 'muscle')) parts.trim.add(extrude(rrShape(0.2, 0.05, 0.02), 0.01, 0.001), frame(f.p, f.n, 0.004), dark);
    }
    // hood and trunk panel lines (top-down rays)
    const top = (x, z) => surf(x, 3, z, 0, -1, 0);
    const hoodZ0 = -L / 2 + (tA + 0.015) * L, hoodZ1 = L / 2 - 0.12;
    const wH = (z) => P.halfW(P.tOf(z)) * 0.86;
    const hood = [];
    for (let z = hoodZ0; z <= hoodZ1; z += 0.06) { const h = top(wH(z), z); if (h) hood.push(h); }
    for (let x = wH(hoodZ1); x >= -wH(hoodZ1); x -= 0.05) { const h = top(x, hoodZ1); if (h) hood.push(h); }
    for (let z = hoodZ1; z >= hoodZ0; z -= 0.06) { const h = top(-wH(z), z); if (h) hood.push(h); }
    for (let x = -wH(hoodZ0); x <= wH(hoodZ0); x += 0.05) { const h = top(x, hoodZ0); if (h) hood.push(h); }
    if (hood.length > 6) ribbon(parts.trim, hood, 0.005, C('#08090a'), 0.0012, true);
    if (b.style !== 'pickup' && b.style !== 'utility' && b.style !== 'van' && b.style !== 'suv' && b.style !== 'offroad' && b.style !== 'hatch') {
      const tz0 = -L / 2 + 0.12, tz1 = -L / 2 + (tR + b.rw * 0.35) * L;
      const wT = (z) => P.halfW(P.tOf(z)) * 0.86;
      const tr = [];
      for (let z = tz0; z <= tz1; z += 0.06) { const h = top(wT(z), z); if (h) tr.push(h); }
      for (let x = wT(tz1); x >= -wT(tz1); x -= 0.05) { const h = top(x, tz1); if (h) tr.push(h); }
      for (let z = tz1; z >= tz0; z -= 0.06) { const h = top(-wT(z), z); if (h) tr.push(h); }
      for (let x = -wT(tz0); x <= wT(tz0); x += 0.05) { const h = top(x, tz0); if (h) tr.push(h); }
      if (tr.length > 6) ribbon(parts.trim, tr, 0.005, C('#08090a'), 0.0012, true);
    }
    // wipers
    const wz = -L / 2 + (tA - 0.014) * L;
    for (const s of [0.28, -0.2]) {
      const h = top(s * P.halfW(tA), wz);
      if (h) parts.trim.add(new THREE.BoxGeometry(0.5, 0.008, 0.012), frame(h.p, h.n, -0.004).clone().multiply(new THREE.Matrix4().makeRotationZ(0.12)), C('#0a0a0b'));
    }
  }
  // exhaust
  const ex = opts.exhaust || (def.sound.cyl >= 8 ? 'dual' : 'single');
  const exX = ex === 'single' ? [-0.4] : ex === 'dual' ? [-0.45, 0.45] : ex === 'quad' ? [-0.52, -0.38, 0.38, 0.52] : [-0.15, 0.15];
  if (DET) for (const x of exX) {
    const r = ex === 'sport' ? 0.055 : 0.042;
    parts.chrome.addGeo(new THREE.CylinderGeometry(r, r * 0.92, 0.16, 12, 1, true), x * wRear, P.bottom(0) + 0.1, zRear - 0.03, 0, 1, 1, 1, chromeC, Math.PI / 2);
    parts.trim.addGeo(new THREE.CircleGeometry(r * 0.88, 12), x * wRear, P.bottom(0) + 0.1, zRear - 0.012, Math.PI, 1, 1, 1, dark);
  }
  // side skirts
  if (DET) for (const s of [1, -1]) {
    const z0 = P.zR + b.wr + 0.08, z1 = P.zF - b.wr - 0.08;
    parts.trim.box(s * (P.halfW(0.5) * 0.992), P.bottom(0.5) + 0.05, (z0 + z1) / 2, 0.03, 0.08, z1 - z0, trimC, 0, 0, false);
  }
  if (DET) for (const w of wheelPositions(b)) {
    const R = b.wr + 0.075, s = w.left ? 1 : -1, x0 = s * P.halfW(P.tOf(w.z)) * 0.5, x1 = s * (P.halfW(P.tOf(w.z)) - 0.012);
    const N = LOD === 0 ? 14 : 8;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI, a1 = ((i + 1) / N) * Math.PI;
      const p = (x, a) => [x, b.wr + R * Math.sin(a), w.z + R * Math.cos(a)];
      const q = [p(x0, a0), p(x1, a0), p(x1, a1), p(x0, a1)];
      // inward-facing quad: keep the winding that faces the wheel axle
      const ex = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], ey = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
      const nrm = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
      const mid = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2 - b.wr, (q[0][2] + q[2][2]) / 2 - w.z];
      const inward = -(nrm[1] * mid[1] + nrm[2] * mid[2]) > 0;
      if (inward) parts.trim.quad(q[0], q[1], q[2], q[3], C('#0b0c0e')); else parts.trim.quad(q[3], q[2], q[1], q[0], C('#0b0c0e'));
    }
    // inner wall seen through the arch
    const wall = [], steps = N;
    for (let i = 0; i <= steps; i++) { const a = (i / steps) * Math.PI; wall.push([x0, b.wr + R * Math.sin(a), w.z + R * Math.cos(a)]); }
    for (let i = 0; i < steps; i++) {
      const c0 = [x0, b.wr, w.z];
      const faceOut = s > 0 ? 1 : -1;
      if (faceOut > 0) parts.trim.quad(c0, wall[i + 1], wall[i], wall[i], C('#101114')); else parts.trim.quad(c0, wall[i], wall[i + 1], wall[i + 1], C('#101114'));
    }
  }
  parts.lights = lights;

  // ---- body style extras ----
  if (b.style === 'pickup' || b.style === 'utility') pickupBed(parts, b, P);
  if (def.lightbar) lightbar(parts, b, P, def.lightbar === 'hidden');
  if (def.livery === 'taxi') parts.paint.box(0, b.roofY + 0.14, -L / 2 + ((tA + tR) / 2) * L, 0.7, 0.22, 0.28, C('#f2f2f0'), 0, 0, false);
  if (b.style === 'offroad') {
    parts.trim.addGeo(new THREE.CylinderGeometry(b.wr * 0.95, b.wr * 0.95, b.ww, 18), 0, P.top(0.02) - 0.1, -L / 2 - 0.12, 0, 1, 1, 1, trimC, Math.PI / 2);
    for (const s of [1, -1]) parts.trim.box(s * P.halfW(0.5) * 1.02, b.roofY + 0.05, 0, 0.05, 0.05, L * 0.45, trimC, 0, 0, false);
  }
  addonGeometry(parts, b, P, opts);

  const out = {};
  for (const k of ['paint', 'glass', 'trim', 'chrome', 'lights']) out[k] = parts[k] && parts[k].count ? parts[k].build() : null;
  out.plates = plates.count ? plates.build() : null;
  out.wheels = wheelPositions(b);
  out.layout = carLayout(b);
  out.dims = { L: b.L, W: b.W, H: b.roofY || b.H };
  out.seat = { x: 0.37, y: b.beltY - 0.05, z: lerp(P.zR, P.zF, 0.42) };
  out.P = P;
  return out;
}

const faceHDefault = (b) => b.shoulder * 0.5;

export function wheelPositions(b) {
  const { zF, zR } = carLayout(b);
  const x = b.trk / 2;
  return [
    { x, z: zF, front: true, left: true }, { x: -x, z: zF, front: true, left: false },
    { x, z: zR, front: false, left: true }, { x: -x, z: zR, front: false, left: false },
  ];
}

function pickupBed(parts, b, P) {
  const L = b.L, tC = b.tR;
  const zBack = -L / 2 + 0.05, zFront = -L / 2 + tC * L - 0.08;
  const w = P.halfW(0.3) * 0.98, y0 = b.deckY - 0.02;
  const c = C('#ffffff'), dk = C('#1a1b1d');
  parts.trim.box(0, y0 + 0.005, (zBack + zFront) / 2, w * 2 - 0.16, 0.01, zFront - zBack - 0.1, dk, 0, 0, false);
  for (const s of [1, -1]) parts.paint.box(s * (w - 0.04), y0 + 0.02, (zBack + zFront) / 2, 0.08, 0.06, zFront - zBack, c, 0, 0, false);
  parts.paint.box(0, y0 + 0.02, zBack + 0.03, w * 2, 0.06, 0.06, c, 0, 0, false);
  if (b.style === 'utility') {
    for (const s of [1, -1]) parts.paint.box(s * (w - 0.25), y0 + 0.35, (zBack + zFront) / 2, 0.5, 0.7, zFront - zBack - 0.1, C('#e8e8e5'), 0, 0, false);
    parts.trim.box(0, b.roofY + 0.12, -L / 2 + (b.tA - 0.04) * L, 1.2, 0.12, 0.25, C('#e0a21a'), 0, 0, false);
  }
}

function lightbar(parts, b, P, hidden) {
  const t = (b.tA - b.ws + b.tR + b.rw) / 2, z = -b.L / 2 + t * b.L;
  const L2 = parts.lights;
  if (hidden) {
    L2.box(0.25, b.beltY + 0.5, -b.L / 2 + (b.tA - 0.02) * b.L, 0.2, 0.05, 0.04, C('#330000'), 0, 0, false);
    for (let i = L2.count - 24; i < L2.count; i++) L2.u[i * 2] = 6.25;
    L2.box(-0.25, b.beltY + 0.5, -b.L / 2 + (b.tA - 0.02) * b.L, 0.2, 0.05, 0.04, C('#000033'), 0, 0, false);
    for (let i = L2.count - 24; i < L2.count; i++) L2.u[i * 2] = 7.25;
    return;
  }
  parts.trim.box(0, b.roofY + 0.06, z, 1.25, 0.06, 0.3, C('#1a1b1d'), 0, 0, false);
  const start = L2.count;
  L2.box(0.33, b.roofY + 0.14, z, 0.56, 0.1, 0.26, C('#5a1010'), 0, 0, false);
  for (let i = start; i < L2.count; i++) L2.u[i * 2] = 6.25;
  const s2 = L2.count;
  L2.box(-0.33, b.roofY + 0.14, z, 0.56, 0.1, 0.26, C('#10105a'), 0, 0, false);
  for (let i = s2; i < L2.count; i++) L2.u[i * 2] = 7.25;
  parts.trim.box(0, P.bottom(1) + 0.35, b.L / 2 + 0.08, 1.0, 0.45, 0.06, C('#141414'), 0, 0, false);
}

function addonGeometry(parts, b, P, o) {
  const L = b.L, dk = C('#141414');
  const paintC = C('#ffffff');
  const deckZ = -L / 2 + 0.08 * L;
  switch (o.spoiler) {
    case 'lip': parts.paint.box(0, P.top(0.02) + 0.03, -L / 2 + 0.05, P.halfW(0.03) * 1.7, 0.03, 0.12, paintC, 0, 0, false); break;
    case 'ducktail': parts.paint.box(0, P.top(0.03) + 0.05, -L / 2 + 0.1, P.halfW(0.04) * 1.8, 0.06, 0.22, paintC, 0, 0, false); break;
    case 'wing': case 'gt': {
      const y = P.top(0.05) + (o.spoiler === 'gt' ? 0.38 : 0.22), w = P.halfW(0.05) * (o.spoiler === 'gt' ? 2.05 : 1.7);
      parts.trim.box(0, y, deckZ, w, 0.035, o.spoiler === 'gt' ? 0.34 : 0.24, dk, 0, 0, false);
      for (const s of [1, -1]) {
        parts.trim.box(s * w * 0.32, (P.top(0.05) + y) / 2, deckZ, 0.04, y - P.top(0.05), 0.12, dk, 0, 0, false);
        if (o.spoiler === 'gt') parts.trim.box(s * w / 2, y + 0.06, deckZ, 0.02, 0.2, 0.4, dk, 0, 0, false);
      }
      break;
    }
  }
  if (o.bumper === 'sport' || o.bumper === 'aero') {
    parts.trim.box(0, P.bottom(1) + 0.03, L / 2 - 0.02, P.halfW(0.98) * 1.9, 0.025, 0.2, dk, 0, 0, false);
    parts.trim.box(0, P.bottom(0) + 0.04, -L / 2 + 0.05, P.halfW(0.02) * 1.6, 0.12, 0.2, dk, 0, 0, false);
    if (o.bumper === 'aero') for (const s of [1, -1]) parts.trim.box(s * P.halfW(0.5) * 1.01, P.bottom(0.5) + 0.02, 0, 0.06, 0.05, b.wb * 0.7, dk, 0, 0, false);
  }
  if (o.hood === 'scoop') parts.paint.box(0, P.top(0.85) + 0.06, -L / 2 + 0.85 * L, 0.5, 0.1, 0.55, paintC, 0, 0, false);
  if (o.hood === 'vented') for (const s of [1, -1]) parts.trim.box(s * 0.35, P.top(0.84) + 0.012, -L / 2 + 0.84 * L, 0.25, 0.02, 0.4, dk, 0, 0, false);
}
