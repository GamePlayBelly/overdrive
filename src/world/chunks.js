import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { smoothstep } from '../core/math.js';
import { UBER_INDEX, UBER_DECAL } from './uber.js';

export const LAYERS = {
  road: { dist: 950 },
  mark: { dist: 230 },
  side: { dist: 420 },
  curb: { dist: 420 },
  flat: { dist: 380 },
  deck: { dist: 800 },
  bldg: { dist: 300 },
  detail: { dist: 210 },
  prop: { dist: 260 },
};
const GROUND = new Set(['road', 'side', 'curb', 'flat']);
const _c = new THREE.Vector3();
const _col = new THREE.Color();

// Spatial store for static world geometry. Builders accumulate per (layer, material, chunk); finalize() merges them into three
// BatchedMesh draws (casters / ground / decals) plus a proxy batch for far building LOD. Visibility is per chunk-layer instance.
export class ChunkStore {
  constructor(size = 128) {
    this.size = size;
    this.builders = new Map();
    this.chunks = new Map();
    this.list = [];
    this.proxyBoxes = new Map();
    this.quality = 1;
    this.stats = {};
  }

  b(layer, mat, x, z) {
    const cx = Math.floor(x / this.size), cz = Math.floor(z / this.size);
    const k = `${layer}|${mat}|${cx}|${cz}`;
    let b = this.builders.get(k);
    if (!b) { b = new GeoBuilder(); b.layer = layer; b.mat = mat; b.cx = cx; b.cz = cz; this.builders.set(k, b); }
    return b;
  }

  proxy(x0, x1, z0, z1, y0, y1, col) {
    const cx = Math.floor(((x0 + x1) / 2) / this.size), cz = Math.floor(((z0 + z1) / 2) / this.size);
    const k = `${cx}|${cz}`;
    let a = this.proxyBoxes.get(k);
    if (!a) { a = { cx, cz, boxes: [] }; this.proxyBoxes.set(k, a); }
    a.boxes.push([x0, x1, z0, z1, y0, y1, col.r, col.g, col.b]);
  }

  chunk(cx, cz) {
    const k = `${cx}|${cz}`;
    let c = this.chunks.get(k);
    if (!c) {
      c = { cx, cz, insts: [], specials: [], proxy: -1, center: new THREE.Vector3((cx + 0.5) * this.size, 0, (cz + 0.5) * this.size), radius: this.size * 0.75, hi: true, key: k };
      this.chunks.set(k, c);
      this.list.push(c);
    }
    return c;
  }

