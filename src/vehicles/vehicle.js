import * as THREE from 'three';
import { createCarMesh } from './carMesh.js';
import { carOutline } from './carModel.js';
import { CarPhysics } from './physics.js';
import { collide } from '../world/collision.js';
import { clamp, lerp } from '../core/math.js';
import { SURF } from '../world/terrain.js';
import { WATER_LEVEL } from '../data/world.js';

let UID = 1;
const _v = new THREE.Vector3();

export class Vehicle {
  constructor(game, def, custom = {}, opts = {}) {
    this.id = UID++;
    this.game = game;
    this.world = game.world;
    this.def = def;
    this.custom = custom;
    this.kind = opts.kind || 'civilian';
    this.owned = !!opts.owned;
    this.uid = opts.uid || null;
    this.car = this.makeCar(def, custom);
    this.group = this.car.group;
    this.group.rotation.order = 'YXZ';
    this.phys = this.makePhys(def, custom);
    this.phys.assist = opts.assist ?? 0.6;
    this.deformable = opts.deformable ?? true;
    if (this.deformable) this.makeUnique();
    this.input = { throttle: 0, brake: 0, steer: 0, hand: false, boost: false };
    this.lights = { head: false, auto: true, indL: 0, indR: 0, hazard: false, siren: false, bar: false };
    this.damage = { total: 0, front: 0, rear: 0, left: 0, right: 0, headL: false, headR: false, tailL: false, tailR: false, glass: 0 };
    this.dirt = 0;
    this.driver = null;
    this.disabled = false;
    this.sunk = false;
    this.lastHit = 0;
    this.hitCooldown = 0;
    this.events = [];
    this.horn = false;
    this.acc = 0;
    this.doorState = { L: 0, R: 0, hood: 0, trunk: 0 };
    this.doorTarget = { L: 0, R: 0, hood: 0, trunk: 0 };
    this.layout = this.car.geo.layout;
    this.dims = this.car.geo.dims;
    this.hx = this.dims.L / 2;
    this.hz = this.dims.W / 2;
    // body center relative to CG along forward axis
    this.cOff = -this.phys.zCG;
    game.scene.add(this.group);
    if (opts.hero) this.addHeadlights();
  }

  makeCar(def, custom) { return createCarMesh(def, custom); }
  makePhys(def, custom) { return new CarPhysics(def, custom.perf || {}); }

  setDoor(name, open) { if (this.car.panels && (name === 'L' || name === 'R' ? this.car.panels['door' + name] : this.car.panels[name])) this.doorTarget[name] = open ? 1 : 0; }
  doorOpen(name) { return this.doorState[name]; }

  updatePanels(dt) {
    const P = this.car.panels;
    if (!P) return;
    const S = this.doorState, T = this.doorTarget;
    for (const k of ['L', 'R', 'hood', 'trunk']) {
      const d = T[k] - S[k];
      if (Math.abs(d) < 0.0005) { if (S[k] !== T[k]) { S[k] = T[k]; this.applyPanel(k); } continue; }
      // doors ease out when opening and accelerate into the latch when closing
      S[k] += Math.sign(d) * Math.min(Math.abs(d), dt * (k === 'L' || k === 'R' ? (d > 0 ? 3.4 : 4.2) : 1.8));
      this.applyPanel(k);
      if (T[k] === 0 && S[k] <= 0 && !this._slam) { /* latched */ }
    }
  }

  applyPanel(k) {
    const P = this.car.panels, S = this.doorState;
    const e = S[k] * S[k] * (3 - 2 * S[k]);
    if (k === 'L' && P.doorL) P.doorL.rotation.y = -e * 1.12;
    else if (k === 'R' && P.doorR) P.doorR.rotation.y = e * 1.12;
    else if (k === 'hood' && P.hood) P.hood.rotation.x = -e * 0.95;
    else if (k === 'trunk' && P.trunk) P.trunk.rotation.x = e * 1.0;
  }

