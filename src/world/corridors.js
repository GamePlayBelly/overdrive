import { catmull, Polyline, clamp, lerp, smoothstep } from '../core/math.js';

// A designed road line. The path is a smooth spline; its elevation either follows the natural terrain loosely (smoothed, grade limited,
// pinned at the ends) or is given explicitly. Terrain carving pulls the ground toward the profile so the road sits in a natural-looking
// cut or fill, and the road graph reads the same profile, so the two always agree.
const DS = 4;

export class Corridor {
  constructor(spec, natural) {
    this.id = spec.id; this.spec = spec;
    this.core = spec.core ?? 9; this.reach = spec.reach ?? 150; this.carve = spec.carve !== false;
    const ctrl = spec.ctrl.map(([x, z, y]) => ({ x, z, y: y ?? 0 }));
    const full = new Polyline(spec.raw ? ctrl : catmull(ctrl, 10));
    const n = Math.max(2, Math.ceil(full.len / DS));
    this.pts = []; this.s = [];
    for (let i = 0; i <= n; i++) { const s = (full.len * i) / n, p = full.at(s); this.pts.push({ x: p.x, z: p.z }); this.s.push(s); }
    this.len = full.len;
    if (spec.explicit) {
      // y from a profile function, or from the control points (smooth spline through them)
      this.y = spec.profile ? this.s.map((s) => spec.profile(s, this.len)) : this.pts.map((_, i) => { const q = full.pts[Math.min(full.pts.length - 1, Math.round(i * (full.pts.length - 1) / n))]; return q.y; });
    } else {
      const raw = this.pts.map((p) => natural(p.x, p.z));
      const W = spec.smooth ?? 220, y = new Float64Array(n + 1);
      for (let i = 0; i <= n; i++) {
        let sum = 0, w = 0;
        for (let j = Math.max(0, i - Math.ceil(W / DS)); j <= Math.min(n, i + Math.ceil(W / DS)); j++) { const k = 1 - Math.abs(this.s[j] - this.s[i]) / W; if (k <= 0) continue; sum += raw[j] * k; w += k; }
        y[i] = sum / w;
      }
      const y0 = spec.ctrl[0][2] ?? null, y1 = spec.ctrl[spec.ctrl.length - 1][2] ?? null;
      const d0 = y0 === null ? 0 : y0 - y[0], d1 = y1 === null ? 0 : y1 - y[n];
      for (let i = 0; i <= n; i++) y[i] += d0 * Math.exp(-this.s[i] / 280) + d1 * Math.exp(-(this.len - this.s[i]) / 280);
      const g = (spec.maxGrade ?? 0.075) * DS, gm = g / DS;
      // inside the cone reachable from both pinned ends the sweeps below can always satisfy the grade limit
      for (let i = 0; i <= n; i++) {
        let lo = -Infinity, hi = Infinity;
        if (y0 !== null) { lo = Math.max(lo, y0 - gm * this.s[i]); hi = Math.min(hi, y0 + gm * this.s[i]); }
        if (y1 !== null) { lo = Math.max(lo, y1 - gm * (this.len - this.s[i])); hi = Math.min(hi, y1 + gm * (this.len - this.s[i])); }
        if (lo <= hi) y[i] = clamp(y[i], lo, hi);
      }
      const relax = (arr, iters) => {
        for (let it = 0; it < iters; it++) {
          if (y0 !== null) arr[0] = y0; if (y1 !== null) arr[n] = y1;
          for (let i = 1; i < n; i++) arr[i] = clamp(arr[i], arr[i - 1] - g, arr[i - 1] + g);
          if (y1 !== null) arr[n] = y1;
          for (let i = n - 1; i >= 1; i--) arr[i] = clamp(arr[i], arr[i + 1] - g, arr[i + 1] + g);
          if (y0 !== null) arr[0] = y0;
        }
      };
      relax(y, 80);
      // gentle final smoothing keeps vertical curves soft
      const sm = Float64Array.from(y), K = 6;
      for (let i = 0; i <= n; i++) { let a = 0, c = 0; for (let j = Math.max(0, i - K); j <= Math.min(n, i + K); j++) { a += y[j]; c++; } sm[i] = a / c; }
      relax(sm, 40);
      if (y0 !== null) sm[0] = y0; if (y1 !== null) sm[n] = y1;
      this.y = Array.from(sm);
      if (spec.minY !== undefined) this.y = this.y.map((v) => Math.max(v, spec.minY));
    }
    // bounding box and a coarse segment grid for fast nearest-point queries
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of this.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    this.box = [x0 - this.reach, x1 + this.reach, z0 - this.reach, z1 + this.reach];
    this.cell = 64; this.grid = new Map();
    for (let i = 0; i < n; i++) {
      const a = this.pts[i], b = this.pts[i + 1], r = this.reach;
      for (let cx = Math.floor((Math.min(a.x, b.x) - r) / this.cell); cx <= Math.floor((Math.max(a.x, b.x) + r) / this.cell); cx++) {
        for (let cz = Math.floor((Math.min(a.z, b.z) - r) / this.cell); cz <= Math.floor((Math.max(a.z, b.z) + r) / this.cell); cz++) {
          const k = cx * 65536 + cz; let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push(i);
        }
      }
    }
  }

