import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { smoothstep, clamp, lerp } from '../core/math.js';
import { convexHull } from '../world/collision.js';
import { carLayout, profile, buildShell, wheelPositions } from './carShell.js';

export { carLayout };

// Procedural car builder. Car-local frame: +z forward, +y up, +x = driver's LEFT. Ground at y=0.
const C = (h) => new THREE.Color(h);

// Top-down silhouette of the body as a convex ring of [lateral, forward] points around the body centre (used for collisions).
const outlineCache = new Map();
export function carOutline(def) {
  if (outlineCache.has(def.id)) return outlineCache.get(def.id);
  const b = def.body, L = b.L, W2 = b.W / 2;
  let pts = [];
  if (b.style === 'bus' || b.style === 'truck') {
    const w = W2, c = 0.35;
    pts = [[w, -L / 2 + c], [w, L / 2 - c], [w - c, L / 2], [-w + c, L / 2], [-w, L / 2 - c], [-w, -L / 2 + c], [-w + c, -L / 2], [w - c, -L / 2]];
  } else if (b.style === 'bike') {
    const w = Math.max(0.3, W2 * 0.8);
    pts = [[w, -L / 2 + 0.2], [w, L / 2 - 0.2], [w * 0.5, L / 2], [-w * 0.5, L / 2], [-w, L / 2 - 0.2], [-w, -L / 2 + 0.2], [-w * 0.5, -L / 2], [w * 0.5, -L / 2]];
  } else {
    const P = profile(b);
    for (const t of [0, 0.015, 0.05, 0.12, 0.25, 0.45, 0.65, 0.82, 0.92, 0.975, 1]) { const w = P.halfW(t) * 0.99, z = -L / 2 + t * L; pts.push([w, z], [-w, z]); }
  }
  const ring = convexHull(pts);
  outlineCache.set(def.id, ring);
  return ring;
}

// ------------------------------------------------------------------
export function buildCar(def, opts = {}) {
  const b = def.body;
  if (b.style === 'bus') return buildBus(def, opts);
  if (b.style === 'truck') return buildTruck(def, opts);
  if (b.style === 'bike') return buildBike(def, opts);
  return buildShell(def, opts);
}

// ---------------- wheels (canonical radius 1, width 1, axle along x, outer face +x) ----------------
const wheelCache = new Map();
export function buildWheel(style = 'fivespoke', profile = 0.64, detail = 0) {
  const key = style + profile + '|' + detail;
  if (wheelCache.has(key)) return wheelCache.get(key);
  const tire = new GeoBuilder(), rim = new GeoBuilder();
  const r0 = profile, w = 0.5;
  const prof = detail ? [[r0, -w], [0.96, -w * 0.7], [1, -w * 0.3], [1, w * 0.3], [0.96, w * 0.7], [r0, w]] : [[r0, -w], [0.93, -w], [0.99, -w * 0.82], [1, -w * 0.45], [1, w * 0.45], [0.99, w * 0.82], [0.93, w], [r0, w]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), detail ? 12 : 20);
  lathe.rotateZ(-Math.PI / 2);
  tire.add(lathe, null, C('#1b1c1e'));
  const rc = C('#ffffff');
  const face = w * 0.72;
  if (!detail) {
    rim.addGeo(new THREE.CylinderGeometry(r0 * 0.98, r0 * 0.98, w * 1.7, 16, 1, true), 0, 0, 0, 0, 1, 1, 1, C('#7a7d80'), 0, Math.PI / 2);
    rim.addGeo(new THREE.TorusGeometry(r0 * 0.96, 0.035, 4, 20), face, 0, 0, Math.PI / 2, 1, 1, 1, rc);
    rim.addGeo(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 14), face - 0.05, 0, 0, 0, 1, 1, 1, rc, 0, Math.PI / 2);
  }
  rim.addGeo(new THREE.CircleGeometry(r0 * 0.94, detail ? 10 : 16), face - 0.25, 0, 0, Math.PI / 2, 1, 1, 1, C('#2a2b2d'));
  const spoke = (n, wid, depth = 0.08, twist = 0) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const g = new THREE.BoxGeometry(depth, r0 * 0.82, wid);
      g.translate(0, r0 * 0.5, 0);
      g.rotateY(twist);
      g.rotateX(a);
      rim.addGeo(g, face - depth / 2, 0, 0, 0, 1, 1, 1, rc);
    }
  };
  const cap = (n) => (detail ? Math.min(n, 6) : n);
  switch (style) {
    case 'fivespoke': spoke(5, 0.2); break;
    case 'multispoke': spoke(cap(10), 0.08); break;
    case 'mesh': spoke(cap(14), 0.05, 0.06, 0.4); if (!detail) spoke(14, 0.05, 0.06, -0.4); break;
    case 'steel': rim.addGeo(new THREE.CylinderGeometry(r0 * 0.9, r0 * 0.9, 0.04, detail ? 10 : 24), face - 0.03, 0, 0, 0, 1, 1, 1, C('#8a8d90'), 0, Math.PI / 2); break;
    case 'deepdish': spoke(6, 0.14, 0.05); if (!detail) rim.addGeo(new THREE.CylinderGeometry(r0 * 0.97, r0 * 0.97, 0.3, 24, 1, true), face - 0.15, 0, 0, 0, 1, 1, 1, C('#d8dadd'), 0, Math.PI / 2); break;
    case 'offroad': spoke(8, 0.12, 0.1); break;
    case 'split': spoke(5, 0.07, 0.08, 0.2); if (!detail) spoke(5, 0.07, 0.08, -0.2); break;
    case 'turbine': spoke(cap(18), 0.06, 0.06, 0.7); break;
    default: spoke(5, 0.2);
  }
  const res = { tire: tire.build(), rim: rim.build() };
  wheelCache.set(key, res);
  return res;
}
export const RIM_STYLES = ['fivespoke', 'multispoke', 'mesh', 'split', 'turbine', 'deepdish', 'steel', 'offroad'];