  // merge builders of one (chunk, batch, layer) into a BatchedMesh-compatible geometry
  static mergeUber(builders) {
    let v = 0, i = 0;
    for (const b of builders) { v += b.count; i += b.i.length; }
    const pos = new Float32Array(v * 3), nor = new Int8Array(v * 4), uv = new Float32Array(v * 2), col = new Uint8Array(v * 4);
    const idx = new Uint32Array(i);
    let vo = 0, io = 0;
    for (const b of builders) {
      const layer = UBER_INDEX[b.mat] ?? 0;
      const n = b.count;
      for (let k = 0; k < n; k++) {
        const p = (vo + k);
        pos[p * 3] = b.p[k * 3]; pos[p * 3 + 1] = b.p[k * 3 + 1]; pos[p * 3 + 2] = b.p[k * 3 + 2];
        nor[p * 4] = Math.round(b.n[k * 3] * 127); nor[p * 4 + 1] = Math.round(b.n[k * 3 + 1] * 127); nor[p * 4 + 2] = Math.round(b.n[k * 3 + 2] * 127);
        uv[p * 2] = b.u[k * 2]; uv[p * 2 + 1] = b.u[k * 2 + 1];
        col[p * 4] = Math.min(255, Math.round(b.c[k * 3] * 255)); col[p * 4 + 1] = Math.min(255, Math.round(b.c[k * 3 + 1] * 255)); col[p * 4 + 2] = Math.min(255, Math.round(b.c[k * 3 + 2] * 255)); col[p * 4 + 3] = layer;
      }
      for (let k = 0; k < b.i.length; k++) idx[io + k] = b.i[k] + vo;
      vo += n; io += b.i.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 4, true));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 4, true));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  finalize(M, proxyMat, group) {
    const groups = new Map();
    const specials = [];
    for (const b of this.builders.values()) {
      if (!b.count) continue;
      if (UBER_INDEX[b.mat] === undefined) { specials.push(b); continue; }
      const batch = UBER_DECAL.has(b.mat) ? 'decal' : GROUND.has(b.layer) ? 'ground' : 'cast';
      const k = `${batch}|${b.layer}|${b.cx}|${b.cz}`;
      let g = groups.get(k);
      if (!g) { g = { batch, layer: b.layer, cx: b.cx, cz: b.cz, builders: [] }; groups.set(k, g); }
      g.builders.push(b);
    }
    const batches = {};
    for (const name of ['cast', 'ground', 'decal']) {
      const list = [...groups.values()].filter((g) => g.batch === name);
      if (!list.length) continue;
      const geos = list.map((g) => { const geo = ChunkStore.mergeUber(g.builders); geo.computeBoundingSphere(); return { g, geo, sph: geo.boundingSphere.clone() }; });
      let V = 0, I = 0;
      for (const { geo } of geos) { V += geo.attributes.position.count; I += geo.index.count; }
      const bm = new THREE.BatchedMesh(geos.length + 8, V + 64, I + 64, name === 'decal' ? M.uberDecal : M.uber);
      bm.perObjectFrustumCulled = false; bm.sortObjects = false; bm.frustumCulled = false;
      bm.castShadow = name === 'cast'; bm.receiveShadow = true;
      bm.name = 'static-' + name;
      for (const { g, geo, sph } of geos) {
        const gid = bm.addGeometry(geo);
        const iid = bm.addInstance(gid);
        const ch = this.chunk(g.cx, g.cz);
        ch.insts.push({ bm, iid, layer: g.layer, on: true, batch: name, sph });
        geo.dispose();
      }
      group.add(bm);
      batches[name] = bm;
      for (const g of list) for (const b of g.builders) { b.p = b.n = b.u = b.c = b.i = null; }
    }
    // specials (alpha-tested / transparent / textured decals): ordinary meshes per chunk
    for (const b of specials) {
      const m = new THREE.Mesh(b.build(), M[b.mat] || M.paint);
      m.matrixAutoUpdate = false; m.updateMatrix(); m.receiveShadow = true; m.castShadow = false;
      m.userData.mat = b.mat;
      const ch = this.chunk(b.cx, b.cz);
      ch.specials.push({ mesh: m, layer: b.layer });
      group.add(m);
      b.p = b.n = b.u = b.c = b.i = null;
    }
    this.builders.clear();
    // far LOD proxies
    let pv = 0, pi = 0; const pg = [];
    for (const a of this.proxyBoxes.values()) {
      const g = new GeoBuilder();
      for (const [x0, x1, z0, z1, y0, y1, r, gg, bb] of a.boxes) g.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, _col.setRGB(r, gg, bb), 0, 0, true, false);
      if (!g.count) continue;
      const geo = g.build();
      pg.push({ a, geo }); pv += geo.attributes.position.count; pi += geo.index.count;
    }
    if (pg.length) {
      const bm = new THREE.BatchedMesh(pg.length + 4, pv + 64, pi + 64, proxyMat);
      bm.perObjectFrustumCulled = false; bm.sortObjects = false; bm.frustumCulled = false; bm.castShadow = false; bm.receiveShadow = false;
      bm.name = 'static-proxy';
      for (const { a, geo } of pg) {
        const gid = bm.addGeometry(geo), iid = bm.addInstance(gid);
        bm.setVisibleAt(iid, false);
        this.chunk(a.cx, a.cz).proxy = iid;
      }
      this.proxyBM = bm;
      group.add(bm);
    }
    this.proxyBoxes.clear();
    this.batches = batches;
    // chunk bounds from instances
    for (const ch of this.list) {
      const s = new THREE.Sphere();
      let first = true;
      for (const i of ch.insts) { if (first) { s.copy(i.sph); first = false; } else s.union(i.sph); }
      for (const sp of ch.specials) { sp.mesh.geometry.computeBoundingSphere(); if (first) { s.copy(sp.mesh.geometry.boundingSphere); first = false; } else s.union(sp.mesh.geometry.boundingSphere); }
      if (!first) { ch.center.copy(s.center); ch.radius = s.radius; }
    }
    this.stats = { chunks: this.list.length, instances: this.list.reduce((s, c) => s + c.insts.length, 0), specials: specials.length, proxies: pg.length };
  }

  // camera-relative LOD; dir = camera forward (unit)
  update(cam, dir, opts = {}, view = null) {
    const q = (opts.quality ?? this.quality) * 1;
    let vis = 0, prox = 0;
    for (const ch of this.list) {
      _c.copy(ch.center).sub(cam);
      const len = _c.length() || 1;
      const d = Math.max(0, len - ch.radius);
      const cos = (_c.x * dir.x + _c.y * dir.y + _c.z * dir.z) / len;
      const bias = d < 40 ? 1 : 0.62 + 0.38 * smoothstep(-0.25, 0.7, cos);
      let bldgOn = false;
      for (const it of ch.insts) {
        const L = LAYERS[it.layer] || LAYERS.bldg;
        let on = d < L.dist * q * bias * (it.on ? 1.06 : 1);
        if (on && view && !view.sphereOrNear(it.sph.center.x, it.sph.center.y, it.sph.center.z, it.sph.radius, 105)) on = false;
        if (on !== it.on) { it.on = on; it.bm.setVisibleAt(it.iid, on); }
        if (it.layer === 'bldg' && on) bldgOn = true;
        if (on) vis++;
      }
      for (const sp of ch.specials) {
        const L = LAYERS[sp.layer] || LAYERS.bldg;
        const on = d < L.dist * q * bias;
        if (sp.mesh.visible !== on) sp.mesh.visible = on;
      }
      if (ch.proxy >= 0) {
        let pOn = !bldgOn && d < 1900 * q;
        if (pOn && view && !view.sphere(ch.center.x, ch.center.y + 30, ch.center.z, ch.radius + 40)) pOn = false;
        if (pOn !== ch.proxyOn) { ch.proxyOn = pOn; this.proxyBM.setVisibleAt(ch.proxy, pOn); }
        if (pOn) prox++;
      }
    }
    this.lastVisible = vis; this.lastProxy = prox;
  }
}

// proxy material: flat-shaded boxes with a procedural window grid that lights up at night
export function makeProxyMaterial(uNight) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uNight;
    sh.vertexShader = 'varying vec3 vWPos; varying vec3 vWNor;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = transformed; vWNor = normal;');
    sh.fragmentShader = 'uniform float uNight; varying vec3 vWPos; varying vec3 vWNor; float pLit;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ax = abs(vWNor.x) > abs(vWNor.z) ? vWPos.z : vWPos.x;
        vec2 cell = vec2(ax / 2.8, vWPos.y / 3.6);
        vec2 f = fract(cell); vec2 id = floor(cell);
        float wall = step(abs(vWNor.y), 0.5);
        float win = wall * step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.78) * step(3.0, vWPos.y);
        float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
        pLit = win * step(0.55, h);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.38 + vec3(0.02, 0.035, 0.05), win);
        diffuseColor.rgb *= mix(1.0, 0.6, step(0.5, vWNor.y));`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.78, 0.5) * pLit * uNight * 1.3;');
  };
  return m;
}
