import { WATER_LEVEL } from '../data/world.js';
import { SEA } from '../data/sea.js';
import { clamp, smoothstep, wrapAngle, TAU } from '../core/math.js';

// Sea surface model shared by the shader and every CPU consumer (boats, swimmers, fish, spray).
// Eight Gerstner components: 0-4 wind sea fanned around the wind, 5-6 swell, 7 a crossing sea.
// Heights follow the mean wind through a significant wave height; directions relax toward the wind; phases are integrated so
// nothing jumps when the weather changes. A squall (x, z, r, k) multiplies every amplitude by 1 + k inside radius r.
const G = 9.81, N = 8;
const WS_REL = [1, 0.64, 0.42, 0.27, 0.17], WS_E = [0.46, 0.27, 0.15, 0.08, 0.04], WS_OFF = [0, 0.28, -0.34, 0.55, -0.62];
const SW_REL = [1, 0.6], SW_E = [0.7, 0.3], SW_OFF = [0, 0.16];

export class WaveField {
  constructor(cfg = SEA) {
    this.cfg = cfg;
    this.tRef = 0;
    this.dx = new Float64Array(N); this.dz = new Float64Array(N); this.k = new Float64Array(N); this.w = new Float64Array(N);
    this.a = new Float64Array(N); this.q = new Float64Array(N); this.ph = new Float64Array(N);
    this.U = 5; this.hsW = 0.6; this.hsS = 0.35; this.hsSlow = 0.6; this.lam = 40; this.dirW = 0.9; this.dirS = 0.9 + cfg.swell.offset;
    this.hs = 0.7; this.steep = 0; this.maxA = 0; this.sea01 = 0;
    this.storm = { x: 0, z: 0, r: 0, k: 0 };
    this.u0 = new Float32Array(N * 4); this.u1 = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) this.ph[i] = i * 2.399;
    this.rebuild();
  }

  rebuild() {
    const c = this.cfg, hsW = this.hsW, hsS = this.hsS, lam = this.lam, lamS = clamp(60 + 40 * hsS, 70, 170);
    const spread = 0.7 + 0.3 * (1 - this.sea01);
    const set = (i, l, dir, amp) => {
      l = Math.max(3.2, l);
      this.dx[i] = Math.cos(dir); this.dz[i] = Math.sin(dir); this.k[i] = TAU / l; this.w[i] = Math.sqrt(G * this.k[i]); this.a[i] = amp;
    };
    for (let i = 0; i < 5; i++) set(i, lam * WS_REL[i], this.dirW + WS_OFF[i] * spread, (hsW / 4) * Math.sqrt(2 * WS_E[i] * 0.82));
    for (let j = 0; j < 2; j++) set(5 + j, lamS * SW_REL[j], this.dirS + SW_OFF[j], (hsS / 4) * Math.sqrt(2 * SW_E[j]));
    set(7, lam * 0.5, this.dirW + 0.9, (hsW / 4) * Math.sqrt(2 * 0.18));
    this.hs = Math.hypot(hsW, hsS);
    this.sea01 = clamp(this.hs / 4, 0, 1);
    const q0 = c.q.calm + (c.q.rough - c.q.calm) * this.sea01;
    let S = 0, maxA = 0;
    for (let i = 0; i < N; i++) { S += this.k[i] * this.a[i]; maxA += this.a[i]; }
    const worst = S * q0 * (1 + this.storm.k), qs = worst > c.maxSteep ? q0 * (c.maxSteep / worst) : q0;
    for (let i = 0; i < N; i++) this.q[i] = qs;
    this.steep = S * qs; this.maxA = maxA;
    for (let i = 0; i < N; i++) {
      this.u0[i * 4] = this.dx[i]; this.u0[i * 4 + 1] = this.dz[i]; this.u0[i * 4 + 2] = this.k[i]; this.u0[i * 4 + 3] = this.ph[i];
      this.u1[i * 4] = this.a[i]; this.u1[i * 4 + 1] = this.q[i]; this.u1[i * 4 + 2] = 0; this.u1[i * 4 + 3] = 0;
    }
  }

  // t: absolute sea time; U: mean wind m/s; dir: direction the wind blows toward
  update(dt, t, U, dir) {
    const c = this.cfg, e = (tau) => 1 - Math.exp(-dt / tau);
    this.U += (U - this.U) * e(20);
    const tHsW = Math.min(c.hs.max, c.hs.base + c.hs.perU2 * this.U * this.U);
    this.hsW += (tHsW - this.hsW) * e(tHsW > this.hsW ? c.tau.windUp : c.tau.windDown);
    this.hsSlow += (this.hsW - this.hsSlow) * e(c.tau.slow);
    const tHsS = c.swell.base + c.swell.frac * this.hsSlow;
    this.hsS += (tHsS - this.hsS) * e(tHsS > this.hsS ? c.tau.swellUp : c.tau.swellDown);
    this.lam += (clamp(c.lambda.perU2 * this.U * this.U, c.lambda.min, c.lambda.max) - this.lam) * e(c.tau.lambda);
    this.dirW += wrapAngle(dir - this.dirW) * e(c.tau.dir);
    this.dirS += wrapAngle(dir + c.swell.offset - this.dirS) * e(c.tau.swellDir);
    const d = t - this.tRef;
    for (let i = 0; i < N; i++) this.ph[i] = (this.ph[i] + this.w[i] * d) % TAU;
    this.tRef = t;
    this.rebuild();
  }

  // jump straight to the equilibrium sea of a wind (tests, teleports, weather snaps)
  settle(U, dir) {
    const c = this.cfg;
    this.U = U; this.hsW = Math.min(c.hs.max, c.hs.base + c.hs.perU2 * U * U); this.hsSlow = this.hsW; this.hsS = c.swell.base + c.swell.frac * this.hsSlow;
    this.lam = clamp(c.lambda.perU2 * U * U, c.lambda.min, c.lambda.max); this.dirW = dir; this.dirS = dir + c.swell.offset;
    this.rebuild();
  }

  // amplitude multiplier of the local squall at x, z
  boost(x, z) {
    const s = this.storm;
    if (s.k <= 0 || s.r <= 0) return 1;
    const d = Math.hypot(x - s.x, z - s.z);
    return 1 + s.k * (1 - smoothstep(0.4 * s.r, s.r, d));
  }

  hsAt(x, z) { return this.hs * this.boost(x, z); }

  // height of the surface above WATER_LEVEL at x, z, d seconds after tRef; fills the up-pointing unit normal when out is given
  sample(x, z, out, d) {
    const A = this.boost(x, z), dx = this.dx, dz = this.dz, k = this.k, w = this.w, a = this.a, q = this.q, ph0 = this.ph;
    let px = x, pz = z, y = 0;
    for (let it = 0; it < 2; it++) {
      y = 0; let ox = 0, oz = 0;
      for (let i = 0; i < N; i++) {
        const ai = a[i] * A, ph = k[i] * (dx[i] * px + dz[i] * pz) - (ph0[i] + w[i] * d), c = Math.cos(ph);
        ox += dx[i] * q[i] * ai * c; oz += dz[i] * q[i] * ai * c; y += ai * Math.sin(ph);
      }
      if (it === 0) { px = x - ox; pz = z - oz; }
    }
    if (out) {
      let nx = 0, nz = 0, ny = 1;
      for (let i = 0; i < N; i++) {
        const ai = a[i] * A, ph = k[i] * (dx[i] * px + dz[i] * pz) - (ph0[i] + w[i] * d);
        nx -= dx[i] * k[i] * ai * Math.cos(ph); nz -= dz[i] * k[i] * ai * Math.cos(ph); ny -= q[i] * k[i] * ai * Math.sin(ph);
      }
      const l = Math.hypot(nx, ny, nz); out.set(nx / l, ny / l, nz / l);
    }
    return WATER_LEVEL + y;
  }

  // water particle velocity at the surface (x, y, z) in out
  velocity(x, z, d, out) {
    const A = this.boost(x, z);
    let vx = 0, vy = 0, vz = 0;
    for (let i = 0; i < N; i++) {
      const ai = this.a[i] * A, ph = this.k[i] * (this.dx[i] * x + this.dz[i] * z) - (this.ph[i] + this.w[i] * d), wa = this.w[i] * ai;
      vx += this.dx[i] * this.q[i] * wa * Math.sin(ph); vz += this.dz[i] * this.q[i] * wa * Math.sin(ph); vy -= wa * Math.cos(ph);
    }
    out.set(vx, vy, vz);
    return out;
  }
}