// ---------------- special bodies ----------------
function boxyParts() { return { paint: new GeoBuilder(), glass: new GeoBuilder(), trim: new GeoBuilder(), chrome: new GeoBuilder(), lights: new GeoBuilder(), plates: new GeoBuilder() }; }
function lightBox(lb, kind, x, y, z, sx, sy, sz, col) {
  const s = lb.count; lb.box(x, y, z, sx, sy, sz, col, 0, 0, false);
  for (let i = s; i < lb.count; i++) lb.u[i * 2] = kind + 0.25;
}
function finishBoxy(parts, b, extraSeat) {
  const out = {};
  for (const k of ['paint', 'glass', 'trim', 'chrome', 'lights', 'plates']) out[k] = parts[k] && parts[k].count ? parts[k].build() : null;
  out.wheels = wheelPositions(b);
  out.layout = carLayout(b);
  out.dims = { L: b.L, W: b.W, H: b.H };
  out.seat = extraSeat;
  return out;
}

function buildBus(def) {
  const b = def.body, p = boxyParts(), L = b.L, W = b.W, H = b.H;
  const y0 = b.clr + 0.25;
  p.paint.box(0, y0 + (H - y0) / 2, 0, W, H - y0, L, C('#ffffff'), 0, 0, false, false);
  const lv = C('#1d4f91');
  for (const s of [1, -1]) {
    p.trim.box(s * (W / 2 + 0.005), y0 + 0.35, 0, 0.01, 0.35, L - 0.4, lv, 0, 0, false);
    p.glass.box(s * (W / 2 + 0.01), y0 + 1.55, -0.3, 0.02, 1.1, L - 3.4, null, 0, 0, false);
  }
  p.glass.box(0, y0 + 1.4, L / 2 + 0.01, W - 0.2, 1.7, 0.02, null, 0, 0, false);
  p.glass.box(0, y0 + 1.7, -L / 2 - 0.01, W - 0.4, 0.8, 0.02, null, 0, 0, false);
  p.trim.box(0, y0 + 2.45, L / 2 + 0.02, W - 0.4, 0.3, 0.03, C('#101010'), 0, 0, false);
  p.trim.box(0, y0 + 0.2, L / 2 + 0.04, W, 0.35, 0.08, C('#2a2b2d'), 0, 0, false);
  for (const s of [1, -1]) {
    lightBox(p.lights, 0, s * W * 0.36, y0 + 0.45, L / 2 + 0.02, 0.3, 0.15, 0.05, C('#dde4ea'));
    lightBox(p.lights, 1, s * W * 0.42, y0 + 0.7, -L / 2 - 0.02, 0.15, 0.4, 0.05, C('#5a0f0f'));
    lightBox(p.lights, s > 0 ? 2 : 3, s * W * 0.44, y0 + 0.2, L / 2 + 0.02, 0.12, 0.08, 0.05, C('#c78a2a'));
  }
  p.trim.box(0, H + 0.1, -L / 2 + 1.5, W * 0.7, 0.25, 1.8, C('#c9ccd0'), 0, 0, false);
  const out = finishBoxy(p, b, { x: 0.8, y: 1.6, z: L / 2 - 1.2 });
  return out;
}

