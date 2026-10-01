import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { makeLightsMaterial, makePaintMaterial, makeGlassMaterial } from './carModel.js';

// Procedural aircraft. Local frame like the cars: +z nose, +y up, +x port. y = 0 is the ground under the wheels.
const C = (h) => new THREE.Color(h);
const cache = new Map();
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
const put = (gb, geo, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, col = null) => { M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)); gb.add(geo, M, col); };
const sph = new THREE.SphereGeometry(1, 18, 12), box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 14), cone = new THREE.ConeGeometry(1, 1, 14);

function buildPlane(ctx, def, jet) {
  const { paint, glass, trim } = ctx, W = C('#f4f4f2'), D = C('#20242b'), ACC = C(def.colors[0] === '#f2f2f0' ? '#c8302a' : '#f2f2f0'), G = C('#8a919a');
  const L = def.body.L, span = def.span;
  put(paint, sph, 0, 1.28, 0.2, jet ? 0.8 : 0.66, jet ? 0.82 : 0.72, L * 0.31, 0, 0, 0, W);
  put(paint, cyl, 0, 1.36, -L * 0.29, jet ? 0.5 : 0.28, L * 0.34, jet ? 0.5 : 0.28, Math.PI / 2, 0, 0, W);
  put(paint, sph, 0, 1.28, L * 0.38, jet ? 0.55 : 0.56, jet ? 0.6 : 0.58, jet ? 1.6 : 0.8, 0, 0, 0, W);
  put(paint, box, 0, 1.27, 0, 1.32, 0.05, L * 0.55, 0, 0, 0, ACC);
  if (jet) {
    for (const s of [1, -1]) { put(paint, box, s * (span / 4 + 0.6), 1.1, -0.2, span / 2 - 0.4, 0.12, 2.2, 0, s * 0.25, 0, W); put(paint, cyl, s * 1.45, 1.4, -L * 0.3, 0.46, 2.4, 0.46, Math.PI / 2, 0, 0, G); put(trim, cyl, s * 1.45, 1.4, -L * 0.3 - 1.25, 0.34, 0.05, 0.34, Math.PI / 2, 0, 0, D); }
    put(paint, box, 0, 3.4, -L * 0.45, 0.14, 1.9, 1.7, -0.15, 0, 0, W);
    put(paint, box, 0, 4.2, -L * 0.47, 3.6, 0.1, 1.0, 0, 0, 0, W);
    put(glass, sph, 0, 1.78, L * 0.28, 0.55, 0.36, 1.0, -0.2, 0, 0, C('#222a33'));
  } else {
    put(paint, box, 0, 2.06, 0.5, span, 0.14, 1.6, 0, 0, 0, W);
    for (const s of [1, -1]) { put(trim, cyl, s * 2.4, 1.6, 0.5, 0.045, 1.7, 0.045, 0, 0, s * 0.62, D); put(paint, box, s * (span / 2 - 0.25), 2.06, 0.5, 0.5, 0.15, 1.55, 0, 0, 0, ACC); }
    put(paint, box, 0, 2.15, -L * 0.45, 0.12, 1.25, 1.35, -0.18, 0, 0, W);
    put(paint, box, 0, 1.55, -L * 0.45, 3.5, 0.1, 0.95, 0, 0, 0, W);
    put(glass, sph, 0, 1.78, 0.75, 0.55, 0.42, 1.25, 0, 0, 0, C('#222a33'));
    put(paint, cyl, 0, 1.28, L * 0.5 - 0.05, 0.5, 0.5, 0.5, Math.PI / 2, 0, 0, C('#2a2f38'));
  }
  const gear = (x, z, r) => { put(trim, cyl, x, 0.34 + r * 0.2, z, 0.04, 0.7, 0.04, 0, 0, 0, D); };
  if (!jet) { gear(1.05, 0.45, 0.3); gear(-1.05, 0.45, 0.3); gear(0, L * 0.25, 0.25); }
}

function buildHeli(ctx, def) {
  const { paint, glass, trim } = ctx, W = C(def.colors[0]), D = C('#20242b'), ACC = C('#f2f2f0');
  const L = def.body.L;
  put(paint, sph, 0, 1.55, 0.7, 1.05, 1.05, 2.0, 0, 0, 0, W);
  put(glass, sph, 0, 1.75, 1.7, 0.92, 0.82, 1.1, 0, 0, 0, C('#222a33'));
  put(paint, cyl, 0, 1.9, -2.7, 0.22, 4.6, 0.22, Math.PI / 2, 0, 0, W);
  put(paint, box, 0, 2.45, -L * 0.5 + 0.1, 0.1, 1.0, 0.9, -0.2, 0, 0, W);
  put(paint, box, 0, 1.55, -L * 0.5 + 0.3, 1.6, 0.06, 0.5, 0, 0, 0, W);
  put(paint, box, 0, 2.45, 0.2, 0.9, 0.55, 1.6, 0, 0, 0, W);
  put(trim, cyl, 0, 2.95, 0.2, 0.09, 0.45, 0.09, 0, 0, 0, D);
  for (const s of [1, -1]) {
    put(trim, cyl, s * 1.0, 0.22, 0.4, 0.05, 3.3, 0.05, Math.PI / 2, 0, 0, D);
    put(trim, cyl, s * 0.95, 0.55, 1.1, 0.04, 0.7, 0.04, 0, 0, s * 0.3, D);
    put(trim, cyl, s * 0.95, 0.55, -0.4, 0.04, 0.7, 0.04, 0, 0, s * 0.3, D);
  }
  put(paint, box, 0, 1.2, 0.7, 1.1, 0.07, 3.0, 0, 0, 0, ACC);
  put(trim, box, 0, 1.0, 2.4, 0.3, 0.2, 0.1, 0, 0, 0, C('#e6edf2'));
}

