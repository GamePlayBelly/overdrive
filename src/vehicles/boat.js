import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { boatGeometry, createBoatMesh } from './boatModel.js';
import { clamp, lerp, smoothstep, wrapAngle } from '../core/math.js';
import { WATER_LEVEL } from '../data/world.js';
import { SURF } from '../world/terrain.js';
import { collide } from '../world/collision.js';

const G = 9.81;
const _n = new THREE.Vector3();

// Hull dynamics: four buoyancy springs riding the exact Gerstner surface (heave, pitch, roll, slams, jumps and landings),
// planing lift and trim, thrust limited by power, quadratic hull drag with a planing hump, keel grip with a slidable stern,
// and stiff seabed contact along the keel so hulls can be beached.
export class BoatPhysics {
  constructor(def, tune = {}, hull = null) {
    this.def = def; this.hull = hull;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
    this.vx = 0; this.vz = 0; this.vy = 0; this.w = 0;
    this.pitch = 0; this.roll = 0; this.pitchV = 0; this.rollV = 0; this.visPitch = 0; this.visRoll = 0;
    this.air = 0; this.onGround = true; this.wheelsDown = 4;
    this.gear = 1; this.rpm = 800; this.shiftT = 0; this.manual = false;
    this.steer = 0; this.steerIn = 0; this.driftMode = false; this.throttle = 0; this.brake = 0; this.hand = 0; this.handK = 0; this.thrIn = 0; this.brkIn = 0;
    this.axF = 0; this.alat = 0; this.slipF = 0; this.slipR = 0; this.spin = 0; this.skid = 0; this.skidF = 0; this.skidR = 0;
    this.wheelRot = 0; this.wheelRotR = 0;
    this.comp = [0, 0, 0, 0]; this.wheelDy = [0, 0, 0, 0]; this.wheelG = [0, 0, 0, 0]; this.wheelN = [0, 0, 0, 0]; this.wheelHit = [true, true, true, true];
    this.surfF = SURF.WATER; this.surfR = SURF.WATER; this.gripF = 1; this.gripR = 1;
    this.health = { engine: 1, steer: 0, brakes: 1 };
    this.assist = 0.6; this.tc = false; this.abs = false; this.engineOn = true; this.cruise = 0; this.limiter = 0;
    this.landing = null; this.bump = 0; this.wet = 0; this.wr = 0.3;
    this.drift = { active: false, angle: 0, chain: 0, chainT: 0, score: 0, best: 0, mult: 1, banked: 0, lastBank: 0, dir: 0 };
    this.boost = 0; this.nitro = 1; this.nitroOn = false;
    this.stat = { distance: 0, air: 0, topSpeed: 0, bestAir: 0, bestJump: 0 };
    this.vyPrev = 0; this.ay = 0; this.slope = 0; this.camber = 0; this.zCG = 0;
    this.sail = null; this.ease = 0; this.sailT = 0; this.sailLuff = 0; this.sailPow = 0; this.tws = 0; this.awa = 0; this.aws = 0; this.motorT = 0;
    this.over = 0; this.windF = 0; this.planing = 0; this.wetN = 4; this.aground = 0; this.slam = 0; this.spray = 0; this.propK = 1; this.buoy = 1; this.leak = 0; this.waveY = 0; this.isBoat = true; this.isBike = false;
    this.retune(tune);
  }

