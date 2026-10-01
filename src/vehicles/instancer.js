import * as THREE from 'three';
import { carGeometry, liveryTexture } from './carMesh.js';
import { buildWheel, makeLightsMaterial, makePaintMaterial, buildCarLow } from './carModel.js';
import { VEHICLE_BY_ID } from '../data/vehicles.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _w = new THREE.Matrix4(), _wl = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);

const shared = {};
function sharedMats() {
  if (shared.glass) return shared;
  shared.glass = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.5, roughness: 0.06, envMapIntensity: 1.8 });
  shared.trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
  shared.chrome = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 1 });
  shared.plates = new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.5 });
  shared.lights = makeLightsMaterial(true);
  shared.low = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.35 });
  shared.tire = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  shared.rim = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, vertexColors: true, metalness: 0.8, roughness: 0.3 });
  shared.paint = {};
  return shared;
}

// Instanced rendering for traffic / parked cars. mode: 'dyn' | 'static' | 'low'
export class CarInstancer {
  constructor(scene, models, cap = 12, mode = 'dyn') {
    this.mode = mode;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.models = {};
    const S = sharedMats();
    let wheelTotal = 0;
    for (const id of models) {
      const def = VEHICLE_BY_ID[id];
      const c = cap;
      const M = { def, cap: c, count: 0, free: [], meshes: {}, slots: [] };
      const mk = (g, mat, name, shadow = true) => {
        if (!g) return null;
        const im = new THREE.InstancedMesh(g, mat, c);
        im.count = 0; im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = name === 'paint' || name === 'low';
        im.visible = false;
        this.group.add(im);
        M.meshes[name] = im;
        return im;
      };
      if (mode === 'low') {
        mk(buildCarLow(def), S.low, 'low', false);
        M.meshes.low.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c * 3).fill(1), 3);
        M.paintKey = 'low';
        M.geo = null;
      } else {
        const geo = carGeometry(def);
        M.geo = geo;
        if (!S.paint[id]) {
          const livery = def.livery === 'police' || def.livery === 'taxi' ? liveryTexture(def.livery, def.colors[0]) : null;
          S.paint[id] = makePaintMaterial({ instanced: true, map: livery });
        }
        mk(geo.paint, S.paint[id], 'paint');
        M.meshes.paint.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c * 3).fill(1), 3);
        M.paintKey = 'paint';
        mk(geo.glass, S.glass, 'glass', false);
        mk(geo.trim, S.trim, 'trim');
        mk(geo.chrome, S.chrome, 'chrome', false);
        mk(geo.plates, S.plates, 'plates', false);
        if (geo.lights) {
          const lg = geo.lights.clone();
          const a = new THREE.InstancedBufferAttribute(new Float32Array(c * 4), 4);
          a.setUsage(THREE.DynamicDrawUsage);
          lg.setAttribute('aLight', a);
          mk(lg, S.lights, 'lights', false);
          M.aLight = a;
        }
        wheelTotal += c * geo.wheels.length;
      }
      for (const im of Object.values(M.meshes)) if (mode === 'dyn') im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.models[id] = M;
    }
    if (wheelTotal) {
      const w = buildWheel('multispoke', 0.64);
      this.tires = new THREE.InstancedMesh(w.tire, S.tire, wheelTotal);
      this.rims = new THREE.InstancedMesh(w.rim, S.rim, wheelTotal);
      for (const m of [this.tires, this.rims]) { m.count = 0; m.frustumCulled = false; this.group.add(m); if (mode === 'dyn') m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
    }
    this.cars = new Set();
    this.dirty = true;
  }

  alloc(modelId, color) {
    const M = this.models[modelId];
    if (!M) return null;
    let idx;
    if (M.free.length) idx = M.free.pop();
    else if (M.count < M.cap) idx = M.count++;
    else return null;
    const car = { model: modelId, M, idx, color: new THREE.Color(color), x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, steer: 0, spin: 0, light: [0, 0, 0, 0], hidden: false };
    M.slots[idx] = car;
    const pm = M.meshes[M.paintKey];
    pm.setColorAt(idx, car.color);
    pm.instanceColor.needsUpdate = true;
    this.cars.add(car);
    this.dirty = true;
    return car;
  }

  release(car) {
    if (!car || !this.cars.has(car)) return;
    this.cars.delete(car);
    const M = car.M;
    M.slots[car.idx] = null;
    M.free.push(car.idx);
    this.dirty = true;
  }

  recolor(car, color) {
    car.color.set(color);
    const pm = car.M.meshes[car.M.paintKey];
    pm.setColorAt(car.idx, car.color);
    pm.instanceColor.needsUpdate = true;
  }

  flush(force = false) {
    if (this.mode !== 'dyn' && !this.dirty && !force) return;
    this.dirty = false;
    let wi = 0;
    for (const id in this.models) {
      const M = this.models[id];
      if (!M.count) { for (const k in M.meshes) M.meshes[k].visible = false; continue; }
      for (let i = 0; i < M.count; i++) {
        const car = M.slots[i];
        if (!car || car.hidden) { for (const k in M.meshes) M.meshes[k].setMatrixAt(i, _zero); if (M.geo) for (let q = 0; q < M.geo.wheels.length; q++) { this.tires.setMatrixAt(wi, _zero); this.rims.setMatrixAt(wi, _zero); wi++; } continue; }
        _e.set(car.pitch, car.yaw, car.roll);
        _q.setFromEuler(_e);
        _p.set(car.x, car.y, car.z);
        _m.compose(_p, _q, _s);
        for (const k in M.meshes) M.meshes[k].setMatrixAt(i, _m);
        if (M.aLight) M.aLight.setXYZW(i, car.light[0], car.light[1], car.light[2], car.light[3]);
        if (M.geo) {
          const wr = M.def.body.wr, ww = M.def.body.ww;
          for (const w of M.geo.wheels) {
            if (w.left) _wl.identity(); else _wl.makeRotationY(Math.PI);
            _wl.premultiply(_w.makeRotationX(car.spin));
            if (w.front) _wl.premultiply(_w.makeRotationY(car.steer));
            _wl.multiply(_w.makeScale(ww, wr, wr));
            _wl.setPosition(w.x, wr, w.z);
            _wl.premultiply(_m);
            this.tires.setMatrixAt(wi, _wl); this.rims.setMatrixAt(wi, _wl);
            wi++;
          }
        }
      }
      for (const k in M.meshes) { const im = M.meshes[k]; im.count = M.count; im.visible = true; im.instanceMatrix.needsUpdate = true; }
      if (M.aLight) M.aLight.needsUpdate = true;
    }
    if (this.tires) {
      this.tires.count = wi; this.rims.count = wi;
      this.tires.instanceMatrix.needsUpdate = true; this.rims.instanceMatrix.needsUpdate = true;
    }
  }
}
