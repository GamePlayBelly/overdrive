import * as THREE from 'three';
import { WATER_LEVEL } from '../data/world.js';
import { clamp, smoothstep } from '../core/math.js';

// Ocean: Gerstner wave surface following the camera, depth-aware colour and shoreline foam, sun glitter, rain ripples.
// The same wave set is evaluated on the CPU (waveAt) so boats, swimmers and floating objects ride the exact visible surface.
const G = 9.81;
const WAVES = [
  { dir: [0.92, 0.38], len: 62, amp: 0.36, q: 0.55 },
  { dir: [0.68, -0.73], len: 38, amp: 0.2, q: 0.6 },
  { dir: [-0.34, 0.94], len: 23, amp: 0.11, q: 0.65 },
  { dir: [0.12, 0.99], len: 14, amp: 0.06, q: 0.7 },
  { dir: [-0.9, 0.44], len: 8.5, amp: 0.028, q: 0.7 },
  { dir: [0.5, -0.86], len: 5.2, amp: 0.016, q: 0.7 },
];
for (const w of WAVES) { const l = Math.hypot(w.dir[0], w.dir[1]); w.dir = [w.dir[0] / l, w.dir[1] / l]; w.k = (Math.PI * 2) / w.len; w.w = Math.sqrt(G * w.k); }

const VS = `
uniform float uTime; uniform float uAmp; uniform vec3 uCenter;
uniform vec4 uW0[6]; // dir.xy, k, omega
uniform vec4 uW1[6]; // amp, q, 0, 0
varying vec3 vWorld; varying vec3 vN; varying float vCrest; varying float vDist;
void main(){
  vec3 p = position; p.xz += uCenter.xz;
  vec3 off = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0); float crest = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 a = uW0[i], b = uW1[i];
    float ph = a.z * dot(a.xy, p.xz) - a.w * uTime;
    float s = sin(ph), c = cos(ph);
    float A = b.x * uAmp;
    off.xz += a.xy * (b.y * A * c); off.y += A * s;
    n.xz -= a.xy * (a.z * A * c); n.y -= b.y * a.z * A * s;
    crest += b.y * a.z * A * s;
  }
  vWorld = vec3(p.x + off.x, off.y + ${WATER_LEVEL.toFixed(3)} + uCenter.y, p.z + off.z);
  vN = normalize(n); vCrest = crest; vDist = length(vWorld.xz - cameraPosition.xz);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const FS = `