  retune(t = {}) {
    const def = this.def, p = def.perf, b = def.body;
    const lv = (k) => t[k] || 0;
    this.tune = t;
    this.mass = p.mass * (1 - lv('weight') * 0.035);
    this.kw = p.kw * (1 + lv('engine') * 0.07 + lv('turbo') * 0.08);
    this.vmax = p.vmax * (1 + lv('engine') * 0.015 + lv('turbo') * 0.02);
    this.vplane = p.vplane; this.redline = p.redline; this.idle = 800;
    this.L = b.L; this.W = b.W; this.draft = b.draft;
    this.rmax = p.rmax; this.alatMax = p.alat * (1 + lv('tires') * 0.04 + lv('susp') * 0.03);
    this.klat = p.klat * (1 + lv('tires') * 0.04);
    this.heel = p.heel; this.trimMax = p.trim;
    this.Pw = this.kw * 1000 * 0.58;
    this.T0 = this.kw * p.thr * (1 + lv('trans') * 0.03);
    this.k2 = Math.min(this.T0, this.Pw / this.vmax) / (this.vmax * this.vmax);
    this.mu = 0.62;
    this.sail = p.sail || null;
    if (this.sail) this.k2 = this.sail.k2;
    const m = this.mass;
    this.I = (m * (b.L * b.L + b.W * b.W)) / 12 * 1.15;
    this.heelArm = b.H * 0.3;
    this.Ipitch = m * b.L * b.L * 0.12; this.Iroll = m * (b.W * b.W + b.H * b.H * 0.5) * 0.11;
    this.d0 = Math.max(0.12, b.draft * 0.8);
    // heavier hulls are better damped in heave; windage areas of the topsides and the front profile
    this.zeta = 0.34 + 0.2 * smoothstep(800, 12000, m);
    this.sideA = b.L * b.H * 0.3; this.frontA = b.W * b.H * 0.4; this.freeboard = Math.max(0.3, b.H * 0.3);
    const wm = m / 4, k = (wm * G) / this.d0, cc = 2 * this.zeta * Math.sqrt(k * wm);
    const zB = b.L * 0.34, zS = -b.L * 0.34, xw = b.W * (this.sail ? 0.2 : 0.36);
    this.corners = [{ lx: xw, lz: zB }, { lx: -xw, lz: zB }, { lx: xw, lz: zS }, { lx: -xw, lz: zS }].map((c) => ({ ...c, k, cc, F: 0 }));
    const H = this.hull, pts = [];
    for (const tt of [0.04, 0.22, 0.42, 0.62, 0.8, 0.94, 1]) pts.push({ lx: 0, lz: -b.L / 2 + tt * b.L, yk: H ? H.yk(tt) : -b.draft });
    for (const tt of [0.2, 0.6]) for (const s of [1, -1]) { const r = H ? H.ring(tt)[2] : [b.W * 0.4, -b.draft * 0.4]; pts.push({ lx: s * r[0], lz: -b.L / 2 + tt * b.L, yk: r[1] }); }
    if (this.sail) for (const tt of [0.4, 0.58]) pts.push({ lx: 0, lz: -b.L / 2 + tt * b.L, yk: -this.sail.keel });
    this.contacts = pts;
    this.kG = (m * G * 5) / 1; this.cG = 2 * 0.6 * Math.sqrt(this.kG * wm);
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwdSpeed() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }
  get kmh() { return this.speed * 3.6; }
  get lateralSpeed() { return this.vx * -Math.cos(this.yaw) + this.vz * Math.sin(this.yaw); }
  get slipAngle() { return Math.atan2(Math.abs(this.lateralSpeed), Math.max(1, Math.abs(this.fwdSpeed))); }

  place(x, y, z, yaw) {
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    this.vx = this.vz = this.vy = this.w = 0; this.pitch = this.roll = this.pitchV = this.rollV = 0; this.visPitch = this.visRoll = 0;
    this.thrIn = this.brkIn = 0; this.steer = this.steerIn = 0; this.axF = this.alat = 0; this.planing = 0; this.air = 0; this.onGround = true;
    this.landing = null; this.bump = 0; this.vyPrev = 0; this.rpm = this.idle;
  }

  shift() {}

  // env: { sea, terrain, t }
  step(dt, input, env) {
    const sea = env.sea, T = env.terrain, tm = env.t;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), m = this.mass;
    let u = this.vx * sy + this.vz * cy, vl = -this.vx * cy + this.vz * sy;
    const au = Math.abs(u), speed = Math.hypot(u, vl), u0 = u;

