import * as THREE from 'three';

// GPU-billboarded particle system: one draw call. Premultiplied output lets one pass draw smoke (alpha) and fire (additive).
const VS = `
attribute vec3 aPos; attribute vec4 aColor; attribute vec4 aData; // size, rot, add, kind
uniform float uLight; varying vec4 vC; varying vec2 vUv; varying float vAdd; varying float vKind;
void main(){
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float c = cos(aData.y), s = sin(aData.y);
  vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aData.x;
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5; vAdd = aData.z; vKind = aData.w;
  vC = vec4(aColor.rgb * mix(uLight, 1.0, aData.z), aColor.a);
}`;
const FS = `
varying vec4 vC; varying vec2 vUv; varying float vAdd; varying float vKind;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 d = vUv - 0.5; float r = length(d) * 2.0;
  float a;
  if (vKind < 0.5) { a = smoothstep(1.0, 0.15, r); a *= a; }          // soft puff
  else if (vKind < 1.5) { a = smoothstep(1.0, 0.0, r); }               // spark / flame core
  else { float n = hash(floor((vUv + vC.r) * 6.0)); a = smoothstep(1.0, 0.3, r) * (0.6 + 0.4 * n); } // dust / debris grain
  a *= vC.a;
  gl_FragColor = vec4(vC.rgb * a, a * (1.0 - vAdd));
  if (gl_FragColor.a + gl_FragColor.r + gl_FragColor.g + gl_FragColor.b < 0.002) discard;
}`;

export class Particles {
  constructor(scene, max = 3500) {
    this.max = max; this.n = 0;
    const N = max;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N); this.maxLife = new Float32Array(N);
    this.s0 = new Float32Array(N); this.s1 = new Float32Array(N);
    this.c0 = new Float32Array(N * 4); this.c1 = new Float32Array(N * 4);
    this.drag = new Float32Array(N); this.grav = new Float32Array(N); this.add = new Float32Array(N); this.kind = new Float32Array(N); this.rot = new Float32Array(N); this.spin = new Float32Array(N);
    this.iPos = new Float32Array(N * 3); this.iCol = new Float32Array(N * 4); this.iData = new Float32Array(N * 4);
    const q = new THREE.InstancedBufferGeometry();
    q.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    q.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(this.iPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.iCol, 4).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(this.iData, 4).setUsage(THREE.DynamicDrawUsage);
    q.setAttribute('aPos', this.aPos); q.setAttribute('aColor', this.aCol); q.setAttribute('aData', this.aData);
    q.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uLight: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, fog: false });
    this.mesh = new THREE.Mesh(q, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
    this.geo = q;
  }

  // o: { x,y,z, vx,vy,vz, life, s0,s1, c0:[r,g,b,a], c1, drag, grav, add, kind, rot, spin }
  emit(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 1;
    this.s0[i] = o.s0 ?? 0.3; this.s1[i] = o.s1 ?? 1;
    const a = o.c0 || [1, 1, 1, 0.5], b = o.c1 || a;
    for (let k = 0; k < 4; k++) { this.c0[i * 4 + k] = a[k]; this.c1[i * 4 + k] = b[k]; }
    this.drag[i] = o.drag ?? 1.5; this.grav[i] = o.grav ?? 0; this.add[i] = o.add ?? 0; this.kind[i] = o.kind ?? 0; this.rot[i] = o.rot ?? Math.random() * 6.28; this.spin[i] = o.spin ?? (Math.random() - 0.5) * 1.5;
  }

  update(dt, light = 1) {
    let n = this.n;
    for (let i = 0; i < n;) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) this.copy(n, i);
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt), i3 = i * 3;
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
      i++;
    }
    this.n = n;
    for (let i = 0; i < n; i++) {
      const t = 1 - this.life[i] / this.maxLife[i], i3 = i * 3, i4 = i * 4;
      this.iPos[i3] = this.pos[i3]; this.iPos[i3 + 1] = this.pos[i3 + 1]; this.iPos[i3 + 2] = this.pos[i3 + 2];
      const fade = t < 0.08 ? t / 0.08 : 1;
      for (let k = 0; k < 3; k++) this.iCol[i4 + k] = this.c0[i4 + k] + (this.c1[i4 + k] - this.c0[i4 + k]) * t;
      this.iCol[i4 + 3] = (this.c0[i4 + 3] + (this.c1[i4 + 3] - this.c0[i4 + 3]) * t) * fade;
      this.iData[i4] = this.s0[i] + (this.s1[i] - this.s0[i]) * t; this.iData[i4 + 1] = this.rot[i]; this.iData[i4 + 2] = this.add[i]; this.iData[i4 + 3] = this.kind[i];
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aData.needsUpdate = n > 0;
    this.mat.uniforms.uLight.value = light;
    this.mesh.visible = n > 0;
  }

  copy(from, to) {
    for (const [arr, w] of [[this.pos, 3], [this.vel, 3], [this.c0, 4], [this.c1, 4]]) for (let k = 0; k < w; k++) arr[to * w + k] = arr[from * w + k];
    for (const arr of [this.life, this.maxLife, this.s0, this.s1, this.drag, this.grav, this.add, this.kind, this.rot, this.spin]) arr[to] = arr[from];
  }
}