precision highp float;
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uNight; uniform float uRain; uniform float uAmp;
uniform float uHole; uniform vec3 uFogCol; uniform float uFogDen; uniform sampler2D uNormal; uniform sampler2D uDepth; uniform vec4 uRect; uniform float uQuality;
uniform sampler2D uWake; uniform vec2 uWakeC; uniform float uWakeSpan; uniform float uWakeOn;
varying vec3 vWorld; varying vec3 vN; varying float vCrest; varying float vDist;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main(){
  if (uHole > 0.0 && max(abs(vWorld.x - cameraPosition.x), abs(vWorld.z - cameraPosition.z)) < uHole) discard;
  vec3 V = normalize(cameraPosition - vWorld);
  vec2 uv1 = vWorld.xz * 0.045 + vec2(uTime * 0.012, uTime * 0.009), uv2 = vWorld.xz * 0.17 + vec2(-uTime * 0.03, uTime * 0.02), uv3 = vWorld.xz * 0.6 + vec2(uTime * 0.05, uTime * 0.07);
  vec3 n1 = texture2D(uNormal, uv1).xyz * 2.0 - 1.0, n2 = texture2D(uNormal, uv2).xyz * 2.0 - 1.0, n3 = texture2D(uNormal, uv3).xyz * 2.0 - 1.0;
  float near = 1.0 - smoothstep(60.0, 420.0, vDist);
  vec3 N = normalize(vN + vec3(n1.x * 0.35 + n2.x * 0.22 * near + n3.x * 0.1 * near, 0.0, n1.y * 0.35 + n2.y * 0.22 * near + n3.y * 0.1 * near) * (0.5 + 0.5 * uAmp));
  // rain ripples
  if (uRain > 0.05 && vDist < 90.0) {
    vec2 g = vWorld.xz * 1.6; vec2 id = floor(g); vec2 f = fract(g) - 0.5; float t = fract(uTime * 0.9 + hash(id) * 6.0);
    float r = length(f); float ring = smoothstep(0.06, 0.0, abs(r - t * 0.5)) * (1.0 - t) * step(hash(id + 7.0), uRain);
    N = normalize(N + vec3(normalize(f + 1e-4).x, 0.0, normalize(f + 1e-4).y) * ring * 0.6);
  }
  // depth from the terrain height map
  vec2 duv = (vWorld.xz - uRect.xy) / uRect.zw;
  float depth = 14.0;
  if (duv.x > 0.0 && duv.y > 0.0 && duv.x < 1.0 && duv.y < 1.0) depth = texture2D(uDepth, duv).r * 16.0;
  vec3 R = reflect(-V, N);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  float ry = max(R.y, 0.0);
  vec3 sky = mix(uHorizon, uZenith, pow(ry, 0.45));
  vec3 deep = mix(vec3(0.012, 0.075, 0.12), vec3(0.004, 0.02, 0.035), uNight);
  vec3 shallow = mix(vec3(0.12, 0.5, 0.48), vec3(0.01, 0.06, 0.06), uNight);
  float dmix = smoothstep(0.0, 5.5, depth);
  vec3 body = mix(shallow, deep, dmix);
  // light scattering through wave crests
  float sss = pow(max(dot(normalize(V + uSunDir * 0.6), N), 0.0), 3.0) * 0.16 * (1.0 - uNight);
  body += vec3(0.05, 0.22, 0.2) * sss * (0.5 + vCrest * 4.0);
  vec3 col = mix(body, sky * (1.0 - 0.25 * uNight), fres);
  vec3 H = normalize(V + uSunDir);
  float spec = pow(max(dot(N, H), 0.0), 380.0) * 14.0 + pow(max(dot(N, H), 0.0), 55.0) * 0.35;
  col += uSunCol * spec * (1.0 - uNight);
  // boat wakes and splashes from the top-down foam map
  float wake = 0.0;
  if (uWakeOn > 0.5) {
    vec2 wuv = (vWorld.xz - uWakeC) / uWakeSpan + 0.5;
    vec2 we = min(wuv, 1.0 - wuv);
    wake = texture2D(uWake, wuv).r * smoothstep(0.0, 0.06, min(we.x, we.y));
    body += vec3(0.05, 0.13, 0.13) * wake * 0.7;
    col = mix(body, sky * (1.0 - 0.25 * uNight), fres);
    col += uSunCol * spec * (1.0 - uNight);
  }
  // foam: wave crests, shoreline breakers
  float fn = vnoise(vWorld.xz * 0.9 + uTime * 0.1) * 0.6 + vnoise(vWorld.xz * 2.7 - uTime * 0.17) * 0.4;
  float crestF = smoothstep(0.26, 0.5, vCrest * 2.4 * uAmp + fn * 0.22 - 0.12) * near;
  float shore = smoothstep(1.3, 0.0, depth) * (0.55 + 0.45 * sin(depth * 7.0 - uTime * 1.7 + fn * 4.0));
  shore *= smoothstep(0.0, 0.25, depth + 0.35);
  float fw = vnoise(vWorld.xz * 2.3 - uTime * 0.35) * 0.6 + vnoise(vWorld.xz * 5.3 + uTime * 0.3) * 0.4;
  float wakeF = smoothstep(0.1, 0.72, wake * (0.4 + 1.0 * fw)) * 0.85;
  float foam = clamp(crestF * 0.7 + shore * (0.7 + 0.3 * fn) + wakeF * 0.95, 0.0, 1.0);
  col = mix(col, vec3(0.92, 0.95, 0.97) * (1.0 - 0.7 * uNight) + vec3(0.02), foam * 0.85);
  // distance haze
  float fog = 1.0 - exp(-uFogDen * uFogDen * vDist * vDist * 1.4426);
  col = mix(col, uFogCol, fog);
  float alpha = clamp(smoothstep(0.0, 1.4, depth) * 0.9 + 0.1, 0.0, 1.0);
  alpha = max(alpha, foam * 0.85);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
}`;

function makeNormalMap() {
  const S = 256, h = new Float32Array(S * S);
  const comps = [[1, 0, 1], [0, 1, 0.9], [2, 1, 0.55], [1, 3, 0.45], [3, 2, 0.35], [5, 3, 0.25], [2, 7, 0.2], [7, 5, 0.15], [11, 7, 0.1], [9, 13, 0.08], [15, 11, 0.06]];
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const ph = comps.map(() => r() * 6.283);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (let i = 0; i < comps.length; i++) { const [fx, fy, a] = comps[i]; v += a * Math.sin((Math.PI * 2 * (fx * x + fy * y)) / S + ph[i]); }
    h[y * S + x] = v;
  }
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)], hy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
    const nx = -hx * 0.9, ny = -hy * 0.9, nz = 1, l = Math.hypot(nx, ny, nz);
    const k = (y * S + x) * 4;
    data[k] = (nx / l * 0.5 + 0.5) * 255; data[k + 1] = (ny / l * 0.5 + 0.5) * 255; data[k + 2] = (nz / l * 0.5 + 0.5) * 255; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

export class Sea {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.t = 0; this.amp = 1; this.quality = 2;
    const T = world.terrain;
    // depth map: 0..16 m below the water line encoded in 8 bits at the terrain grid resolution
    const nx = T.nx, nz = T.nz, d = new Uint8Array(nx * nz);
    for (let i = 0; i < d.length; i++) d[i] = Math.round(clamp((WATER_LEVEL - T.h[i]) / 16, 0, 1) * 255);
    // coarse wet-cell mask with a summed-area table: lets the fine rings be skipped when no water is within their reach
    const cell = 64, gw = Math.ceil(((nx - 1) * T.res) / cell), gh = Math.ceil(((nz - 1) * T.res) / cell), sat = new Int32Array((gw + 1) * (gh + 1)), wet = new Uint8Array(gw * gh);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (T.h[j * nx + i] < WATER_LEVEL - 0.05) wet[Math.min(gh - 1, Math.floor((j * T.res) / cell)) * gw + Math.min(gw - 1, Math.floor((i * T.res) / cell))] = 1;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) sat[(y + 1) * (gw + 1) + x + 1] = wet[y * gw + x] + sat[y * (gw + 1) + x + 1] + sat[(y + 1) * (gw + 1) + x] - sat[y * (gw + 1) + x];
    this.wetMap = { cell, gw, gh, sat, x0: T.x0, z0: T.z0 };
    this.depthTex = new THREE.DataTexture(d, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
    this.depthTex.minFilter = this.depthTex.magFilter = THREE.LinearFilter; this.depthTex.wrapS = this.depthTex.wrapT = THREE.ClampToEdgeWrapping; this.depthTex.needsUpdate = true;
    this.uni = {
      uTime: { value: 0 }, uAmp: { value: 1 }, uCenter: { value: new THREE.Vector3() },
      uW0: { value: WAVES.map((w) => new THREE.Vector4(w.dir[0], w.dir[1], w.k, w.w)) }, uW1: { value: WAVES.map((w) => new THREE.Vector4(w.amp, w.q, 0, 0)) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uNight: { value: 0 }, uRain: { value: 0 }, uFogCol: { value: new THREE.Color() }, uFogDen: { value: 0.0006 },
      uWake: { value: null }, uWakeC: { value: new THREE.Vector2() }, uWakeSpan: { value: 120 }, uWakeOn: { value: 0 },
      uNormal: { value: makeNormalMap() }, uDepth: { value: this.depthTex }, uRect: { value: new THREE.Vector4(T.x0, T.z0, (nx - 1) * T.res, (nz - 1) * T.res) }, uQuality: { value: 1 },
    };
    // three concentric grids (fine near the camera, coarse to the horizon); each has its own centre and a hole where the finer one draws
    this.group = new THREE.Group(); this.group.frustumCulled = false;
    this.rings = [];
    const mk = (size, seg, snap, hole, drop) => {
      const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { ...this.uni, uCenter: { value: new THREE.Vector3() }, uHole: { value: hole } }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; m.matrixAutoUpdate = false;
      this.group.add(m);
      this.rings.push({ m, mat, snap, drop });
    };
    mk(900, 300, 3, 0, 0); mk(4200, 210, 20, 420, -0.03); mk(26000, 140, 100, 2000, -0.06);
    scene.add(this.group);
    this.seaCache = { x: 1e9, z: 1e9, d: 1e9 };
    this.clock = 0;
  }

  setQuality(q) { this.quality = q; }

  // is there any water within r metres of (x, z)? Outside the height map is taken to be open sea.
  waterWithin(x, z, r) {
    const M = this.wetMap, i0 = Math.floor((x - r - M.x0) / M.cell), i1 = Math.floor((x + r - M.x0) / M.cell), j0 = Math.floor((z - r - M.z0) / M.cell), j1 = Math.floor((z + r - M.z0) / M.cell);
    if (i0 < 0 || j0 < 0 || i1 >= M.gw || j1 >= M.gh) return true;
    const W = M.gw + 1, s = M.sat;
    return s[(j1 + 1) * W + i1 + 1] - s[j0 * W + i1 + 1] - s[(j1 + 1) * W + i0] + s[j0 * W + i0] > 0;
  }

  // wave height and (optionally) normal at world x,z at time t
  waveAt(x, z, out = null, t = this.t) {
    let px = x, pz = z, y = 0;
    const A = this.amp;
    for (let it = 0; it < 2; it++) {
      y = 0; let dx = 0, dz = 0;
      for (const w of WAVES) { const ph = w.k * (w.dir[0] * px + w.dir[1] * pz) - w.w * t; const a = w.amp * A; dx += w.dir[0] * w.q * a * Math.cos(ph); dz += w.dir[1] * w.q * a * Math.cos(ph); y += a * Math.sin(ph); }
      if (it === 0) { px = x - dx; pz = z - dz; }
    }
    if (out) {
      let nx = 0, nz = 0, ny = 1;
      for (const w of WAVES) { const ph = w.k * (w.dir[0] * px + w.dir[1] * pz) - w.w * t; const a = w.amp * A; nx -= w.dir[0] * w.k * a * Math.cos(ph); nz -= w.dir[1] * w.k * a * Math.cos(ph); ny -= w.q * w.k * a * Math.sin(ph); }
      const l = Math.hypot(nx, ny, nz); out.set(nx / l, ny / l, nz / l);
    }
    return WATER_LEVEL + y;
  }

  depthAt(x, z) { return WATER_LEVEL - this.world.terrain.height(x, z); }
  isSea(x, z) { return this.world.terrain.height(x, z) < WATER_LEVEL - 0.05; }

  // distance in metres to the nearest water from a point (cached; used by ambience)
  distanceToSea(x, z) {
    const c = this.seaCache;
    if ((c.x - x) ** 2 + (c.z - z) ** 2 < 40 * 40) return c.d;
    const T = this.world.terrain;
    let best = 1e9;
    if (T.height(x, z) < WATER_LEVEL) best = 0;
    else for (let a = 0; a < 16 && best > 0; a++) { const dx = Math.cos((a / 16) * 6.283), dz = Math.sin((a / 16) * 6.283); for (let r = 40; r <= 640; r += 40) { if (r >= best) break; if (T.height(x + dx * r, z + dz * r) < WATER_LEVEL) { best = Math.min(best, r); break; } } }
    c.x = x; c.z = z; c.d = best;
    return best;
  }

  update(dt, camera, sky) {
    this.t += dt;
    const w = sky.w, U = this.uni;
    this.amp += ((0.55 + 0.75 * Math.min(1.4, w.wind) + w.rain * 0.25) - this.amp) * Math.min(1, dt * 0.25);
    U.uTime.value = this.t; U.uAmp.value = this.amp;
    const cp = camera.position;
    for (const r of this.rings) r.mat.uniforms.uCenter.value.set(Math.round(cp.x / r.snap) * r.snap, r.drop, Math.round(cp.z / r.snap) * r.snap);
    this.rings[0].m.visible = this.waterWithin(cp.x, cp.z, 500);
    this.rings[1].m.visible = this.quality >= 1 && this.waterWithin(cp.x, cp.z, 2300);
    U.uSunDir.value.copy(sky.uniforms.sunDir.value); U.uSunCol.value.copy(sky.uniforms.sunCol.value).multiplyScalar(0.9);
    U.uZenith.value.copy(sky.uniforms.zenith.value); U.uHorizon.value.copy(sky.uniforms.horizon.value);
    U.uNight.value = sky.night; U.uRain.value = w.rain;
    U.uFogCol.value.copy(sky.scene.fog.color); U.uFogDen.value = sky.scene.fog.density;
  }
}