  makeUnique() {
    for (const k of ['paint', 'trim', 'glass', 'lights']) {
      const m = this.car.meshes[k];
      if (!m) continue;
      m.geometry = m.geometry.clone();
      m.userData.orig = Float32Array.from(m.geometry.attributes.position.array);
    }
  }

  addHeadlights() {
    const L = new THREE.SpotLight(0xffeedd, 0, 90, 0.56, 0.75, 2);
    const b = this.def.body;
    L.position.set(0, b.hoodY || 0.9, b.L / 2 - 0.2);
    L.target.position.set(0, 0, b.L / 2 + 20);
    L.castShadow = false;
    this.group.add(L, L.target);
    this.spot = L;
  }

  get x() { return this.phys.x; }
  get y() { return this.phys.y; }
  get z() { return this.phys.z; }
  get yaw() { return this.phys.yaw; }
  get speed() { return this.phys.speed; }
  get kmh() { return this.phys.kmh; }
  get pos() { return _v.set(this.phys.x, this.phys.y, this.phys.z); }
  fwd() { return { x: Math.sin(this.phys.yaw), z: Math.cos(this.phys.yaw) }; }

  place(x, y, z, yaw) {
    this.phys.place(x, y, z, yaw);
    this.sync(0);
  }

  // body outline in world space: bounding box plus the convex silhouette ring; rebuilt only when the body has moved
  outline() { return this._outline || (this._outline = carOutline(this.def)); }

  obb() {
    const p = this.phys;
    const o = this._obb;
    if (o && this._ox === p.x && this._oz === p.z && this._oy === p.yaw) return o;
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    const cx = p.x + s * this.cOff, cz = p.z + c * this.cOff;
    const ring = this.outline(), box = o || (this._obb = { type: 'box', poly: new Array(ring.length * 2) });
    box.x = cx; box.z = cz; box.hx = this.hx; box.hz = this.hz; box.cos = s; box.sin = c;
    for (let i = 0; i < ring.length; i++) { const q = ring[i]; box.poly[2 * i] = cx + q[0] * c + q[1] * s; box.poly[2 * i + 1] = cz - q[0] * s + q[1] * c; }
    this._ox = p.x; this._oz = p.z; this._oy = p.yaw;
    return box;
  }

  // distance from a world point to the hull rectangle (0 inside)
  distTo(x, z) {
    const o = this.obb(), dx = x - o.x, dz = z - o.z;
    const lx = dx * o.cos + dz * o.sin, lz = -dx * o.sin + dz * o.cos;
    return Math.hypot(Math.max(Math.abs(lx) - o.hx, 0), Math.max(Math.abs(lz) - o.hz, 0));
  }