function buildTruck(def) {
  const b = def.body, p = boxyParts(), L = b.L, W = b.W;
  const cabL = 2.1, y0 = b.clr + 0.3;
  const zc = L / 2 - cabL / 2;
  p.paint.box(0, y0 + 1.15, zc, W - 0.1, 2.1, cabL, C('#ffffff'), 0, 0, false, false);
  p.glass.box(0, y0 + 1.75, L / 2 + 0.005, W - 0.4, 0.8, 0.02, null, 0, 0, false);
  for (const s of [1, -1]) p.glass.box(s * (W / 2 - 0.045), y0 + 1.75, zc + 0.3, 0.02, 0.7, 1.0, null, 0, 0, false);
  p.trim.box(0, y0 + 0.4, L / 2 + 0.04, W - 0.1, 0.4, 0.06, C('#2a2b2d'), 0, 0, false);
  const boxL = L - cabL - 0.15, zb = -L / 2 + boxL / 2;
  p.paint.box(0, y0 + 0.2 + 1.55, zb, W, 3.1, boxL, C('#f2f2f0'), 0, 0, false, false);
  p.trim.box(0, y0 + 0.15, zb, W - 0.4, 0.3, boxL, C('#2a2b2d'), 0, 0, false);
  p.trim.box(0, y0 + 1.75, -L / 2 - 0.01, W - 0.1, 3.0, 0.02, C('#d8d8d6'), 0, 0, false);
  for (const s of [1, -1]) {
    lightBox(p.lights, 0, s * W * 0.36, y0 + 0.55, L / 2 + 0.02, 0.3, 0.16, 0.05, C('#dde4ea'));
    lightBox(p.lights, 1, s * W * 0.42, y0 + 0.4, -L / 2 - 0.02, 0.2, 0.25, 0.05, C('#5a0f0f'));
    lightBox(p.lights, s > 0 ? 2 : 3, s * W * 0.45, y0 + 0.3, L / 2 + 0.02, 0.12, 0.08, 0.05, C('#c78a2a'));
  }
  return finishBoxy(p, b, { x: 0.6, y: 2.0, z: L / 2 - 1.0 });
}