    // a sailboat's auxiliary engine starts on throttle and stops again a few seconds after letting go
    if (this.sail) {
      if (!this.engineOn && input.throttle > 0.25) { this.engineOn = true; this.motorT = 6; }
      else if (this.engineOn) { if (input.throttle > 0.05) this.motorT = 6; else if ((this.motorT -= dt) <= 0) this.engineOn = false; }
    }
    const thrT = this.engineOn ? clamp(input.throttle, 0, 1) : 0, brkT = clamp(input.brake, 0, 1);
    this.thrIn += clamp(thrT - this.thrIn, -dt * 6, dt * 3.4);
    this.brkIn += clamp(brkT - this.brkIn, -dt * 8, dt * 6);
    this.handK += clamp((input.hand ? 1 : 0) - this.handK, -dt * 2.6, dt * 8);
    const wantNitro = !!input.boost && this.nitro > 0.02 && this.engineOn && thrT > 0.3;
    this.nitroOn = wantNitro;
    this.boost += ((wantNitro ? 1 : 0) - this.boost) * Math.min(1, dt * (wantNitro ? 6 : 3));
    this.nitro = wantNitro ? Math.max(0, this.nitro - dt * 0.14) : Math.min(1, this.nitro + dt * 0.012);
    this.steerIn += clamp(clamp(-input.steer, -1, 1) - this.steerIn, -dt * 4.5, dt * 4.5);
    this.steer = this.steerIn * 0.5;
    let thr = this.thrIn;
    const brk = this.brkIn;
    if (this.cruise > 0 && input.throttle < 0.05 && brkT < 0.05 && this.engineOn) thr = clamp((this.cruise - u) * 0.35, 0, 0.85);

    // planing state, trim at the hump, roll bias from the turn
    const plTarget = this.vplane > 50 ? 0 : smoothstep(0.6 * this.vplane, 1.3 * this.vplane, au);
    this.planing += (plTarget - this.planing) * Math.min(1, dt * 2.2);
    const plane = this.planing;
    const hump = this.vplane > 50 ? 0 : Math.exp(-(((au - 0.78 * this.vplane) / (0.3 * this.vplane)) ** 2));
    const trim = -(this.trimMax * (hump + plane * 0.3) + clamp(this.axF * 0.01, -0.04, 0.05));
    const ac = u * this.w;
    const rollBias = -this.heel * Math.atan(ac / G) * (0.6 + 0.4 * plane);
    const sp = Math.sin(this.pitch - trim), sr = Math.sin(this.roll - rollBias);

    // sails: lift and drag from the apparent wind, auto-trimmed; the handbrake key eases the sheets
    let sFu = 0, sFl = 0, sMr = 0;
    const SL = this.sail;
    if (SL) {
      const wnd = env.wind || { x: 0, z: 0 };
      const ax = wnd.x - this.vx, az = wnd.z - this.vz;
      const a_u = ax * sy + az * cy, a_l = -ax * cy + az * sy, aws = Math.hypot(a_u, a_l) || 1e-4;
      const beta = Math.atan2(Math.abs(a_l), -a_u), s = a_l < 0 ? 1 : -1;
      this.ease += ((input.hand ? 1 : 0) - this.ease) * Math.min(1, dt * 2.5);
      const trim = clamp(beta - 0.3 + this.ease * 0.9, 0.06, 1.45), alpha = beta - trim;
      const nogo = smoothstep(0.36, 0.66, beta);
      const cl0 = alpha < 0 ? 0 : Math.min(4.6 * alpha, 1.35) - Math.max(0, alpha - 0.32) * 1.7;
      const CL = Math.max(0, cl0) * nogo * (1 - 0.85 * this.ease);
      const sa = Math.sin(Math.min(Math.abs(alpha), 1.57));
      const CD = 0.07 + 0.06 * CL * CL + 0.75 * sa * sa;
      const heelCut = 1 - 0.5 * smoothstep(0.4, 0.75, Math.abs(this.roll));
      const q = 0.5 * 1.225 * aws * aws * SL.area * heelCut * (1 - 0.7 * smoothstep(8, 18, aws));
      const ux = a_u / aws, lx = a_l / aws;
      sFu = q * (-CL * s * lx + CD * ux); sFl = q * (CL * s * ux + CD * lx);
      sMr = sFl * SL.hCE;
      this.tws = Math.hypot(wnd.x, wnd.z); this.aws = aws; this.awa = beta * s;
      this.sailT = -s * trim;
      this.sailLuff = clamp(1 - smoothstep(0.03, 0.2, alpha) * nogo + 0.8 * this.ease, 0, 1);
      this.sailPow = clamp(Math.hypot(sFu, sFl) / (m * 3), 0, 1);
    }

