import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCarMesh } from '../vehicles/carMesh.js';
import { buildHuman, poseFor, applyPose, DEFAULT_LOOK } from '../actors/human.js';
import { clamp, damp, dampAngle } from '../core/math.js';

// Studio scene for the garage, showroom, shop and avatar creator. Rendered through the game pipeline (HDR, bloom, AA).
export class Stage {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d10);
    this.scene.fog = new THREE.Fog(0x0b0d10, 14, 42);
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
    const pm = new THREE.PMREMGenerator(game.renderer);
    this.envRT = pm.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(4, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 0.5; sc.far = 24;
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03;
    const rim1 = new THREE.DirectionalLight(0x9fb8ff, 1.4); rim1.position.set(-6, 3, -4);
    const rim2 = new THREE.DirectionalLight(0xff8f8f, 0.9); rim2.position.set(5, 2, -6);
    const hemi = new THREE.HemisphereLight(0xdde6ff, 0x1a1c20, 0.35);
    this.scene.add(key, rim1, rim2, hemi, key.target);
    // platform
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.42, metalness: 0.25 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.66, 96), new THREE.MeshBasicMaterial({ color: 0x5b6570, transparent: true, opacity: 0.5, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004;
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.23, 96), new THREE.MeshBasicMaterial({ color: 0xe5383b, transparent: true, opacity: 0.35, toneMapped: false }));
    ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.004;
    this.scene.add(floor, ring, ring2);
    this.turn = new THREE.Group();
    this.scene.add(this.turn);
    this.yaw = 0.9; this.pitch = 0.14; this.dist = 7.4; this.tYaw = 0.9; this.tPitch = 0.14; this.tDist = 7.4;
    this.center = new THREE.Vector3(0, 0.8, 0);
    this.auto = 0.22; this.idleT = 0;
    this.subject = null; this.kind = null;
    this.spin = 0;
  }

  clearSubject() {
    if (this.subject) { this.turn.remove(this.subject.group || this.subject.root); this.subject = null; }
    this.pose = null;
  }

  showCar(def, custom = {}, opts = {}) {
    this.clearSubject();
    const car = createCarMesh(def, { ...custom, doors: opts.doors !== false });
    car.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    car.group.position.y = def.boat ? def.body.draft + 0.02 : 0;
    this.turn.add(car.group);
    this.subject = car; this.kind = 'car';
    const b = def.body;
    const sl = def.perf?.sail;
    this.center.set(0, sl ? sl.mast * 0.4 : b.roofY * 0.5 || 0.7, 0);
    this.tDist = sl ? Math.max(b.L * 1.9, sl.mast * 2.1) : Math.max(8.2, b.L * 2.05); this.tPitch = sl ? 0.08 : 0.13;
    this.maxDist = sl ? this.tDist * 1.4 : 16;
    // lights on for showroom feel
    if (car.mats.lights?.userData?.uLight) car.mats.lights.userData.uLight.value.set(opts.lights === false ? 0 : 1, 0, 0, 0);
    if (opts.open) for (const k of opts.open) this.setPanel(k, 1);
    this.car = car; this.def = def;
    this.panels = { L: 0, R: 0, hood: 0, trunk: 0 }; this.panelT = { L: opts.open?.includes('L') ? 1 : 0, R: 0, hood: 0, trunk: 0 };
    return car;
  }

  setPanel(k, v) { if (this.panelT) this.panelT[k] = v; }

  showAvatar(look = DEFAULT_LOOK) {
    this.clearSubject();
    const rig = buildHuman(look);
    rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.turn.add(rig.root);
    this.subject = rig; this.kind = 'avatar'; this.rig = rig;
    this.center.set(0, 0.95 * (look.height || 1.78) / 1.78, 0);
    this.tDist = 3.3; this.tPitch = 0.05; this.tYaw = 0.35; this.animT = 0;
    this.emote = null;
    return rig;
  }

  playEmote(name) { this.emote = { name, t: 0 }; }

  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }

  drag(dx, dy) { this.tYaw -= dx * 0.008; this.tPitch = clamp(this.tPitch + dy * 0.006, -0.05, 0.9); this.idleT = 3; }
  zoom(d) { this.tDist = clamp(this.tDist * (1 + d * 0.001), 2, this.maxDist || 16); this.idleT = 3; }
  // shift the framing sideways so the subject sits in the free half of the screen
  frame(offsetX = 0) { this.offsetX = offsetX; }

  update(dt) {
    this.idleT = Math.max(0, this.idleT - dt);
    if (this.idleT <= 0 && this.auto) this.tYaw += this.auto * dt;
    this.yaw = damp(this.yaw, this.tYaw, 7, dt); this.pitch = damp(this.pitch, this.tPitch, 7, dt); this.dist = damp(this.dist, this.tDist, 6, dt);
    const ox = damp(this._ox || 0, this.offsetX || 0, 5, dt); this._ox = ox;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cam = this.camera, c = this.center;
    cam.position.set(c.x + Math.sin(this.yaw) * cp * this.dist, c.y + sp * this.dist + 0.25, c.z + Math.cos(this.yaw) * cp * this.dist);
    cam.lookAt(c);
    if (ox) { const r = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0); cam.position.addScaledVector(r, ox * this.dist * 0.2); cam.lookAt(c.clone().addScaledVector(r, ox * this.dist * 0.2)); }
    if (this.kind === 'car' && this.car) {
      const v = this.car;
      for (const k of ['L', 'R', 'hood', 'trunk']) {
        this.panels[k] = damp(this.panels[k], this.panelT[k], 5, dt);
        const e = this.panels[k] * this.panels[k] * (3 - 2 * this.panels[k]), P = v.panels || {};
        if (k === 'L' && P.doorL) P.doorL.rotation.y = -e * 1.12; else if (k === 'R' && P.doorR) P.doorR.rotation.y = e * 1.12;
        else if (k === 'hood' && P.hood) P.hood.rotation.x = -e * 0.95; else if (k === 'trunk' && P.trunk) P.trunk.rotation.x = e;
      }
      this.spin += dt * 2;
      for (const w of v.wheels) { w.spin.rotation.x = this.spin * 0.2; w.pivot.position.y = w.r; }
    } else if (this.kind === 'avatar' && this.rig) {
      this.animT += dt;
      let name = 'idle';
      if (this.emote) { this.emote.t += dt; name = this.emote.name; if (this.emote.t > 3.2) this.emote = null; }
      applyPose(this.rig, poseFor(name, this.animT, this.animT * 3, 1));
    }
  }

  render(dt) { this.game.pipeline.render(dt, this.scene, this.camera); }
}