export function aircraftGeometry(def) {
  if (cache.has(def.id)) return cache.get(def.id);
  const ctx = { paint: new GeoBuilder(), glass: new GeoBuilder(), trim: new GeoBuilder() };
  if (def.air === 'heli') buildHeli(ctx, def); else buildPlane(ctx, def, def.air === 'jet');
  const b = def.body, out = {};
  for (const k of ['paint', 'glass', 'trim']) out[k] = ctx[k].count ? ctx[k].build(k !== 'glass') : null;
  out.chrome = null; out.lights = null; out.plates = null; out.wheels = [];
  out.layout = { zF: b.L / 2, zR: -b.L / 2, track: b.W * 0.6, wr: 0.3, ww: 0.2 };
  out.dims = { L: b.L, W: b.W, H: b.H };
  out.seat = def.air === 'heli' ? { x: 0.35, y: 1.15, z: 1.15, pose: 'drive' } : def.air === 'jet' ? { x: 0.0, y: 1.0, z: 3.2, pose: 'drive' } : { x: 0.32, y: 1.0, z: 0.55, pose: 'drive' };
  out.eye = { x: out.seat.x, y: out.seat.y + 0.62, z: out.seat.z + 0.1 };
  out.P = null;
  const hw = b.W / 2, hl = b.L / 2;
  out.outline = [[hw, -hl], [hw, hl], [-hw, hl], [-hw, -hl]];
  cache.set(def.id, out);
  return out;
}

export function createAircraftMesh(def, custom = {}) {
  const geo = aircraftGeometry(def), group = new THREE.Group();
  const base = custom.color || def.colors[0];
  const paint = makePaintMaterial({ color: base, finish: custom.finish || 'gloss' });
  const glass = makeGlassMaterial(0.5);
  const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
  const lights = makeLightsMaterial(false);
  const mats = { paint, glass, trim, chrome: trim, lights, plates: trim, rim: trim, tire: trim };
  const meshes = {};
  for (const k of ['paint', 'trim', 'glass']) {
    if (!geo[k]) continue;
    const m = new THREE.Mesh(geo[k], mats[k]); m.castShadow = k !== 'glass'; m.receiveShadow = k !== 'glass'; if (k === 'glass') m.renderOrder = 2;
    meshes[k] = m; group.add(m);
  }
  const rig = { wheels: [] }, dark = new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.8 }), blade = new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 0.5 });
  const wheel = (x, y, z, r) => { const g = new THREE.Group(); g.position.set(x, y, z); const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.55, 14), dark); t.rotation.z = Math.PI / 2; t.castShadow = true; g.add(t); group.add(g); rig.wheels.push(g); };
  const L = def.body.L;
  if (def.air === 'prop') {
    wheel(1.05, 0.3, 0.45, 0.3); wheel(-1.05, 0.3, 0.45, 0.3); wheel(0, 0.26, L * 0.25, 0.25);
    const prop = new THREE.Group(); prop.position.set(0, 1.28, L * 0.5 + 0.05);
    for (const a of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.0, 0.03), blade); b.position.y = a ? -1 : 1; prop.add(b); }
    const spin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 10), new THREE.MeshStandardMaterial({ color: '#c8302a', roughness: 0.4 })); spin.rotation.x = Math.PI / 2; spin.position.z = 0.15; prop.add(spin);
    group.add(prop); rig.prop = prop;
  } else if (def.air === 'jet') {
    wheel(1.0, 0.3, 0.6, 0.3); wheel(-1.0, 0.3, 0.6, 0.3); wheel(0, 0.26, L * 0.28, 0.24);
  } else {
    const rotor = new THREE.Group(); rotor.position.set(0, 3.2, 0.2);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 5.0), blade); b.position.z = 2.5; const h = new THREE.Group(); h.rotation.y = (i / 4) * Math.PI * 2; h.add(b); rotor.add(h); }
    group.add(rotor); rig.rotor = rotor;
    const tail = new THREE.Group(); tail.position.set(0.14, 2.2, -L * 0.5 + 0.2);
    for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.12), blade); b.rotation.x = i * Math.PI / 2; tail.add(b); }
    group.add(tail); rig.tailRotor = tail;
  }
  return { group, meshes, panels: null, split: null, mats, wheels: [], geo, def, map: null, rig };
}