    // buoyancy springs on the live wave surface
    let Fw = 0, Tp = 0, Tr = 0, wetN = 0, over = -1;
    const cs = this.corners, lift = this.d0 * (1 + 0.5 * plane);
    for (let i = 0; i < 4; i++) {
      const c = cs[i];
      const wx = this.x + sy * c.lz + cy * c.lx, wz = this.z + cy * c.lz - sy * c.lx;
      const h = sea.waveAt(wx, wz, null, tm);
      const bodyY = this.y - c.lz * sp + c.lx * sr;
      const vAt = this.vy - this.pitchV * c.lz + this.rollV * c.lx;
      const comp = h + lift - bodyY;
      let F = 0;
      if (comp > 0) {
        const slam = vAt < -1.2 ? 1 + 0.22 * (-vAt - 1.2) : 1;
        F = Math.max(0, c.k * comp + (vAt < 0 ? c.cc * -vAt * slam : c.cc * 0.55 * -vAt));
        wetN++;
      }
      over = Math.max(over, comp - this.d0 - this.freeboard * 0.6);
      c.F = F; c.h = h; this.comp[i] = clamp(comp, 0, 2); this.wheelHit[i] = comp > 0;
      Fw += F; Tp += -F * c.lz; Tr += F * c.lx;
    }
    Fw *= this.buoy; Tp *= this.buoy; Tr *= this.buoy;
    if (sea.waves) over = Math.max(over, sea.waves.hsAt(this.x, this.z) * 0.5 - this.freeboard * 1.8);
    this.over = over;
    // windage on the topsides and the front profile
    let wFu = 0, wFl = 0;
    const wd = env.wind;
    if (wd) {
      const rx = wd.x - this.vx, rz = wd.z - this.vz, ru = rx * sy + rz * cy, rl = -rx * cy + rz * sy, rs = Math.hypot(ru, rl);
      wFu = 0.5 * 1.225 * 0.6 * this.frontA * rs * ru; wFl = 0.5 * 1.225 * 1.0 * this.sideA * rs * rl;
      Tr += wFl * this.heelArm;
      this.windF = Math.hypot(wFu, wFl);
    }
    if (SL) { Tr += sMr - SL.gm * m * G * Math.sin(this.roll); this.rollV *= 1 - Math.min(0.5, dt * 1.6); }

    // seabed / shore contact along the keel
    let Fg = 0, Fgx = 0, Fgz = 0;
    for (const c of this.contacts) {
      const wx = this.x + sy * c.lz + cy * c.lx, wz = this.z + cy * c.lz - sy * c.lx;
      const gh = T.height(wx, wz);
      const bodyY = this.y - c.lz * sp + c.lx * sr;
      const pen = gh - (bodyY + c.yk);
      if (pen <= 0) continue;
      const vAt = this.vy - this.pitchV * c.lz + this.rollV * c.lx;
      const F = Math.min(this.kG * Math.min(pen, 0.3) + (vAt < 0 ? this.cG * -vAt : 0), m * G * 1.6);
      Fg += F; Tp += -F * c.lz; Tr += F * c.lx;
      const gx = (T.height(wx + 1, wz) - T.height(wx - 1, wz)) * 0.5, gz = (T.height(wx, wz + 1) - T.height(wx, wz - 1)) * 0.5;
      Fgx -= F * clamp(gx, -2, 2); Fgz -= F * clamp(gz, -2, 2);
    }
    this.wetN = wetN; this.aground = Fg > m * G * 0.04 ? 1 : 0;

