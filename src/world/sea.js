import * as THREE from 'three';
import { WATER_LEVEL } from '../data/world.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { WaveField } from './waves.js';
import { WATER_FX } from './waterFx.js';

// Ocean: Gerstner wave surface following the camera, depth-aware colour and shoreline foam, sun glitter, rain ripples.
// The wave set lives in WaveField and is evaluated on the CPU (waveAt) so boats, swimmers and floating objects ride the exact visible surface.
// The surface is premultiplied: volume scattering, reflection, glitter and foam are added light, the rest of the scene shows through what is left.
const VS = `
uniform float uTime; uniform vec3 uCenter; uniform float uSpacing; uniform vec4 uStorm;
uniform vec4 uW0[8]; // dir.xy, k, phase
uniform vec4 uW1[8]; // amp, q, 0, 0
varying vec3 vWorld; varying vec3 vN; varying float vCrest; varying float vDist;
void main(){
  vec3 p = position; p.xz += uCenter.xz;
  float boost = 1.0;
  if (uStorm.w > 0.0) boost += uStorm.w * (1.0 - smoothstep(0.4 * uStorm.z, uStorm.z, distance(p.xz, uStorm.xy)));
  vec3 off = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0); float crest = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 a = uW0[i], b = uW1[i];
    float A = b.x * boost * smoothstep(2.2 * uSpacing, 4.5 * uSpacing, 6.2831853 / a.z);
    float ph = a.z * dot(a.xy, p.xz) - a.w;
    float s = sin(ph), c = cos(ph);
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
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uNight; uniform float uRain;
uniform float uHole; uniform vec3 uFogCol; uniform float uFogDen; uniform sampler2D uNormal; uniform sampler2D uDepth; uniform vec4 uRect; uniform float uQuality;
uniform sampler2D uWake; uniform vec2 uWakeC; uniform float uWakeSpan; uniform float uWakeOn; uniform sampler2D uWaveSim;
uniform vec2 uWindDir; uniform float uWindK; uniform float uSea; uniform float uFoamK; uniform float uTurb; uniform float uDim; uniform float uUnder; uniform vec3 uUwCol; uniform float uUwDen;
varying vec3 vWorld; varying vec3 vN; varying float vCrest; varying float vDist;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main(){
  if (uHole > 0.0 && max(abs(vWorld.x - cameraPosition.x), abs(vWorld.z - cameraPosition.z)) < uHole) discard;
  vec3 toCam = cameraPosition - vWorld;
  float d3 = length(toCam);
  vec3 V = toCam / d3;
  vec2 uv1 = vWorld.xz * 0.045 + vec2(uTime * 0.012, uTime * 0.009), uv2 = vWorld.xz * 0.17 + vec2(-uTime * 0.03, uTime * 0.02), uv3 = vWorld.xz * 0.6 + vec2(uTime * 0.05, uTime * 0.07);
  vec3 n1 = texture2D(uNormal, uv1).xyz * 2.0 - 1.0, n2 = texture2D(uNormal, uv2).xyz * 2.0 - 1.0, n3 = texture2D(uNormal, uv3).xyz * 2.0 - 1.0;
  float near = 1.0 - smoothstep(60.0, 420.0, vDist);
  float rough = 0.5 + 0.5 * clamp(uSea * 1.6 + 0.3, 0.0, 1.6);
  vec3 N = normalize(vN + vec3(n1.x * 0.35 + n2.x * 0.22 * near + n3.x * 0.1 * near, 0.0, n1.y * 0.35 + n2.y * 0.22 * near + n3.y * 0.1 * near) * rough);
  // rain ripples
  if (uQuality > 0.5 && uRain > 0.05 && vDist < 90.0) {
    vec2 g = vWorld.xz * 1.6; vec2 id = floor(g); vec2 f = fract(g) - 0.5; float t = fract(uTime * 0.9 + hash(id) * 6.0);
    float r = length(f); float ring = smoothstep(0.06, 0.0, abs(r - t * 0.5)) * (1.0 - t) * step(hash(id + 7.0), uRain);
    N = normalize(N + vec3(normalize(f + 1e-4).x, 0.0, normalize(f + 1e-4).y) * ring * 0.6 * (1.0 - 0.7 * uSea));
  }
  // seen from below: Snell's window onto the sky, total internal reflection outside it, fog of the water volume
  if (uUnder > 0.5) {
    vec3 Nd = -N, I = -V;
    vec3 T = refract(I, Nd, 1.33);
    float cosI = max(dot(Nd, V), 0.0);
    float fr = 0.02 + 0.98 * pow(1.0 - cosI, 5.0);
    vec3 col;
    if (dot(T, T) < 0.001) { col = uUwCol * 0.5; }
    else {
      float ty = max(T.y, 0.0);
      vec3 sk = mix(uHorizon, uZenith, pow(ty, 0.45)) * vec3(0.75, 0.95, 1.0);
      float sd = max(dot(T, uSunDir), 0.0);
      sk += uSunCol * (pow(sd, 380.0) * 30.0 + pow(sd, 18.0) * 0.5) * (1.0 - uNight);
      col = mix(sk * (1.0 - 0.3 * uNight), uUwCol * 0.5, fr);
    }
    col += vec3(0.5, 0.62, 0.62) * smoothstep(0.1, 0.4, vCrest * 4.0) * 0.12 * (1.0 - uNight);
    float fogU = 1.0 - exp(-uUwDen * d3);
    col = mix(col, uUwCol, fogU);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    return;
  }
  // hull waves from the wave-equation map: slope tilts the normal, steep crests whiten
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
      hullFoam = smoothstep(0.7, 1.6, length(gr)) * ek;
    }
  }
  // depth from the terrain height map
  vec2 duv = (vWorld.xz - uRect.xy) / uRect.zw;
  float depth = 14.0;
  if (duv.x > 0.0 && duv.y > 0.0 && duv.x < 1.0 && duv.y < 1.0) depth = texture2D(uDepth, duv).r * 16.0;
  vec3 R = reflect(-V, N);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  float ry = max(R.y, 0.0);
  vec3 sky = mix(uHorizon, uZenith, pow(ry, 0.45));
  vec3 deep = mix(mix(vec3(0.012, 0.075, 0.12), vec3(0.02, 0.058, 0.066), uTurb), vec3(0.004, 0.02, 0.035), uNight);
  vec3 shallow = mix(mix(vec3(0.12, 0.5, 0.48), vec3(0.13, 0.32, 0.29), uTurb), vec3(0.01, 0.06, 0.06), uNight);
  float dmix = smoothstep(0.0, 5.5, depth);
  vec3 body = mix(shallow, deep, dmix) * uDim;
  // light scattering through wave crests
  float sss = pow(max(dot(normalize(V + uSunDir * 0.6), N), 0.0), 3.0) * 0.16 * (1.0 - uNight);
  body += vec3(0.05, 0.22, 0.2) * sss * (0.5 + clamp(vCrest * 5.0, 0.0, 1.5));
  vec3 H = normalize(V + uSunDir);
  float spec = pow(max(dot(N, H), 0.0), 380.0) * 14.0 + pow(max(dot(N, H), 0.0), 55.0) * 0.35;
  // boat wakes and splashes from the top-down foam map
  float wake = 0.0;
  if (uWakeOn > 0.5) {
    vec2 wuv = (vWorld.xz - uWakeC) / uWakeSpan + 0.5;
    vec2 we = min(wuv, 1.0 - wuv);
    wake = texture2D(uWake, wuv).r * smoothstep(0.0, 0.06, min(we.x, we.y));
    body += vec3(0.05, 0.13, 0.13) * wake * 0.7;
  }
  // foam: wave crests, whitecaps, wind streaks, shoreline breakers, wakes
  float fn = vnoise(vWorld.xz * 0.9 + uTime * 0.1) * 0.6 + vnoise(vWorld.xz * 2.7 - uTime * 0.17) * 0.4;
  float crestF = smoothstep(0.26, 0.5, vCrest * (3.4 - 1.2 * uSea) + fn * 0.22 - 0.12 - uFoamK * 0.08) * near;
  float shore = smoothstep(1.3, 0.0, depth) * (0.55 + 0.45 * sin(depth * 7.0 - uTime * 1.7 + fn * 4.0));
  shore *= smoothstep(0.0, 0.25, depth + 0.35);
  float wakeF = 0.0;
  if (wake > 0.01) {
    float fw = vnoise(vWorld.xz * 2.3 - uTime * 0.35) * 0.6 + vnoise(vWorld.xz * 5.3 + uTime * 0.3) * 0.4;
    wakeF = smoothstep(0.1, 0.72, wake * (0.4 + 1.0 * fw)) * 0.85;
  }
  float streak = 0.0, patches = 0.0;
  if (uQuality > 0.5 && uFoamK > 0.02) {
    vec2 wp = vec2(dot(vWorld.xz, uWindDir), dot(vWorld.xz, vec2(-uWindDir.y, uWindDir.x)));
    float st = vnoise(vec2(wp.x * 0.07 - uTime * (0.9 + uWindK * 2.5), wp.y * 0.85)) * 0.6 + vnoise(vec2(wp.x * 0.17 - uTime * (1.4 + uWindK * 3.0), wp.y * 2.2)) * 0.4;
    streak = smoothstep(0.68, 0.9, st) * smoothstep(0.3, 0.8, uWindK) * (1.0 - smoothstep(250.0, 1200.0, vDist));
    float pn = vnoise(wp * vec2(0.05, 0.09) - vec2(uTime * 0.6, 0.0)) * 0.6 + vnoise(wp * vec2(0.13, 0.2) - vec2(uTime * 0.9, 0.0)) * 0.4;
    patches = uFoamK * smoothstep(0.7 - 0.08 * uFoamK, 0.9, pn) * smoothstep(0.0, 0.03, vCrest + 0.02 + uSea * 0.03 * smoothstep(120.0, 500.0, vDist));
  }
  float foam = clamp(crestF * 0.7 + shore * (0.7 + 0.3 * fn) + wakeF * 0.95 + hullFoam * 0.3 + streak * 0.3 + patches * 0.4, 0.0, 1.0) * 0.85;
  // premultiplied surface: volume light, reflection, glitter, foam; T is what still shows of the scene behind
  float bodyA = 1.0 - exp(-depth * mix(0.34, 0.85, uTurb));
  vec3 emit = body * bodyA * (1.0 - fres) + sky * (1.0 - 0.25 * uNight) * fres + uSunCol * spec * (1.0 - uNight);
  float T = (1.0 - bodyA) * (1.0 - fres);
  vec3 foamCol = vec3(0.92, 0.95, 0.97) * (1.0 - 0.7 * uNight) * (0.55 + 0.45 * uDim) + vec3(0.02);
  emit = emit * (1.0 - foam) + foamCol * foam; T *= 1.0 - foam;
  float fog = 1.0 - exp(-uFogDen * uFogDen * d3 * d3);
  emit = emit * (1.0 - fog) + uFogCol * fog; T *= 1.0 - fog;
  gl_FragColor = vec4(emit, 1.0 - T);
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
    this.t = 0; this.quality = 2;
    this.waves = new WaveField();
    this.under = false; this.camDepth = -1;
    this.uw = { col: new THREE.Color(0.05, 0.3, 0.34), den: 0.04 };
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
    const W = this.waves;
    this.uni = {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uStorm: { value: new THREE.Vector4() },
      uW0: { value: W.u0 }, uW1: { value: W.u1 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uNight: { value: 0 }, uRain: { value: 0 }, uFogCol: { value: new THREE.Color() }, uFogDen: { value: 0.0006 },
      uWake: { value: null }, uWaveSim: { value: null }, uWakeC: { value: new THREE.Vector2() }, uWakeSpan: { value: 120 }, uWakeOn: { value: 0 },
      uNormal: { value: makeNormalMap() }, uDepth: { value: this.depthTex }, uRect: { value: new THREE.Vector4(T.x0, T.z0, (nx - 1) * T.res, (nz - 1) * T.res) }, uQuality: { value: 1 },
      uWindDir: { value: new THREE.Vector2(1, 0) }, uWindK: { value: 0.2 }, uSea: { value: 0.2 }, uFoamK: { value: 0 }, uTurb: { value: 0.2 }, uDim: { value: 1 },
      uUnder: { value: 0 }, uUwCol: { value: this.uw.col }, uUwDen: { value: 0.04 },
    };
    // three concentric grids (fine near the camera, coarse to the horizon); each has its own centre and a hole where the finer one draws
    this.group = new THREE.Group(); this.group.frustumCulled = false;
    this.rings = [];
    const mk = (size, seg, hole, drop) => {
      const cell = size / seg;
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, uniforms: { ...this.uni, uCenter: { value: new THREE.Vector3() }, uHole: { value: hole }, uSpacing: { value: cell } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; m.matrixAutoUpdate = false;
      this.group.add(m);
      this.rings.push({ m, mat, snap: cell, drop, hole });
    };
    mk(900, 300, 0, 0); mk(4200, 210, 420, -0.03); mk(26000, 140, 2000, -0.06);
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
  waveAt(x, z, out = null, t = this.t) { return this.waves.sample(x, z, out, t - this.waves.tRef); }

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
    const w = sky.w, W = this.waves, U = this.uni, wd = sky.wind;
    const sq = sky.squall; if (sq) { const s = W.storm; s.x = sq.x; s.z = sq.z; s.r = sq.r * 1.3; s.k = sq.k * 0.7; } else W.storm.k = 0;
    W.update(dt, this.t, wd.mean ?? wd.speed, wd.dir);
    U.uTime.value = this.t;
    const st = W.storm; U.uStorm.value.set(st.x, st.z, st.r, st.k);
    U.uWindDir.value.set(Math.cos(W.dirW), Math.sin(W.dirW));
    U.uWindK.value = clamp(W.U / 20, 0, 1); U.uSea.value = W.sea01;
    U.uFoamK.value = Math.pow(clamp((W.U - 5.5) / 9, 0, 1), 1.1);
    U.uTurb.value = clamp(0.2 + W.sea01 * 0.55 + w.rain * 0.25, 0, 1);
    U.uDim.value = lerp(0.5, 1, clamp(w.sun, 0, 1));
    U.uQuality.value = this.quality;
    const cp = camera.position;
    for (const r of this.rings) r.mat.uniforms.uCenter.value.set(Math.round(cp.x / r.snap) * r.snap, r.drop, Math.round(cp.z / r.snap) * r.snap);
    this.rings[0].m.visible = this.waterWithin(cp.x, cp.z, 500);
    this.rings[1].m.visible = this.quality >= 1 && this.waterWithin(cp.x, cp.z, 2300);
    this.rings[2].mat.uniforms.uHole.value = this.rings[1].m.visible ? 2000 : 440;
    U.uSunDir.value.copy(sky.uniforms.sunDir.value); U.uSunCol.value.copy(sky.uniforms.sunCol.value).multiplyScalar(0.9);
    U.uZenith.value.copy(sky.uniforms.zenith.value); U.uHorizon.value.copy(sky.uniforms.horizon.value);
    U.uNight.value = sky.night; U.uRain.value = w.rain;
    U.uFogCol.value.copy(sky.scene.fog.color); U.uFogDen.value = sky.scene.fog.density;
    // camera against the live surface
    const sy = W.sample(cp.x, cp.z, null, this.t - W.tRef);
    this.camDepth = sy - cp.y;
    this.under = this.camDepth > 0 && this.world.terrain.height(cp.x, cp.z) < sy - 0.05;
    U.uUnder.value = this.under ? 1 : 0; WATER_FX.uWUnder.value = U.uUnder.value;
    const dk = clamp(this.camDepth / 12, 0, 1), lum = (0.4 + 0.6 * clamp(w.sun, 0, 1)) * (1 - 0.85 * sky.night);
    this.uw.col.setRGB(lerp(0.06, 0.012, dk) * lum, lerp(0.34, 0.075, dk) * lum, lerp(0.36, 0.15, dk) * lum).lerp(new THREE.Color(0.05, 0.1, 0.09).multiplyScalar(lum), U.uTurb.value * 0.5);
    this.uw.den = lerp(0.03, 0.085, U.uTurb.value) + 0.012 * dk;
    U.uUwDen.value = this.uw.den;
    WATER_FX.uWT.value = this.t * 0.7; WATER_FX.uWSun.value = clamp(sky.sun.intensity / 3, 0, 1) * (1 - sky.night); WATER_FX.uWTurb.value = U.uTurb.value;
  }
}
