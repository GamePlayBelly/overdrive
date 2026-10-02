import * as THREE from 'three';
import { WATER_LEVEL } from '../data/world.js';
import { SEABED } from '../data/sea.js';
import { hash2, RNG } from '../core/rng.js';
import { WATER_FX, WATER_FX_GLSL } from './waterFx.js';

const noise = (x, z, s) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const SWAY = { value: 0 };
const _o = new THREE.Object3D(), _c = new THREE.Color();

function bakeColors(geo, fn) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), col); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function merge(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return m;
}

// Lambert material with sway driven by height and the bed colour treatment of the terrain (absorption, caustics) shared through WATER_FX
export function decorMaterial(sway, extra = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSwayT = SWAY; Object.assign(sh.uniforms, WATER_FX);
    sh.vertexShader = 'uniform float uSwayT; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec3 ip = instanceMatrix[3].xyz;
      #else
      vec3 ip = vec3(0.0);
      #endif
      transformed.x += sin(uSwayT * 1.3 + ip.x * 0.7 + ip.z * 0.5 + position.y * 1.4) * ${sway.toFixed(3)} * position.y;
      transformed.z += cos(uSwayT * 1.1 + ip.z * 0.6 + position.y * 1.1) * ${(sway * 0.7).toFixed(3)} * position.y;
      #ifdef USE_INSTANCING
      vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
      vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`);
    sh.fragmentShader = WATER_FX_GLSL + 'varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n      diffuseColor.rgb = wfxApply(diffuseColor.rgb, vWP, length(vViewPosition));');
  };
  return m;
}

function bladeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  const r = new RNG(5);
  for (let i = 0; i < 14; i++) {
    const bx = 6 + r.f() * 52, h = 70 + r.f() * 56, g = 90 + r.f() * 90;
    x.strokeStyle = `rgb(${40 + r.f() * 40},${g},${50 + r.f() * 30})`; x.lineWidth = 2 + r.f() * 2.4; x.lineCap = 'round';
    x.beginPath(); x.moveTo(bx, 128); x.quadraticCurveTo(bx + (r.f() - 0.5) * 24, 128 - h * 0.6, bx + (r.f() - 0.5) * 30, 128 - h); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Seabed {
  constructor(game) {
    this.g = game; this.last = { x: 1e9, z: 1e9, t: 0 }; this.on = true; this.quality = 1;
    const sc = game.scene, rng = new RNG('seabed');
    // geometry
    const tuftG = merge([0, Math.PI / 2].map((a) => bakeColors(new THREE.PlaneGeometry(0.7, 1, 1, 3).translate(0, 0.5, 0).rotateY(a).toNonIndexed(), (x, y, z, c) => c.setRGB(0.5 + 0.5 * y, 0.8 + 0.2 * y, 0.5))));
    const kelpG = merge([0, 1.9].map((a) => bakeColors(new THREE.PlaneGeometry(0.22, 1, 1, 10).translate(0, 0.5, 0).rotateY(a).toNonIndexed(), (x, y, z, c) => c.setRGB(0.3 + 0.25 * y, 0.3 + 0.3 * y, 0.08))));
    const branch = () => { const parts = []; const n = 6; for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + rng.f(), tilt = 0.25 + rng.f() * 0.5, h = 0.5 + rng.f() * 0.6; const g = new THREE.CylinderGeometry(0.03, 0.09, h, 5, 1).translate(0, h / 2, 0).rotateZ(tilt).rotateY(a); parts.push(bakeColors(g.toNonIndexed(), (x, y, z, c) => c.setScalar(0.65 + 0.5 * Math.min(1, y)))); } const base = new THREE.CylinderGeometry(0.16, 0.2, 0.12, 6).translate(0, 0.06, 0); parts.push(bakeColors(base.toNonIndexed(), (x, y, z, c) => c.setScalar(0.5))); return merge(parts); };
    const brainG = bakeColors(new THREE.IcosahedronGeometry(0.5, 2).scale(1, 0.55, 1).translate(0, 0.1, 0), (x, y, z, c) => c.setScalar(0.7 + 0.3 * Math.sin(x * 22) * Math.sin(z * 22) + 0.1 * y));
    const rockG = (() => { const g = new THREE.IcosahedronGeometry(0.5, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const k = 0.78 + 0.45 * noise(v.x * 3.1 + 9, v.z * 3.1 + v.y * 2.3, 3); p.setXYZ(i, v.x * k, v.y * k * 0.8, v.z * k); } g.computeVertexNormals(); return bakeColors(g, (x, y, z, c) => c.setScalar(0.55 + 0.45 * (y + 0.4))); })();
    const crateG = bakeColors(new THREE.BoxGeometry(0.7, 0.5, 0.5).translate(0, 0.25, 0).toNonIndexed(), (x, y, z, c) => c.setRGB(0.5, 0.38, 0.24));
    const barrelG = bakeColors(new THREE.CylinderGeometry(0.28, 0.28, 0.85, 10).translate(0, 0.42, 0).rotateZ(1.2).toNonIndexed(), (x, y, z, c) => c.setRGB(0.36, 0.2, 0.15));
    const mk = (geo, mat, cap) => { const m = new THREE.InstancedMesh(geo, mat, cap); m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); sc.add(m); return m; };
    const grassMat = decorMaterial(0.2, { map: bladeTexture(), alphaTest: 0.4, side: THREE.DoubleSide });
    this.m = {
      tuft: mk(tuftG, grassMat, 2600), kelp: mk(kelpG, decorMaterial(0.12, { side: THREE.DoubleSide }), 320),
      coralB: mk(branch(), decorMaterial(0.02), 260), coralD: mk(brainG, decorMaterial(0), 180), rock: mk(rockG, decorMaterial(0), 420), crate: mk(crateG, decorMaterial(0), 40), barrel: mk(barrelG, decorMaterial(0), 40),
    };
    this.wrecks = [];
    this.buildWrecks(rng);
  }

  buildWrecks(rng) {
    const g = this.g, nav = g.seaNav, sea = g.world.sea, T = g.world.terrain;
    if (!nav) return;
    const mat = decorMaterial(0);
    for (let tries = 0, n = 0; tries < 400 && n < SEABED.wrecks; tries++) {
      const p = nav.random(() => rng.f(), nav.big, -1300, 200, 100, 3200);
      if (!p) continue;
      const d = WATER_LEVEL - T.height(p.x, p.z);
      if (d < 4 || d > 10 || sea.distanceToSea(p.x, p.z) > 0) continue;
      if (this.wrecks.some((w) => Math.hypot(w.x - p.x, w.z - p.z) < 500)) continue;
      const L = rng.range(8, 14), grp = new THREE.Group();
      const hull = bakeColors(new THREE.BoxGeometry(L * 0.28, 1.6, L).translate(0, 0.8, 0).toNonIndexed(), (x, y, z, c) => c.setRGB(0.34 + 0.12 * Math.sin(z * 3), 0.27, 0.2));
      const mast = bakeColors(new THREE.CylinderGeometry(0.1, 0.14, L * 0.7, 6).rotateZ(1.2).translate(L * 0.12, 1.6, 0).toNonIndexed(), (x, y, z, c) => c.setRGB(0.3, 0.24, 0.18));
      grp.add(new THREE.Mesh(merge([hull, mast]), mat));
      const y = T.height(p.x, p.z);
      grp.position.set(p.x, y - 0.2, p.z); grp.rotation.set(rng.range(-0.25, 0.25), rng.f() * 6.28, rng.range(0.25, 0.5));
      grp.visible = false; g.scene.add(grp);
      this.wrecks.push({ x: p.x, z: p.z, y, grp, L }); n++;
    }
  }

  setQuality(q) { this.quality = q; }

  update(dt) {
    const g = this.g, sea = g.world.sea, cam = g.camera.position, M = this.m;
    SWAY.value = sea.t;
    const near = this.on && this.quality > 0 && sea.waterWithin(cam.x, cam.z, 100);
    for (const k in M) M[k].visible = near;
    for (const w of this.wrecks) w.grp.visible = near && (w.x - cam.x) ** 2 + (w.z - cam.z) ** 2 < 260 * 260;
    if (!near) return;
    this.last.t -= dt;
    const moved = (cam.x - this.last.x) ** 2 + (cam.z - this.last.z) ** 2;
    if (moved < 25 && this.last.t > 0) return;
    this.last.x = cam.x; this.last.z = cam.z; this.last.t = 2;
    this.rebuild(cam);
  }

  rebuild(cam) {
    const g = this.g, T = g.world.terrain, C = SEABED.cell, R = SEABED.radius * (0.55 + 0.45 * this.quality), n = { tuft: 0, kelp: 0, coralB: 0, coralD: 0, rock: 0, crate: 0, barrel: 0 }, M = this.m;
    const put = (key, x, y, z, rot, sx, sy, sz, col) => { const m = M[key]; if (n[key] >= m.instanceMatrix.count) return; _o.position.set(x, y, z); _o.rotation.set(0, rot, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix(); m.setMatrixAt(n[key], _o.matrix); m.setColorAt(n[key], col); n[key]++; };
    const i0 = Math.floor((cam.x - R) / C), i1 = Math.floor((cam.x + R) / C), j0 = Math.floor((cam.z - R) / C), j1 = Math.floor((cam.z + R) / C);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * C, cz = (j + 0.5) * C, dx = cx - cam.x, dz = cz - cam.z, d = Math.hypot(dx, dz);
      if (d > R) continue;
      const hgt = T.height(cx, cz), depth = WATER_LEVEL - hgt;
      if (depth < 0.5 || depth > 14) continue;
      const rockN = noise(cx * 0.035 + 7, cz * 0.035, 1), weedN = noise(cx * 0.06, cz * 0.06 + 3, 2), r0 = hash2(i, j, 11), r1 = hash2(i, j, 12), r2 = hash2(i, j, 13), r3 = hash2(i, j, 14);
      const at = (u, v) => { const x = cx + (u - 0.5) * C, z = cz + (v - 0.5) * C; return [x, T.height(x, z), z]; };
      if (rockN < 0.55 && depth > 0.8 && depth < 6 && weedN > 0.38 && d < R * 0.75) {
        const c = Math.round(7 * weedN);
        for (let k = 0; k < c; k++) { const [x, y, z] = at(hash2(i, j, 20 + k), hash2(i, j, 40 + k)); const s = 0.7 + hash2(i, j, 60 + k) * 0.8; _c.setRGB(0.6 + 0.4 * hash2(i, j, 80 + k), 0.8, 0.5); put('tuft', x, y - 0.03, z, hash2(i, j, 100 + k) * 6.28, s, s * (0.8 + weedN * 0.8), s, _c); }
      }
      if (rockN > 0.5 && depth > 3 && depth < 12 && r0 > 0.55) { const [x, y, z] = at(r1, r2), h = 2 + r3 * 3; _c.setRGB(0.8, 0.85, 0.6); put('kelp', x, y - 0.05, z, r1 * 6.28, 1.4, Math.min(h, depth - 0.4), 1, _c); }
      if (rockN > 0.6 && depth > 1.2 && depth < 7 && r0 > 0.25) {
        const [x, y, z] = at(r1, r2), hue = hash2(i, j, 30);
        _c.setHSL(hue < 0.35 ? 0.04 + hue * 0.1 : hue < 0.7 ? 0.9 + (hue - 0.35) * 0.1 : 0.12 + (hue - 0.7) * 0.2, 0.7, 0.55);
        if (r3 > 0.45) put('coralB', x, y - 0.05, z, r1 * 6.28, 1 + r2, 0.8 + r0, 1 + r2, _c); else { _c.setHSL(0.08 + hue * 0.15, 0.45, 0.5); put('coralD', x, y, z, r1 * 6.28, 0.8 + r2 * 1.2, 0.8 + r0, 0.8 + r2 * 1.2, _c); }
      }
      if ((rockN > 0.58 && r1 > 0.45) || r0 > 0.965) { const [x, y, z] = at(r2, r3), s = 0.5 + r0 * (rockN > 0.58 ? 2.4 : 1.2); { const k = 0.45 + 0.4 * r3; _c.setRGB(k, k * 0.95, k * 0.85); } put('rock', x, y + s * 0.08, z, r2 * 6.28, s * (0.9 + r1 * 0.5), s * 0.7, s * (0.9 + r3 * 0.5), _c); }
      if (r0 > 0.992 && depth > 1) { const [x, y, z] = at(r1, r2); _c.setScalar(0.9); put(r3 > 0.5 ? 'crate' : 'barrel', x, y, z, r2 * 6.28, 1, 1, 1, _c); }
    }
    for (const k in M) { M[k].count = n[k]; M[k].instanceMatrix.needsUpdate = true; if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true; }
  }
}

