import * as THREE from 'three';
import { clamp, smoothstep } from '../core/math.js';

const SHAFT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const SHAFT_FS = `
uniform float uTime; uniform float uInt; uniform vec3 uCol; varying vec2 vUv;
void main(){
  float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
  float fl = 0.65 + 0.35 * sin(vUv.x * 9.0 + uTime * 0.9 + vUv.y * 3.0);
  float a = edge * smoothstep(0.0, 0.4, vUv.y) * smoothstep(1.0, 0.7, vUv.y) * fl * uInt;
  gl_FragColor = vec4(uCol * a, a);
}`;
const SNOW_VS = `
uniform vec3 uCam; uniform float uTime; uniform vec3 uDrift; uniform float uBox; attribute float aSeed;
varying float vA;
void main(){
  vec3 p = position * uBox + uDrift * uTime + vec3(0.0, -0.05 * uTime, 0.0) + vec3(sin(uTime * 0.3 + aSeed * 40.0), cos(uTime * 0.27 + aSeed * 31.0), 0.0) * 0.3;
  p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec4 mv = viewMatrix * vec4(p + uCam, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(110.0 * (0.4 + aSeed) / -mv.z, 1.0, 5.0);
  vA = (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(p))) * (0.5 + 0.5 * aSeed);
}`;
const SNOW_FS = `uniform vec3 uCol; uniform float uInt; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, d) * vA * uInt; gl_FragColor = vec4(uCol, a); }`;

const _l = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

