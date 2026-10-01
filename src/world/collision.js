// 2D (xz) static colliders with vertical ranges, spatial hash, SAT helpers.
export class Colliders {
  constructor(cell = 16) {
    this.cell = cell;
    this.grid = new Map();
    this.list = [];
    this._stamp = 0;
  }

  _cells(c, fn) {
    const C = this.cell;
    const r = c.type === 'circle' ? c.r : Math.hypot(c.hx, c.hz);
    const x0 = Math.floor((c.x - r) / C), x1 = Math.floor((c.x + r) / C);
    const z0 = Math.floor((c.z - r) / C), z1 = Math.floor((c.z + r) / C);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) fn(i * 73856093 ^ j * 19349663, i, j);
  }

  _insert(c) {
    c.id = this.list.length;
    this.list.push(c);
    c._q = 0;
    this._cells(c, (k) => { let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(c); });
    return c;
  }

  remove(c) {
    if (c.removed) return;
    c.removed = true;
    this._cells(c, (k) => { const a = this.grid.get(k); if (a) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); } });
  }

  restore(c) {
    if (!c.removed) return;
    c.removed = false;
    this._cells(c, (k) => { let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(c); });
  }

  // oriented box: center, half extents along local u (angle rot) and v
  box(x, z, hx, hz, rot = 0, y0 = -50, y1 = 400, o = {}) {
    return this._insert({ type: 'box', x, z, hx, hz, rot, cos: Math.cos(rot), sin: Math.sin(rot), y0, y1, kind: o.kind || 'wall', mat: o.mat || 'concrete', ref: o.ref || null, solid: o.solid ?? true });
  }
  circle(x, z, r, y0 = -50, y1 = 400, o = {}) {
    return this._insert({ type: 'circle', x, z, r, y0, y1, kind: o.kind || 'pole', mat: o.mat || 'metal', ref: o.ref || null, solid: o.solid ?? true });
  }
  seg(ax, az, bx, bz, thick = 0.4, y0 = -50, y1 = 400, o = {}) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 0.05) return null;
    return this.box((ax + bx) / 2, (az + bz) / 2, L / 2, thick / 2, Math.atan2(dz, dx), y0, y1, o);
  }

  query(x, z, r, y0, y1, fn) {
    const C = this.cell, q = ++this._stamp;
    const i0 = Math.floor((x - r) / C), i1 = Math.floor((x + r) / C), j0 = Math.floor((z - r) / C), j1 = Math.floor((z + r) / C);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.grid.get(i * 73856093 ^ j * 19349663);
      if (!a) continue;
      for (let k = 0; k < a.length; k++) {
        const c = a[k];
        if (c._q === q) continue;
        c._q = q;
        if (c.y1 < y0 || c.y0 > y1) continue;
        if (fn(c) === false) return;
      }
    }
  }

  // segment raycast in xz; returns fraction t of first hit or 1
  raycast(ax, az, bx, bz, y0 = 0.5, y1 = 2, filter = null) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-6) return 1;
    let best = 1;
    const steps = Math.ceil(L / this.cell) + 1;
    const q = ++this._stamp;
    for (let s = 0; s <= steps; s++) {
      const px = ax + (dx * s) / steps, pz = az + (dz * s) / steps;
      const i = Math.floor(px / this.cell), j = Math.floor(pz / this.cell);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const a = this.grid.get((i + di) * 73856093 ^ (j + dj) * 19349663);
        if (!a) continue;
        for (const c of a) {
          if (c._q === q) continue;
          c._q = q;
          if (c.y1 < y0 || c.y0 > y1 || !c.solid) continue;
          if (filter && !filter(c)) continue;
          const t = c.type === 'circle' ? rayCircle(ax, az, dx, dz, c) : rayBox(ax, az, dx, dz, c);
          if (t < best) best = t;
        }
      }
      if (best < s / steps) break;
    }
    return best;
  }
}

function rayCircle(ax, az, dx, dz, c) {
  const fx = ax - c.x, fz = az - c.z;
  const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), cc = fx * fx + fz * fz - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return 1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : cc < 0 ? 0 : 1;
}