function buildBike(def) {
  const b = def.body, p = boxyParts();
  const { zF, zR } = carLayout(b);
  const pc = C('#ffffff'), dark = C('#1a1a1c');
  // frame spine
  const spine = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8); spine.rotateX(Math.PI / 2 - 0.35);
  p.trim.addGeo(spine, 0, 0.72, 0.05, 0, 1, 1, 1, dark);
  // tank + fairing
  p.paint.addGeo(new THREE.SphereGeometry(0.22, 14, 10), 0, 0.92, 0.18, 0, 0.9, 0.75, 1.5, pc);
  p.paint.addGeo(new THREE.ConeGeometry(0.26, 0.6, 12), 0, 0.88, zF - 0.28, 0, 1, 1, 1, pc, Math.PI / 2 + 0.3);
  p.glass.addGeo(new THREE.PlaneGeometry(0.34, 0.26), 0, 1.12, zF - 0.44, 0, 1, 1, 1, null, -0.9);
  // seat & tail
  p.trim.box(0, 0.9, -0.28, 0.26, 0.08, 0.55, dark, 0, 0, false);
  p.paint.addGeo(new THREE.ConeGeometry(0.16, 0.55, 10), 0, 0.92, -0.7, 0, 1, 1, 1, pc, -Math.PI / 2 - 0.2);
  // engine block
  p.chrome.box(0, 0.5, 0.05, 0.36, 0.34, 0.42, C('#6d7073'), 0, 0, false);
  // forks & swingarm
  for (const s of [1, -1]) {
    const f = new THREE.CylinderGeometry(0.025, 0.025, 0.85, 8); f.rotateX(-0.42);
    p.chrome.addGeo(f, s * 0.09, 0.62, zF - 0.15, 0, 1, 1, 1, C('#b8bcc0'));
    const sw = new THREE.CylinderGeometry(0.03, 0.03, 0.62, 8); sw.rotateX(Math.PI / 2 + 0.12);
    p.trim.addGeo(sw, s * 0.08, 0.38, zR + 0.3, 0, 1, 1, 1, dark);
  }
  p.chrome.addGeo(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), -0.12, 0.42, -0.45, 0, 1, 1, 1, C('#b8bcc0'), Math.PI / 2 - 0.2);
  p.trim.box(0, 1.02, zF - 0.4, 0.62, 0.03, 0.03, dark, 0, 0, false);
  lightBox(p.lights, 0, 0, 0.98, zF - 0.34, 0.16, 0.08, 0.05, C('#dde4ea'));
  lightBox(p.lights, 1, 0, 0.9, -0.98, 0.12, 0.05, 0.04, C('#5a0f0f'));
  lightBox(p.lights, 2, 0.12, 0.95, zF - 0.4, 0.04, 0.03, 0.04, C('#c78a2a'));
  lightBox(p.lights, 3, -0.12, 0.95, zF - 0.4, 0.04, 0.03, 0.04, C('#c78a2a'));
  const out = finishBoxy(p, b, { x: 0, y: 0.92, z: -0.2 });
  out.wheels = [{ x: 0, z: zF, front: true, left: true }, { x: 0, z: zR, front: false, left: true }];
  out.bike = true;
  return out;
}

// ---------------- materials ----------------
const LIGHT_VS_HEAD = `
attribute vec4 aLight;
uniform vec4 uLight;
varying float vLk;
varying vec4 vLight;
`;
export function makeLightsMaterial(instanced) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffffff });
  m.userData.uLight = { value: new THREE.Vector4(0, 0, 0, 0) };
  m.userData.uBar = { value: new THREE.Vector2(0, 0) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLight = m.userData.uLight;
    sh.uniforms.uBarRB = m.userData.uBar;
    sh.vertexShader = LIGHT_VS_HEAD + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vLk = uv.x;
      ${instanced ? 'vLight = aLight;' : 'vLight = uLight;'}`);
    sh.fragmentShader = 'uniform vec2 uBarRB; varying float vLk; varying vec4 vLight;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rev = step(1.5, vLight.y);
      float brk = vLight.y - rev * 2.0;
      vec3 em = vec3(0.0);
      if (vLk < 0.5) em = vec3(1.0, 0.94, 0.82) * vLight.x * 5.0;
      else if (vLk < 1.5) em = vec3(1.0, 0.04, 0.02) * (0.5 * min(vLight.x, 1.0) + brk * 2.2);
      else if (vLk < 2.5) em = vec3(1.0, 0.42, 0.0) * vLight.z * 5.0;
      else if (vLk < 3.5) em = vec3(1.0, 0.42, 0.0) * vLight.w * 5.0;
      else if (vLk < 4.5) em = vec3(1.0) * rev * 3.0;
      else if (vLk < 5.5) em = vec3(1.0, 0.04, 0.02) * brk * 2.0;
      else if (vLk < 6.5) em = vec3(1.0, 0.05, 0.03) * uBarRB.x * 8.0;
      else em = vec3(0.1, 0.25, 1.0) * uBarRB.y * 8.0;
      totalEmissiveRadiance = em;`);
  };
  return m;
}

