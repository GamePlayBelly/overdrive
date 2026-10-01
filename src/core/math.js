export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoothstep = (a, b, v) => smooth(clamp((v - a) / (b - a), 0, 1));
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const angleDiff = (a, b) => wrapAngle(b - a);
export const dampAngle = (a, b, k, dt) => a + angleDiff(a, b) * (1 - Math.exp(-k * dt));
export const len2 = (x, z) => Math.sqrt(x * x + z * z);
export const dist2 = (ax, az, bx, bz) => Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);
export const sign = (v) => (v < 0 ? -1 : 1);
export const moveTowards = (a, b, d) => (Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d);

export function segClosest(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cz = az + dz * t;
  return { t, x: cx, z: cz, d: Math.sqrt((px - cx) ** 2 + (pz - cz) ** 2) };
}

export class Polyline {
  constructor(pts) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z, (b.y || 0) - (a.y || 0)));
    }
    this.len = this.cum[this.cum.length - 1];
    this._seg = 0;
  }
  segAt(s) {
    const c = this.cum;
    let i = this._seg;
    if (i >= c.length - 1 || c[i] > s) i = 0;
    while (i < c.length - 2 && c[i + 1] < s) i++;
    this._seg = i;
    return i;
  }
  at(s, out = {}) {
    s = clamp(s, 0, this.len);
    const i = this.segAt(s);
    const a = this.pts[i], b = this.pts[i + 1] || a;
    const L = this.cum[i + 1] - this.cum[i] || 1e-9;
    const t = (s - this.cum[i]) / L;
    out.x = a.x + (b.x - a.x) * t;
    out.y = (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t;
    out.z = a.z + (b.z - a.z) * t;
    const dx = b.x - a.x, dz = b.z - a.z, dl = Math.hypot(dx, dz) || 1;
    out.dx = dx / dl; out.dz = dz / dl;
    out.slope = ((b.y || 0) - (a.y || 0)) / (L || 1);
    return out;
  }
  heading(s) {
    const p = this.at(s);
    return Math.atan2(p.dx, p.dz);
  }
  project(px, pz) {
    let best = { d: Infinity, s: 0, i: 0 };
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const r = segClosest(px, pz, a.x, a.z, b.x, b.z);
      if (r.d < best.d) best = { d: r.d, s: this.cum[i] + r.t * (this.cum[i + 1] - this.cum[i]), i, x: r.x, z: r.z };
    }
    return best;
  }
  offset(d) {
    const out = [];
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      let rx = -tz, rz = tx;
      let k = 1;
      if (i > 0 && i < n - 1) {
        const ax = p.x - a.x, az = p.z - a.z, al = Math.hypot(ax, az) || 1;
        const r0x = -az / al, r0z = ax / al;
        const dot = r0x * rx + r0z * rz;
        k = 1 / Math.max(0.5, dot);
      }
      out.push({ x: p.x + rx * d * k, y: p.y || 0, z: p.z + rz * d * k });
    }
    return out;
  }
  slice(s0, s1, step = 0) {
    const out = [this.at(s0)];
    for (let i = 0; i < this.pts.length; i++) if (this.cum[i] > s0 + 1e-4 && this.cum[i] < s1 - 1e-4) out.push({ ...this.pts[i] });
    out.push(this.at(s1));
    const clean = out.map((p) => ({ x: p.x, y: p.y || 0, z: p.z }));
    if (!step) return clean;
    const pl = new Polyline(clean), res = [];
    const n = Math.max(1, Math.ceil(pl.len / step));
    for (let i = 0; i <= n; i++) { const q = pl.at((pl.len * i) / n); res.push({ x: q.x, y: q.y, z: q.z }); }
    return res;
  }
  reversed() { return new Polyline([...this.pts].reverse()); }
}

// right-hand normal for a heading (x,z) direction with the game convention: forward=(sin,cos), right=(-cos,sin)
export const rightOf = (dx, dz) => ({ x: -dz, z: dx });

export function catmull(points, samplesPerSeg = 8) {
  const out = [];
  const P = (i) => points[clamp(i, 0, points.length - 1)];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const n = Math.max(2, Math.ceil(samplesPerSeg * segLen / 40));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y || 0, p1.y || 0, p2.y || 0, p3.y || 0), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  const last = points[points.length - 1];
  out.push({ x: last.x, y: last.y || 0, z: last.z });
  return out;
}

export function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function fmtTime(sec) {
  if (!isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
