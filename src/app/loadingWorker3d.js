import * as THREE from 'three';
import { buildCar, buildWheel, makePaintMaterial, makeGlassMaterial, makeLightsMaterial } from '../vehicles/carModel.js';
import { VEHICLE_BY_ID } from '../data/vehicles.js';
import { makePlate } from '../world/textures.js';

// Loading scene (runs in a worker): a car on a wet two-lane road at dusk, seen from a chase camera. Lamps, rain, planar reflections and a
// small post pipeline (bloom, filmic tonemap, grain). Progress sets the speed.
let renderer, scene, camera, W = 1280, H = 720, DPR = 1;
let rtScene, rtRefl, rtB1, rtB1b, rtB2, rtB2b, quad, quadScene, quadCam;
let matBright, matBlur, matComp;
let road, ground, dome, rain, spray, halos, trees, skyline, beacons, gantries = [], lampRows = [], railRows = [];
let car, wheels = [], carMats = {}, reflCam, texMat = new THREE.Matrix4(), envRT = null;
let prog = 0, speed = 14, t = 0, scroll = 0, mx = 0.5, my = 0.5, smx = 0.5, smy = 0.5, done = false, running = true, last = 0, exposure = 1, brake = 0, nextBrake = 6;
const LAMP_S = 42, LAMP_H = 9.0, ROAD_HW = 8.0, CAR_X = -1.8;
const onc = [{ z: 400, x: 1.8, v: 0, on: false }, { z: 400, x: 1.8, v: 0, on: false }, { z: 400, x: 1.8, v: 0, on: false }];
let nextOnc = 3;
const U = {
  uTime: { value: 0 }, uScroll: { value: 0 }, uCam: { value: new THREE.Vector3() }, uFog: { value: new THREE.Color(0.05, 0.055, 0.07) }, uFogD: { value: 0.0065 },
  uSpeed: { value: 0 }, uCarX: { value: CAR_X }, uBrake: { value: 0 }, uTexMat: { value: texMat }, tRefl: { value: null }, uWet: { value: 1 },
  uOnc: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uLampPh: { value: 0 },
};

const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