export function makePaintMaterial({ color = '#ffffff', finish = 'metallic', instanced = false, map = null } = {}) {
  const F = {
    gloss: { metalness: 0.05, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04 },
    metallic: { metalness: 0.62, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05 },
    matte: { metalness: 0.15, roughness: 0.7, clearcoat: 0, clearcoatRoughness: 0.5 },
    pearl: { metalness: 0.45, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03, sheen: 1 },
    chrome: { metalness: 1, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02 },
  }[finish] || {};
  const m = instanced
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.45, roughness: 0.34, map, envMapIntensity: 1.1 })
    : new THREE.MeshPhysicalMaterial({ color, ...F, map, envMapIntensity: 1.2, sheenColor: new THREE.Color(color).offsetHSL(0.1, 0, 0.2) });
  m.userData.dirt = { value: 0 };
  m.userData.dirtTex = { value: null };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = m.userData.dirt;
    sh.vertexShader = 'varying float vLocalY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLocalY = position.y;');
    sh.fragmentShader = 'uniform float uDirt; varying float vLocalY;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float dm = uDirt * clamp(1.25 - vLocalY * 0.95, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.23, 0.17), dm * 0.85);`);
  };
  return m;
}

export function makeGlassMaterial(tint = 0.35) {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.05, 0.06, 0.07), metalness: 0.35, roughness: 0.03, transparent: true, opacity: 0.72 + tint * 0.25, envMapIntensity: 2.0, depthWrite: false, side: THREE.DoubleSide });
}

// ---------------- low-poly LOD (single merged geometry, vertex colours; paint parts white for tinting) ----------------
const lowCache = new Map();
export function buildCarLow(def) {
  if (lowCache.has(def.id)) return lowCache.get(def.id);
  const full = buildCar(def, { lod: 2 });
  const out = new GeoBuilder();
  const push = (g, col) => { if (g) out.add(g, null, col); };
  push(full.paint, new THREE.Color(1, 1, 1));
  push(full.glass, new THREE.Color(0.05, 0.06, 0.07));
  push(full.trim, null);
  push(full.lights, null);
  const b = def.body;
  for (const w of full.wheels) {
    const g = new THREE.CylinderGeometry(b.wr, b.wr, b.ww, 7);
    g.rotateZ(Math.PI / 2);
    out.addGeo(g, w.x, b.wr, w.z, 0, 1, 1, 1, new THREE.Color(0.07, 0.07, 0.08));
  }
  const geo = out.build();
  lowCache.set(def.id, geo);
  return geo;
}

const proxyCache = new Map();
export function buildCarProxy(def) {
  if (proxyCache.has(def.id)) return proxyCache.get(def.id);
  const b = def.body, out = new GeoBuilder();
  const W = new THREE.Color(1, 1, 1), G = new THREE.Color(0.05, 0.06, 0.07), K = new THREE.Color(0.07, 0.07, 0.08);
  if (b.style === 'bike') {
    out.box(0, 0.75, 0, 0.32, 0.55, b.L * 0.7, W, 0, 0, false);
    out.box(0, 0.32, b.wb / 2 - b.ohF, 0.14, 0.62, 0.62, K, 0, 0, false);
    out.box(0, 0.32, -b.wb / 2 + 0.2, 0.16, 0.62, 0.62, K, 0, 0, false);
  } else {
    const cab = b.style === 'bus' || b.style === 'truck';
    const zc = -(b.wb / 2 - b.ohF) * 0 + (b.L / 2 - b.ohF - b.wb / 2);
    out.box(0, (b.clr + (b.beltY || b.H * 0.6)) / 2 + 0.05, 0, b.W * 0.98, (b.beltY || b.H * 0.6) - b.clr, b.L * 0.98, W, 0, 0, false);
    if (!cab) {
      const tA = b.tA || 0.66, tR = b.tR || 0.1;
      const z0 = -b.L / 2 + (tR + 0.06) * b.L, z1 = -b.L / 2 + (tA - 0.05) * b.L;
      out.box(0, ((b.beltY || 0.9) + b.roofY) / 2, (z0 + z1) / 2, b.W * 0.86, b.roofY - (b.beltY || 0.9), z1 - z0, G, 0, 0, false);
    }
    for (const sx of [1, -1]) for (const z of [b.L / 2 - b.ohF, b.L / 2 - b.ohF - b.wb]) out.box(sx * (b.trk / 2), b.wr, z, b.ww, b.wr * 2, b.wr * 1.8, K, 0, 0, false);
    void zc;
  }
  const geo = out.build();
  proxyCache.set(def.id, geo);
  return geo;
}
