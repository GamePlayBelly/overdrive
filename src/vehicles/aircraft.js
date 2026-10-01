import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { createAircraftMesh } from './aircraftModel.js';
import { clamp, smoothstep } from '../core/math.js';
import { WATER_LEVEL } from '../data/world.js';
import { SURF } from '../world/terrain.js';
import { collide } from '../world/collision.js';

const G = 9.81;
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3();

// Arcade flight model: airspeed-scaled control authority, lift from angle of attack with a stall, banked turns, nose-wheel steering and a ground roll.
// Helicopters hover on collective thrust along the rotor axis and tilt the disc with the cyclic.
export class AirPhysics {
  constructor(def, tune = {}) {
    this.def = def; this.kind = def.air; this.isAir = true;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.w = 0;
    this.pitch = 0; this.roll = 0; this.visPitch = 0; this.visRoll = 0; this.thr = 0; this.rotorK = 0;
    this.air = 0; this.airT = 0; this.onGround = true; this.wheelsDown = 4; this.agl = 0; this.stalled = 0; this.crash = 0;
    this.gear = 1; this.rpm = 0; this.shiftT = 0; this.manual = false;
    this.steer = 0; this.steerIn = 0; this.driftMode = false; this.throttle = 0; this.brake = 0; this.hand = 0; this.handK = 0; this.thrIn = 0; this.brkIn = 0;
    this.axF = 0; this.alat = 0; this.slipF = 0; this.slipR = 0; this.spin = 0; this.skid = 0; this.skidF = 0; this.skidR = 0;
    this.wheelRot = 0; this.wheelRotR = 0; this.wheelDy = [0, 0, 0, 0]; this.wheelHit = [true, true, true, true]; this.wheelG = [0, 0, 0, 0]; this.wheelN = [0, 0, 0, 0]; this.comp = [0, 0, 0, 0];
    this.surfF = SURF.ASPHALT; this.surfR = SURF.ASPHALT; this.gripF = 1; this.gripR = 1;
    this.health = { engine: 1, steer: 0, brakes: 1 };
    this.assist = 0.6; this.tc = false; this.abs = false; this.engineOn = false; this.cruise = 0; this.limiter = 0;
    this.landing = null; this.bump = 0; this.wet = 0; this.wr = 0.3;
    this.drift = { active: false, angle: 0, chain: 0, chainT: 0, score: 0, best: 0, mult: 1, banked: 0, lastBank: 0, dir: 0 };
    this.boost = 0; this.nitro = 1; this.nitroOn = false;
    this.stat = { distance: 0, air: 0, topSpeed: 0, bestAir: 0, bestJump: 0 };
    this.vyPrev = 0; this.ay = 0; this.slope = 0; this.camber = 0; this.zCG = 0; this.isBike = false; this.isBoat = false;
    this.retune(tune);
  }

  retune(t = {}) {
    const p = this.def.perf;
    this.tune = t;
    this.mass = p.mass * (1 - (t.weight || 0) * 0.03);
    this.vmax = p.vmax * (1 + (t.engine || 0) * 0.015);
    this.T0 = p.T0 * (1 + (t.engine || 0) * 0.06 + (t.turbo || 0) * 0.05);
    this.redline = p.redline; this.idle = p.redline * 0.25; this.S = p.S;
    this.I = this.mass * 4;
  }