    // vertical integration
    const vyBefore = this.vy;
    const ay = (Fw + Fg) / m - G;
    this.vy += ay * dt; this.y += this.vy * dt;
    this.pitchV += (Tp / this.Ipitch) * dt; this.rollV += (Tr / this.Iroll) * dt;
    this.pitchV *= 1 - Math.min(0.9, dt * 0.9); this.rollV *= 1 - Math.min(0.9, dt * 1.1);
    this.pitchV = clamp(this.pitchV, -5, 5); this.rollV = clamp(this.rollV, -5, 5);
    this.pitch = clamp(this.pitch + this.pitchV * dt, -0.6, 0.6); this.roll = clamp(this.roll + this.rollV * dt, -0.9, 0.9);

    // forward force: prop thrust, reverse/braking thrust, hull drag, wave slope, keel grip
    const contact = wetN > 0 || Fg > 0;
    const sternN = cs[2], sternM = cs[3];
    const sx = this.x - sy * this.L * 0.4, sz = this.z - cy * this.L * 0.4;
    const depthS = (sternN.h + sternM.h) * 0.5 - T.height(sx, sz);
    this.propK = Math.max(0.3, smoothstep(0.05, 0.4, depthS)) * smoothstep(0, 2, wetN + 0.01);
    const Tfull = Math.min(this.T0, this.Pw / Math.max(au, 1.8)) * (1 + this.boost * 0.55) * this.health.engine;
    let Fl = 0;
    if (this.engineOn && contact) {
      if (u > 0.9 || (thr > 0.05 && brk < 0.05)) {
        Fl += Tfull * thr * this.propK;
        if (brk > 0.05 && u > 0.9) Fl -= Math.min(this.T0 * 0.55, m * 4.5) * brk * this.propK;
      } else if (brk > 0.05) Fl -= this.T0 * 0.5 * brk * this.propK * (u > -this.vmax * 0.3 ? 1 : 0.15);
    }
    const dragK = this.k2 * (1 + 0.45 * hump) * (1 - 0.06 * plane);
    let D = dragK * u * au + 24 * u;
    if (wetN < 2) D *= 0.12;
    const wv = wetN > 0 ? wetN / 4 : 0;
    sea.waveAt(this.x, this.z, _n, tm);
    const slx = _n.x * G * 0.7 * wv, slz = _n.z * G * 0.7 * wv;
    if (SL) D += SL.wall * Math.max(0, au - SL.hull) ** 2;
    u += ((Fl - D + sFu + wFu) / m + slx * sy + slz * cy) * dt;
    vl += ((sFl + wFl) / m + slx * -cy + slz * sy) * dt;
    if (Fg > 0) {
      const s2 = Math.hypot(u, vl);
      if (s2 > 1e-4) { const dv = Math.min(s2, (this.mu * Fg) / m * dt); u -= (u / s2) * dv; vl -= (vl / s2) * dv; }
      u += ((Fgx * sy + Fgz * cy) / m) * dt; vl += ((Fgx * -cy + Fgz * sy) / m) * dt;
    }
    if (contact) {
      const hs = this.handK * smoothstep(4, 10, speed);
      vl *= Math.exp(-this.klat * lerp(1, 0.5, plane) * (1 - 0.82 * hs) * dt);
    }