  update(dt, env) {
    const p = this.phys;
    p.wet = env.wet || 0;
    const input = this.disabled ? { throttle: 0, brake: 0.3, steer: 0, hand: false } : this.input;
    this.stepPhysics(dt, input, env);
    this.hitCooldown -= dt;
    if (p.landing) { this.events.push({ type: 'landing', ...p.landing }); p.landing = null; }
    if (p.bump > 0.9) { this.events.push({ type: 'bump', impact: p.bump }); }
    p.bump = 0;
    this.checkWater(dt);
    // dirt accumulates off-road / in rain
    const offroad = p.surfR === SURF.GRASS || p.surfR === SURF.DIRT || p.surfR === SURF.FIELD || p.surfR === SURF.SAND || p.surfR === SURF.GRAVEL;
    if (offroad && p.speed > 3) this.dirt = Math.min(1, this.dirt + dt * 0.02 * (1 + (env.wet || 0) * 2));
    else if ((env.rain || 0) > 0.3) this.dirt = Math.max(0, this.dirt - dt * 0.002);
    this.car.mats.paint.userData.dirt.value = this.dirt;
    // lights
    const night = env.night || 0;
    if (this.lights.auto) this.lights.head = night > 0.35 || (env.rain || 0) > 0.4 || (env.fog || 0) > 0.004;
    const t = performance.now() / 1000;
    const blink = Math.sin(t * 9) > 0 ? 1 : 0;
    const head = this.lights.head && !this.disabled ? 1 : 0;
    const brakeV = p.brake > 0.1 && p.gear >= 0 && p.speed > 0.2 ? 1 : 0;
    const rev = p.gear < 0 ? 2 : 0;
    const iL = (this.lights.indL || this.lights.hazard) && blink ? 1 : 0, iR = (this.lights.indR || this.lights.hazard) && blink ? 1 : 0;
    const LV = this.car.mats.lights.userData.uLight.value;
    LV.set(head * (this.damage.headL && this.damage.headR ? 0 : 1), brakeV + rev, iL, iR);
    if (this.lights.bar) {
      const ph = (t * 2.2) % 1;
      const r = ph < 0.25 ? (Math.sin(t * 60) > 0 ? 1 : 0.1) : ph < 0.5 ? 0.15 : ph < 0.75 ? 0.1 : 0.2;
      const bl = ph >= 0.5 && ph < 0.75 ? (Math.sin(t * 60) > 0 ? 1 : 0.1) : ph < 0.5 ? 0.12 : 0.18;
      this.car.mats.lights.userData.uBar.value.set(r, bl);
    } else this.car.mats.lights.userData.uBar.value.set(0, 0);
    if (this.spot) { this.spot.intensity = head ? (this.lights.high ? 24000 : 9500) * (this.damage.headL ? 0.5 : 1) * (this.damage.headR ? 0.5 : 1) : 0; this.spot.distance = this.lights.high ? 170 : 95; this.spot.angle = this.lights.high ? 0.34 : 0.56; }
    this.updatePanels(dt);
    this.sync(dt);
  }