  get speed() { return Math.hypot(this.vx, this.vy, this.vz); }
  get fwdSpeed() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }
  get kmh() { return this.speed * 3.6; }
  get lateralSpeed() { return 0; }
  get slipAngle() { return 0; }

  place(x, y, z, yaw) {
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    this.vx = this.vy = this.vz = this.w = 0; this.pitch = this.roll = this.visPitch = this.visRoll = 0; this.thr = 0; this.rotorK = 0;
    this.onGround = true; this.landing = null; this.bump = 0; this.crash = 0; this.airT = 0;
  }

  shift() {}

  basis() {
    _e.set(-this.pitch, this.yaw, this.roll, 'YXZ'); _q.setFromEuler(_e);
    _f.set(0, 0, 1).applyQuaternion(_q); _u.set(0, 1, 0).applyQuaternion(_q);
  }

  step(dt, inp, ground, world) {
    const heli = this.kind === 'heli', jet = this.kind === 'jet', pf = this.def.perf, m = this.mass;
    const on = this.engineOn;
    this.thr = clamp(this.thr + (inp.thrDelta || 0) * dt * (heli ? 0.55 : 0.5), 0, 1);
    if (!heli && inp.throttle > 0.01 && !inp.thrDelta) this.thr = Math.max(this.thr, inp.throttle);
    this.rotorK += ((on ? 1 : 0) - this.rotorK) * Math.min(1, dt * (on ? 0.35 : 0.12));
    const pitchIn = inp.pitch || 0, rollIn = inp.roll || 0, yawIn = inp.yawIn || 0;
    let V = this.speed;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const g = ground(this.x, this.z, this.y + 4);
    let gy = g.y; if (world && world.isWater(this.x, this.z, this.y)) gy = Math.max(gy, WATER_LEVEL);
    this.agl = this.y - gy;
    const dens = clamp(1 - Math.max(0, this.y) / 3600, 0.45, 1);
    this.surfR = this.surfF = g.surf ?? SURF.ASPHALT;
    this.basis();
    let ax = 0, ay = -G, az = 0;
    if (heli) {
      const ctl = this.rotorK;
      const pt = pitchIn * 0.42, rt = rollIn * 0.42;
      this.pitch += (pt - this.pitch) * Math.min(1, dt * 2.4); this.roll += (rt - this.roll) * Math.min(1, dt * 2.4);
      if (this.onGround) { this.pitch *= 1 - Math.min(1, dt * 4); this.roll *= 1 - Math.min(1, dt * 4); }
      const lift = (G * (0.25 + 1.5 * this.thr)) * ctl * ctl * dens;
      this.basis();
      ax += _u.x * lift; ay += _u.y * lift; az += _u.z * lift;
      this.w += ((-yawIn * 1.15 * (ctl > 0.5 ? 1 : 0)) - this.w) * Math.min(1, dt * 3);
      const hv = Math.hypot(this.vx, this.vz);
      const dr = 0.22 + hv * 0.012;
      ax -= this.vx * dr; az -= this.vz * dr; ay -= this.vy * (0.5 + Math.abs(this.vy) * 0.03);
      this.thrIn = this.thr;
    } else {
      const stallV = pf.vstall;
      const ctl = clamp(V / (stallV * 0.8), 0, 1) ** 1.2;
      const fwd = this.vx * _f.x + this.vy * _f.y + this.vz * _f.z;
      const q = 0.5 * 1.2 * dens * V * V;
      const gamma = V > 4 ? Math.atan2(this.vy, Math.hypot(this.vx, this.vz)) : this.pitch;
      const alpha = this.pitch - gamma;
      const aMax = 0.27;
      let CL = clamp(alpha * 7, -0.9, 1.5);
      this.stalled += (((alpha > aMax || (V < stallV * 0.9 && !this.onGround)) ? 1 : 0) - this.stalled) * Math.min(1, dt * 3);
      CL *= 1 - this.stalled * 0.65;
      const L = q * this.S * CL;
      // control
      if (this.onGround) {
        const canRotate = fwd > pf.vr * 0.88;
        if (canRotate) this.pitch = clamp(this.pitch + pitchIn * 0.85 * dt, -0.04, 0.42); else this.pitch += (0 - this.pitch) * Math.min(1, dt * 3);
        this.roll += (0 - this.roll) * Math.min(1, dt * 5);
      } else {
        this.pitch += pitchIn * 1.05 * ctl * dt + this.stalled * -0.9 * dt;
        if (!pitchIn) this.pitch += (gamma + 0.045 - this.pitch) * Math.min(1, dt * 0.7) * ctl;
        this.roll += rollIn * 1.7 * ctl * dt;
        if (!rollIn) this.roll -= this.roll * Math.min(1, dt * 0.45);
      }
      this.pitch = clamp(this.pitch, -1.2, 1.2); this.roll = clamp(this.roll, -1.4, 1.4);
      if (this.onGround) this.w += ((-((rollIn + yawIn) * 0.55) * clamp(fwd / 7, 0, 1) / (1 + fwd * 0.02)) - this.w) * Math.min(1, dt * 6);
      else this.w = -(G * Math.tan(this.roll) / Math.max(V, 18)) * Math.cos(this.pitch) - yawIn * 0.4 * ctl;
      this.basis();
      const thrust = on ? this.thr * this.T0 * dens * (jet ? clamp(1.12 - V / (this.vmax * 1.05), 0.12, 1) : clamp(1.15 - V / (this.vmax * 1.12), 0.1, 1)) : 0;
      let lx = _u.x, ly = _u.y, lz = _u.z;
      if (V > 2) { const vx = this.vx / V, vy = this.vy / V, vz = this.vz / V, d = lx * vx + ly * vy + lz * vz; lx -= vx * d; ly -= vy * d; lz -= vz * d; const l = Math.hypot(lx, ly, lz) || 1; lx /= l; ly /= l; lz /= l; }
      ax += (_f.x * thrust + lx * L) / m; ay += (_f.y * thrust + ly * L) / m; az += (_f.z * thrust + lz * L) / m;
      const CD = 0.026 + 0.045 * CL * CL + (this.onGround ? 0.01 : 0) + this.stalled * 0.12;
      if (V > 0.1) { const D = q * this.S * CD / m; ax -= (this.vx / V) * D; ay -= (this.vy / V) * D; az -= (this.vz / V) * D; }
      this.thrIn = this.thr; this.dbg = { L, thrust, CL, alpha, gamma, q };
    }
    this.yaw += this.w * dt;
    this.vx += ax * dt; this.vy += ay * dt; this.vz += az * dt;
    if (!heli && !this.onGround) {
      // cross-flow damping stands in for the fin and the side force: velocity follows the nose
      this.basis();
      const vf = this.vx * _f.x + this.vy * _f.y + this.vz * _f.z;
      const rx = this.vx - _f.x * vf, ry = this.vy - _f.y * vf, rz = this.vz - _f.z * vf, k = Math.exp(-dt * (0.9 + V * 0.025));
      const keepY = ry + 0; // gravity already pulls the sink rate; lift is what fights it
      this.vx = _f.x * vf + rx * k; this.vy = _f.y * vf + keepY * Math.exp(-dt * (0.25 + V * 0.012)); this.vz = _f.z * vf + rz * k;
    }
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    // ground
    const wasGround = this.onGround;
    const clear = heli ? 0.02 : 0.0;
    if (this.y <= gy + clear) {
      const sink = -this.vy;
      if (!wasGround && sink > 0.5) {
        const hard = sink > (heli ? 3.2 : 3.4);
        this.landing = { air: this.airT, speed: Math.max(sink, this.speed * 0.3), hard, x: this.x, y: gy, z: this.z };
        this.bump = Math.max(this.bump, sink);
        if (sink > (heli ? 6 : 8.5) || (!heli && this.pitch < -0.35 && V > 22) || (Math.abs(this.roll) > 0.6 && V > 18)) this.crash = Math.max(this.crash, sink + V * 0.25);
      }
      this.airT = 0;
      this.y = gy + clear; if (this.vy < 0) this.vy = 0;
      this.onGround = true;
      const fy = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      let fwdG = this.vx * fy + this.vz * fz;
      const water = this.surfR === SURF.WATER || (world && world.isWater(this.x, this.z, this.y) && gy <= WATER_LEVEL + 0.05);
      fwdG -= Math.sign(fwdG) * Math.min(Math.abs(fwdG), (water ? 2.5 : 0.35) * dt);
      if (inp.hand || inp.brake > 0.3) fwdG -= Math.sign(fwdG) * Math.min(Math.abs(fwdG), (heli ? 4 : 7) * dt);
      if (heli) { this.vx *= 1 - Math.min(1, dt * 1.5); this.vz *= 1 - Math.min(1, dt * 1.5); this.vx += (fy * fwdG - this.vx) * 0.0; }
      else { this.vx = fy * fwdG; this.vz = fz * fwdG; }
      this.wheelRot += (fwdG / 0.3) * dt;
    } else {
      this.onGround = false; this.airT += dt;
      this.stat.air = this.airT;
    }
    this.stat.topSpeed = Math.max(this.stat.topSpeed, this.speed);
    this.rpm = this.engineOn ? (heli ? this.redline * (0.15 + 0.85 * this.rotorK) : this.idle + (this.redline - this.idle) * (0.12 + 0.88 * this.thr)) : 0;
    this.throttle = this.thr; this.brake = inp.hand ? 1 : 0;
    this.visPitch = -this.pitch; this.visRoll = this.roll;
    this.vyPrev = this.vy;
  }
}

