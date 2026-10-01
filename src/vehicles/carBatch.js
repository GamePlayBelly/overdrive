import * as THREE from 'three';
import { carGeometry, liveryTexture } from './carMesh.js';
import { buildWheel, makeLightsMaterial, makePaintMaterial, buildCarLow, buildCarProxy } from './carModel.js';
import { VEHICLE_BY_ID } from '../data/vehicles.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _w = new THREE.Matrix4(), _wl = new THREE.Matrix4();

let shared = null;
function mats() {
  if (shared) return shared;
  shared = {
    glass: new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.5, roughness: 0.08, envMapIntensity: 1.6 }),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }),
    chrome: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 1 }),
    plates: new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.5 }),
    lights: makeLightsMaterial(true),
    low: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.3 }),
    proxy: new THREE.MeshLambertMaterial({ vertexColors: true }),
    tire: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, vertexColors: true, metalness: 0.8, roughness: 0.3 }),
    paint: {},
  };
  return shared;
}

export const TIER = { near: 30, mid: 115, far: 270 };

// Immediate-mode instanced car renderer: only visible cars are written each frame, in three LOD tiers.
// Traffic cars never cast real shadows (contact shadows are drawn separately).
export class CarBatch {
  constructor(scene, modelIds, { nearCap = 8, midCap = 40, farCap = 90, wheelCap = 96 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'carBatch';
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);
    const S = mats();
    this.models = {};
    for (const id of modelIds) {
      const def = VEHICLE_BY_ID[id];
      const geo = carGeometry(def, {}, 1);
      const M = { def, geo, nNear: 0, nMid: 0, nFar: 0, capNear: nearCap, capMid: midCap, capFar: farCap, near: {}, mid: null, far: null };
      const mk = (g, mat, cap, tinted = false) => {
        const im = new THREE.InstancedMesh(g, mat, cap);
        im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.visible = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (tinted) { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
        this.group.add(im);
        return im;
      };
      if (!S.paint[id]) S.paint[id] = makePaintMaterial({ instanced: true, map: def.livery === 'police' || def.livery === 'taxi' ? liveryTexture(def.livery, def.colors[0]) : null });
      M.near.paint = mk(geo.paint, S.paint[id], nearCap, true);
      M.near.glass = mk(geo.glass, S.glass, nearCap);
      if (geo.trim) M.near.trim = mk(geo.trim, S.trim, nearCap);
      if (geo.chrome) M.near.chrome = mk(geo.chrome, S.chrome, nearCap);
      if (geo.plates) M.near.plates = mk(geo.plates, S.plates, nearCap);
      if (geo.lights) {
        const lg = geo.lights.clone();
        const a = new THREE.InstancedBufferAttribute(new Float32Array(nearCap * 4), 4);
        a.setUsage(THREE.DynamicDrawUsage);
        lg.setAttribute('aLight', a);
        M.near.lights = mk(lg, S.lights, nearCap);
        M.aLight = a;
      }
      M.mid = mk(buildCarLow(def), S.low, midCap, true);
      const shared = M.near.paint.instanceMatrix;
      for (const k in M.near) M.near[k].instanceMatrix = shared;
      this.models[id] = M;
    }
    const fg = new THREE.BoxGeometry(1, 1, 1); fg.translate(0, 0.5, 0);
    const fc = new Float32Array(fg.attributes.position.count * 3).fill(1); fg.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    this.far = new THREE.InstancedMesh(fg, S.proxy, farCap * 4);
    this.far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(farCap * 4 * 3).fill(1), 3);
    this.far.count = 0; this.far.frustumCulled = false; this.far.castShadow = false; this.far.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.far.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.far);
    this.nFar = 0; this.farCap = farCap * 4;
    const w = buildWheel('multispoke', 0.64, 1);
    this.tires = new THREE.InstancedMesh(w.tire, S.tire, wheelCap);
    this.rims = new THREE.InstancedMesh(w.rim, S.rim, wheelCap);
    for (const m of [this.tires, this.rims]) { m.count = 0; m.frustumCulled = false; m.castShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
    this.wheelCap = wheelCap;
    this.nWheels = 0;
    this.stats = { near: 0, mid: 0, far: 0 };
    this.dist = { near: TIER.near, mid: TIER.mid, far: TIER.far };
  }

  begin() {
    for (const id in this.models) { const M = this.models[id]; M.nNear = 0; M.nMid = 0; M.nFar = 0; }
    this.nWheels = 0; this.nFar = 0;
  }