// ---------------------------------------------------------------- sky
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FS = `
uniform float uTime; varying vec3 vDir;
${NOISE}
void main(){
  vec3 d = normalize(vDir); float e = d.y;
  vec3 zen = vec3(0.0035, 0.0065, 0.016), mid = vec3(0.022, 0.032, 0.058), hor = vec3(0.13, 0.1, 0.1);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.16, e)); col = mix(col, zen, smoothstep(0.1, 0.8, e));
  vec2 uv = d.xz / (abs(e) + 0.16) * 0.9;
  float n = fbm(uv * 1.4 + vec2(uTime * 0.006, 0.0)), n2 = fbm(uv * 3.1 - vec2(uTime * 0.01, 3.0));
  float cl = smoothstep(0.38, 0.78, n * 0.75 + n2 * 0.3) * smoothstep(0.0, 0.1, e) * (1.0 - smoothstep(0.3, 0.75, e));
  vec3 under = mix(hor * 0.9, mid * 1.1, smoothstep(0.0, 0.5, e));
  col = mix(col, under * (0.5 + 0.6 * n2) , cl * 0.7);
  float g = pow(max(dot(d, normalize(vec3(0.1, 0.0, 1.0))), 0.0), 5.0) * exp(-abs(e) * 11.0);
  col += vec3(0.6, 0.4, 0.24) * g * 0.22;
  if (e < 0.0) col = mix(hor * 0.5, vec3(0.012, 0.014, 0.02), smoothstep(0.0, -0.12, e));
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- road
const ROAD_VS = `
uniform mat4 uTexMat; varying vec3 vWP; varying vec4 vRefl;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vRefl = uTexMat * wp; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const ROAD_FS = `
precision highp float;
uniform sampler2D tRefl; uniform vec3 uCam; uniform float uScroll, uTime, uFogD, uCarX, uBrake, uWet, uLampPh, uSpeed; uniform vec3 uFog; uniform vec4 uOnc[3];
varying vec3 vWP; varying vec4 vRefl;
${NOISE}
const float LS = ${LAMP_S}.0;
vec3 lampPool(vec3 p){
  vec3 acc = vec3(0.0);
  for (int r = 0; r < 2; r++) {
    float lx = r == 0 ? -7.0 : 7.0;
    float z0 = r == 0 ? 0.0 : LS * 0.5;
    float k = floor((p.z - z0 + uLampPh) / LS + 0.5);
    for (int j = -2; j <= 2; j++) {
      float lz = z0 + (k + float(j)) * LS - uLampPh;
      vec3 d = vec3(p.x - lx, ${LAMP_H.toFixed(1)}, p.z - lz);
      float d2 = dot(d, d);
      acc += vec3(1.0, 0.78, 0.52) * (d.y / sqrt(d2)) / d2;
    }
  }
  return acc * 520.0;
}
float beam(vec3 hp, float dir, vec3 p){
  float dz = (p.z - hp.z) * dir; float lat = p.x - hp.x;
  float spread = 1.6 + 0.2 * dz;
  float cone = exp(-(lat * lat) / (spread * spread));
  float fall = 1.0 / (1.0 + dz * dz / 420.0);
  return cone * fall * smoothstep(2.0, 7.0, dz) * (1.0 - smoothstep(60.0, 110.0, dz));
}
void main(){
  vec3 p = vWP; float x = p.x, z = p.z + uScroll, ax = abs(x);
  float nM = fbm(vec2(x * 0.7, z * 0.28)), nS = vnoise(vec2(x * 17.0, z * 17.0)), nG = vnoise(vec2(x * 61.0, z * 61.0)), nP = fbm(vec2(x * 0.55 + 4.0, z * 0.22));
  float tr = 0.0;
  for (int i = 0; i < 4; i++) { float cx = (i < 2 ? -1.8 : 1.8) + (mod(float(i), 2.0) < 0.5 ? -0.8 : 0.8); float q = (x - cx) / 0.42; tr = max(tr, exp(-q * q)); }
  float asph = 1.0 - smoothstep(${ROAD_HW}.0 - 0.15, ${ROAD_HW}.0 + 0.25, ax);
  float wet = clamp(uWet * (0.5 + 0.55 * tr + (nP - 0.5) * 1.6), 0.0, 1.0);
  wet = mix(0.18, wet, asph);
  vec3 alb = vec3(0.042, 0.043, 0.047) * (0.65 + 0.7 * nM) * (0.82 + 0.3 * nS) * (0.9 + 0.2 * nG);
  alb *= mix(1.0, 0.72, tr);
  alb = mix(vec3(0.026, 0.024, 0.021) * (0.7 + 0.6 * nG), alb, asph);
  // marking
  float dash = step(fract(z / 12.0), 0.25) * (1.0 - smoothstep(0.07, 0.11, ax));
  float edgeL = 1.0 - smoothstep(0.08, 0.13, abs(ax - 7.2));
  float mk = max(dash, edgeL) * asph * (0.45 + 0.55 * smoothstep(0.25, 0.7, vnoise(vec2(x * 9.0, z * 4.0))));
  alb = mix(alb, vec3(0.5, 0.5, 0.48), mk);
  // light on the surface
  vec3 L = lampPool(p);
  vec3 hl = vec3(uCarX + 0.62, 0.65, 2.1), hr = vec3(uCarX - 0.62, 0.65, 2.1);
  float bm = beam(hl, 1.0, p) + beam(hr, 1.0, p);
  L += vec3(1.0, 0.92, 0.78) * bm * 2.4;
  for (int i = 0; i < 3; i++) if (uOnc[i].z > 0.0) {
    float o = uOnc[i].z;
    L += vec3(0.86, 0.93, 1.0) * (beam(vec3(uOnc[i].x + 0.65, 0.7, uOnc[i].y), -1.0, p) + beam(vec3(uOnc[i].x - 0.65, 0.7, uOnc[i].y), -1.0, p)) * 2.8 * o;
  }
  // tail light wash behind the car
  vec3 tl = vec3(uCarX, 0.7, -2.2);
  float behind = smoothstep(0.6, -1.2, p.z - tl.z);
  vec2 dt = vec2(abs(x - uCarX) - 0.62, p.z - tl.z);
  float tw = exp(-(dt.x * dt.x) / 3.2 - (dt.y * dt.y) / 10.0) * behind;
  L += vec3(1.0, 0.045, 0.02) * tw * (0.55 + 2.2 * uBrake);
  L += vec3(0.05, 0.062, 0.095) * 0.35;
  vec3 diff = alb * L;
  float diffMask = mk * (0.35 + 0.65 * dot(L, vec3(0.33))) * 0.55;
  diff += vec3(0.42, 0.4, 0.36) * diffMask * 0.4 * min(dot(L, vec3(0.33)), 3.0);
  // reflection
  vec3 V = normalize(uCam - p);
  float cosT = clamp(V.y, 0.0, 1.0);
  float F = 0.03 + 0.97 * pow(1.0 - cosT, 5.0);
  vec2 uv = vRefl.xy / vRefl.w;
  vec2 rip = vec2(sin(x * 5.3 + z * 2.1 + uTime * 1.1) + sin(x * 11.7 - z * 4.3 - uTime * 0.8) * 0.6, sin(x * 3.9 - z * 6.7 + uTime * 0.9) + sin(x * 9.1 + z * 8.3 - uTime * 1.3) * 0.6) * 0.0012 * (0.4 + wet);
  float blur = mix(0.016, 0.0016, wet) * (1.0 + 1.6 * (1.0 - tr));
  vec3 refl = vec3(0.0); float ws = 0.0;
  for (int i = -5; i <= 5; i++) {
    float f = float(i) / 5.0, w = exp(-f * f * 2.2);
    vec2 o = vec2(f * blur * 0.28, f * blur);
    refl += texture2D(tRefl, uv + rip + o).rgb * w; ws += w;
  }
  refl /= ws;
  float rk = F * wet * (1.0 - mk * 0.8) * asph;
  vec3 col = diff * (1.0 - rk * 0.6) + refl * rk;
  float dist = length(p - uCam);
  float fg = 1.0 - exp(-uFogD * uFogD * dist * dist);
  col = mix(col, uFog, fg);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- tree line / skyline
const TREE_VS = `
uniform float uScroll; uniform float uSide; uniform float uBase; varying float vH; varying vec3 vWP; varying vec2 vUv;
${NOISE}
void main(){
  vec3 p = position; float z = p.z + uScroll;
  float prof = 0.5 + 0.5 * fbm(vec2(z * 0.045, uSide * 7.0)) + 0.4 * vnoise(vec2(z * 0.4, uSide)) ;
  float top = uBase * prof;
  float y = uv.y * top;
  vec4 wp = modelMatrix * vec4(p.x, y, p.z, 1.0);
  vWP = wp.xyz; vH = uv.y; vUv = vec2(z, y);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const TREE_FS = `
precision highp float; uniform vec3 uFog; uniform float uFogD; uniform vec3 uCam; varying float vH; varying vec3 vWP; varying vec2 vUv;
${NOISE}
void main(){
  float leaf = fbm(vUv * vec2(0.9, 0.9) + 3.0);
  float edge = smoothstep(0.7, 1.0, vH);
  vec3 col = vec3(0.004, 0.0055, 0.007) * (0.6 + 0.8 * leaf) + vec3(0.02, 0.026, 0.04) * edge * edge * 0.6;
  float d = length(vWP - uCam); float fg = 1.0 - exp(-uFogD * uFogD * d * d);
  gl_FragColor = vec4(mix(col, uFog, fg), 1.0);
}`;
const SKYLINE_FS = `
precision highp float; uniform vec3 uFog; uniform float uFogD; uniform vec3 uCam; uniform float uTime; varying float vH; varying vec3 vWP; varying vec2 vUv;
${NOISE}
void main(){
  vec2 g = vec2(vUv.x * 0.55, vUv.y * 0.32);
  vec2 cell = floor(g); float r = h21(cell + 11.0);
  vec2 f = fract(g);
  float win = step(0.74, r) * step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.75);
  vec3 wc = mix(vec3(1.0, 0.62, 0.28), vec3(0.8, 0.88, 1.0), step(0.55, h21(cell + 3.0)));
  vec3 col = vec3(0.012, 0.016, 0.026) + wc * win * 0.5;
  float d = length(vWP - uCam); float fg = 1.0 - exp(-uFogD * uFogD * d * d * 0.5);
  gl_FragColor = vec4(mix(col, uFog * 1.35, fg), 1.0);
}`;

// ---------------------------------------------------------------- additive sprites: lamp halos, headlights, beacons
const HALO_VS = `
attribute vec4 aData; attribute vec3 aCol; uniform float uScale; varying vec3 vCol; varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uScale * aData.x / d, 2.0, 420.0);
  vA = aData.y * smoothstep(0.8, 3.5, d) * (1.0 - smoothstep(0.0, 1.0, aData.z)); vCol = aCol;
}`;
const HALO_FS = `
precision highp float; varying vec3 vCol; varying float vA; uniform float uFogD;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float core = exp(-r * r * 18.0), glow = exp(-r * r * 3.2) * 0.35 + 0.02 / (r + 0.15) * smoothstep(1.0, 0.5, r);
  gl_FragColor = vec4(vCol * (core * 4.0 + glow) * vA, 1.0);
}`;

// ---------------------------------------------------------------- rain and spray
const RAIN_VS = `
attribute float tip; uniform float uTime, uScroll, uLampPh; uniform vec3 uCam; uniform float uCarX;
varying float vA;
const float LS = ${LAMP_S}.0;
float lit(vec3 p){
  float a = 0.0004;
  for (int r = 0; r < 2; r++) {
    float lx = r == 0 ? -7.0 : 7.0, z0 = r == 0 ? 0.0 : LS * 0.5;
    float k = floor((p.z - z0 + uLampPh) / LS + 0.5);
    for (int j = -1; j <= 1; j++) { float lz = z0 + (k + float(j)) * LS - uLampPh; vec3 d = vec3(p.x - lx, p.y - ${LAMP_H.toFixed(1)}, p.z - lz); a += 70.0 / (40.0 + dot(d, d)); }
  }
  vec3 t = vec3(p.x - uCarX, p.y - 0.7, p.z + 2.3); a += 0.9 / (1.0 + dot(t, t) * 0.12);
  vec3 h = vec3(p.x - uCarX, p.y - 0.65, p.z - 2.1); if (p.z > 2.0) a += 0.9 / (1.0 + dot(h, h) * 0.02);
  return a;
}
void main(){
  vec3 box = vec3(26.0, 14.0, 60.0);
  vec3 base = position * box;
  vec3 off = vec3(1.5 * uTime, -22.0 * uTime, 0.0);
  vec3 p = uCam + (fract((base + off - uCam) / box + 0.5) - 0.5) * box;
  p.z += 8.0;
  vec3 dir = normalize(vec3(1.5, -22.0, 0.0));
  vec3 q = p - dir * 0.55 * tip;
  vA = (0.26 - 0.22 * tip) * min(lit(p), 0.8) * (0.3 + 0.7 * fract(position.x * 91.7));
  gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
}`;
const RAIN_FS = 'varying float vA; void main(){ gl_FragColor = vec4(vec3(0.75, 0.82, 0.95) * vA, 1.0); }';

const SPRAY_VS = `
attribute vec4 aSeed; uniform float uTime, uSpeed, uScale, uBrake, uCarX; varying vec3 vCol; varying float vA;
void main(){
  float age = fract(uTime * 0.85 + aSeed.y);
  float side = aSeed.x > 0.5 ? 1.0 : -1.0;
  vec3 s = vec3(uCarX + side * 0.82, 0.12, -1.35);
  vec3 v = vec3((aSeed.z - 0.5) * 2.2, 0.8 + 2.2 * aSeed.w, -(uSpeed * 0.28) * (0.45 + aSeed.z));
  vec3 p = s + v * age * 1.5 + vec3(0.0, -1.2 * age * age, 0.0);
  p.y = max(p.y, 0.05);
  vec4 mv = viewMatrix * vec4(p, 1.0); float d = max(-mv.z, 0.6);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uScale * (0.35 + 2.2 * age) / d, 2.0, 200.0);
  float tw = exp(-((p.z + 4.2) * (p.z + 4.2)) / 14.0);
  vCol = vec3(0.16, 0.18, 0.22) + vec3(0.7, 0.07, 0.04) * tw * (0.3 + 1.2 * uBrake);
  vA = pow(1.0 - age, 2.4) * 0.035 * (0.4 + uSpeed / 40.0);
}`;
const SPRAY_FS = 'precision highp float; varying vec3 vCol; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; float a = smoothstep(1.0, 0.0, r); gl_FragColor = vec4(vCol * a * a * vA * 10.0, 1.0); }';

// ---------------------------------------------------------------- post
const FS_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const BRIGHT_FS = `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
void main(){ vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b)); float k = max(0.0, l - uThresh) / max(l, 1e-4); gl_FragColor = vec4(min(c * k, vec3(30.0)), 1.0); }`;
const BLUR_FS = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270; c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162; c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703; c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703; gl_FragColor = vec4(c, 1.0); }`;
const COMP_FS = `uniform sampler2D tScene, tB1, tB2; uniform float uExp, uBloom, uTime, uFade; uniform vec2 uRes; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 dv = vUv - 0.5; float r2 = dot(dv, dv);
  vec3 c = vec3(texture2D(tScene, vUv - dv * 0.012 * r2).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + dv * 0.012 * r2).b);
  c += (texture2D(tB1, vUv).rgb * 0.55 + texture2D(tB2, vUv).rgb * 0.9) * uBloom;
  c *= uExp;
  c = aces(c * 0.95);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 0.9);
  c = mix(c, c * vec3(0.94, 1.0, 1.08), 1.0 - smoothstep(0.0, 0.35, l));
  c *= 1.0 - 0.55 * smoothstep(0.1, 0.62, r2 * 2.2);
  c = toSRGB(c);
  c += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.035 + (hash(gl_FragCoord.xy * 0.5 + fract(uTime * 1.7) * 37.0) - 0.5) * 0.012;
  c *= uFade;
  gl_FragColor = vec4(c, 1.0);
}`;

function sm(vs, fs, uniforms, extra = {}) { return new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, ...extra }); }

// ---------------------------------------------------------------- scene pieces
function glowCanvas() {
  const c = new OffscreenCanvas(1024, 320), x = c.getContext('2d');
  x.fillStyle = '#0b5a3c'; x.fillRect(0, 0, 1024, 320);
  x.strokeStyle = '#e9efe9'; x.lineWidth = 8; x.strokeRect(10, 10, 1004, 300);
  x.fillStyle = '#f2f5f1'; x.font = 'bold 118px Arial'; x.textAlign = 'left'; x.fillText('RIVERTON', 60, 138);
  x.font = 'bold 62px Arial'; x.fillText('Marlow Bay', 60, 262); x.textAlign = 'right'; x.fillText('42 km', 960, 262);
  x.beginPath(); x.moveTo(860, 130); x.lineTo(960, 130); x.lineTo(960, 50); x.lineTo(990, 50); x.lineTo(924, 14); x.lineTo(858, 50); x.lineTo(888, 50); x.lineTo(888, 100); x.lineTo(860, 100); x.closePath(); x.fillStyle = '#f2f5f1'; x.fill();
  return c;
}

function makeLamp(withLight) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.55, metalness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, LAMP_H, 8), metal); pole.position.y = LAMP_H / 2; g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.1), metal); arm.position.set(-1.1, LAMP_H, 0); g.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.34), metal); head.position.set(-2.1, LAMP_H + 0.02, 0); g.add(head);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.26), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.55).multiplyScalar(6) }));
  lens.rotation.x = Math.PI / 2; lens.position.set(-2.1, LAMP_H - 0.045, 0); g.add(lens);
  if (withLight) {
    const l = new THREE.PointLight(0xffc27a, 1500, 46, 2); l.position.set(-2.1, LAMP_H - 0.4, 0); g.add(l);
  }
  return g;
}

function buildEnvironment() {
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.6, 0.28).multiplyScalar(14) });
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), dome.material.clone()));
  es.children[0].material.side = THREE.BackSide;
  for (let i = -3; i <= 3; i++) for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), lampMat); m.position.set(sx * 7, 9, i * 20 + (sx > 0 ? 10 : 0)); m.rotation.x = Math.PI / 2; es.add(m);
  }
  const red = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.05, 0.02).multiplyScalar(1.2), side: THREE.DoubleSide })); red.position.set(0, 0.8, -30); es.add(red);
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.022, 0.028) })); gnd.position.y = -0.2; es.add(gnd);
  const pm = new THREE.PMREMGenerator(renderer);
  envRT = pm.fromScene(es, 0.03);
  pm.dispose();
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.9;
}

function pickCar(force) {
  if (force && VEHICLE_BY_ID[force]) return [force, '#1d2a3a'];
  const opts = [['arc', '#232a33'], ['gts', '#d9dadc'], ['meridian', '#1a1c20'], ['arc', '#7a1a1c'], ['thunder', '#1b3a6b'], ['vireo', '#b3151b'], ['gts', '#101214']];
  return opts[Math.floor(Math.random() * opts.length)];
}

function buildCarMesh(force) {
  const [id, color] = pickCar(force);
  const def = VEHICLE_BY_ID[id];
  const geo = buildCar(def, {});
  car = new THREE.Group();
  const paint = makePaintMaterial({ color, finish: 'metallic' });
  paint.clearcoat = 1; paint.clearcoatRoughness = 0.03; paint.envMapIntensity = 1.5;
  const glass = makeGlassMaterial(0.5); glass.envMapIntensity = 0.55; glass.opacity = 0.9;
  const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
  const chrome = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 1.0, envMapIntensity: 1.4 });
  const lights = makeLightsMaterial(false);
  lights.userData.uLight.value.set(1, 0, 0, 0);
  const plateMat = new THREE.MeshStandardMaterial({ map: makePlate('RIV 2481'), roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
  carMats = { paint, glass, trim, chrome, lights, plates: plateMat };
  for (const k of ['paint', 'trim', 'chrome', 'lights', 'plates', 'glass']) {
    if (!geo[k]) continue;
    const m = new THREE.Mesh(geo[k], carMats[k]); m.castShadow = false; if (k === 'glass') m.renderOrder = 2;
    car.add(m);
  }
  const ws = buildWheel(def.rims, def.body.style === 'sports' || def.body.style === 'supercar' ? 0.72 : 0.64);
  const rimMat = new THREE.MeshStandardMaterial({ color: '#c9ccd0', vertexColors: true, metalness: 0.85, roughness: 0.25 });
  const tireMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const wr = def.body.wr, ww = def.body.ww;
  for (const w of geo.wheels) {
    const pivot = new THREE.Group(); pivot.position.set(w.x, wr, w.z);
    const spin = new THREE.Group(); spin.add(new THREE.Mesh(ws.tire, tireMat), new THREE.Mesh(ws.rim, rimMat)); spin.scale.set(ww, wr, wr);
    if (!w.left) spin.rotation.y = Math.PI;
    const holder = new THREE.Group(); holder.add(spin); pivot.add(holder); car.add(pivot);
    wheels.push({ spin, left: w.left, r: wr });
  }
  car.userData = { def, L: def.body.L, rearZ: -def.body.L / 2 };
  car.position.set(CAR_X, 0, 0);
  scene.add(car);
}

function buildRoadside() {
  // ground
  ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 1200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.012, 0.014, 0.012), roughness: 1, metalness: 0 }));
  ground.position.set(0, -0.02, 400); scene.add(ground);
  // road
  const rg = new THREE.PlaneGeometry(ROAD_HW * 2 + 6, 900).rotateX(-Math.PI / 2);
  road = new THREE.Mesh(rg, new THREE.ShaderMaterial({ vertexShader: ROAD_VS, fragmentShader: ROAD_FS, uniforms: U, depthWrite: true }));
  road.position.set(0, 0, 400); scene.add(road);
  // guard rails
  const railMat = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.35, metalness: 0.9 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.5 });
  for (const sx of [-1, 1]) {
    const row = new THREE.Group(); row.position.x = sx * 8.7;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 700), railMat); rail.position.set(0, 0.62, 330); row.add(rail);
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 700), railMat); rail2.position.set(-sx * 0.04, 0.84, 330); row.add(rail2);
    const posts = new THREE.Group();
    const pg = new THREE.BoxGeometry(0.1, 0.9, 0.1);
    for (let k = -4; k < 100; k++) { const p = new THREE.Mesh(pg, postMat); p.position.set(sx * 0.08, 0.45, k * 4); posts.add(p); }
    row.add(posts); row.userData.posts = posts;
    scene.add(row); railRows.push(row);
  }
  // lamps: two rows, alternating
  for (const r of [0, 1]) {
    const row = new THREE.Group(); row.userData.r = r;
    for (let k = -3; k <= 8; k++) {
      const lamp = makeLamp(k >= -1 && k <= 2);
      lamp.position.set(r === 0 ? -9.2 : 9.2, 0, k * LAMP_S + (r ? LAMP_S / 2 : 0));
      if (r === 0) lamp.scale.x = -1;
      row.add(lamp);
    }
    scene.add(row); lampRows.push(row);
  }
  // tree line and skyline
  const tg = new THREE.PlaneGeometry(1, 1, 1, 1);
  const treeGeo = new THREE.BufferGeometry();
  const nz = 300, pos = [], uv = [], idx = [];
  for (let i = 0; i <= nz; i++) { const z = -60 + i * 2.2; pos.push(0, 0, z, 0, 1, z); uv.push(0, 0, 0, 1); if (i < nz) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  treeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); treeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); treeGeo.setIndex(idx);
  trees = [];
  for (const [side, x, base] of [[-1, -24, 16], [1, 24, 15], [-1, -52, 26], [1, 52, 24]]) {
    const m = new THREE.Mesh(treeGeo, new THREE.ShaderMaterial({ vertexShader: TREE_VS, fragmentShader: TREE_FS, uniforms: { uScroll: U.uScroll, uSide: { value: x * 0.13 }, uBase: { value: base }, uFog: U.uFog, uFogD: U.uFogD, uCam: U.uCam }, side: THREE.DoubleSide }));
    m.position.set(x, 0, 0); m.frustumCulled = false; scene.add(m); trees.push(m);
  }
  // skyline strip
  const sg = new THREE.BufferGeometry(), sp = [], su = [], si = [];
  let bx = -520;
  while (bx < 520) {
    const w = 18 + Math.random() * 38, h = 20 + Math.pow(Math.random(), 2.2) * 190, z = 1700 + Math.random() * 300, b = sp.length / 3;
    sp.push(bx, 0, z, bx + w, 0, z, bx + w, h, z, bx, h, z); su.push(bx, 0, bx + w, 0, bx + w, h, bx, h);
    si.push(b, b + 1, b + 2, b, b + 2, b + 3); bx += w + Math.random() * 14;
  }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); sg.setIndex(si);
  skyline = new THREE.Mesh(sg, new THREE.ShaderMaterial({ vertexShader: 'varying vec3 vWP; varying vec2 vUv; varying float vH; void main(){ vWP = (modelMatrix * vec4(position, 1.0)).xyz; vUv = uv; vH = uv.y; gl_Position = projectionMatrix * viewMatrix * vec4(vWP, 1.0); }', fragmentShader: SKYLINE_FS, uniforms: { uFog: U.uFog, uFogD: U.uFogD, uCam: U.uCam, uTime: U.uTime }, side: THREE.DoubleSide }));
  skyline.frustumCulled = false; scene.add(skyline);
  // gantry sign
  const sc = glowCanvas(), stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace; stex.anisotropy = 8;
  const steel = new THREE.MeshStandardMaterial({ color: 0x5b6066, roughness: 0.5, metalness: 0.8 });
  const signMat = new THREE.MeshStandardMaterial({ map: stex, roughness: 0.4, metalness: 0.1, emissive: 0xffffff, emissiveMap: stex, emissiveIntensity: 0.07 });
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 8.4, 10), steel); p.position.set(sx * 9.8, 4.2, 0); g.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.5, 0.6), steel); beam.position.set(0, 8.2, 0); g.add(beam);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 2.56), signMat); sign.position.set(-1.8, 6.5, -0.36); sign.rotation.y = Math.PI; g.add(sign);
    g.userData.i = i; scene.add(g); gantries.push(g);
  }
}

function buildSprites() {
  // halos: lamps (fixed layout, recycled via the same scroll), oncoming lights, tower beacons
  const maxN = 64;
  const pos = new Float32Array(maxN * 3), data = new Float32Array(maxN * 4), col = new Float32Array(maxN * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aData', new THREE.BufferAttribute(data, 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  halos = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: HALO_VS, fragmentShader: HALO_FS, uniforms: { uScale: { value: 1 }, uFogD: U.uFogD }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true }));
  halos.frustumCulled = false; scene.add(halos);
  // rain
  const N = 1800, rp = new Float32Array(N * 6), tp = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { const x = Math.random(), y = Math.random(), z = Math.random(); rp.set([x, y, z, x, y, z], i * 6); tp[i * 2] = 0; tp[i * 2 + 1] = 1; }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('tip', new THREE.BufferAttribute(tp, 1));
  rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({ vertexShader: RAIN_VS, fragmentShader: RAIN_FS, uniforms: { uTime: U.uTime, uScroll: U.uScroll, uLampPh: U.uLampPh, uCam: U.uCam, uCarX: U.uCarX }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  rain.frustumCulled = false; scene.add(rain);
  // spray
  const SN = 260, sd = new Float32Array(SN * 4), sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) sd.set([i % 2, Math.random(), Math.random(), Math.random()], i * 4);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  spray = new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: SPRAY_VS, fragmentShader: SPRAY_FS, uniforms: { uTime: U.uTime, uSpeed: U.uSpeed, uScale: { value: 1 }, uBrake: U.uBrake, uCarX: U.uCarX }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  spray.frustumCulled = false; scene.add(spray);
}

function updateHalos() {
  const g = halos.geometry, P = g.attributes.position.array, D = g.attributes.aData.array, C = g.attributes.aCol.array;
  let n = 0;
  const add = (x, y, z, size, a, r, gg, b, fade = 0) => { P[n * 3] = x; P[n * 3 + 1] = y; P[n * 3 + 2] = z; D[n * 4] = size; D[n * 4 + 1] = a; D[n * 4 + 2] = fade; C[n * 3] = r; C[n * 3 + 1] = gg; C[n * 3 + 2] = b; n++; };
  const ph = scroll % LAMP_S;
  for (const [r, lx, z0] of [[0, -7.0, 0], [1, 7.0, LAMP_S / 2]]) for (let k = -2; k <= 8; k++) add(lx, LAMP_H - 0.45, z0 + k * LAMP_S - ph, 5.0, 1.0, 1.0, 0.78, 0.5);
  // car lights
  const cx = car.position.x, rear = -car.userData.L / 2, front = car.userData.L / 2;
  for (const sx of [-1, 1]) { add(cx + sx * 0.66, 0.74, rear - 0.05, 2.4, 0.9 + brake * 1.4, 1, 0.05, 0.03); add(cx + sx * 0.64, 0.66, front - 0.1, 2.6, 0.7, 1, 0.94, 0.82); }
  for (const o of onc) if (o.on) for (const sx of [-1, 1]) add(o.x + sx * 0.65, 0.72, o.z, 6.5, 1.0, 0.86, 0.93, 1.0);
  for (const bx of [-130, 40, 210]) add(bx, 150, 1800, 6, Math.sin(t * 2.2 + bx) > 0.2 ? 1 : 0.15, 1, 0.05, 0.03);
  g.setDrawRange(0, n); g.attributes.position.needsUpdate = g.attributes.aData.needsUpdate = g.attributes.aCol.needsUpdate = true;
}

// ---------------------------------------------------------------- init / resize
function makeRT(w, h, samples = 0, depth = true) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth, samples, generateMipmaps: false });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return rt;
}

function allocTargets() {
  for (const r of [rtScene, rtRefl, rtB1, rtB1b, rtB2, rtB2b]) r?.dispose();
  const w = Math.max(2, Math.round(W * DPR)), h = Math.max(2, Math.round(H * DPR));
  rtScene = makeRT(w, h, 2); rtRefl = makeRT(Math.max(2, w >> 1), Math.max(2, h >> 1), 0);
  rtB1 = makeRT(w >> 2, h >> 2, 0, false); rtB1b = makeRT(w >> 2, h >> 2, 0, false); rtB2 = makeRT(w >> 3, h >> 3, 0, false); rtB2b = makeRT(w >> 3, h >> 3, 0, false);
  matComp.uniforms.uRes.value.set(w, h);
  U.tRefl.value = rtRefl.texture;
  const scl = h / 720;
  halos.material.uniforms.uScale.value = 190 * scl; spray.material.uniforms.uScale.value = 150 * scl;
}

function init(m) {
  dbg = !!m.debug;
  W = m.w; H = m.h; DPR = Math.min(m.dpr || 1, 1.5);
  renderer = new THREE.WebGLRenderer({ canvas: m.canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  renderer.setPixelRatio(1); renderer.setSize(Math.round(W * DPR), Math.round(H * DPR), false);
  renderer.toneMapping = THREE.NoToneMapping;
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0d0e12, 0.0065);
  scene.fog.color.copy(U.uFog.value);
  camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 2600);
  reflCam = new THREE.PerspectiveCamera(34, W / H, 0.1, 2600);
  dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: { uTime: U.uTime }, side: THREE.BackSide, depthWrite: false, fog: false }));
  dome.scale.setScalar(2000); dome.frustumCulled = false; dome.renderOrder = -10; scene.add(dome);
  scene.add(new THREE.HemisphereLight(0x4d5f86, 0x12100f, 0.55));
  buildEnvironment();
  buildRoadside();
  buildCarMesh(m.car);
  buildSprites();
  quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
  quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quadScene = new THREE.Scene(); quadScene.add(quad);
  matBright = sm(FS_VS, BRIGHT_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1.0 } });
  matBlur = sm(FS_VS, BLUR_FS, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  matComp = sm(FS_VS, COMP_FS, { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, uExp: { value: 1 }, uBloom: { value: 0.5 }, uTime: { value: 0 }, uFade: { value: 0 }, uRes: { value: new THREE.Vector2() } });
  allocTargets();
  last = performance.now(); requestAnimationFrame(frame);
}

function setReflection() {
  // mirror the camera about y = 0 (standard planar reflector setup)
  const cp = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
  const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(cp);
  const n = new THREE.Vector3(0, 1, 0), o = new THREE.Vector3();
  const view = new THREE.Vector3().subVectors(o, cp).reflect(n).negate().add(o);
  const tgt = new THREE.Vector3().subVectors(o, look).reflect(n).negate().add(o);
  reflCam.position.copy(view);
  reflCam.up.set(0, 1, 0).applyMatrix4(rot).reflect(n);
  reflCam.lookAt(tgt);
  reflCam.far = camera.far; reflCam.fov = camera.fov; reflCam.aspect = camera.aspect;
  reflCam.updateProjectionMatrix(); reflCam.updateMatrixWorld();
  texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  texMat.multiply(reflCam.projectionMatrix); texMat.multiply(reflCam.matrixWorldInverse);
}

function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }

let frameN = 0, fpsT = 0, fpsN = 0, dbg = false;
function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt; frameN++;
  if (dbg) { fpsT += dt; fpsN++; if (fpsT > 3) { console.warn('loader fps ' + (fpsN / fpsT).toFixed(1)); fpsT = 0; fpsN = 0; } }
  const tSpeed = done ? 44 : 15 + prog * 17;
  speed += (tSpeed - speed) * Math.min(1, dt * 0.8);
  scroll += speed * dt;
  smx += (mx - smx) * Math.min(1, dt * 2.2); smy += (my - smy) * Math.min(1, dt * 2.2);
  U.uTime.value = t; U.uScroll.value = scroll; U.uSpeed.value = speed; U.uLampPh.value = scroll % LAMP_S;
  // occasional brake lights, oncoming cars
  nextBrake -= dt; if (nextBrake < 0) { brake = 1; nextBrake = 7 + Math.random() * 8; } brake = Math.max(0, brake - dt * 0.9); U.uBrake.value = brake;
  carMats.lights.userData.uLight.value.set(1, brake > 0.05 ? brake : 0, 0, 0);
  nextOnc -= dt;
  if (nextOnc < 0) { const o = onc.find((q) => !q.on); if (o) { o.on = true; o.z = 520; o.v = 24 + Math.random() * 10; o.x = 1.8 + (Math.random() - 0.5) * 0.5; } nextOnc = 4.5 + Math.random() * 6; }
  let glare = 0;
  onc.forEach((o, i) => {
    if (o.on) { o.z -= (o.v + speed) * dt; if (o.z < -40) o.on = false; const d = Math.max(0, o.z); glare = Math.max(glare, Math.exp(-d / 50) * (o.z > -10 ? 1 : 0)); }
    U.uOnc.value[i].set(o.x, o.z, o.on ? 1 : 0, 0);
  });
  exposure += ((1.0 - glare * 0.32) - exposure) * Math.min(1, dt * (glare > 0.2 ? 5 : 0.9));
  // car
  const sway = Math.sin(t * 0.55) * 0.1, bob = Math.sin(t * 7.3) * 0.004 * (speed / 30) + Math.sin(t * 2.1) * 0.006;
  car.position.set(CAR_X + sway, bob, 0); car.rotation.y = Math.cos(t * 0.55) * 0.012; car.rotation.z = Math.sin(t * 1.1) * 0.003; car.rotation.x = -brake * 0.012 + Math.sin(t * 1.7) * 0.002;
  U.uCarX.value = car.position.x;
  for (const w of wheels) w.spin.rotation.x -= (speed / w.r) * dt * (w.left ? -1 : 1) * -1;
  // moving groups
  const lp = scroll % LAMP_S, gp = scroll % 4;
  for (const row of lampRows) row.position.z = -lp;
  for (const row of railRows) row.userData.posts.position.z = -gp;
  gantries.forEach((g, i) => { const per = 420; let z = 160 + i * per - (scroll % (per * 2)); if (z < -60) z += per * 2; g.position.z = z; });
  // camera
  const orbit = (smx - 0.5) * 0.9, lift = (0.5 - smy) * 0.7;
  const cx = -0.2 + Math.sin(t * 0.17) * 0.5 + orbit * 3.2, cy = 1.1 + lift + Math.sin(t * 0.23) * 0.1, cz = -8.6 - Math.cos(t * 0.13) * 0.9 + orbit * 0.4 - (done ? Math.min(4, (t - doneT) * 1.2) : 0);
  camera.position.set(cx + Math.sin(t * 9.1) * 0.0015, cy + Math.sin(t * 7.7) * 0.0015, cz);
  camera.lookAt(CAR_X * 0.1 + orbit * 0.4 + 0.4, 0.75, 3.5);
  camera.fov = 34 + Math.min(4, (speed - 15) * 0.12); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  U.uCam.value.copy(camera.position);
  dome.position.copy(camera.position);
  updateHalos();
  setReflection();
  // reflection pass
  road.visible = false; ground.visible = false; rain.visible = false;
  renderer.setRenderTarget(rtRefl); renderer.setClearColor(0x000000, 1); renderer.clear();
  renderer.render(scene, reflCam);
  road.visible = true; ground.visible = true; rain.visible = true;
  renderer.setRenderTarget(rtScene); renderer.clear();
  renderer.render(scene, camera);
  // bloom
  const w1 = rtB1.width, h1 = rtB1.height, w2 = rtB2.width, h2 = rtB2.height;
  matBright.uniforms.tSrc.value = rtScene.texture; matBright.uniforms.uTexel.value.set(1 / rtScene.width, 1 / rtScene.height); matBright.uniforms.uThresh.value = 1.6;
  pass(matBright, rtB1);
  for (let i = 0; i < 2; i++) {
    matBlur.uniforms.tSrc.value = rtB1.texture; matBlur.uniforms.uDir.value.set(1.6 / w1, 0); pass(matBlur, rtB1b);
    matBlur.uniforms.tSrc.value = rtB1b.texture; matBlur.uniforms.uDir.value.set(0, 1.6 / h1); pass(matBlur, rtB1);
  }
  matBright.uniforms.tSrc.value = rtB1.texture; matBright.uniforms.uTexel.value.set(1 / w1, 1 / h1); matBright.uniforms.uThresh.value = 0.0; pass(matBright, rtB2);
  for (let i = 0; i < 3; i++) {
    matBlur.uniforms.tSrc.value = rtB2.texture; matBlur.uniforms.uDir.value.set(2.2 / w2, 0); pass(matBlur, rtB2b);
    matBlur.uniforms.tSrc.value = rtB2b.texture; matBlur.uniforms.uDir.value.set(0, 2.2 / h2); pass(matBlur, rtB2);
  }
  const cu = matComp.uniforms;
  cu.tScene.value = rtScene.texture; cu.tB1.value = rtB1.texture; cu.tB2.value = rtB2.texture; cu.uExp.value = 1.35 * exposure; cu.uBloom.value = 0.42; cu.uTime.value = t;
  cu.uFade.value = Math.min(1, t / 1.4);
  pass(matComp, null);
}

let doneT = 0;
for (const k of ['error', 'warn']) { const o = console[k]; console[k] = (...a) => { o.apply(console, a); try { self.postMessage({ type: 'log', level: k, text: a.map(String).join(' ').slice(0, 600) }); } catch { /* ignore */ } }; }
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') { try { init(m); } catch (err) { console.error('loader init failed', err.stack || err.message); } }
  else if (m.type === 'resize') { W = m.w; H = m.h; DPR = Math.min(m.dpr || 1, 1.5); if (renderer) { renderer.setSize(Math.round(W * DPR), Math.round(H * DPR), false); camera.aspect = W / H; camera.updateProjectionMatrix(); allocTargets(); } }
  else if (m.type === 'mouse') { mx = m.x; my = m.y; }
  else if (m.type === 'progress') prog = m.p;
  else if (m.type === 'done') { done = true; doneT = t; }
  else if (m.type === 'stop') { running = false; }
};
