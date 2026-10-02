import { WATER_LEVEL } from '../data/world.js';
import { clamp, smoothstep } from '../core/math.js';

// Navigation grid over the water: cells deep enough for a keel and clear of piles, connected components so a goal is always reachable,
// and an A* with shore-shy costs followed by line-of-sight smoothing. Shared by boat traffic and the coast guard.
export class SeaNav {
  constructor(world, cell = 40) {
    const T = world.terrain;
    this.cell = cell; this.x0 = T.x0; this.z0 = T.z0;
    this.w = Math.ceil(((T.nx - 1) * T.res) / cell); this.h = Math.ceil(((T.nz - 1) * T.res) / cell);
    const n = this.w * this.h;
    this.ok = new Uint8Array(n); this.cost = new Float32Array(n); this.comp = new Int32Array(n);
    this.terrain = T;
    const hc = cell * 0.4;
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const cx = this.x0 + (i + 0.5) * cell, cz = this.z0 + (j + 0.5) * cell;
      const d0 = WATER_LEVEL - T.height(cx, cz);
      if (d0 < 2.4) continue;
      const dm = Math.min(d0, WATER_LEVEL - T.height(cx + hc, cz), WATER_LEVEL - T.height(cx - hc, cz), WATER_LEVEL - T.height(cx, cz + hc), WATER_LEVEL - T.height(cx, cz - hc));
      if (dm < 1.8) continue;
      let blocked = false;
      world.colliders.query(cx, cz, cell * 0.55, WATER_LEVEL - 1, WATER_LEVEL + 2.5, (c) => { if (c.solid || c.kind === 'pier') blocked = true; });
      if (blocked) continue;
      const k = j * this.w + i;
      this.ok[k] = 1; this.cost[k] = 1 + 1.6 * smoothstep(8, 2.4, dm);
    }
    // connected components (4-neighbour)
    let id = 0; const stack = [];
    for (let s = 0; s < n; s++) {
      if (!this.ok[s] || this.comp[s]) continue;
      id++; stack.push(s); this.comp[s] = id;
      while (stack.length) {
        const c = stack.pop(), ci = c % this.w, cj = (c / this.w) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= this.w || nj >= this.h) continue;
          const q = nj * this.w + ni;
          if (this.ok[q] && !this.comp[q]) { this.comp[q] = id; stack.push(q); }
        }
      }
    }
    this.sizes = new Int32Array(id + 1);
    for (let s = 0; s < n; s++) this.sizes[this.comp[s]]++;
    this.big = this.sizes.reduce((b, v, i) => (i && v > (this.sizes[b] || 0) ? i : b), 1);
  }

  idx(x, z) { const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell); return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i; }
  cx(k) { return this.x0 + ((k % this.w) + 0.5) * this.cell; }
  cz(k) { return this.z0 + (((k / this.w) | 0) + 0.5) * this.cell; }
  navigable(x, z) { const k = this.idx(x, z); return k >= 0 && this.ok[k] === 1; }
  compAt(x, z) { const k = this.idx(x, z); return k < 0 ? 0 : this.comp[k]; }

  // nearest navigable cell centre to a point (spiral search)
  nearest(x, z, maxR = 12, comp = 0) {
    const k0 = this.idx(x, z); if (k0 < 0) return null;
    const i0 = k0 % this.w, j0 = (k0 / this.w) | 0;
    for (let r = 0; r <= maxR; r++) {
      let best = -1, bd = 1e18;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const k = j * this.w + i; if (!this.ok[k] || (comp && this.comp[k] !== comp)) continue;
        const d = (this.cx(k) - x) ** 2 + (this.cz(k) - z) ** 2; if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return { x: this.cx(best), z: this.cz(best), k: best };
    }
    return null;
  }

  // random navigable point in the given component between rmin and rmax of (fx, fz); rnd() in 0..1
  random(rnd, comp, fx, fz, rmin, rmax) {
    for (let t = 0; t < 60; t++) {
      const a = rnd() * 6.2832, r = rmin + rnd() * (rmax - rmin), x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r, k = this.idx(x, z);
      if (k >= 0 && this.ok[k] && (!comp || this.comp[k] === comp)) return { x: this.cx(k) + (rnd() - 0.5) * this.cell * 0.6, z: this.cz(k) + (rnd() - 0.5) * this.cell * 0.6, k };
    }
    return null;
  }

  // straight line over navigable cells
  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (this.cell * 0.5));
    for (let s = 1; s < n; s++) { const t = s / n, k = this.idx(ax + (bx - ax) * t, az + (bz - az) * t); if (k < 0 || !this.ok[k]) return false; }
    return true;
  }

  // waypoints from a to b, or null when they are not connected
  path(ax, az, bx, bz) {
    const A = this.nearest(ax, az), B = this.nearest(bx, bz);
    if (!A || !B || this.comp[A.k] !== this.comp[B.k]) return null;
    if (A.k === B.k || this.los(ax, az, bx, bz)) return [{ x: bx, z: bz }];
    const w = this.w, n = w * this.h, g = new Float32Array(n).fill(1e9), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const heap = [], push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
    const bi = B.k % w, bj = (B.k / w) | 0, hf = (k) => { const dx = Math.abs((k % w) - bi), dz = Math.abs(((k / w) | 0) - bj); return (dx + dz + (1.4142 - 2) * Math.min(dx, dz)); };
    g[A.k] = 0; push(A.k, hf(A.k));
    let it = 0, found = false;
    while (heap.length && it++ < 90000) {
      const c = pop(); if (closed[c]) continue; closed[c] = 1;
      if (c === B.k) { found = true; break; }
      const ci = c % w, cj = (c / w) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= w || nj >= this.h) continue;
        const q = nj * w + ni; if (!this.ok[q] || closed[q]) continue;
        if (di && dj && (!this.ok[cj * w + ni] || !this.ok[nj * w + ci])) continue;
        const ng = g[c] + (di && dj ? 1.4142 : 1) * this.cost[q];
        if (ng < g[q]) { g[q] = ng; from[q] = c; push(q, ng + hf(q)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let c = B.k; c >= 0; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = [{ x: ax, z: az }, ...cells.map((k) => ({ x: this.cx(k), z: this.cz(k) })), { x: bx, z: bz }];
    // string pulling
    const out = []; let cur = 0;
    while (cur < pts.length - 1) {
      let nx = cur + 1;
      for (let j = pts.length - 1; j > cur + 1; j--) if (this.los(pts[cur].x, pts[cur].z, pts[j].x, pts[j].z)) { nx = j; break; }
      out.push(pts[nx]); cur = nx;
    }
    return out;
  }

  depthAt(x, z) { return WATER_LEVEL - this.terrain.height(x, z); }
  clamp01(v) { return clamp(v, 0, 1); }
}
