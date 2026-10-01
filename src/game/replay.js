import * as THREE from 'three';
import { clamp, damp, wrapAngle } from '../core/math.js';

export const HZ = 30, SECS = 45, CAP = HZ * SECS;
const K = ['x', 'y', 'z', 'yaw', 'visPitch', 'visRoll', 'steer', 'steerIn', 'wheelRot', 'wheelRotR', 'vx', 'vy', 'vz', 'rpm', 'thrIn', 'brkIn', 'skidF', 'skidR', 'limiter', 'boost', 'gear', 'onGround', 'planing', 'wetN', 'spray', 'propK', 'spin', 'surfR', 'surfF', 'engineOn', 'nitroOn'];
const NK = K.length, STR = NK + 8;
const BOOL = new Set(['onGround', 'engineOn', 'nitroOn']);
const DISC = new Set(['gear', 'onGround', 'engineOn', 'nitroOn', 'surfR', 'surfF', 'limiter']);
const IS_BOOL = K.map((k) => BOOL.has(k)), IS_DISC = K.map((k) => DISC.has(k)), YAW = K.indexOf('yaw');
const SEG = 4.6;
const ORDER_CAR = ['chase', 'track', 'wheel', 'side', 'front', 'heli', 'hood', 'track', 'cockpit', 'side', 'heli'];
const ORDER_BOAT = ['chase', 'track', 'side', 'front', 'heli', 'hood', 'track', 'side', 'heli'];
export const SHOTS = [['auto', 'Auto'], ['chase', 'Chase'], ['track', 'Trackside'], ['side', 'Side'], ['front', 'Head-on'], ['heli', 'Aerial'], ['wheel', 'Wheel'], ['hood', 'Hood'], ['cockpit', 'Cockpit']];
const DOF = { track: 0.12, front: 0.1, wheel: 0.08, heli: 0.05 };
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