    // yaw: rudder / outboard / jet authority needs flow over it (boat speed or prop wash)
    if (contact) {
      const flow = Math.max(this.sail ? 0.4 : 0, smoothstep(0, 1, (au + 3.2 * thr * this.propK) / 2.6));
      const rmax = Math.min(this.rmax, this.alatMax / Math.max(au, 2));
      const rT = this.steerIn * rmax * flow * (u >= -0.4 ? 1 : -1) * (1 + 0.45 * this.handK * smoothstep(5, 10, speed));
      const kr = (4.2 / (1 + m / 4500)) * (1 + 0.6 * this.handK), accMax = 7 / (1 + m / 4000);
      const betaNow = u > 0.5 ? Math.atan2(vl, u) : 0;
      if (this.driftMode) {
        // handbrake slide: the steering picks the slip angle, throttle widens it, the keel pulls it back when released
        const bmax = (0.3 + 0.32 * thr) * smoothstep(5, 11, au);
        this.w += clamp(9 * (this.steerIn * bmax - betaNow) - 3.2 * this.w, -accMax * 2.2, accMax * 2.2) * dt;
      } else {
        this.w += clamp((rT - this.w) * kr - betaNow * 1.2 * (0.3 + 0.7 * plane), -accMax, accMax) * dt;
      }
      if (Fg > 0) this.w *= 1 - Math.min(1, dt * 2.5);
    } else this.w *= 1 - dt * 0.05;

    this.vx = u * sy - vl * cy; this.vz = u * cy + vl * sy;
    this.yaw = wrapAngle(this.yaw + this.w * dt);
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.axF += ((u - u0) / Math.max(dt, 1e-4) - this.axF) * Math.min(1, dt * 8);
    this.alat += (ac - this.alat) * Math.min(1, dt * 6);

    // engine, gear indicator
    const rT = this.engineOn ? this.idle + (this.redline - this.idle) * clamp((0.1 + 0.9 * thr * (0.5 + 0.5 * clamp(au / this.vmax, 0, 1)) + 0.12 * brk) * (wetN < 2 ? 1.3 : 1), 0, 1.05) : 0;
    this.rpm += (rT - this.rpm) * Math.min(1, dt * 7);
    this.limiter = this.rpm > this.redline * 0.985 ? 1 : 0;
    this.gear = u < -0.3 || (brk > 0.1 && u < 0.9 && thr < 0.05) ? -1 : 1;
    this.throttle = thr; this.brake = brk; this.hand = this.handK;
    this.wheelRot += (u / 0.3) * dt; this.wheelRotR = this.wheelRot;

    // air time, landings, slams
    const wasAir = !this.onGround;
    this.onGround = contact;
    if (!contact) { this.air += dt; this.stat.air += dt; }
    else {
      if (wasAir && this.air > 0.15) {
        const impact = Math.max(0, -vyBefore);
        this.landing = { speed: impact, air: this.air, x: this.x, y: this.y, z: this.z, hard: impact > 4 };
        this.stat.bestAir = Math.max(this.stat.bestAir, this.air);
        this.bump = Math.max(this.bump, impact);
      }
      this.air = 0;
    }
    const dv = this.vy - this.vyPrev;
    if (contact && Math.abs(dv) > 1.3) { this.bump = Math.max(this.bump, Math.abs(dv) * 0.6); this.slam = Math.max(this.slam, Math.abs(dv)); }
    this.slam *= Math.max(0, 1 - dt * 3);
    this.vyPrev = this.vy;
    this.spray = wetN > 0 ? clamp((Math.abs(this.pitchV) * 0.5 + Math.abs(dv) * 0.6) * smoothstep(3, 14, au), 0, 2) : 0;
    const beta = u > 0.5 ? Math.atan2(vl, u) : 0;
    this.skid = clamp(Math.abs(vl) * 0.12, 0, 1) * plane; this.skidR = this.skid; this.driftMode = this.handK > 0.3 && au > 6;
    this.updateDrift(dt, speed, beta);
    this.stat.distance += speed * dt; this.stat.topSpeed = Math.max(this.stat.topSpeed, speed);
    this.visPitch = this.pitch; this.visRoll = this.roll;
    // stability guard: a bad step is rolled back instead of propagating
    const gd = this._good;
    if (!Number.isFinite(this.x + this.y + this.z + this.vx + this.vz + this.vy + this.pitch + this.roll + this.w) || Math.abs(this.vy) > 40 || speed > 90) {
      if (gd) Object.assign(this, gd); else { this.vx = this.vz = this.vy = this.w = 0; }
      this.pitchV = this.rollV = 0;
    } else this._good = { x: this.x, y: this.y, z: this.z, yaw: this.yaw, vx: this.vx, vz: this.vz, vy: this.vy, pitch: this.pitch, roll: this.roll, w: this.w };
  }

  updateDrift(dt, speed, beta) {
    const d = this.drift, sl = Math.abs(beta);
    const sliding = this.onGround && speed > 7 && sl > 0.2 && (this.handK > 0.2 || sl > 0.34);
    if (sliding) {
      d.active = true; d.angle = sl; d.dir = Math.sign(beta); d.chainT = 1.4;
      const gain = speed * sl * 9 * dt * d.mult;
      d.chain += gain; d.score += gain;
      d.mult = Math.min(5, 1 + Math.floor(d.chain / 1500) * 0.5);
    } else {
      d.active = false;
      d.chainT -= dt;
      if (d.chainT <= 0 && d.chain > 0) { d.banked = Math.round(d.chain); d.lastBank = d.banked; d.best = Math.max(d.best, d.chain); d.chain = 0; d.mult = 1; d.chainT = 0; }
    }
  }
}

