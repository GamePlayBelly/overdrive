import * as THREE from 'three';

// Top-down foam map centred on the camera: boats, swimmers and splashes stamp soft blobs, every frame the map diffuses and fades,
// and the sea shader reads it as white water. Persistent, frame-rate independent and exact on the wave surface.
const DECAY_VS = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DECAY_FS = `
precision highp float;
uniform sampler2D uPrev; uniform vec2 uShift; uniform float uDecay; uniform float uSpread; uniform float uTexel;
varying vec2 vUv;
float at(vec2 uv){ return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 0.0 : texture2D(uPrev, uv).r; }
void main(){
  vec2 uv = vUv + uShift;
  float c = at(uv);
  float n = at(uv + vec2(uTexel, 0.0)) + at(uv - vec2(uTexel, 0.0)) + at(uv + vec2(0.0, uTexel)) + at(uv - vec2(0.0, uTexel));
  float v = mix(c, n * 0.25, uSpread) * uDecay - 0.0012;
  gl_FragColor = vec4(max(v, 0.0), 0.0, 0.0, 1.0);
}`;
const STAMP_VS = `
attribute vec4 aS; // x, z relative to the map centre, radius, strength
uniform float uHalf; varying vec2 vP; varying float vK;
void main(){
  vP = position.xy * 2.0; vK = aS.w;
  vec2 w = aS.xy + position.xy * 2.0 * aS.z;
  gl_Position = vec4(w / uHalf, 0.0, 1.0);
}`;
const STAMP_FS = `
precision highp float;
varying vec2 vP; varying float vK;
void main(){ float r = length(vP); float a = smoothstep(1.0, 0.0, r); a = a * a * (3.0 - 2.0 * a); gl_FragColor = vec4(a * vK, 0.0, 0.0, 1.0); }`;

// Hull waves: a damped 2D wave equation (r = height, g = velocity) on the same camera-centred window. Bows and sterns push impulses into it
// and the divergent V of a wake, bow waves and the slap against hulls emerge on their own; the sea shader reads the slope as normals.
const SIM_FS = `
precision highp float;
uniform sampler2D uPrev; uniform vec2 uShift; uniform float uK; uniform float uDamp; uniform float uTexel;
varying vec2 vUv;
vec2 at(vec2 uv){ return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec2(0.0) : texture2D(uPrev, uv).rg; }
void main(){
  vec2 uv = vUv + uShift;
  vec2 c = at(uv);
  float lap = at(uv + vec2(uTexel, 0.0)).x + at(uv - vec2(uTexel, 0.0)).x + at(uv + vec2(0.0, uTexel)).x + at(uv - vec2(0.0, uTexel)).x - 4.0 * c.x;
  float v = (c.y + uK * lap) * uDamp;
  float e = smoothstep(0.0, 0.07, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  gl_FragColor = vec4((c.x + v) * e, v * e, 0.0, 1.0);
}`;
const WSTAMP_FS = `
precision highp float;
varying vec2 vP; varying float vK;
void main(){ float r = length(vP); float a = smoothstep(1.0, 0.0, r); a = a * a * (3.0 - 2.0 * a); gl_FragColor = vec4(0.0, a * vK, 0.0, 0.0); }`;

