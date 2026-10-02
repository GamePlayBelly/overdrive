def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('src/render/wake.js', [
 ("export class WakeMap {", """// Hull waves: a damped 2D wave equation (r = height, g = velocity) on the same camera-centred window. Bows and sterns push impulses into it
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

export class WakeMap {"""),
 ("    this.list = []; this.n = 0;\n", """    this.list = []; this.n = 0;
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
"""),
 ("    uniforms.uWake.value = this.A.texture;", "    uniforms.uWake.value = this.A.texture; if (uniforms.uWaveSim) uniforms.uWaveSim.value = this.SA.texture;"),
 ("  update(dt, camX, camZ) {", """  // an impulse into the wave equation: positive pushes the surface up, negative pulls it down
  wave(x, z, radius, impulse) {
    if (this.wn >= this.wmax) return;
    const i = this.wn++ * 4;
    this.wdata[i] = x; this.wdata[i + 1] = z; this.wdata[i + 2] = radius; this.wdata[i + 3] = impulse;
  }

  update(dt, camX, camZ) {"""),
 ("    r.setRenderTarget(prevTarget); r.autoClear = prevAuto;\n    const t0 = this.A;", """    // wave equation step(s), then this frame's hull impulses
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
    const t0 = this.A;"""),
])

patch('src/world/sea.js', [
 ("uniform sampler2D uWake; uniform vec2 uWakeC; uniform float uWakeSpan; uniform float uWakeOn;\nuniform vec2 uWindDir;", "uniform sampler2D uWake; uniform vec2 uWakeC; uniform float uWakeSpan; uniform float uWakeOn; uniform sampler2D uWaveSim;\nuniform vec2 uWindDir;"),
 ("  // depth from the terrain height map\n  vec2 duv", """  // hull waves from the wave-equation map: slope tilts the normal, steep crests whiten
  float hullFoam = 0.0;
  if (uWakeOn > 0.5) {
    vec2 hw = (vWorld.xz - uWakeC) / uWakeSpan + 0.5;
    vec2 he = min(hw, 1.0 - hw);
    float ek = smoothstep(0.0, 0.08, min(he.x, he.y));
    if (ek > 0.0) {
      const float WK = 1.0 / 512.0;
      float hL = texture2D(uWaveSim, hw - vec2(WK, 0.0)).r, hR = texture2D(uWaveSim, hw + vec2(WK, 0.0)).r, hD = texture2D(uWaveSim, hw - vec2(0.0, WK)).r, hU = texture2D(uWaveSim, hw + vec2(0.0, WK)).r;
      vec2 gr = vec2(hR - hL, hU - hD) / (2.0 * uWakeSpan * WK);
      N = normalize(N + vec3(-gr.x, 0.0, -gr.y) * 2.2 * ek);
      hullFoam = smoothstep(0.35, 0.9, length(gr)) * ek;
    }
  }
  // depth from the terrain height map
  vec2 duv"""),
 ("wakeF * 0.95 + streak * 0.3", "wakeF * 0.95 + hullFoam * 0.5 + streak * 0.3"),
 ("uWake: { value: null },", "uWake: { value: null }, uWaveSim: { value: null },"),
])
print('ok')