  yAt(s) {
    const t = clamp(s / DS, 0, this.y.length - 1), i = Math.min(this.y.length - 2, Math.floor(t));
    return lerp(this.y[i], this.y[i + 1], t - i);
  }

  // nearest point on the path: { d, s, y, x, z } or null when the point is outside the influence box
  project(x, z) {
    const B = this.box;
    if (x < B[0] || x > B[1] || z < B[2] || z > B[3]) return null;
    const l = this.grid.get(Math.floor(x / this.cell) * 65536 + Math.floor(z / this.cell));
    if (!l) return null;
    let bd = Infinity, bs = 0, bx = 0, bz = 0;
    for (const i of l) {
      const a = this.pts[i], b = this.pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
      const cx = a.x + dx * t, cz = a.z + dz * t, d = Math.hypot(x - cx, z - cz);
      if (d < bd) { bd = d; bs = this.s[i] + t * DS; bx = cx; bz = cz; }
    }
    return { d: bd, s: bs, y: this.yAt(bs), x: bx, z: bz };
  }

  // points for the road graph: [{ x, y, z, fixedY }]
  points(step = 10) {
    const out = [], n = Math.max(1, Math.ceil(this.len / step));
    for (let i = 0; i <= n; i++) { const s = (this.len * i) / n, t = s / DS, k = Math.min(this.pts.length - 2, Math.floor(t)); const a = this.pts[k], b = this.pts[k + 1], f = t - k; out.push({ x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), y: this.yAt(s), fixedY: true }); }
    return out;
  }
}

export const CORRIDORS = [];

// flat building pads, blended into the surrounding ground
export const PAD_LIST = [];
function applyPads(h, x, z) {
  for (const p of PAD_LIST) {
    const dx = Math.max(p.x0 - x, 0, x - p.x1), dz = Math.max(p.z0 - z, 0, z - p.z1);
    if (dx > p.fall || dz > p.fall) continue;
    const m = 1 - smoothstep(0, p.fall, Math.hypot(dx, dz));
    if (m > 0) h = lerp(h, p.y, m);
  }
  return h;
}

// pull the ground toward every corridor's profile, then flatten the town pads
export function carveCorridors(h, x, z) {
  for (const c of CORRIDORS) {
    if (!c.carve) continue;
    const q = c.project(x, z);
    if (!q || q.d > c.reach) continue;
    const diff = Math.abs(h - q.y);
    const fall = clamp(diff * 1.15, 26, c.reach - c.core);
    const m = 1 - smoothstep(c.core, c.core + fall, q.d);
    if (m > 0) h = lerp(h, q.y - 0.12, m);
  }
  return applyPads(h, x, z);
}

// build the corridor set once (needs the natural height function, which lives in terrain.js)
export function ensureCorridors(natural, specs, pads = []) {
  if (CORRIDORS.length) return CORRIDORS;
  PAD_LIST.push(...pads);
  for (const sp of specs) CORRIDORS.push(new Corridor(sp, natural));
  return CORRIDORS;
}