  // c: { def, x, y, z, yaw, pitch, roll, steer, spin, color (THREE.Color), light[4] } with x,y,z = body origin; returns tier or ''
  push(c, view) {
    const M = this.models[c.def.id];
    if (!M) return '';
    const dx = c.x - view.pos.x, dz = c.z - view.pos.z, d2 = dx * dx + dz * dz;
    const D = this.dist;
    if (d2 > D.far * D.far) return '';
    if (d2 > 400 && !view.sphere(c.x, c.y + 0.9, c.z, 3.4)) return '';
    _e.set(c.pitch || 0, c.yaw, c.roll || 0);
    _q.setFromEuler(_e);
    _p.set(c.x, c.y, c.z);
    _m.compose(_p, _q, _s);
    const el = _m.elements;
    if (d2 < D.near * D.near && M.nNear < M.capNear) {
      const i = M.nNear++;
      M.near.paint.instanceMatrix.array.set(el, i * 16);
      const col = c.color, ic = M.near.paint.instanceColor.array;
      ic[i * 3] = col.r; ic[i * 3 + 1] = col.g; ic[i * 3 + 2] = col.b;
      if (M.aLight) { const a = M.aLight.array, l = c.light; a[i * 4] = l[0]; a[i * 4 + 1] = l[1]; a[i * 4 + 2] = l[2]; a[i * 4 + 3] = l[3]; }
      const b = M.def.body, wr = b.wr, ww = b.ww;
      for (const w of M.geo.wheels) {
        if (this.nWheels >= this.wheelCap) break;
        if (w.left) _wl.identity(); else _wl.makeRotationY(Math.PI);
        _wl.premultiply(_w.makeRotationX(c.spin || 0));
        if (w.front) _wl.premultiply(_w.makeRotationY(c.steer || 0));
        _wl.multiply(_w.makeScale(ww, wr, wr));
        _wl.setPosition(w.x, wr, w.z);
        _wl.premultiply(_m);
        this.tires.instanceMatrix.array.set(_wl.elements, this.nWheels * 16);
        this.rims.instanceMatrix.array.set(_wl.elements, this.nWheels * 16);
        this.nWheels++;
      }
      return 'near';
    }
    if (d2 < D.mid * D.mid && M.nMid < M.capMid) {
      const i = M.nMid++;
      M.mid.instanceMatrix.array.set(el, i * 16);
      const col = c.color, ic = M.mid.instanceColor.array;
      ic[i * 3] = col.r; ic[i * 3 + 1] = col.g; ic[i * 3 + 2] = col.b;
      return 'mid';
    }
    if (this.nFar >= this.farCap) return '';
    const i = this.nFar++;
    const b = M.def.body;
    _s.set(b.W * 0.96, (b.roofY || b.H) * 0.92, b.L * 0.98);
    _m.compose(_p, _q, _s);
    _m.elements[13] += b.clr;
    this.far.instanceMatrix.array.set(_m.elements, i * 16);
    _s.set(1, 1, 1);
    const col = c.color, ic = this.far.instanceColor.array;
    ic[i * 3] = col.r; ic[i * 3 + 1] = col.g; ic[i * 3 + 2] = col.b;
    return 'far';
  }

  end() {
    let near = 0, mid = 0, far = 0;
    for (const id in this.models) {
      const M = this.models[id];
      for (const k in M.near) { const im = M.near[k]; im.count = M.nNear; im.visible = M.nNear > 0; }
      if (M.nNear) { M.near.paint.instanceMatrix.needsUpdate = true; M.near.paint.instanceColor.needsUpdate = true; if (M.aLight) M.aLight.needsUpdate = true; }
      { const im = M.mid, n = M.nMid; im.count = n; im.visible = n > 0; if (n) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; } }
      near += M.nNear; mid += M.nMid;
    }
    far = this.nFar;
    this.far.count = far; this.far.visible = far > 0;
    if (far) { this.far.instanceMatrix.needsUpdate = true; this.far.instanceColor.needsUpdate = true; }
    this.tires.count = this.rims.count = this.nWheels;
    this.tires.visible = this.rims.visible = this.nWheels > 0;
    if (this.nWheels) { this.tires.instanceMatrix.needsUpdate = true; this.rims.instanceMatrix.needsUpdate = true; }
    this.stats.near = near; this.stats.mid = mid; this.stats.far = far;
  }
}
