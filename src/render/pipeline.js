import * as THREE from 'three';

const pop = (n) => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const BRIGHT_FS = `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = max(0.0, l - uThresh) / max(l, 1e-4);
  gl_FragColor = vec4(min(c * k, vec3(24.0)), 1.0);
}`;

const BLUR_FS = `
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162; c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703; c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const AO_FS = `
uniform sampler2D tDepth; uniform vec2 uCamPlanes, uProj, uTexel; uniform float uAoR, uAoK; uniform float uResY; varying vec2 vUv;
float linZ(vec2 uv){ float z = textureLod(tDepth, uv, 0.0).x; return (2.0 * uCamPlanes.x * uCamPlanes.y) / (uCamPlanes.y + uCamPlanes.x - (z * 2.0 - 1.0) * (uCamPlanes.y - uCamPlanes.x)); }
vec3 vpos(vec2 uv, float d){ vec2 n = uv * 2.0 - 1.0; return vec3(n.x * d / uProj.x, n.y * d / uProj.y, -d); }
void main(){
  vec2 uv = vUv;
  float d0 = linZ(uv);
  vec3 P = vpos(uv, d0);
  vec2 tx = vec2(uTexel.x, 0.0), ty = vec2(0.0, uTexel.y);
  float dR = linZ(uv + tx), dL = linZ(uv - tx), dU = linZ(uv + ty), dD = linZ(uv - ty);
  vec3 ex = abs(dR - d0) < abs(dL - d0) ? vpos(uv + tx, dR) - P : P - vpos(uv - tx, dL);
  vec3 ey = abs(dU - d0) < abs(dD - d0) ? vpos(uv + ty, dU) - P : P - vpos(uv - ty, dD);
  vec3 N = normalize(cross(ex, ey));
  if (dot(N, P) > 0.0) N = -N;
  float rpx = clamp(uAoR * uProj.y * 0.5 * uResY / d0, 3.0, 60.0);
  float rot = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  float occ = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float a = rot + fi * 2.39996323;
    float r = sqrt((fi + 0.5) / 9.0);
    vec2 suv = uv + vec2(cos(a), sin(a)) * r * rpx * uTexel;
    vec3 V = vpos(suv, linZ(suv)) - P;
    float dist = length(V);
    occ += max(0.0, dot(V, N) / (dist + 1e-4) - 0.14) * (1.0 - smoothstep(uAoR * 0.9, uAoR * 2.4, dist));
  }
  float ao = clamp(1.0 - uAoK * occ * 0.21, 0.0, 1.0);
  ao = mix(ao, 1.0, smoothstep(50.0, 140.0, d0));
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

