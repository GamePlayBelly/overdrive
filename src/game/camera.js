import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, smoothstep, wrapAngle } from '../core/math.js';

const MODES = ['chase', 'far', 'hood', 'cockpit', 'bumper'];

export class CameraRig {
  constructor(camera, game) {
    this.cam = camera;
    this.game = game;
    this.mode = 'chase';
    this.pos = new THREE.Vector3(0, 5, 10);
    this.look = new THREE.Vector3();
    this.yawOff = 0; this.pitchOff = 0.12; this.orbitT = 0;
    this.shake = 0;
    this.fov = 62; this.baseFov = 62; this.settle = 0;
    this.footYaw = 0; this.footPitch = 0.2;
    this.cine = null;
    this.lookBack = false;
    this.velYaw = 0;
    this.shakeEnabled = true;
    this.fovEffects = true;
  }

  cycle() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    return this.mode;
  }

  addShake(v) { if (this.shakeEnabled) this.shake = Math.min(1.2, this.shake + v); }

  // scripted cinematic: { target: Vector3 | fn, from: Vector3 | fn, dur, orbit }
  cinematic(c) { this.cine = { t: 0, ...c }; }

  update(dt, input) {
    const g = this.game, cam = this.cam;
    this.settle = Math.max(0, this.settle - dt);
    const mdx = input.mouse.dx, mdy = input.mouse.dy;
    const [lx, ly] = input.lookAxes();
    if (this.cine) {
      const c = this.cine;
      c.t += dt;
      const tgt = typeof c.target === 'function' ? c.target(c.t) : c.target;
      const from = typeof c.from === 'function' ? c.from(c.t) : c.from;
      this.pos.lerp(from, 1 - Math.exp(-dt * (c.snap ?? 3)));
      this.look.lerp(tgt, 1 - Math.exp(-dt * 5));
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
      this.setFov(c.fov || 50, dt);
      if (c.dur && c.t > c.dur) { this.cine = null; c.done?.(); }
      return;
    }
    const v = g.player.vehicle;
    if (v) {
      const p = v.phys;
      const s = Math.sin(p.yaw), co = Math.cos(p.yaw);
      const speed = p.speed;
      if (mdx || mdy || lx || ly) {
        this.yawOff -= mdx * 0.004 * input.mouseSens + lx * dt * 2.5;
        this.pitchOff = clamp(this.pitchOff + (input.invertY ? -1 : 1) * (mdy * 0.003 * input.mouseSens + ly * dt * 1.5), -0.25, 1.1);
        this.orbitT = 1.8;
      }
      this.orbitT -= dt;
      if (this.orbitT <= 0) { this.yawOff = damp(this.yawOff, 0, 3, dt); this.pitchOff = damp(this.pitchOff, 0.12, 3, dt); }
      const boat = !!v.isBoat, sea = boat ? g.world.sea : null;
      if (boat) this.boatY = this.boatV === v ? damp(this.boatY, p.y, 2.6, dt) : p.y;
      this.boatV = boat ? v : null;
      const refY = boat ? this.boatY : p.y;
      const L = v.dims.L, H = v.dims.H;
      // follow velocity heading slightly when sliding
      const velH = speed > 3 ? Math.atan2(p.vx, p.vz) : p.yaw;
      const rev = p.fwdSpeed < -2 && p.gear < 0;
      let baseYaw = p.yaw;
      const slide = wrapAngle(velH - p.yaw);
      if (!rev && speed > 5) baseYaw = p.yaw + clamp(slide, -0.6, 0.6) * 0.45;
      this.velYaw = dampAngle(this.velYaw, baseYaw, 6, dt);
      let yaw = this.velYaw + this.yawOff + (this.lookBack ? Math.PI : 0);
      const bodyC = new THREE.Vector3(v.group.position.x, refY, v.group.position.z);
      if (this.mode === 'chase' || this.mode === 'far') {
        const far = this.mode === 'far' ? 1.45 : 1;
        const mast = boat ? v.def.perf?.sail?.mast || 0 : 0;
        const dist = (L * (boat ? 0.95 : 1.05) + 3.2 + Math.min(speed, 60) * 0.035 + mast * 0.3) * far;
        const hgt = (boat ? H * 0.55 + 1.5 + mast * 0.3 : H * 0.95 + 0.9) * far + this.pitchOff * dist * 0.5;
        const want = new THREE.Vector3(bodyC.x - Math.sin(yaw) * dist, refY + hgt, bodyC.z - Math.cos(yaw) * dist);
        // keep camera out of buildings
        const t = g.world.colliders.raycast(bodyC.x, bodyC.z, want.x, want.z, refY + 0.5, refY + hgt, (c) => c.kind === 'building' || c.kind === 'wall' || c.kind === 'pier');
        if (t < 1) { want.x = lerp(bodyC.x, want.x, Math.max(0.15, t - 0.08)); want.z = lerp(bodyC.z, want.z, Math.max(0.15, t - 0.08)); }
        const gy = (boat ? sea.waveAt(want.x, want.z) + 0.9 : g.world.groundY(want.x, want.z, want.y) + 0.6);
        if (want.y < gy) want.y = gy;
        const k = 1 - Math.exp(-dt * (this.settle > 0 ? 3.6 : this.orbitT > 0 ? 12 : 7.5));
        this.pos.lerp(want, k);
        this.pos.y = lerp(this.pos.y, want.y, 1 - Math.exp(-dt * 5));
        if (boat && this.pos.y < gy) this.pos.y = gy;
        const ahead = Math.min(speed, 40) * 0.06;
        this.look.set(bodyC.x + s * ahead, refY + H * (boat ? 0.42 : 0.62) + mast * 0.18, bodyC.z + co * ahead);
        cam.position.copy(this.pos);
        cam.lookAt(this.look);
        v.group.visible = true;
      } else {
        const seat = v.car.geo.seat || { x: 0.37, y: 1, z: 0 };
        const eye = boat || v.isAir ? v.car.geo.eye : null;
        const local = this.mode === 'hood' ? new THREE.Vector3(0, boat ? H * 0.42 + 0.5 : H * 0.72 + 0.2, boat ? L * 0.3 : L * 0.12) : this.mode === 'bumper' ? new THREE.Vector3(0, boat ? 0.9 : 0.55, L / 2 + 0.1) : eye ? new THREE.Vector3(eye.x, eye.y, eye.z) : new THREE.Vector3(seat.x * (v.def.body.style === 'bike' ? 0 : 1), v.def.body.style === 'bike' ? seat.y + 0.7 : Math.max(seat.y + 0.42, (v.def.body.beltY || 0) + 0.21), seat.z + 0.05);
        v.group.updateMatrixWorld();
        const wp = local.clone().applyMatrix4(v.group.matrixWorld);
        cam.position.copy(wp);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.visPitch * 0.8 + this.pitchOff * 0.3 - 0.04, p.yaw + this.yawOff + (this.lookBack ? Math.PI : 0), p.visRoll * 0.5, 'YXZ'));
        const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        cam.lookAt(wp.clone().add(dir));
        this.pos.copy(cam.position);
      }
      const targetFov = this.baseFov + (this.mode === 'cockpit' ? 8 : -2) + (this.fovEffects ? smoothstep(10, 70, speed) * 14 : 0);
      this.setFov(targetFov, dt);
      if (this.shakeEnabled) {
        const rough = boat ? (p.planing * 0.3 + p.slam * 0.06) * smoothstep(4, 18, speed) : (p.surfF === 0 || p.surfF === 4 || p.surfF === 3 || p.surfF === 9 ? 0.4 : 0.05) * smoothstep(5, 25, speed) + smoothstep(45, 80, speed) * 0.25;
        this.shake = Math.max(this.shake * Math.exp(-dt * 5), rough * 0.18);
      }
    } else {
      // on foot
      const pl = g.player;
      if (mdx || mdy || lx || ly) {
        this.footYaw -= mdx * 0.0032 * input.mouseSens + lx * dt * 3;
        this.footPitch = clamp(this.footPitch + (input.invertY ? -1 : 1) * (mdy * 0.0028 * input.mouseSens + ly * dt * 2), -0.5, 1.2);
      }
      const d = 4.2 + this.footPitch * 1.6;
      const head = new THREE.Vector3(pl.x, pl.y + 1.55, pl.z);
      const right = new THREE.Vector3(-Math.cos(this.footYaw), 0, Math.sin(this.footYaw));
      const want = new THREE.Vector3(pl.x - Math.sin(this.footYaw) * d * Math.cos(this.footPitch), pl.y + 1.6 + Math.sin(this.footPitch) * d, pl.z - Math.cos(this.footYaw) * d * Math.cos(this.footPitch)).addScaledVector(right, 0.55);
      const t = g.world.colliders.raycast(head.x, head.z, want.x, want.z, pl.y + 0.3, pl.y + 2.5, (c) => c.kind === 'building' || c.kind === 'wall');
      if (t < 1) { want.x = lerp(head.x, want.x, Math.max(0.1, t - 0.1)); want.z = lerp(head.z, want.z, Math.max(0.1, t - 0.1)); }
      let gy = g.world.groundY(want.x, want.z, want.y) + 0.3;
      if (g.world.sea) gy = Math.max(gy, g.world.sea.waveAt(want.x, want.z) + (pl.state === 'swim' ? 0.45 : 0.3));
      if (want.y < gy) want.y = gy;
      this.pos.lerp(want, 1 - Math.exp(-dt * (this.settle > 0 ? 3.2 : 14)));
      cam.position.copy(this.pos);
      cam.lookAt(head.addScaledVector(right, 0.55));
      this.setFov(this.baseFov, dt);
    }
    if (this.shake > 0.001) {
      const t = performance.now() / 1000;
      cam.position.x += Math.sin(t * 41) * this.shake * 0.05;
      cam.position.y += Math.sin(t * 57 + 1) * this.shake * 0.05;
      cam.rotation.z += Math.sin(t * 33) * this.shake * 0.006;
    }
  }

  setFov(f, dt) {
    this.fov = damp(this.fov, f, 3, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }

  snapBehind() {
    const v = this.game.player.vehicle;
    if (v) { this.velYaw = v.phys.yaw; this.yawOff = 0; }
    else this.footYaw = this.game.player.yaw;
  }
}