export class WakeMap {
  constructor(renderer, uniforms, size = 512, span = 120) {
    this.r = renderer; this.size = size; this.span = span; this.texel = span / size;
    const mk = () => new THREE.WebGLRenderTarget(size, size, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false });
    this.A = mk(); this.B = mk();
    this.cx = 1e9; this.cz = 1e9;
    this.center = uniforms.uWakeC.value;
    this.decayMat = new THREE.ShaderMaterial({ vertexShader: DECAY_VS, fragmentShader: DECAY_FS, uniforms: { uPrev: { value: null }, uShift: { value: new THREE.Vector2() }, uDecay: { value: 1 }, uSpread: { value: 0.2 }, uTexel: { value: 1 / size } }, depthTest: false, depthWrite: false });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.decayMesh = new THREE.Mesh(tri, this.decayMat); this.decayMesh.frustumCulled = false;
    this.max = 384;
    const q = new THREE.InstancedBufferGeometry();
    q.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    q.setIndex([0, 1, 2, 0, 2, 3]);
    this.data = new Float32Array(this.max * 4);
    this.attr = new THREE.InstancedBufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage);
    q.setAttribute('aS', this.attr); q.instanceCount = 0;
    this.stampMat = new THREE.ShaderMaterial({ vertexShader: STAMP_VS, fragmentShader: STAMP_FS, uniforms: { uHalf: { value: span / 2 } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    this.stampMesh = new THREE.Mesh(q, this.stampMat); this.stampMesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.decayMesh);
    this.scene2 = new THREE.Scene(); this.scene2.add(this.stampMesh);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.list = []; this.n = 0;
    const mh = () => new THREE.WebGLRenderTarget(size, size, { format: THREE.RGBAFormat, type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false });
    this.SA = mh(); this.SB = mh();
    this.simMat = new THREE.ShaderMaterial({ vertexShader: DECAY_VS, fragmentShader: SIM_FS, uniforms: { uPrev: { value: null }, uShift: { value: new THREE.Vector2() }, uK: { value: 0.04 }, uDamp: { value: 0.992 }, uTexel: { value: 1 / size } }, depthTest: false, depthWrite: false });
    this.simMesh = new THREE.Mesh(tri, this.simMat); this.simMesh.frustumCulled = false;
    this.simScene = new THREE.Scene(); this.simScene.add(this.simMesh);
    this.wmax = 160; this.wn = 0;
    const wq = new THREE.InstancedBufferGeometry();
    wq.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); wq.setIndex([0, 1, 2, 0, 2, 3]);
    this.wdata = new Float32Array(this.wmax * 4);
    this.wattr = new THREE.InstancedBufferAttribute(this.wdata, 4).setUsage(THREE.DynamicDrawUsage);
    wq.setAttribute('aS', this.wattr); wq.instanceCount = 0;
    this.wstampMat = new THREE.ShaderMaterial({ vertexShader: STAMP_VS, fragmentShader: WSTAMP_FS, uniforms: { uHalf: { value: span / 2 } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    this.wstampMesh = new THREE.Mesh(wq, this.wstampMat); this.wstampMesh.frustumCulled = false;
    this.wScene = new THREE.Scene(); this.wScene.add(this.wstampMesh);
    this.waveC = 3.2;
    this.uniforms = uniforms;
    uniforms.uWake.value = this.A.texture; if (uniforms.uWaveSim) uniforms.uWaveSim.value = this.SA.texture; uniforms.uWakeSpan.value = span; uniforms.uWakeOn.value = 0;
    this.enabled = true;
    this.tau = 3.2;
  }

  // strength 0..1, radius in metres
  stamp(x, z, radius, strength) {
    if (this.n >= this.max) return;
    const i = this.n++ * 4;
    this.data[i] = x; this.data[i + 1] = z; this.data[i + 2] = radius; this.data[i + 3] = strength;
  }

  // an impulse into the wave equation: positive pushes the surface up, negative pulls it down
  wave(x, z, radius, impulse) {
    if (this.wn >= this.wmax) return;
    const i = this.wn++ * 4;
    this.wdata[i] = x; this.wdata[i + 1] = z; this.wdata[i + 2] = radius; this.wdata[i + 3] = impulse;
  }

  update(dt, camX, camZ) {
    if (!this.enabled) { this.uniforms.uWakeOn.value = 0; this.n = 0; return; }
    const t = this.texel;
    const nx = Math.round(camX / t) * t, nz = Math.round(camZ / t) * t;
    const first = this.cx > 1e8;
    const sx = first ? 0 : (nx - this.cx) / this.span, sz = first ? 0 : (nz - this.cz) / this.span;
    this.cx = nx; this.cz = nz; this.center.set(nx, nz);
    const r = this.r, prevTarget = r.getRenderTarget(), prevAuto = r.autoClear;
    const B = this.B;
    this.decayMat.uniforms.uPrev.value = this.A.texture;
    this.decayMat.uniforms.uShift.value.set(sx, sz);
    this.decayMat.uniforms.uDecay.value = Math.exp(-dt / this.tau);
    this.decayMat.uniforms.uSpread.value = Math.min(0.6, 6 * dt);
    r.autoClear = false;
    r.setRenderTarget(B);
    r.render(this.scene, this.cam);
    if (this.n > 0) {
      const inst = this.stampMesh.geometry;
      for (let i = 0; i < this.n; i++) { this.data[i * 4] -= nx; this.data[i * 4 + 1] -= nz; }
      inst.instanceCount = this.n; this.attr.needsUpdate = true;
      r.render(this.scene2, this.cam);
      this.n = 0;
    }
    // wave equation step(s), then this frame's hull impulses
    const steps = dt > 1 / 40 ? 2 : 1, h = dt / steps, cfl = (this.waveC * h) / this.texel;
    for (let s = 0; s < steps; s++) {
      const su = this.simMat.uniforms;
      su.uPrev.value = this.SA.texture; su.uShift.value.set(s === 0 ? sx : 0, s === 0 ? sz : 0); su.uK.value = Math.min(0.2, cfl * cfl);
      r.setRenderTarget(this.SB); r.render(this.simScene, this.cam);
      if (s === steps - 1 && this.wn > 0) {
        for (let i = 0; i < this.wn; i++) { this.wdata[i * 4] -= nx; this.wdata[i * 4 + 1] -= nz; }
        this.wstampMesh.geometry.instanceCount = this.wn; this.wattr.needsUpdate = true;
        r.render(this.wScene, this.cam);
      }
      const ts = this.SA; this.SA = this.SB; this.SB = ts;
    }
    this.wn = 0;
    r.setRenderTarget(prevTarget); r.autoClear = prevAuto;
    if (this.uniforms.uWaveSim) this.uniforms.uWaveSim.value = this.SA.texture;
    const t0 = this.A; this.A = this.B; this.B = t0;
    this.uniforms.uWake.value = this.A.texture;
    this.uniforms.uWakeOn.value = 1;
  }
}