export class Aircraft extends Vehicle {
  constructor(game, def, custom = {}, opts = {}) {
    super(game, def, custom, { ...opts, deformable: false });
    this.isAir = true;
    this.rig = this.car.rig;
    this.spinA = 0;
  }

  makeCar(def, custom) { return createAircraftMesh(def, custom); }
  makePhys(def, custom) { return new AirPhysics(def, custom.perf || {}); }

  place(x, y, z, yaw) { this.phys.place(x, y, z, yaw); this.sync(0); }
  outline() { return this.car.geo.outline; }
  get eye() { return this.car.geo.eye; }
  checkWater() {}

  stepPhysics(dt, input, env) {
    const p = this.phys;
    p.engineOn = !!this.driver && !this.disabled;
    const steps = Math.max(1, Math.ceil(dt / (1 / 90))), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      p.step(h, this.disabled ? { thrDelta: -1 } : input, env.ground, this.world);
      this.collideStatic(h);
    }
    if (p.crash > 0) {
      const imp = p.crash; p.crash = 0;
      this.damage.total = 1; this.disabled = true;
      this.events.push({ type: 'crash', impact: imp * 2.5, x: p.x, y: p.y + 1, z: p.z, kind: 'ground', mat: 'metal' });
      p.vx *= 0.2; p.vz *= 0.2;
    }
  }

  collideStatic() {
    const p = this.phys, R = Math.hypot(this.hx, this.hz) + 1.5;
    this.world.colliders.query(p.x, p.z, R, p.y + 0.1, p.y + this.dims.H, (c) => {
      const hit = collide(this.obb(), c);
      if (!hit) return;
      if (!c.solid && c.kind !== 'prop') return;
      if (c.kind === 'prop' && c.ref) { const handled = this.game.onPropHit?.(this, c.ref, hit); if (handled) return; }
      this.resolve(hit, c, Infinity, null);
    });
  }

  applyDamage(px, pz, impact) {
    const amt = clamp((impact - 4) * 0.03, 0, 0.6) * (this.game.damageScale ?? 1);
    if (amt <= 0) return;
    const d = this.damage;
    d.total = Math.min(1, d.total + amt);
    if (d.total >= 0.999 && !this.disabled) { this.disabled = true; this.events.push({ type: 'disabled' }); }
  }

  repair() {
    Object.assign(this.damage, { total: 0, front: 0, rear: 0, left: 0, right: 0, headL: false, headR: false, tailL: false, tailR: false, glass: 0 });
    this.disabled = false; this.phys.crash = 0;
  }

  sync(dt) {
    const p = this.phys, g = this.group, R = this.rig;
    g.position.set(p.x, p.y, p.z);
    g.rotation.set(p.visPitch, p.yaw, p.visRoll);
    for (const w of R.wheels || []) w.rotation.x = p.wheelRot;
    if (R.prop) { this.spinA += dt * (p.rpm / 60) * 6.283 * 0.5; R.prop.rotation.z = this.spinA; }
    if (R.rotor) { this.spinA += dt * 30 * p.rotorK; R.rotor.rotation.y = this.spinA; if (R.tailRotor) R.tailRotor.rotation.x = this.spinA * 1.6; }
  }
}
void smoothstep; void _v;