export class Boat extends Vehicle {
  constructor(game, def, custom = {}, opts = {}) {
    super(game, def, custom, { ...opts, deformable: false });
    this.isBoat = true;
    this.rig = this.car.rig;
    this.prop = 0;
    this.leak = 0;
    this.moor = null;
    this.sailA = 0; this.sailL = 1; this.hoist = 0;
  }

  makeCar(def, custom) { return createBoatMesh(def, custom); }
  makePhys(def, custom) { return new BoatPhysics(def, custom.perf || {}, boatGeometry(def).boat.F); }

  place(x, y, z, yaw) {
    const sea = this.world.sea;
    this.phys.place(x, sea ? sea.waveAt(x, z) : WATER_LEVEL, z, yaw);
    this.sync(0);
  }

  get eye() { return this.car.geo.eye; }

  outline() { return this.car.geo.outline; }

  stepPhysics(dt, input, env) {
    const p = this.phys, sea = this.world.sea;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    const e = { sea, terrain: this.world.terrain, t: sea.t, wind: this.game.sky?.wind };
    const mo = this.moor;
    if (mo && !this.driver && !this.sunk) {
      // an unattended boat rides on its mooring line
      p.vx += ((mo.x - p.x) * 2.2 - p.vx * 2.6) * dt;
      p.vz += ((mo.z - p.z) * 2.2 - p.vz * 2.6) * dt;
      p.w += (wrapAngle(mo.yaw - p.yaw) * 1.4 - p.w * 2.2) * dt;
    }
    for (let i = 0; i < steps; i++) {
      e.t = sea.t + (i + 1) * h;
      p.step(h, input, e);
      this.collideStatic(h);
    }
    // waves breaking over the side swamp the hull; it bails itself slowly when the sea eases
    if (p.over > 0.02) this.swamp = Math.min(1.1, (this.swamp || 0) + dt * 0.004 * Math.min(2, p.over));
    else this.swamp = Math.max(0, (this.swamp || 0) - dt * 0.012);
    if (this.swamp > 0.02) {
      p.buoy = Math.max(0.2, (1 - this.leak * 0.8) * (1 - 0.45 * this.swamp));
      if (this.swamp > 1 && !this.sunk) { this.sunk = true; this.disabled = true; this.events.push({ type: 'sunk' }); }
    }
    // a leaking hull loses buoyancy and finally goes down
    if (this.leak > 0.02) {
      p.buoy = Math.max(0.2, (1 - this.leak * 0.8) * (1 - 0.45 * (this.swamp || 0)));
      this.leak = Math.min(1.2, this.leak + dt * 0.004 * (1 + p.speed * 0.05));
      if (this.leak > 1 && !this.sunk) { this.sunk = true; this.disabled = true; this.events.push({ type: 'sunk' }); }
    }
  }