  stepPhysics(dt, input, env) {
    const p = this.phys;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      p.step(h, input, env.ground);
      this.collideStatic(h);
    }
  }

  checkWater(dt) {
    const p = this.phys;
    if (!this.sunk && p.y < WATER_LEVEL - 0.4 && this.world.isWater(p.x, p.z, p.y)) {
      this.sunk = true; this.disabled = true; this.events.push({ type: 'sunk' });
    }
    if (this.sunk) { p.vx *= 0.9; p.vz *= 0.9; p.y = Math.max(p.y - dt * 0.6, WATER_LEVEL - 2.5); p.onGround = true; }
  }

  sync(dt) {
    const p = this.phys, g = this.group;
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    g.position.set(p.x - s * p.zCG, p.y + p.zCG * Math.sin(p.visPitch), p.z - c * p.zCG);
    g.rotation.set(p.visPitch, p.yaw, p.visRoll);
    for (const w of this.car.wheels) {
      const i = (w.front ? 0 : 2) + (w.left ? 0 : 1);
      w.spin.rotation.x = w.front ? p.wheelRot : p.wheelRotR;
      if (w.front) w.holder.rotation.y = p.steer;
      w.pivot.position.y = w.r + (p.wheelDy[i] ?? 0);
    }
  }

  // ---------- collisions with static world ----------
  collideStatic(dt) {
    const p = this.phys;
    const R = Math.hypot(this.hx, this.hz) + 0.5;
    const y0 = p.y + 0.25, y1 = p.y + this.dims.H * 0.9;
    const x = p.x, z = p.z;
    this.world.colliders.query(this.obb().x, this.obb().z, R, y0, y1, (c) => {
      const hit = collide(this.obb(), c);
      if (!hit) return;
      if (c.kind === 'parked' && c.ref) { this.game.traffic?.wakeParked(c.ref); return; }
      if (c.kind === 'prop' && c.ref) {
        const handled = this.game.onPropHit?.(this, c.ref, hit);
        if (handled) return;
      }
      if (!c.solid && c.kind !== 'prop') return;
      this.resolve(hit, c, Infinity, null);
    });
    void x; void z;
  }

  // impulse response against infinite mass (or other vehicle with mass mB & inertia IB)
  resolve(hit, c, mB, other) {
    const p = this.phys;
    p.x += hit.nx * hit.depth * (mB === Infinity ? 1 : 0.5);
    p.z += hit.nz * hit.depth * (mB === Infinity ? 1 : 0.5);
    const rx = hit.px - p.x, rz = hit.pz - p.z;
    const vpx = p.vx + p.w * rz, vpz = p.vz - p.w * rx;
    let rvx = vpx, rvz = vpz;
    if (other) {
      const o = other.phys, orx = hit.px - o.x, orz = hit.pz - o.z;
      rvx -= o.vx + o.w * orz; rvz -= o.vz - o.w * orx;
    }
    const vn = rvx * hit.nx + rvz * hit.nz;
    if (vn >= 0) return 0;
    const cA = rz * hit.nx - rx * hit.nz;
    let inv = 1 / p.mass + (cA * cA) / p.I;
    let cB = 0;
    if (other) { const o = other.phys, orx = hit.px - o.x, orz = hit.pz - o.z; cB = orz * hit.nx - orx * hit.nz; inv += 1 / o.mass + (cB * cB) / o.I; }
    const e = 0.18;
    const j = (-(1 + e) * vn) / inv;
    p.vx += (j * hit.nx) / p.mass; p.vz += (j * hit.nz) / p.mass; p.w += (cA * j) / p.I;
    // friction
    const tx = -hit.nz, tz = hit.nx;
    const vt = rvx * tx + rvz * tz;
    const cAt = rz * tx - rx * tz;
    let invT = 1 / p.mass + (cAt * cAt) / p.I;
    if (other) { const o = other.phys, orx = hit.px - o.x, orz = hit.pz - o.z; const cBt = orz * tx - orx * tz; invT += 1 / o.mass + (cBt * cBt) / o.I; }
    const jt = clamp(-vt / invT, -0.45 * j, 0.45 * j);
    p.vx += (jt * tx) / p.mass; p.vz += (jt * tz) / p.mass; p.w += (cAt * jt) / p.I;
    if (other) {
      const o = other.phys, orx = hit.px - o.x, orz = hit.pz - o.z;
      o.x -= hit.nx * hit.depth * 0.5; o.z -= hit.nz * hit.depth * 0.5;
      o.vx -= (j * hit.nx + jt * tx) / o.mass; o.vz -= (j * hit.nz + jt * tz) / o.mass;
      o.w -= ((orz * hit.nx - orx * hit.nz) * j + (orz * tx - orx * tz) * jt) / o.I;
    }
    const impact = -vn;
    if (impact > 2.2 && this.hitCooldown <= 0) {
      this.hitCooldown = 0.12;
      this.applyDamage(hit.px, hit.pz, impact, hit.nx, hit.nz);
      this.events.push({ type: 'crash', impact, x: hit.px, y: p.y + 0.6, z: hit.pz, nx: hit.nx, nz: hit.nz, kind: c?.kind || 'vehicle', mat: c?.mat || 'metal', other });
    }
    return impact;
  }

  applyDamage(px, pz, impact, nx, nz) {
    const p = this.phys, s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    const cx = p.x + s * this.cOff, cz = p.z + c * this.cOff;
    const lx = (px - cx) * c - (pz - cz) * s, lz = (px - cx) * s + (pz - cz) * c;
    const amt = clamp((impact - 2.2) * 0.016, 0, 0.45) * (this.game.damageScale ?? 1);
    if (amt <= 0) return;
    const d = this.damage;
    const zone = Math.abs(lz) / this.hx > Math.abs(lx) / this.hz ? (lz > 0 ? 'front' : 'rear') : lx > 0 ? 'left' : 'right';
    d[zone] = Math.min(1, d[zone] + amt * 1.6);
    d.total = Math.min(1, d.total + amt);
    if (zone === 'front' && d.front > 0.35) { if (lx > -0.2) d.headL = true; if (lx < 0.2) d.headR = true; }
    if (zone === 'rear' && d.rear > 0.35) { d.tailL = d.tailR = true; }
    if (impact > 13) d.glass = Math.min(1, d.glass + 0.35);
    p.health.engine = clamp(1 - Math.max(0, d.front - 0.25) * 0.8 - d.total * 0.25, 0.15, 1);
    p.health.steer += (Math.random() - 0.5) * amt * 0.8;
    p.health.brakes = clamp(1 - d.total * 0.3, 0.55, 1);
    if (d.total >= 0.999 || p.health.engine <= 0.16) { if (!this.disabled) { this.disabled = true; this.events.push({ type: 'disabled' }); } }
    if (this.deformable) this.deform(lx, lz, impact, zone);
  }

  deform(lx, lz, impact, zone) {
    // local body coords: x left, z forward from body origin
    const dent = clamp((impact - 2.2) * 0.012, 0, 0.18);
    const r = 0.55 + impact * 0.03;
    const dir = zone === 'front' ? [0, -1] : zone === 'rear' ? [0, 1] : zone === 'left' ? [-1, 0] : [1, 0];
    for (const k of ['paint', 'trim', 'glass', 'lights']) {
      const m = this.car.meshes[k];
      if (!m) continue;
      const pos = m.geometry.attributes.position, a = pos.array;
      for (let i = 0; i < pos.count; i++) {
        const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
        const dx = x - lx, dz = z - lz;
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        const f = (1 - Math.sqrt(d2) / r) ** 2 * dent * (0.7 + 0.6 * ((i * 7919) % 13) / 13) * (y < 1.6 ? 1 : 0.4);
        a[i * 3] += dir[0] * f; a[i * 3 + 2] += dir[1] * f; a[i * 3 + 1] -= f * 0.25;
      }
      pos.needsUpdate = true;
      if (k === 'paint') m.geometry.computeVertexNormals();
    }
    if (this.damage.glass > 0.5 && this.car.mats.glass.opacity < 0.95) { this.car.mats.glass.opacity = 0.95; this.car.mats.glass.roughness = 0.6; this.car.mats.glass.color.setRGB(0.35, 0.37, 0.38); }
  }

  repair() {
    for (const k of ['paint', 'trim', 'glass', 'lights']) {
      const m = this.car.meshes[k];
      if (!m?.userData.orig) continue;
      m.geometry.attributes.position.array.set(m.userData.orig);
      m.geometry.attributes.position.needsUpdate = true;
      if (k === 'paint') m.geometry.computeVertexNormals();
    }
    Object.assign(this.damage, { total: 0, front: 0, rear: 0, left: 0, right: 0, headL: false, headR: false, tailL: false, tailR: false, glass: 0 });
    this.phys.health = { engine: 1, steer: 0, brakes: 1 };
    this.disabled = false; this.sunk = false;
    const g = this.car.mats.glass; g.opacity = 0.8; g.roughness = 0.03; g.color.setRGB(0.05, 0.06, 0.07);
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        if (o.userData.orig) o.geometry.dispose();
      }
    });
    if (this.car.map) this.car.map.dispose();
    for (const m of Object.values(this.car.mats)) m.dispose?.();
  }
}

// vehicle-vehicle contact
export function collideVehicles(a, b) {
  const A = a.obb(), B = b.obb();
  if (Math.abs(a.phys.y - b.phys.y) > 2.5) return 0;
  if ((A.x - B.x) ** 2 + (A.z - B.z) ** 2 > (a.hx + b.hx + 1) ** 2) return 0;
  const hit = collide(A, B);
  if (!hit) return 0;
  const imp = a.resolve(hit, null, b.phys.mass, b);
  if (imp > 2.2 && b.hitCooldown <= 0) {
    b.hitCooldown = 0.12;
    b.applyDamage(hit.px, hit.pz, imp, -hit.nx, -hit.nz);
    b.events.push({ type: 'crash', impact: imp, x: hit.px, y: b.phys.y + 0.6, z: hit.pz, kind: 'vehicle', mat: 'metal', other: a });
  }
  return imp;
}
