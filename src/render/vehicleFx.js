import * as THREE from 'three';
import { Particles } from './particles.js';
import { SkidMarks } from './skidMarks.js';
import { SURF } from '../world/terrain.js';

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _a = { x: 0, z: 0 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;
const LOOSE = new Set([SURF.GRASS, SURF.DIRT, SURF.GRAVEL, SURF.SAND, SURF.FIELD]);

// Tire smoke, dust, skid marks, exhaust, nitro flames, sparks and landing bursts for player-driven vehicles.
export class VehicleFx {
  constructor(game) {
    this.g = game;
    this.pt = new Particles(game.scene, 3600);
    this.marks = new SkidMarks(game.scene, 3200);
    this.acc = new Map();
    game.on('vehicle:crash', (e) => this.sparks(e));
    game.on('vehicle:landing', (e) => this.landing(e));
    game.on('vehicle:bump', (e) => { if (e.v.isBoat && e.impact > 2.2) this.slam(e.v, e.impact); });
    game.on('player:splash', (e) => this.splash(e.x, e.y, e.z, e.speed));
    this.enabled = true;
  }

  rate(key, perSec, dt) {
    let a = (this.acc.get(key) || 0) + perSec * dt;
    const n = Math.floor(a); a -= n; this.acc.set(key, a);
    return n;
  }

  update(dt) {
    const g = this.g, sky = g.sky;
    if (this.enabled) for (const v of g.vehicles) { if (v.group.visible && (v.speed > 0.3 || v.phys.spin > 0.05 || v.phys.nitroOn || v.phys.engineOn)) this.vehicle(v, dt); }
    const light = 0.28 + 0.72 * (1 - sky.night) * (0.6 + 0.4 * sky.w.sun);
    const P = g.player;
    if (P.state === 'swim' && g.wake) this.swimmer(P, dt);
    this.pt.update(dt, light);
    this.marks.flush();
  }

  vehicle(v, dt) {
    if (v.isBoat) return this.boat(v, dt);
    if (v.isAir) return;
    const g = this.g, p = v.phys, world = g.world;
    const speed = p.speed;
    v.group.updateMatrixWorld();
    const wheels = v.car.wheels;
    const surf = p.surfR;
    const loose = LOOSE.has(surf);
    const wet = g.sky.wetness;
    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i];
      w.pivot.getWorldPosition(_p);
      const gy = world.groundY(_p.x, _p.z, _p.y + 0.5);
      const front = w.front;
      const skid = front ? p.skidF : p.skidR;
      const contact = p.wheelHit[(front ? 0 : 2) + (w.left ? 0 : 1)];
      if (!contact || !p.onGround) { this.marks.trails.delete(v.id * 8 + i); continue; }
      const key = v.id * 8 + i;
      if (skid > 0.28 && speed > 2) {
        const ww = v.def.body.ww * 0.9;
        if (!loose) this.marks.add(key, _p.x, gy, _p.z, p.vx, p.vz, ww, Math.min(0.7, 0.22 + skid * 0.5) * (1 - wet * 0.4), 0);
        else if (speed > 4) this.marks.add(key, _p.x, gy, _p.z, p.vx, p.vz, ww * 1.1, 0.16 + skid * 0.16, 1);
        const n = this.rate('sm' + key, (loose ? 34 : 26) * skid * Math.min(1.3, speed / 12), dt);
        for (let k = 0; k < n; k++) {
          const s = 0.25 + Math.random() * 0.3;
          if (loose) this.pt.emit({ x: _p.x + rnd(0.25), y: gy + 0.12, z: _p.z + rnd(0.25), vx: p.vx * 0.32 + rnd(1.4), vy: 0.8 + Math.random() * 1.2, vz: p.vz * 0.32 + rnd(1.4), life: 1.3 + Math.random() * 1.1, s0: s * 1.2, s1: 2.8 + Math.random() * 1.6, c0: surf === SURF.SAND ? [0.85, 0.75, 0.55, 0.42] : surf === SURF.GRASS || surf === SURF.FIELD ? [0.5, 0.45, 0.3, 0.4] : [0.6, 0.52, 0.4, 0.45], c1: [0.55, 0.5, 0.4, 0], drag: 1.6, grav: -0.25, kind: 2 });
          else this.pt.emit({ x: _p.x + rnd(0.2), y: gy + 0.1, z: _p.z + rnd(0.2), vx: p.vx * 0.28 + rnd(0.8), vy: 0.5 + Math.random() * 0.8, vz: p.vz * 0.28 + rnd(0.8), life: 1.0 + Math.random() * 1.0, s0: s, s1: 1.8 + Math.random() * 1.4, c0: [0.92, 0.92, 0.95, 0.4 + skid * 0.25], c1: [0.75, 0.76, 0.8, 0], drag: 1.4, grav: -0.3, kind: 0 });
        }
      } else this.marks.trails.delete(key);
      // spray in the wet and dust on loose surfaces at speed
      if (!front && speed > 9) {
        if (wet > 0.3 && !loose) { const n = this.rate('sp' + key, 14 * wet * Math.min(1, speed / 25), dt); for (let k = 0; k < n; k++) this.pt.emit({ x: _p.x + rnd(0.15), y: gy + 0.15, z: _p.z + rnd(0.15), vx: p.vx * 0.15 + rnd(0.6), vy: 0.7 + Math.random() * 0.7, vz: p.vz * 0.15 + rnd(0.6), life: 0.7 + Math.random() * 0.5, s0: 0.25, s1: 1.1, c0: [0.85, 0.9, 0.95, 0.16], c1: [0.8, 0.85, 0.9, 0], drag: 1.8, grav: -0.1, kind: 0 }); }
        if (loose) { const n = this.rate('ds' + key, 18 * Math.min(1, speed / 22), dt); for (let k = 0; k < n; k++) this.pt.emit({ x: _p.x + rnd(0.2), y: gy + 0.1, z: _p.z + rnd(0.2), vx: p.vx * 0.2 + rnd(1.1), vy: 0.6 + Math.random() * 1.0, vz: p.vz * 0.2 + rnd(1.1), life: 1.0 + Math.random() * 1.1, s0: 0.3, s1: 2.0 + Math.random(), c0: [0.6, 0.52, 0.4, 0.28], c1: [0.55, 0.5, 0.4, 0], drag: 1.7, grav: -0.2, kind: 2 }); }
      }
    }
    // smoke from a wrecked engine bay, flames when it is finished
    if (v.damage.total > 0.55 && v.car.geo.layout) {
      const k = (v.damage.total - 0.5) * 2, n = this.rate('dm' + v.id, 10 + 18 * k, dt), b2 = v.def.body;
      for (let q = 0; q < n; q++) {
        _q.set(rnd(0.35), (b2.hoodY || 0.9) + 0.05, b2.L * 0.32).applyMatrix4(v.group.matrixWorld);
        const dark = v.damage.total > 0.85;
        this.pt.emit({ x: _q.x, y: _q.y, z: _q.z, vx: rnd(0.4) + p.vx * 0.4, vy: 1 + Math.random() * 1.2, vz: rnd(0.4) + p.vz * 0.4, life: 1.6 + Math.random(), s0: 0.25, s1: 1.6, c0: dark ? [0.1, 0.1, 0.11, 0.28] : [0.75, 0.75, 0.78, 0.22], c1: [0.35, 0.35, 0.38, 0], drag: 0.8, grav: -0.4, kind: 0 });
        if (v.damage.total > 0.94 && Math.random() < 0.5) this.pt.emit({ x: _q.x, y: _q.y, z: _q.z, vx: rnd(0.3), vy: 1.2 + Math.random(), vz: rnd(0.3), life: 0.35, s0: 0.35, s1: 0.05, c0: [2.4, 1.0, 0.25, 0.9], c1: [1.0, 0.2, 0.05, 0], drag: 1.2, grav: -1, add: 1, kind: 1, spin: 0 });
      }
    }
    // exhaust
    if (p.engineOn && v.def.body.style !== 'bike' || p.engineOn) {
      const cold = 1;
      const lz = v.car.geo.layout.zR - 0.35 - 0.02;
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
      const thr = p.thrIn;
      const n = this.rate('ex' + v.id, (thr > 0.6 ? 18 : 6) * cold * (0.5 + p.rpm / p.redline), dt);
      for (let k = 0; k < n; k++) {
        _q.set(-0.4 + (k % 2) * 0.8, 0.28, v.def.body.L * -0.5 - 0.05).applyMatrix4(v.group.matrixWorld);
        this.pt.emit({ x: _q.x, y: _q.y, z: _q.z, vx: -s * 1.6 + p.vx * 0.5 + rnd(0.2), vy: 0.15 + Math.random() * 0.25, vz: -c * 1.6 + p.vz * 0.5 + rnd(0.2), life: 0.7 + Math.random() * 0.5, s0: 0.06, s1: 0.55, c0: [0.6, 0.62, 0.66, 0.05 + thr * 0.08], c1: [0.55, 0.57, 0.6, 0], drag: 1.8, grav: -0.05, kind: 0 });
      }
      void lz;
    }
    // nitro flames
    if (p.nitroOn) {
      for (let k = 0; k < 3; k++) {
        _q.set(-0.4 + (k % 2) * 0.8, 0.3, v.def.body.L * -0.5 - 0.1).applyMatrix4(v.group.matrixWorld);
        const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
        this.pt.emit({ x: _q.x, y: _q.y, z: _q.z, vx: -s * 9 + p.vx * 0.9 + rnd(0.5), vy: rnd(0.3), vz: -c * 9 + p.vz * 0.9 + rnd(0.5), life: 0.16 + Math.random() * 0.08, s0: 0.35, s1: 0.05, c0: [0.5, 0.75, 2.2, 0.9], c1: [0.2, 0.3, 1.2, 0], drag: 2.5, grav: 0, add: 1, kind: 1, spin: 0 });
      }
    }
    // backfire / engine pops on lift-off
    if (p.limiter || (p.thrIn < 0.05 && p.rpm > 4200 && p.speed > 8 && v.def.sound.rough > 0.35 && Math.random() < dt * 5)) {
      _q.set(-0.4 + (Math.random() < 0.5 ? 0.8 : 0), 0.3, v.def.body.L * -0.5 - 0.1).applyMatrix4(v.group.matrixWorld);
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
      for (let k = 0; k < 3; k++) this.pt.emit({ x: _q.x, y: _q.y, z: _q.z, vx: -s * 5 + rnd(0.6), vy: rnd(0.4), vz: -c * 5 + rnd(0.6), life: 0.1, s0: 0.3, s1: 0.06, c0: [2.4, 1.2, 0.3, 1], c1: [1.2, 0.3, 0.05, 0], drag: 2, add: 1, kind: 1, spin: 0 });
    }
  }

  // ---------------------------------------------------------------- water
  boat(v, dt) {
    const g = this.g, p = v.phys, sea = g.world.sea, W = g.wake;
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw), b = v.def.body, L = b.L, Wd = b.W;
    const sp = p.speed, plane = p.planing, thr = p.thrIn, cam = g.camera.position;
    const d2 = (v.x - cam.x) ** 2 + (v.z - cam.z) ** 2;
    if (d2 > 200 * 200) return;
    const wv = (lx, lz, o = _a) => { o.x = v.x + c * lx + s * lz; o.z = v.z - s * lx + c * lz; return o; };
    const wet = p.wetN > 0;
    if (W && d2 < 75 * 75 && wet) {
      const k = clamp(sp / 16, 0, 1);
      for (const f of [0.3, 0, -0.3]) { wv(0, f * L); W.stamp(_a.x, _a.z, Wd * 0.8 + L * 0.1, (0.18 + 0.25 * k) * (f === 0 ? 0.8 : 1)); }
      if (sp > 1.5 || thr > 0.1) { wv(0, -L * 0.5 - 0.4); W.stamp(_a.x, _a.z, Wd * 0.7, clamp(0.25 + thr * 0.5 + k * 0.35, 0, 1) * p.propK); }
      if (sp > 4) for (const sg of [1, -1]) { wv(sg * Wd * 0.55, L * 0.34); W.stamp(_a.x, _a.z, 1.1 + k * 0.8, 0.3 + 0.4 * k); wv(sg * Wd * 0.72, -L * 0.12); W.stamp(_a.x, _a.z, 1.4 + k, 0.22 + 0.35 * k); }
    }
    if (d2 > 140 * 140) return;
    const toWorld = (lx, ly, lz, o = _q) => o.set(c * lx + s * lz, ly, -s * lx + c * lz);
    // bow spray
    if (wet && sp > 3) {
      const n = this.rate('bs' + v.id, sp * sp * 0.05 * (0.45 + 0.6 * (1 - plane * 0.5)) + p.spray * 40, dt);
      for (let k = 0; k < n; k++) {
        const side = Math.random() < 0.5 ? 1 : -1;
        wv(side * Wd * 0.28, L * 0.42);
        const y = sea.waveAt(_a.x, _a.z) + 0.1;
        toWorld(side * (1.8 + sp * 0.14 + Math.random() * 2), 1.8 + sp * 0.1 + Math.random() * 2.2, sp * 0.3 + Math.random() * 2);
        this.pt.emit({ x: _a.x, y, z: _a.z, vx: _q.x + p.vx * 0.5, vy: _q.y, vz: _q.z + p.vz * 0.5, life: 0.5 + Math.random() * 0.55, s0: 0.2, s1: 0.8 + sp * 0.03, c0: [1, 1, 1, 0.5], c1: [0.9, 0.96, 1, 0], drag: 0.9, grav: 8, kind: 0 });
      }
    }
    // rooster tail and prop wash
    if (wet && thr > 0.15 && p.propK > 0.4) {
      const rt = this.rate('rt' + v.id, 60 * thr * smooth01(plane) * (v.def.boat === 'jetski' ? 1.4 : 1), dt);
      for (let k = 0; k < rt; k++) {
        wv((Math.random() - 0.5) * 0.3, -L * 0.5 - 0.3);
        toWorld((Math.random() - 0.5) * 1.2, 3.2 + sp * 0.1 + Math.random() * 1.6, -(sp * 0.28 + 1.5 + Math.random()));
        this.pt.emit({ x: _a.x, y: sea.waveAt(_a.x, _a.z) + 0.15, z: _a.z, vx: _q.x + p.vx * 0.85, vy: _q.y, vz: _q.z + p.vz * 0.85, life: 0.55 + Math.random() * 0.4, s0: 0.3, s1: 1.1, c0: [1, 1, 1, 0.42], c1: [0.9, 0.96, 1, 0], drag: 0.7, grav: 9, kind: 0 });
      }
      const pw = this.rate('pw' + v.id, 36 * thr, dt);
      for (let k = 0; k < pw; k++) {
        wv((Math.random() - 0.5) * 0.8, -L * 0.5 - 0.6 - Math.random() * 0.6);
        this.pt.emit({ x: _a.x, y: sea.waveAt(_a.x, _a.z) + 0.08, z: _a.z, vx: -s * (1 + Math.random()) + p.vx * 0.3, vy: 0.3 + Math.random() * 0.4, vz: -c * (1 + Math.random()) + p.vz * 0.3, life: 0.9 + Math.random() * 0.7, s0: 0.35, s1: 1.5, c0: [0.86, 0.95, 0.95, 0.3], c1: [0.8, 0.92, 0.94, 0], drag: 1.6, grav: 0.3, kind: 0 });
      }
    }
    // exhaust and nitro
    const ex = v.car.geo.boat.exhaust;
    if (p.engineOn && ex && d2 < 90 * 90) {
      v.group.updateMatrixWorld();
      const inboard = v.car.geo.boat.inboard;
      const n = this.rate('ex' + v.id, (thr > 0.6 ? 14 : 5) * (0.5 + p.rpm / p.redline) * (inboard ? 0.7 : 1), dt);
      for (let k = 0; k < n; k++) {
        const e = ex[k % ex.length];
        _q.set(e[0], e[1], e[2]).applyMatrix4(v.group.matrixWorld);
        this.pt.emit({ x: _q.x, y: _q.y, z: _q.z, vx: -s * 1.2 + p.vx * 0.5 + rnd(0.2), vy: inboard ? 0.9 : 0.2, vz: -c * 1.2 + p.vz * 0.5 + rnd(0.2), life: 0.8 + Math.random() * 0.6, s0: inboard ? 0.15 : 0.08, s1: inboard ? 1.2 : 0.6, c0: inboard ? [0.18, 0.18, 0.2, 0.12] : [0.62, 0.66, 0.7, 0.06 + thr * 0.08], c1: [0.5, 0.52, 0.55, 0], drag: 1.4, grav: inboard ? -0.4 : -0.05, kind: 0 });
      }
      if (p.nitroOn) for (let k = 0; k < 3; k++) {
        const e = ex[k % ex.length];
        _q.set(e[0], e[1] + 0.05, e[2] - 0.1).applyMatrix4(v.group.matrixWorld);
        this.pt.emit({ x: _q.x, y: _q.y, z: _q.z, vx: -s * 9 + p.vx * 0.9 + rnd(0.5), vy: rnd(0.3), vz: -c * 9 + p.vz * 0.9 + rnd(0.5), life: 0.16 + Math.random() * 0.08, s0: 0.4, s1: 0.06, c0: [0.5, 0.75, 2.2, 0.9], c1: [0.2, 0.3, 1.2, 0], drag: 2.5, grav: 0, add: 1, kind: 1, spin: 0 });
      }
    }
  }

  slam(v, impact) {
    const p = v.phys, sea = this.g.world.sea, L = v.def.body.L, Wd = v.def.body.W;
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    const n = Math.min(26, Math.round(impact * 3.2));
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? 1 : -1, lz = L * (0.25 + Math.random() * 0.2), lx = side * Wd * 0.4;
      const x = v.x + c * lx + s * lz, z = v.z - s * lx + c * lz;
      this.pt.emit({ x, y: sea.waveAt(x, z) + 0.1, z, vx: c * side * (1.5 + Math.random() * 3) + p.vx * 0.5, vy: 1.5 + Math.random() * Math.min(5, impact * 0.6), vz: -s * side * (1.5 + Math.random() * 3) + p.vz * 0.5, life: 0.6 + Math.random() * 0.5, s0: 0.25, s1: 1.0, c0: [1, 1, 1, 0.5], c1: [0.9, 0.96, 1, 0], drag: 0.8, grav: 9, kind: 0 });
    }
  }

  splash(x, y, z, speed, size = 1) {
    const n = Math.min(70, Math.round(8 + speed * 5 * size));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = Math.random(), sp = 1 + r * (2 + speed * 0.5) * Math.min(2, size);
      this.pt.emit({ x: x + Math.cos(a) * 0.3, y: y + 0.1, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vy: 2 + Math.random() * Math.min(7, 2 + speed * 0.5), vz: Math.sin(a) * sp, life: 0.7 + Math.random() * 0.7, s0: 0.2, s1: 0.9 + Math.random() * 0.6, c0: [1, 1, 1, 0.55], c1: [0.9, 0.96, 1, 0], drag: 0.9, grav: 9, kind: 0 });
    }
    const W = this.g.wake;
    if (W) { W.stamp(x, z, 1.4 + size * 0.8, 0.9); W.stamp(x, z, 2.6 + size, 0.5); }
  }

  swimmer(P, dt) {
    const W = this.g.wake, sea = this.g.world.sea;
    W.stamp(P.x, P.z, 0.9, 0.12 + Math.min(0.25, P.speed * 0.1));
    if (P.speed > 0.6) {
      const n = this.rate('sw', P.speed * 8, dt);
      for (let k = 0; k < n; k++) this.pt.emit({ x: P.x + Math.sin(P.yaw) * 0.3 + rnd(0.3), y: sea.waveAt(P.x, P.z) + 0.05, z: P.z + Math.cos(P.yaw) * 0.3 + rnd(0.3), vx: rnd(0.6), vy: 0.4 + Math.random() * 0.8, vz: rnd(0.6), life: 0.5 + Math.random() * 0.4, s0: 0.08, s1: 0.3, c0: [1, 1, 1, 0.4], c1: [0.9, 0.96, 1, 0], drag: 1, grav: 7, kind: 0 });
    }
  }

  sparks(e) {
    if (e.impact < 3) return;
    const n = Math.min(40, Math.round(e.impact * 1.6));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = 2 + Math.random() * Math.min(10, e.impact * 0.8);
      this.pt.emit({ x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * sp + (e.nx || 0) * 3, vy: 1 + Math.random() * 4, vz: Math.sin(a) * sp + (e.nz || 0) * 3, life: 0.35 + Math.random() * 0.5, s0: 0.07, s1: 0.02, c0: [2.2, 1.3, 0.4, 1], c1: [1.2, 0.2, 0.05, 0], drag: 0.4, grav: 9.8, add: 1, kind: 1, spin: 0 });
    }
    for (let i = 0; i < Math.min(12, n / 2); i++) this.pt.emit({ x: e.x, y: e.y, z: e.z, vx: rnd(2.5), vy: 0.5 + Math.random() * 1.5, vz: rnd(2.5), life: 1 + Math.random() * 0.8, s0: 0.3, s1: 1.4, c0: [0.5, 0.5, 0.52, 0.3], c1: [0.4, 0.4, 0.42, 0], drag: 1.5, grav: -0.1, kind: 0 });
    // body chips in the paint colour and glass on hard hits
    if (e.impact > 6 && e.v?.car?.mats?.paint) {
      const pc = e.v.car.mats.paint.color, nc = Math.min(22, Math.round(e.impact * 0.9));
      for (let i = 0; i < nc; i++) {
        const a = Math.random() * 6.283, sp = 2 + Math.random() * Math.min(9, e.impact * 0.5);
        this.pt.emit({ x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * sp + (e.nx || 0) * 4, vy: 1 + Math.random() * 4, vz: Math.sin(a) * sp + (e.nz || 0) * 4, life: 1.2 + Math.random() * 1.2, s0: 0.06 + Math.random() * 0.08, s1: 0.05, c0: [pc.r, pc.g, pc.b, 0.95], c1: [pc.r, pc.g, pc.b, 0], drag: 0.3, grav: 9.8, kind: 2, spin: rnd(6) });
      }
    }
    if (e.impact > 10) {
      const ng = Math.min(26, Math.round(e.impact * 1.1));
      for (let i = 0; i < ng; i++) {
        const a = Math.random() * 6.283, sp = 1.5 + Math.random() * Math.min(8, e.impact * 0.45);
        this.pt.emit({ x: e.x, y: e.y + 0.2, z: e.z, vx: Math.cos(a) * sp + (e.nx || 0) * 3, vy: 1.5 + Math.random() * 4, vz: Math.sin(a) * sp + (e.nz || 0) * 3, life: 1.0 + Math.random() * 1.0, s0: 0.035 + Math.random() * 0.04, s1: 0.03, c0: [0.7, 0.88, 1, 0.9], c1: [0.7, 0.88, 1, 0], drag: 0.4, grav: 9.8, add: 0.6, kind: 1, spin: rnd(9) });
      }
    }
  }

  landing(e) {
    if (e.v.isBoat) return this.splash(e.x, e.y, e.z, e.speed * 1.4, e.v.def.body.W);
    const v = e.v, p = v.phys;
    v.group.updateMatrixWorld();
    const loose = LOOSE.has(p.surfR);
    for (const w of v.car.wheels) {
      w.pivot.getWorldPosition(_p);
      const gy = this.g.world.groundY(_p.x, _p.z, _p.y + 0.5);
      const n = Math.min(14, Math.round(e.speed * 1.4));
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.283, sp = 0.8 + Math.random() * Math.min(4, e.speed * 0.5);
        this.pt.emit({ x: _p.x, y: gy + 0.08, z: _p.z, vx: Math.cos(a) * sp + p.vx * 0.2, vy: 0.4 + Math.random() * 1.2, vz: Math.sin(a) * sp + p.vz * 0.2, life: 0.9 + Math.random() * 0.9, s0: 0.3, s1: 1.6 + Math.random() * 1.2, c0: loose ? [0.6, 0.52, 0.4, 0.4] : [0.75, 0.75, 0.78, 0.28], c1: [0.6, 0.55, 0.5, 0], drag: 2, grav: -0.15, kind: loose ? 2 : 0 });
      }
    }
    if (e.speed > 6) this.sparks({ x: p.x, y: p.y + 0.15, z: p.z, impact: e.speed * 0.8, nx: 0, nz: 0 });
  }
}

const smooth01 = (t) => t * t * (3 - 2 * t);