  dispose() { super.dispose(); this.rig?.sailMat?.dispose?.(); }

  checkWater() {}

  collideStatic(dt) {
    const p = this.phys;
    const R = Math.hypot(this.hx, this.hz) + 0.5;
    this.world.colliders.query(p.x, p.z, R, p.y - p.draft, p.y + this.dims.H * 0.9, (c) => {
      const hit = collide(this.obb(), c);
      if (!hit) return;
      if (!c.solid && c.kind !== 'prop') return;
      if (c.kind === 'prop' && c.ref) { const handled = this.game.onPropHit?.(this, c.ref, hit); if (handled) return; }
      this.resolve(hit, c, Infinity, null);
    });
  }

  applyDamage(px, pz, impact) {
    const amt = clamp((impact - 2.4) * 0.012, 0, 0.3) * (this.game.damageScale ?? 1);
    if (amt <= 0) return;
    const d = this.damage, p = this.phys;
    d.total = Math.min(1, d.total + amt);
    p.health.engine = clamp(1 - d.total * 0.45, 0.35, 1);
    if (impact > 7) this.leak = Math.min(1.2, this.leak + amt * 0.5);
    if (d.total >= 0.999 && !this.disabled) { this.disabled = true; this.events.push({ type: 'disabled' }); }
  }

  repair() {
    Object.assign(this.damage, { total: 0, front: 0, rear: 0, left: 0, right: 0, headL: false, headR: false, tailL: false, tailR: false, glass: 0 });
    this.phys.health = { engine: 1, steer: 0, brakes: 1 };
    this.disabled = false; this.sunk = false; this.leak = 0; this.swamp = 0; this.phys.buoy = 1;
  }

  sync(dt) {
    const p = this.phys, g = this.group, R = this.rig;
    g.position.set(p.x, p.y, p.z);
    g.rotation.set(p.visPitch, p.yaw, p.visRoll);
    if (R.wheel) R.wheel.rotation.z = -p.steerIn * 2.6;
    if (R.engine) R.engine.rotation.y = -p.steerIn * 0.5;
    if (R.nozzle) R.nozzle.rotation.y = -p.steerIn * 0.45;
    if (R.prop) { this.prop += dt * (p.rpm / 60) * 6.283 * 0.06; R.prop.rotation.z = this.prop; }
    if (R.radar) R.radar.rotation.y += dt * 2.4;
    if (R.tiller) R.tiller.rotation.y = -p.steerIn * 0.5;
    if (R.sails) {
      const S = R.sails, k = dt > 0 ? 1 - Math.exp(-Math.min(dt, 0.1) * 3.2) : 1, kl = dt > 0 ? 1 - Math.exp(-Math.min(dt, 0.1) * 6) : 1;
      this.sailA += (p.sailT - this.sailA) * k; this.sailL += (p.sailLuff - this.sailL) * kl;
      const a = this.sailA, U = R.sailMat.userData.sail;
      // sails come up when someone sails the boat and are furled while it sits at its berth
      const want = this.driver || this.ai || p.speed > 1.5 ? 1 : 0;
      this.hoist = dt > 0 ? this.hoist + Math.max(-dt * 0.8, Math.min(dt * 0.45, want - this.hoist)) : want;
      for (const m of S.meshes) { m.visible = this.hoist > 0.03; m.scale.y = Math.max(0.02, this.hoist); }
      S.main.rotation.y = a; S.hinge.quaternion.setFromAxisAngle(S.axis, a * 0.84);
      U.uCamber.value = -(a < 0 ? -1 : 1) * 0.5 * (1 - this.sailL) * (this.def.body.L / 9.4) ** 0.5;
      U.uFlutter.value = this.sailL; U.uTime.value = this.world.sea.t;
    }
  }
}