// Everything that happens when the camera is below the surface: water-coloured fog, no sky dome, light shafts from the window above,
// drifting particles, breath bubbles, a distorted and tinted post pass and a muffled mix.
export class Underwater {
  constructor(game) {
    this.g = game; this.k = 0; this.bt = 2; this.t = 0;
    this.clear = new THREE.Color(); game.renderer.getClearColor(this.clear); this.clearA = game.renderer.getClearAlpha();
    const N = 14, geo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0).rotateZ(0);
    this.shaftMat = new THREE.ShaderMaterial({ vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, uniforms: { uTime: { value: 0 }, uInt: { value: 0 }, uCol: { value: new THREE.Color(0.7, 1, 0.95) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.shafts = new THREE.InstancedMesh(geo, this.shaftMat, N); this.shafts.frustumCulled = false; this.shafts.visible = false; this.shafts.renderOrder = 4;
    this.seeds = Array.from({ length: N }, (_, i) => ({ x: (Math.sin(i * 12.9) * 0.5 + 0.5) * 40, z: (Math.sin(i * 78.2) * 0.5 + 0.5) * 40, w: 1.6 + (i % 5) * 0.8, ph: i * 1.7 }));
    game.scene.add(this.shafts);
    const M = 700, pos = new Float32Array(M * 3), seed = new Float32Array(M);
    for (let i = 0; i < M; i++) { pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random(); seed[i] = Math.random(); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.snowU = { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uDrift: { value: new THREE.Vector3() }, uBox: { value: 30 }, uCol: { value: new THREE.Color(0.7, 0.9, 0.9) }, uInt: { value: 0.5 } };
    this.snow = new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: SNOW_VS, fragmentShader: SNOW_FS, uniforms: this.snowU, transparent: true, depthWrite: false }));
    this.snow.frustumCulled = false; this.snow.visible = false; this.snow.renderOrder = 4;
    game.scene.add(this.snow);
    game.on('player:splash', (e) => { const sea = game.world.sea; if (e.speed > 3 && sea) this.burst(e.x, e.y - 0.6, e.z, Math.min(30, 8 + e.speed * 4)); });
  }

  burst(x, y, z, n) {
    const pt = this.g.fx.pt;
    for (let i = 0; i < n; i++) pt.emit({ x: x + (Math.random() - 0.5) * 0.8, y: y - Math.random() * 1.2, z: z + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 0.6, vy: 0.9 + Math.random() * 0.9, vz: (Math.random() - 0.5) * 0.6, life: 0.9 + Math.random() * 0.9, s0: 0.05, s1: 0.1, c0: [0.9, 0.97, 1, 0.55], c1: [0.9, 0.97, 1, 0], drag: 0.7, grav: -0.5, kind: 0 });
  }

  update(dt) {
    const g = this.g, sea = g.world.sea, sky = g.sky, cam = g.camera.position, uw = sea.uw, P = g.player;
    this.t += dt;
    const on = sea.under ? 1 : 0;
    this.k += (on - this.k) * Math.min(1, dt * 10);
    const k = this.k, under = on > 0, fx = g.pipeline.fx;
    fx.water = k;
    g.audio?.setUnderwater?.(k);
    sky.dome.visible = !under;
    if (under) {
      const f = sky.scene.fog; f.color.copy(uw.col); f.density = uw.den;
      g.renderer.setClearColor(uw.col, 1);
      const depth = clamp(sea.camDepth, 0, 30), dim = Math.exp(-depth * 0.14);
      sky.sun.intensity *= 0.35 + 0.65 * dim; sky.sun.color.lerp(new THREE.Color(0.5, 0.85, 0.9), 0.5);
      sky.hemi.intensity *= 0.35 + 0.4 * dim; sky.hemi.color.lerp(uw.col, 0.55);
    } else if (this.wasUnder) g.renderer.setClearColor(this.clear, this.clearA);
    this.wasUnder = under;
    this.shafts.visible = under && g.sky.sun.intensity > 0.2;
    this.snow.visible = under;
    if (!under) return;
    const sd = sky.uniforms.sunDir.value, hx = -sd.x / 1.33, hz = -sd.z / 1.33, m = Math.min(0.95, Math.hypot(hx, hz));
    _l.set(hx, -Math.sqrt(1 - m * m), hz).normalize();
    const depthC = clamp(sea.camDepth, 0, 30), vis = clamp(sd.y * 2.2, 0, 1) * (1 - sky.w.cloud * 0.75) * (1 - sea.uni.uTurb.value * 0.6) * Math.exp(-depthC * 0.09);
    this.shaftMat.uniforms.uInt.value = vis * 0.55; this.shaftMat.uniforms.uTime.value = this.t;
    this.shaftMat.uniforms.uCol.value.copy(uw.col).multiplyScalar(5).lerp(new THREE.Color(0.8, 1, 0.95), 0.5);
    const wy = sea.waves.sample(cam.x, cam.z, null, sea.t - sea.waves.tRef), S = 44, len = Math.min(26, Math.max(10, depthC + 14));
    for (let i = 0; i < this.seeds.length; i++) {
      const s = this.seeds[i];
      const px = cam.x + ((s.x - cam.x) % S + S * 1.5) % S - S / 2, pz = cam.z + ((s.z - cam.z) % S + S * 1.5) % S - S / 2;
      _y.copy(_l).negate();
      _z.set(cam.x - px, 0, cam.z - pz).normalize();
      _x.crossVectors(_y, _z).normalize();
      _z.crossVectors(_x, _y).normalize();
      _m.makeBasis(_x.multiplyScalar(s.w * (0.8 + 0.4 * Math.sin(this.t * 0.3 + s.ph))), _y.multiplyScalar(len), _z).setPosition(px, wy, pz);
      this.shafts.setMatrixAt(i, _m);
    }
    this.shafts.instanceMatrix.needsUpdate = true;
    const U = this.snowU; U.uCam.value.copy(cam); U.uTime.value = this.t; U.uDrift.value.set(P.cur?.x ?? 0, 0, P.cur?.z ?? 0).multiplyScalar(2).add(_s.set(0.05, 0, 0.03));
    U.uCol.value.copy(uw.col).multiplyScalar(4).add(new THREE.Color(0.25, 0.3, 0.3)); U.uInt.value = 0.55 * (0.4 + 0.6 * Math.exp(-depthC * 0.05));
    // breath bubbles while the head is under
    if (P.state === 'swim' && P.dive > 0.3) {
      this.bt -= dt;
      if (this.bt <= 0) { this.bt = 2.2 + Math.random() * 2; this.burst(P.x + Math.sin(P.yaw) * 0.25, P.y + 1.3, P.z + Math.cos(P.yaw) * 0.25, 7 + Math.floor(Math.random() * 6)); }
    }
  }
}