function rayBox(ax, az, dx, dz, c) {
  const ox = ax - c.x, oz = az - c.z;
  const lx = ox * c.cos + oz * c.sin, lz = -ox * c.sin + oz * c.cos;
  const ldx = dx * c.cos + dz * c.sin, ldz = -dx * c.sin + dz * c.cos;
  let t0 = 0, t1 = 1;
  for (const [o, d, h] of [[lx, ldx, c.hx], [lz, ldz, c.hz]]) {
    if (Math.abs(d) < 1e-9) { if (o < -h || o > h) return 1; continue; }
    let ta = (-h - o) / d, tb = (h - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return 1;
  }
  return t0;
}

// ---------- SAT between an oriented box (car) and a collider ----------
// box A: {x,z,hx,hz,cos,sin}. Returns {nx,nz,depth,px,pz} with normal pointing from B to A, or null.
export function obbCorners(b, out = []) {
  const ux = b.cos * b.hx, uz = b.sin * b.hx, vx = -b.sin * b.hz, vz = b.cos * b.hz;
  out[0] = b.x + ux + vx; out[1] = b.z + uz + vz;
  out[2] = b.x - ux + vx; out[3] = b.z - uz + vz;
  out[4] = b.x - ux - vx; out[5] = b.z - uz - vz;
  out[6] = b.x + ux - vx; out[7] = b.z + uz - vz;
  return out;
}

const _ca = [], _cb = [];
function project(corners, ax, az) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < 8; i += 2) { const p = corners[i] * ax + corners[i + 1] * az; if (p < mn) mn = p; if (p > mx) mx = p; }
  return [mn, mx];
}

function insideBox(px, pz, b, pad = 0) {
  const ox = px - b.x, oz = pz - b.z;
  const lx = ox * b.cos + oz * b.sin, lz = -ox * b.sin + oz * b.cos;
  return Math.abs(lx) <= b.hx + pad && Math.abs(lz) <= b.hz + pad;
}

export function obbVsObb(A, B) {
  if (A.poly || B.poly) return polyVsPoly(A, B);
  obbCorners(A, _ca); obbCorners(B, _cb);
  const axes = [A.cos, A.sin, -A.sin, A.cos, B.cos, B.sin, -B.sin, B.cos];
  let best = Infinity, nx = 0, nz = 0;
  for (let i = 0; i < 8; i += 2) {
    const ax = axes[i], az = axes[i + 1];
    const [a0, a1] = project(_ca, ax, az), [b0, b1] = project(_cb, ax, az);
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o <= 0) return null;
    if (o < best) {
      best = o;
      const dir = (A.x - B.x) * ax + (A.z - B.z) * az;
      nx = dir >= 0 ? ax : -ax; nz = dir >= 0 ? az : -az;
    }
  }
  let px = 0, pz = 0, n = 0;
  for (let i = 0; i < 8; i += 2) if (insideBox(_ca[i], _ca[i + 1], B, 0.02)) { px += _ca[i]; pz += _ca[i + 1]; n++; }
  if (!n) for (let i = 0; i < 8; i += 2) if (insideBox(_cb[i], _cb[i + 1], A, 0.02)) { px += _cb[i]; pz += _cb[i + 1]; n++; }
  if (!n) { px = (A.x + B.x) / 2; pz = (A.z + B.z) / 2; n = 1; }
  return { nx, nz, depth: best, px: px / n, pz: pz / n };
}

export function obbVsCircle(A, c) {
  if (A.poly) return polyVsCircle(A, c);
  const ox = c.x - A.x, oz = c.z - A.z;
  const lx = ox * A.cos + oz * A.sin, lz = -ox * A.sin + oz * A.cos;
  const cx = Math.max(-A.hx, Math.min(A.hx, lx)), cz = Math.max(-A.hz, Math.min(A.hz, lz));
  let dx = lx - cx, dz = lz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > c.r * c.r) return null;
  let d = Math.sqrt(d2), nlx, nlz, depth;
  if (d < 1e-6) {
    const px = A.hx - Math.abs(lx), pz = A.hz - Math.abs(lz);
    if (px < pz) { nlx = -Math.sign(lx) || -1; nlz = 0; depth = px + c.r; } else { nlx = 0; nlz = -Math.sign(lz) || -1; depth = pz + c.r; }
  } else { nlx = -dx / d; nlz = -dz / d; depth = c.r - d; }
  // normal from circle to A, in world
  const nx = nlx * A.cos - nlz * A.sin, nz = nlx * A.sin + nlz * A.cos;
  const wx = A.x + cx * A.cos - cz * A.sin, wz = A.z + cx * A.sin + cz * A.cos;
  return { nx, nz, depth, px: wx, pz: wz };
}

export function collide(A, c) {
  return c.type === 'circle' ? obbVsCircle(A, c) : obbVsObb(A, c);
}

// ---------- convex outlines (vehicle silhouettes) ----------
// A.poly is a flat [x0, z0, x1, z1, ...] ring of world points (either winding); normals always point from B to A (or from the circle to A).
const _pa2 = [], _pb2 = [];
const polyArea = (P) => { let a = 0; const n = P.length >> 1; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += P[2 * i] * P[2 * j + 1] - P[2 * j] * P[2 * i + 1]; } return a; };
const polyOf = (X, tmp) => { if (X.poly) return X.poly; obbCorners(X, tmp); tmp.length = 8; return tmp; };