// Rolling record of the player's vehicle state (last 45 s at 30 Hz) and a playback mode with a cutting camera director.
export class Replay {
  constructor(game) {
    this.g = game;
    this.buf = new Float32Array(CAP * STR);
    this.n = 0; this.head = 0; this.acc = 0; this.v = null;
    this.active = false; this.t = 0; this.speed = 1; this.paused = false; this.shot = 'auto'; this.bars = true; this.loop = true;
    this.saved = null; this.hidden = [];
    this.o = new Float32Array(STR); this.o2 = new Float32Array(STR);
    this.C = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 60, key: '', fixed: new THREE.Vector3() };
    this.want = new THREE.Vector3(); this.aim = new THREE.Vector3();
  }

  get length() { return Math.max(0, (this.n - 1) / HZ); }
  ready() { return !!this.v && this.n >= HZ * 2; }

  reset(v) { this.v = v; this.n = 0; this.head = 0; this.acc = 0; }

  record(dt) {
    const P = this.g.player, v = P.vehicle;
    if (!v || P.state !== 'driving' || !this.g.input.enabled) return;
    if (v !== this.v) this.reset(v);
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= 1 / HZ) { this.acc -= 1 / HZ; this.push(v.phys); }
  }

  push(p) {
    const b = this.buf, o = this.head * STR;
    for (let i = 0; i < NK; i++) b[o + i] = +p[K[i]] || 0;
    for (let i = 0; i < 4; i++) { b[o + NK + i] = (p.wheelDy && p.wheelDy[i]) || 0; b[o + NK + 4 + i] = p.wheelHit && p.wheelHit[i] ? 1 : 0; }
    this.head = (this.head + 1) % CAP; if (this.n < CAP) this.n++;
  }

  at(i) { return ((((this.head - this.n + i) % CAP) + CAP) % CAP) * STR; }

  sample(t, out) {
    const f = clamp(t * HZ, 0, this.n - 1), i = Math.min(this.n - 2, Math.floor(f)), u = f - i, A = this.at(i), B = this.at(i + 1), b = this.buf;
    for (let k = 0; k < NK; k++) {
      const a = b[A + k], c = b[B + k];
      out[k] = IS_DISC[k] ? (u < 0.5 ? a : c) : k === YAW ? a + wrapAngle(c - a) * u : a + (c - a) * u;
    }
    for (let k = NK; k < STR; k++) out[k] = k >= NK + 4 ? (u < 0.5 ? b[A + k] : b[B + k]) : b[A + k] + (b[B + k] - b[A + k]) * u;
    return out;
  }

  // ------------------------------------------------------------------ playback
  start() {
    const g = this.g, v = this.v, p = v.phys;
    this.has = K.map((k) => k in p);
    this.saved = { vals: K.map((k) => p[k]), dy: p.wheelDy ? [...p.wheelDy] : null, hit: p.wheelHit ? [...p.wheelHit] : null, mode: g.rig.mode, fov: g.camera.fov, horn: v.horn };
    this.t = 0; this.speed = 1; this.paused = false; this.shot = 'auto';
    this.hide();
    g.pipeline.setDepth(true);
    this.C.key = ''; this.C.pos.copy(g.camera.position); this.C.fov = g.camera.fov;
    v.horn = false;
    this.active = true;
    this.pose(0, 0);
  }

  stop() {
    const g = this.g, v = this.v, p = v.phys, S = this.saved;
    this.active = false;
    if (S) {
      K.forEach((k, i) => { if (this.has[i]) p[k] = S.vals[i]; });
      if (S.dy) for (let i = 0; i < 4; i++) p.wheelDy[i] = S.dy[i];
      if (S.hit) for (let i = 0; i < 4; i++) p.wheelHit[i] = S.hit[i];
      g.rig.mode = S.mode;
    }
    v.sync(0); v.group.updateMatrixWorld(true);
    for (const o of this.hidden) o.visible = true;
    this.hidden = [];
    const fx = g.pipeline.fx; fx.dof = 0;
    g.pipeline.setDepth(false);
    g.rig.cine = null; g.rig.pos.copy(g.camera.position); g.rig.fov = g.camera.fov; g.rig.snapBehind(); g.rig.settle = 0.9;
    this.acc = 0;
  }

  hide() {
    const g = this.g, off = (o) => { if (o && o.visible) { this.hidden.push(o); o.visible = false; } };
    off(g.traffic?.batch?.group); off(g.peds?.renderer?.mesh); off(g.contact?.mesh);
    for (const v of g.vehicles) if (v !== this.v) off(v.group);
    for (const h of g.police?.helis || []) off(h.group);
    for (const o of g.police?.officers || []) off(o.rig?.root);
    off(g.player.rig?.root);
  }

  pose(t, dt) {
    const v = this.v, p = v.phys, o = this.sample(t, this.o);
    for (let i = 0; i < NK; i++) if (this.has[i]) p[K[i]] = IS_BOOL[i] ? o[i] > 0.5 : o[i];
    for (let i = 0; i < 4; i++) { if (p.wheelDy) p.wheelDy[i] = o[NK + i]; if (p.wheelHit) p.wheelHit[i] = o[NK + 4 + i] > 0.5; }
    v.sync(dt);
    v.group.updateMatrixWorld(true);
    const L = v.car.mats.lights?.userData?.uLight?.value;
    if (L) L.set(v.lights.head ? 1 : 0, (p.brkIn > 0.1 && p.gear >= 0 && p.speed > 0.2 ? 1 : 0) + (p.gear < 0 ? 2 : 0), 0, 0);
  }

  seek(t) { this.t = clamp(t, 0, this.length); this.C.key = ''; }

  frame(dt) {
    const g = this.g, v = this.v, sd = this.paused ? 0 : dt * this.speed;
    if (!this.paused) {
      this.t += sd;
      if (this.t >= this.length) { if (this.loop) { this.t = 0; this.C.key = ''; } else { this.t = this.length; this.paused = true; } }
    }
    this.pose(this.t, sd);
    this.director(dt, this.t);
    g.time += sd;
    g.view.update(g.camera);
    g.sky.update(sd, v.pos, g.camera);
    g.world.update(sd, g.camera.position, g.sky, g.view);
    g.fx.update(sd);
    g.radio?.update(dt);
    g.grass.update(sd, g.camera, g.sky, [{ x: v.x, z: v.z, r: Math.max(v.hx, v.hz) * 1.05 + 0.6, k: 1 }]);
    g.wake.update(sd, g.camera.position.x, g.camera.position.z);
    g.audio.update(g, dt);
    g.input.pressed.clear(); g.input.mouse.dx = g.input.mouse.dy = 0;
  }

  // ------------------------------------------------------------------ director
  shotAt(t) {
    if (this.shot !== 'auto') return { name: this.shot, start: Math.floor(t / SEG) * SEG, idx: Math.floor(t / SEG) };
    const i = Math.floor(t / SEG), order = this.v.isBoat ? ORDER_BOAT : ORDER_CAR;
    return { name: order[i % order.length], start: i * SEG, idx: i };
  }

  ground(x, z, y) {
    const g = this.g;
    return this.v.isBoat ? g.world.sea.waveAt(x, z) : g.world.groundY(x, z, y + 6);
  }

  blocked(x0, z0, x1, z1, y) { return this.g.world.colliders.raycast(x0, z0, x1, z1, y + 0.4, y + 3, (c) => c.kind === 'building' || c.kind === 'wall' || c.kind === 'pier') < 1; }

  director(dt, t) {
    const g = this.g, cam = g.camera, v = this.v, p = v.phys, C = this.C, sh = this.shotAt(t), key = sh.name + ':' + sh.idx, cut = C.key !== key;
    C.key = key;
    const boat = !!v.isBoat, L = v.dims.L, H = v.dims.H, Wd = v.hz * 2, sp = p.speed, yaw = p.yaw, s = Math.sin(yaw), c = Math.cos(yaw);
    const cx = v.group.position.x, cy = p.y, cz = v.group.position.z;
    const want = this.want, aim = this.aim, local = (lx, ly, lz, o) => o.set(cx + c * lx + s * lz, cy + ly, cz - s * lx + c * lz);
    const side = sh.idx % 2 ? -1 : 1;
    let fov = 58, follow = 7, aimK = 12, rigid = false;
    aim.set(cx + s * Math.min(sp, 40) * 0.05, cy + H * 0.6, cz + c * Math.min(sp, 40) * 0.05);
    let mode = 'chase', minH = boat ? 0.9 : 0.55;
    switch (sh.name) {
      case 'chase': {
        const dist = L * 0.95 + 3.2 + Math.min(sp, 60) * 0.03;
        want.set(cx - s * dist, cy + H * 0.8 + 1, cz - c * dist);
        if (this.blocked(cx, cz, want.x, want.z, cy)) { want.x = cx + (want.x - cx) * 0.45; want.z = cz + (want.z - cz) * 0.45; want.y += 0.6; }
        fov = 54 + clamp(sp / 70, 0, 1) * 10; follow = 6;
        break;
      }
      case 'track': case 'front': {
        if (cut || !C.fixed.lengthSq()) {
          const t1 = Math.min(this.length, t + (sh.name === 'front' ? 1.9 : 1.6)), o2 = this.sample(t1, this.o2), fx = o2[0], fz = o2[2], fy = o2[1], fyaw = o2[YAW], fs = Math.sin(fyaw), fc = Math.cos(fyaw);
          const lat = sh.name === 'front' ? 1.4 : 7 + Math.min(sp, 40) * 0.08, ahead = sh.name === 'front' ? 9 + sp * 0.12 : 4;
          for (const sg of [side, -side]) {
            C.fixed.set(fx + fs * ahead + fc * lat * sg, fy, fz + fc * ahead - fs * lat * sg);
            if (!this.blocked(fx, fz, C.fixed.x, C.fixed.z, fy)) break;
          }
          C.fixed.y = Math.max(this.ground(C.fixed.x, C.fixed.z, fy) + 1.15, boat ? fy + 1.1 : 0);
        }
        want.copy(C.fixed); rigid = true;
        fov = clamp(2 * Math.atan(3.2 / Math.max(want.distanceTo(aim), 1)) * 57.3, 18, 62);
        minH = 0.4;
        break;
      }
      case 'side': {
        local(side * (Wd / 2 + 4.6 + Math.min(sp, 40) * 0.03), H * 0.55 + 0.5, L * 0.12, want);
        if (this.blocked(cx, cz, want.x, want.z, cy)) local(-side * (Wd / 2 + 4.6), H * 0.55 + 0.5, L * 0.12, want);
        aim.set(cx, cy + H * 0.5, cz);
        fov = 50; follow = 8;
        break;
      }
      case 'heli': {
        const a = sh.idx * 1.9 + (t - sh.start) * 0.24, r = 24 + Math.min(sp, 50) * 0.3;
        want.set(cx + Math.cos(a) * r, cy + 26 + Math.min(sp, 50) * 0.2, cz + Math.sin(a) * r);
        aim.set(cx, cy + H * 0.4, cz);
        fov = 46; follow = 3.2; minH = 6;
        break;
      }
      case 'wheel': {
        local(-side * (Wd / 2 + 1.05), 0.34, -L * 0.3, want);
        local(Wd * 0.05, 0.42, L * 0.16, aim);
        fov = 70; follow = 30; aimK = 40; rigid = true; minH = 0.22;
        break;
      }
      case 'hood': case 'cockpit': {
        let lx, ly, lz;
        if (sh.name === 'hood') { lx = 0; ly = boat ? H * 0.42 + 0.5 : H * 0.72 + 0.2; lz = boat ? L * 0.3 : L * 0.12; mode = 'hood'; }
        else {
          const seat = v.car.geo.seat || { x: 0.37, y: 1, z: 0 }, eye = boat ? v.car.geo.eye : null, bike = v.def.body.style === 'bike';
          if (eye) { lx = eye.x; ly = eye.y; lz = eye.z; } else { lx = bike ? 0 : seat.x; ly = bike ? seat.y + 0.7 : Math.max(seat.y + 0.42, (v.def.body.beltY || 0) + 0.21); lz = seat.z + 0.05; }
          mode = 'cockpit';
        }
        want.set(lx, ly, lz).applyMatrix4(v.group.matrixWorld);
        aim.set(0, 0, 6).applyQuaternion(v.group.getWorldQuaternion(_q)).add(want);
        fov = mode === 'cockpit' ? 72 : 68; follow = 1000; aimK = 1000; rigid = true; minH = -5;
        break;
      }
      default: break;
    }
    const dof = cut ? 0 : DOF[sh.name] || 0;
    if (cut) { C.pos.copy(want); C.look.copy(aim); C.fov = fov; if (sh.name !== 'track' && sh.name !== 'front') C.fixed.set(0, 0, 0); }
    else {
      C.pos.lerp(want, 1 - Math.exp(-dt * follow));
      C.look.lerp(aim, 1 - Math.exp(-dt * aimK));
      C.fov = damp(C.fov, fov, 4, dt);
    }
    if (rigid && (sh.name === 'wheel' || sh.name === 'hood' || sh.name === 'cockpit')) C.pos.copy(want);
    if (sh.name === 'track' || sh.name === 'front') C.pos.copy(C.fixed);
    const gy = this.ground(C.pos.x, C.pos.z, C.pos.y);
    if (minH > -4 && C.pos.y < gy + minH) C.pos.y = gy + minH;
    cam.position.copy(C.pos); cam.lookAt(C.look);
    if (mode !== 'chase') cam.rotation.z += -p.visRoll * 0.4;
    if (Math.abs(cam.fov - C.fov) > 0.01) { cam.fov = C.fov; cam.updateProjectionMatrix(); }
    g.rig.mode = mode;
    const fx = g.pipeline.fx;
    fx.dof = damp(fx.dof || 0, dof, 6, dt);
    fx.focus.set(Math.max(2, C.pos.distanceTo(_v.set(cx, cy + 0.6, cz))), 2.5);
  }
}