const COMPOSITE_FS = `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tBloom2; uniform sampler2D tDepth;
uniform vec2 uTexel; uniform float uExposure; uniform float uBloom; uniform float uVig; uniform float uGrain; uniform float uTime;
uniform float uCA; uniform float uSpeed; uniform float uSharp; uniform float uSat; uniform float uContrast; uniform vec3 uLift; uniform vec3 uGain; uniform vec3 uTint;
uniform float uFxaa; uniform float uDamage; uniform float uWater; uniform float uRain; uniform float uDof; uniform vec2 uFocus; uniform vec2 uCamPlanes;
uniform float uFlash; varying vec2 vUv;
#ifdef USE_AO
uniform sampler2D tAO; uniform vec2 uAoTexel;
float aoApply(vec2 uv, vec3 c){
  vec2 t = uAoTexel * 0.75;
  float a = (texture2D(tAO, uv + vec2(t.x, t.y)).r + texture2D(tAO, uv + vec2(-t.x, t.y)).r + texture2D(tAO, uv + vec2(t.x, -t.y)).r + texture2D(tAO, uv + vec2(-t.x, -t.y)).r) * 0.25;
  return mix(a, 1.0, smoothstep(0.9, 3.5, max(c.r, max(c.g, c.b))));
}
#endif

vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 fxaa(vec2 uv){
  vec3 rgbNW = texture2D(tScene, uv + uTexel * vec2(-1.0, -1.0)).rgb, rgbNE = texture2D(tScene, uv + uTexel * vec2(1.0, -1.0)).rgb;
  vec3 rgbSW = texture2D(tScene, uv + uTexel * vec2(-1.0, 1.0)).rgb, rgbSE = texture2D(tScene, uv + uTexel * vec2(1.0, 1.0)).rgb;
  vec3 rgbM = texture2D(tScene, uv).rgb;
  float lNW = luma(min(rgbNW, vec3(4.0))), lNE = luma(min(rgbNE, vec3(4.0))), lSW = luma(min(rgbSW, vec3(4.0))), lSE = luma(min(rgbSE, vec3(4.0))), lM = luma(min(rgbM, vec3(4.0)));
  float lmin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lmax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (texture2D(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, uv + dir * -0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);
  float lb = luma(min(b, vec3(4.0)));
  return (lb < lmin || lb > lmax) ? a : b;
}

void main(){
  vec2 uv = vUv;
  if (uWater > 0.01) uv += uWater * 0.0035 * vec2(sin(uv.y * 38.0 + uTime * 1.6), cos(uv.x * 31.0 + uTime * 1.3));
#ifdef USE_RAIN
  if (uRain > 0.01) { float t = uTime * 0.6; vec2 g = uv * vec2(9.0, 5.0); float n = hash(floor(g) + floor(t)); vec2 f = fract(g) - 0.5; float d = length(f + vec2(0.0, fract(t + n) - 0.5) * 0.4); float drop = smoothstep(0.32, 0.0, d) * step(0.93, n) * uRain; uv += normalize(f + 1e-4) * drop * 0.01; }
#endif
  vec2 dv = uv - 0.5; float r2 = dot(dv, dv);
  vec3 col;
#ifdef USE_SPEED
  if (uSpeed > 0.001 || uCA > 0.0001) {
    vec3 acc = vec3(0.0); float ws = 0.0;
    for (int i = 0; i < 6; i++) {
      float t = float(i) / 5.0; vec2 o = -dv * t * uSpeed * (0.35 + r2 * 2.0);
      float w = 1.0 - t * 0.6;
      acc += vec3(texture2D(tScene, uv + o - dv * uCA * r2).r, texture2D(tScene, uv + o).g, texture2D(tScene, uv + o + dv * uCA * r2).b) * w; ws += w;
    }
    col = acc / ws;
  } else
#endif
  {
#ifdef USE_FXAA
    col = uFxaa > 0.5 ? fxaa(uv) : texture2D(tScene, uv).rgb;
#else
    col = texture2D(tScene, uv).rgb;
#endif
  }
#ifdef USE_SHARP
  {
    vec3 n = texture2D(tScene, uv + vec2(uTexel.x, 0.0)).rgb + texture2D(tScene, uv - vec2(uTexel.x, 0.0)).rgb + texture2D(tScene, uv + vec2(0.0, uTexel.y)).rgb + texture2D(tScene, uv - vec2(0.0, uTexel.y)).rgb;
    col += (col - n * 0.25) * uSharp;
  }
#endif
#ifdef USE_AO
  col *= aoApply(uv, col);
#endif
#ifdef USE_DOF
  {
    float z = texture2D(tDepth, uv).x;
    float zn = uCamPlanes.x, zf = uCamPlanes.y;
    float lin = (2.0 * zn * zf) / (zf + zn - (z * 2.0 - 1.0) * (zf - zn));
    float coc = clamp(abs(lin - uFocus.x) / max(uFocus.x, 0.1) * uFocus.y, 0.0, 1.0) * uDof;
    if (coc > 0.02) {
      vec3 acc = col; float ws = 1.0;
      float rot = hash(gl_FragCoord.xy + uTime) * 6.2831853;
      for (int i = 0; i < 20; i++) { float a = float(i) * 2.39996 + rot; float rr = sqrt((float(i) + 0.5) / 20.0); vec2 o = vec2(cos(a), sin(a)) * rr * coc * 11.0 * uTexel; acc += texture2D(tScene, uv + o).rgb; ws += 1.0; }
      col = acc / ws;
    }
  }
#endif
#ifdef USE_BLOOM
  col += (texture2D(tBloom, uv).rgb + texture2D(tBloom2, uv).rgb * 1.2) * uBloom;
#endif
  col *= uExposure;
  col = aces(col * 0.9) * 1.02;
  float l = luma(col);
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  col = col * uGain + uLift * (1.0 - col);
  col *= uTint;
  { float ll = luma(col); col = mix(col * vec3(0.95, 0.99, 1.07), col * vec3(1.05, 1.0, 0.93), smoothstep(0.18, 0.75, ll)); col = col + 0.004 * (1.0 - ll); }
  col *= 1.0 - uVig * smoothstep(0.18, 0.95, r2 * 2.6);
  col = mix(col, col * vec3(0.62, 0.9, 1.0) + vec3(0.0, 0.03, 0.05), uWater);
  col *= 1.0 - uWater * 0.3 * smoothstep(0.1, 0.9, r2 * 2.6);
  col += vec3(0.6, 0.02, 0.02) * uDamage * smoothstep(0.1, 0.6, r2 * 2.0);
  col += vec3(0.9, 0.95, 1.0) * uFlash;
  col = toSRGB(clamp(col, 0.0, 1.0));
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * (1.0 / 255.0) + (hash(gl_FragCoord.xy * 1.7 + uTime * 3.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Pipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    renderer.info.autoReset = false;
    this.scale = 1; this.samples = 2; this.bloom = true; this.fxaa = false; this.dprCap = 1; this.dpr = Math.min(devicePixelRatio || 1, this.dprCap);
    this.enabled = true; this.ao = false; this.dofDepth = false;
    this.fx = { vig: 0.32, grain: 0.012, ca: 0.0, speed: 0, sharp: 0.18, sat: 1.06, contrast: 1.04, lift: new THREE.Vector3(0, 0, 0), gain: new THREE.Vector3(1, 1, 1), tint: new THREE.Vector3(1, 1, 1), damage: 0, water: 0, rain: 0, flash: 0, bloom: 0.35, dof: 0, focus: new THREE.Vector2(10, 1), aoR: 1.7, aoK: 1.4 };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scn = new THREE.Scene(); this.scn.add(this.quad);
    const sm = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
    this.matBright = sm(BRIGHT_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1.0 } });
    this.matBlur = sm(BLUR_FS, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.matAO = sm(AO_FS, { tDepth: { value: null }, uCamPlanes: { value: new THREE.Vector2(0.25, 7000) }, uProj: { value: new THREE.Vector2(1, 1) }, uTexel: { value: new THREE.Vector2() }, uAoR: { value: 1.3 }, uAoK: { value: 1 }, uResY: { value: 720 } });
    const cu = {}; for (const k of ['tScene', 'tBloom', 'tBloom2', 'tDepth']) cu[k] = { value: null };
    Object.assign(cu, { uTexel: { value: new THREE.Vector2() }, uExposure: { value: 1 }, uBloom: { value: 0.5 }, uVig: { value: 0 }, uGrain: { value: 0 }, uTime: { value: 0 }, uCA: { value: 0 }, uSpeed: { value: 0 }, uSharp: { value: 0 }, uSat: { value: 1 }, uContrast: { value: 1 }, uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uFxaa: { value: 0 }, uDamage: { value: 0 }, uWater: { value: 0 }, uRain: { value: 0 }, uDof: { value: 0 }, uFocus: { value: new THREE.Vector2(10, 1) }, uCamPlanes: { value: new THREE.Vector2(0.25, 7000) }, uFlash: { value: 0 }, tAO: { value: null }, uAoTexel: { value: new THREE.Vector2(1, 1) } });
    this.cu = cu; this.comps = new Map(); this.ready = new Set(); this.base = 8 | 16 | 32 | 2 | 1;
    this.comp(this.base);
    this.aoRT = null; this.rt = null; this.b1 = null; this.b1b = null; this.b2 = null; this.b2b = null; this.black = null;
    this.w = 0; this.h = 0;
    this.time = 0;
    this.depthTex = null;
  }

  // composite variants: each effect is compiled in or out, so the common frame runs a lean shader
  comp(key) {
    let m = this.comps.get(key);
    if (!m) {
      const d = {};
      if (key & 1) d.USE_SPEED = 1; if (key & 2) d.USE_FXAA = 1; if (key & 4) d.USE_DOF = 1; if (key & 8) d.USE_SHARP = 1; if (key & 16) d.USE_RAIN = 1; if (key & 32) d.USE_BLOOM = 1; if (key & 64) d.USE_AO = 1;
      m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: COMPOSITE_FS, uniforms: this.cu, defines: d, depthTest: false, depthWrite: false });
      this.comps.set(key, m);
    }
    return m;
  }

  async warmup() {
    const keys = [];
    for (const sharp of [8, 0]) for (const post of [0, 32, 2]) for (const dyn of [0, 1, 16, 17]) keys.push(sharp | post | dyn);
    for (const sharp of [8, 0]) for (const post of [0, 32, 2]) keys.push(sharp | post | 4);
    for (const sharp of [8, 0]) for (const post of [0, 32, 2]) for (const dyn of [0, 16]) keys.push(64 | sharp | post | dyn);
    keys.sort((a, b) => pop(a) - pop(b));
    for (const k of keys) {
      try { this.quad.material = this.comp(k); await this.renderer.compileAsync(this.scn, this.cam); this.ready.add(k); } catch (e) { console.warn('composite variant', k, e); }
    }
  }

  setQuality({ scale, samples, bloom, fxaa, dpr, ao } = {}) {
    let dirty = false;
    if (ao !== undefined && ao !== this.ao) { this.ao = ao; dirty = this._syncDepth() || dirty; }
    if (dpr !== undefined && dpr !== this.dprCap) { this.dprCap = dpr; this.dpr = Math.min(devicePixelRatio || 1, dpr); dirty = true; }
    if (scale !== undefined && Math.abs(scale - this.scale) > 0.001) { this.scale = scale; dirty = true; }
    if (samples !== undefined && samples !== this.samples) { this.samples = samples; dirty = true; }
    if (bloom !== undefined) this.bloom = bloom;
    if (fxaa !== undefined) this.fxaa = fxaa;
    if (dirty) this.resize(this.cssW, this.cssH, true);
  }

  resize(cssW, cssH, force = false) {
    if (!force && cssW === this.cssW && cssH === this.cssH && this.rt) return;
    this.cssW = cssW; this.cssH = cssH;
    const R = this.renderer;
    R.setPixelRatio(this.dpr);
    R.setSize(cssW, cssH, false);
    const cw = Math.max(2, Math.round(cssW * this.dpr)), ch = Math.max(2, Math.round(cssH * this.dpr));
    const w = Math.max(2, Math.round(cw * this.scale)), h = Math.max(2, Math.round(ch * this.scale));
    this.w = w; this.h = h; this.cw = cw; this.ch = ch;
    const mk = (ww, hh, samples = 0, depth = false) => {
      const o = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth, samples, generateMipmaps: false };
      const t = new THREE.WebGLRenderTarget(ww, hh, o);
      t.texture.colorSpace = THREE.LinearSRGBColorSpace;
      return t;
    };
    for (const t of [this.rt, this.b1, this.b1b, this.b2, this.b2b, this.aoRT]) t?.dispose();
    this.aoRT = new THREE.WebGLRenderTarget(Math.max(2, (w + 1) >> 1), Math.max(2, (h + 1) >> 1), { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
    this.rt = mk(w, h, this.samples, true);
    this.rt.resolveDepthBuffer = !!this.wantDepth;
    if (this.wantDepth) { this.depthTex = new THREE.DepthTexture(w, h); this.depthTex.type = THREE.UnsignedIntType; this.rt.depthTexture = this.depthTex; }
    const w1 = Math.max(2, w >> 2), h1 = Math.max(2, h >> 2), w2 = Math.max(2, w >> 3), h2 = Math.max(2, h >> 3);
    this.b1 = mk(w1, h1); this.b1b = mk(w1, h1); this.b2 = mk(w2, h2); this.b2b = mk(w2, h2);
    if (!this.black) { this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.black.needsUpdate = true; }
  }

  _syncDepth() { const want = this.dofDepth || this.ao; if (want === !!this.wantDepth) return false; this.wantDepth = want; return true; }
  setDepth(on) { this.dofDepth = !!on; if (this._syncDepth()) this.resize(this.cssW, this.cssH, true); }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scn, this.cam);
  }

  render(dt, scene = this.scene, camera = this.camera) {
    const R = this.renderer, fx = this.fx;
    this.time += dt;
    R.info.reset();
    if (!this.rt) this.resize(this.cssW || innerWidth, this.cssH || innerHeight, true);
    const tm = R.toneMapping;
    R.toneMapping = THREE.NoToneMapping;
    R.setRenderTarget(this.rt);
    R.render(scene, camera);
    R.toneMapping = tm;
    let bloomA = this.black, bloomB = this.black;
    if (this.bloom && fx.bloom > 0.001) {
      const u = this.matBright.uniforms;
      u.tSrc.value = this.rt.texture; u.uTexel.value.set(1 / this.w, 1 / this.h); u.uThresh.value = 2.2;
      this.pass(this.matBright, this.b1);
      const bu = this.matBlur.uniforms;
      bu.tSrc.value = this.b1.texture; bu.uDir.value.set(1 / this.b1.width, 0); this.pass(this.matBlur, this.b1b);
      bu.tSrc.value = this.b1b.texture; bu.uDir.value.set(0, 1 / this.b1.height); this.pass(this.matBlur, this.b1);
      u.tSrc.value = this.b1.texture; u.uTexel.value.set(1 / this.b1.width, 1 / this.b1.height); u.uThresh.value = 0.0;
      this.pass(this.matBright, this.b2);
      bu.tSrc.value = this.b2.texture; bu.uDir.value.set(1 / this.b2.width, 0); this.pass(this.matBlur, this.b2b);
      bu.tSrc.value = this.b2b.texture; bu.uDir.value.set(0, 1 / this.b2.height); this.pass(this.matBlur, this.b2);
      bloomA = this.b1.texture; bloomB = this.b2.texture;
    } else { bloomA = this.black; bloomB = this.black; }
    const aoOn = this.ao && this.depthTex;
    if (aoOn) {
      const au = this.matAO.uniforms;
      au.tDepth.value = this.depthTex; au.uCamPlanes.value.set(camera.near, camera.far); au.uProj.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
      au.uTexel.value.set(1 / this.w, 1 / this.h); au.uAoR.value = fx.aoR ?? 1.3; au.uAoK.value = fx.aoK ?? 1; au.uResY.value = this.h;
      this.pass(this.matAO, this.aoRT);
    }
    const c = this.cu;
    c.tScene.value = this.rt.texture; c.tBloom.value = bloomA.isTexture ? bloomA : bloomA; c.tBloom2.value = bloomB; c.tDepth.value = this.depthTex;
    c.uTexel.value.set(1 / this.w, 1 / this.h);
    c.uExposure.value = R.toneMappingExposure; c.uBloom.value = this.bloom ? fx.bloom : 0;
    c.uVig.value = fx.vig; c.uGrain.value = fx.grain; c.uTime.value = this.time % 100; c.uCA.value = fx.ca; c.uSpeed.value = fx.speed;
    c.uSharp.value = this.scale < 0.95 ? fx.sharp * 1.4 : 0; c.uSat.value = fx.sat; c.uContrast.value = fx.contrast;
    c.uLift.value.copy(fx.lift); c.uGain.value.copy(fx.gain); c.uTint.value.copy(fx.tint);
    c.uFxaa.value = this.samples === 0 && this.fxaa ? 1 : 0;
    c.uDamage.value = fx.damage; c.uWater.value = fx.water; c.uRain.value = fx.rain; c.uFlash.value = fx.flash;
    c.uDof.value = fx.dof; c.uFocus.value.copy(fx.focus); c.uCamPlanes.value.set(camera.near, camera.far);
    c.tAO.value = this.aoRT.texture; c.uAoTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
    const key = (aoOn ? 64 : 0) | (fx.speed > 0.001 || fx.ca > 0.0001 ? 1 : 0) | (c.uFxaa.value > 0.5 ? 2 : 0) | (fx.dof > 0.001 && this.depthTex ? 4 : 0) | (c.uSharp.value > 0.001 ? 8 : 0) | (fx.rain > 0.01 ? 16 : 0) | (this.bloom && fx.bloom > 0.001 ? 32 : 0);
    this.pass(this.comp(this.ready.has(key) ? key : this.base | key), null);
  }
}