export function polyVsCircle(A, c) {
  const P = A.poly, n = P.length >> 1, sg = polyArea(P) >= 0 ? 1 : -1;
  let inside = true, maxd = -Infinity, mi = 0, bd2 = Infinity, bx = 0, bz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, px = P[2 * i], pz = P[2 * i + 1], ex = P[2 * j] - px, ez = P[2 * j + 1] - pz;
    const len2 = ex * ex + ez * ez, len = Math.sqrt(len2) || 1e-9;
    const d = (c.x - px) * (sg * ez / len) + (c.z - pz) * (-sg * ex / len);
    if (d > 0) inside = false;
    if (d > maxd) { maxd = d; mi = i; }
    let t = ((c.x - px) * ex + (c.z - pz) * ez) / (len2 || 1e-9); t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = px + ex * t, qz = pz + ez * t, dx = c.x - qx, dz = c.z - qz, d2 = dx * dx + dz * dz;
    if (d2 < bd2) { bd2 = d2; bx = qx; bz = qz; }
  }
  if (inside) {
    const i = mi, j = (i + 1) % n, ex = P[2 * j] - P[2 * i], ez = P[2 * j + 1] - P[2 * i + 1], len = Math.hypot(ex, ez) || 1e-9;
    const nx = sg * ez / len, nz = -sg * ex / len;
    return { nx: -nx, nz: -nz, depth: c.r - maxd, px: c.x - nx * maxd, pz: c.z - nz * maxd };
  }
  const d = Math.sqrt(bd2);
  if (d >= c.r) return null;
  const ux = d > 1e-6 ? (c.x - bx) / d : 0, uz = d > 1e-6 ? (c.z - bz) / d : 1;
  return { nx: -ux, nz: -uz, depth: c.r - d, px: bx, pz: bz };
}

export function polyVsPoly(A, B) {
  const PA = polyOf(A, _pa2), PB = polyOf(B, _pb2), na = PA.length >> 1, nb = PB.length >> 1;
  const sa = polyArea(PA) >= 0 ? 1 : -1, sb = polyArea(PB) >= 0 ? 1 : -1;
  let best = Infinity, bnx = 0, bnz = 0, owner = 0;
  const axisTest = (P, n, sg, own) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ex = P[2 * j] - P[2 * i], ez = P[2 * j + 1] - P[2 * i + 1], len = Math.hypot(ex, ez);
      if (len < 1e-9) continue;
      const nx = sg * ez / len, nz = -sg * ex / len;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (let k = 0; k < na; k++) { const d = PA[2 * k] * nx + PA[2 * k + 1] * nz; if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (let k = 0; k < nb; k++) { const d = PB[2 * k] * nx + PB[2 * k + 1] * nz; if (d < b0) b0 = d; if (d > b1) b1 = d; }
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return false;
      if (o < best) { best = o; bnx = nx; bnz = nz; owner = own; }
    }
    return true;
  };
  if (!axisTest(PA, na, sa, 0) || !axisTest(PB, nb, sb, 1)) return null;
  let cax = 0, caz = 0, cbx = 0, cbz = 0;
  for (let k = 0; k < na; k++) { cax += PA[2 * k]; caz += PA[2 * k + 1]; }
  for (let k = 0; k < nb; k++) { cbx += PB[2 * k]; cbz += PB[2 * k + 1]; }
  if ((cax / na - cbx / nb) * bnx + (caz / na - cbz / nb) * bnz < 0) { bnx = -bnx; bnz = -bnz; }
  // contact: the deepest vertex of the penetrating body
  let px = 0, pz = 0, bd = owner === 1 ? Infinity : -Infinity;
  if (owner === 1) { for (let k = 0; k < na; k++) { const d = PA[2 * k] * bnx + PA[2 * k + 1] * bnz; if (d < bd) { bd = d; px = PA[2 * k]; pz = PA[2 * k + 1]; } } }
  else { for (let k = 0; k < nb; k++) { const d = PB[2 * k] * bnx + PB[2 * k + 1] * bnz; if (d > bd) { bd = d; px = PB[2 * k]; pz = PB[2 * k + 1]; } } }
  return { nx: bnx, nz: bnz, depth: best, px, pz };
}

// convex hull of [x, z] pairs (Andrew's monotone chain), returns a flat ring
export function convexHull(pts) {
  const p = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 1e-9) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
