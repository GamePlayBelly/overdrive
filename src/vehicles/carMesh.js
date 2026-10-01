import * as THREE from 'three';
import { buildCar, buildWheel, makeLightsMaterial, makePaintMaterial, makeGlassMaterial } from './carModel.js';
import { makePlate, toTex, canvas } from '../world/textures.js';
import { hasDoors, splitPanels } from './doors.js';
import { createBoatMesh } from './boatModel.js';
import { createAircraftMesh } from './aircraftModel.js';
import { Assets } from '../core/assets.js';

const geoCache = new Map();
const splitCache = new Map();
export function carGeometry(def, custom = {}, lod = 0) {
  const key = def.id + '|' + lod + '|' + (custom.spoiler || '') + (custom.bumper || '') + (custom.hood || '') + (custom.exhaust || '') + (custom.mirrorColor || '') + (custom.noFiller ? 'nf' : '');
  if (!geoCache.has(key)) geoCache.set(key, buildCar(def, { ...custom, lod }));
  return geoCache.get(key);
}

export function liveryTexture(kind, base = '#ffffff', decal = null, decalColor = '#111111', number = '') {
  const W = 1024, H = 512, c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  const band = (v0, v1, col) => { ctx.fillStyle = col; ctx.fillRect(0, (1 - v1) * H, W, (v1 - v0) * H); };
  // right side panel is canvas y 0.2H..0.35H (upright); left side 0.65H..0.8H (rotated 180°)
  const sideText = (text, u, v, size, col, font = 'bold') => {
    ctx.fillStyle = col; ctx.font = `${font} ${size}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, u * W, (1 - (0.5 + v)) * H);
    ctx.save(); ctx.translate(u * W, (1 - (0.5 - v)) * H); ctx.rotate(Math.PI);
    ctx.fillText(text, 0, 0); ctx.restore();
  };
  if (kind === 'police') {
    band(0.3, 0.7, '#0e1a2b');
    band(0.245, 0.26, '#c3141a'); band(0.74, 0.755, '#c3141a');
    band(0.26, 0.272, '#1d4fbf'); band(0.728, 0.74, '#1d4fbf');
    sideText('POLICE', 0.47, 0.235, 58, '#0e1a2b', '900');
    sideText('RIVERTON COUNTY', 0.47, 0.205, 20, '#0e1a2b');
    sideText(number || 'RC 14', 0.16, 0.225, 30, '#0e1a2b');
    ctx.fillStyle = '#0e1a2b'; ctx.font = '900 44px Arial'; ctx.textAlign = 'center';
    ctx.save(); ctx.translate(0.82 * W, H - 8); ctx.rotate(-Math.PI / 2); ctx.restore();
  } else if (kind === 'taxi') {
    for (let k = 0; k < 64; k++) { ctx.fillStyle = k % 2 ? '#111' : '#f2f2f2'; ctx.fillRect(k * 16, (1 - 0.262) * H, 16, 8); ctx.fillRect(k * 16, (1 - 0.262) * H + 8, 16, 8); }
    for (let k = 0; k < 64; k++) { ctx.fillStyle = (k + 1) % 2 ? '#111' : '#f2f2f2'; ctx.fillRect(k * 16, (1 - 0.748) * H - 8, 16, 8); ctx.fillRect(k * 16, (1 - 0.748) * H, 16, 8); }
    sideText('TAXI', 0.5, 0.2, 54, '#111', '900');
    sideText('RIVERTON CAB CO.', 0.5, 0.17, 18, '#111');
  } else if (kind === 'unmarked') {
    // nothing
  }
  if (decal) {
    ctx.fillStyle = decalColor;
    if (decal === 'stripes') { ctx.fillRect(0, 0, W, H * 0.035); ctx.fillRect(0, H * 0.965, W, H * 0.035); ctx.fillRect(0, H * 0.02, W, 6); }
    if (decal === 'sideStripe') { band(0.22, 0.245, decalColor); band(0.755, 0.78, decalColor); }
    if (decal === 'number') { ctx.beginPath(); ctx.arc(0.5 * W, 0.28 * H, 42, 0, 7); ctx.arc(0.5 * W, 0.72 * H, 42, 0, 7); ctx.fillStyle = '#f2f2f2'; ctx.fill(); sideText(number || '27', 0.5, 0.22, 56, decalColor, '900'); }
    if (decal === 'split') { band(0.3, 0.7, decalColor); }
    if (decal === 'flames') {
      for (const [v0, flip] of [[0.28, 1], [0.72, -1]]) for (let k = 0; k < 7; k++) {
        ctx.beginPath(); const y = (1 - v0) * H; const x0 = W * 0.98;
        ctx.moveTo(x0, y - 20 * flip); ctx.quadraticCurveTo(W * (0.8 - k * 0.03), y + (k % 2 ? 26 : -18) * flip, W * (0.55 - k * 0.03), y + (k % 2 ? 6 : -10) * flip);
        ctx.quadraticCurveTo(W * 0.7, y + 12 * flip, x0, y + 24 * flip); ctx.fill();
      }
    }
    if (decal === 'checker') for (let k = 0; k < 40; k++) { ctx.fillStyle = k % 2 ? decalColor : '#f2f2f2'; ctx.fillRect(W * 0.3 + (k % 20) * 20, H * (k < 20 ? 0.24 : 0.72), 20, 20); }
    if (decal === 'rally') { band(0.2, 0.3, decalColor); band(0.7, 0.8, decalColor); sideText('RIVERTON RALLY', 0.45, 0.25, 30, '#f2f2f2', '900'); }
  }
  const t = toTex(c, { repeat: false });
  return t;
}

// Full-detail car: returns { group, parts, wheels[], materials, def }
export function createCarMesh(def, custom = {}) {
  if (def.boat) return createBoatMesh(def, custom);
  if (def.air) return createAircraftMesh(def, custom);
  if (Assets.has('car:' + def.id)) return createGltfCar(def, custom);
  const doorsOn = custom.doors !== false && hasDoors(def);
  const geo = carGeometry(def, doorsOn ? { ...custom, noFiller: true } : custom);
  const group = new THREE.Group();
  const livery = def.livery === 'police' || def.livery === 'taxi' ? def.livery : null;
  const base = custom.color || def.colors[0];
  const needsMap = livery || custom.decal;
  const map = needsMap ? liveryTexture(livery, base, custom.decal, custom.decalColor, custom.number) : null;
  const paint = makePaintMaterial({ color: map ? '#ffffff' : base, finish: custom.finish || 'metallic', map });
  const glass = makeGlassMaterial(custom.tint ?? 0.35);
  const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
  const chrome = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 1.0, envMapIntensity: 1.4 });
  const lights = makeLightsMaterial(false);
  const plateTex = makePlate(custom.plate || randomPlate());
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
  const mats = { paint, glass, trim, chrome, lights, plates: plateMat };
  const meshes = {};
  let split = null;
  if (doorsOn) {
    const key = def.id + '|' + (custom.spoiler || '') + (custom.bumper || '') + (custom.hood || '') + (custom.exhaust || '') + (custom.mirrorColor || '');
    if (!splitCache.has(key)) splitCache.set(key, splitPanels(def, geo));
    split = splitCache.get(key);
  }
  for (const k of ['paint', 'trim', 'chrome', 'lights', 'plates', 'glass']) {
    const src = split && split.body[k] ? split.body[k] : geo[k];
    if (!src) continue;
    const g = k === 'paint' && map ? fixGreenhouseUV(src) : src;
    const m = new THREE.Mesh(g, mats[k]);
    m.castShadow = k !== 'glass' && k !== 'plates';
    m.receiveShadow = k === 'paint';
    if (k === 'glass') m.renderOrder = 2;
    meshes[k] = m;
    group.add(m);
  }
  const panels = {};
  if (split) {
    const mk = (parts, hinge, name) => {
      const pivot = new THREE.Group(); pivot.position.set(hinge.x, hinge.y, hinge.z); pivot.name = name;
      for (const k of ['paint', 'glass', 'trim', 'chrome']) if (parts[k]) { const m = new THREE.Mesh(parts[k], mats[k]); m.castShadow = k === 'paint'; if (k === 'glass') m.renderOrder = 2; pivot.add(m); }
      if (parts.inner) pivot.add(new THREE.Mesh(parts.inner, mats.trim));
      group.add(pivot);
      return pivot;
    };
    panels.doorL = mk(split.doors[0], split.hinges.doors[0], 'doorL');
    panels.doorR = mk(split.doors[1], split.hinges.doors[1], 'doorR');
    if (split.hood.paint) panels.hood = mk(split.hood, split.hinges.hood, 'hood');
    if (split.trunk.paint) panels.trunk = mk(split.trunk, split.hinges.trunk, 'trunk');
    if (split.interior) group.add(new THREE.Mesh(split.interior, mats.trim));
  }
  // wheels
  const ws = buildWheel(custom.rims || def.rims, custom.tireProfile || (def.body.style === 'offroad' || def.body.style === 'pickup' ? 0.58 : def.body.style === 'sports' || def.body.style === 'supercar' ? 0.72 : 0.64));
  const rimMat = new THREE.MeshStandardMaterial({ color: custom.rimColor || (def.rims === 'steel' ? '#3a3c3f' : '#c9ccd0'), vertexColors: true, metalness: 0.85, roughness: 0.25 });
  const tireMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const wheels = [];
  const wr = def.body.wr * (custom.wheelScale || 1), ww = def.body.ww * (custom.wheelWidth || 1);
  for (const w of geo.wheels) {
    const pivot = new THREE.Group();
    pivot.position.set(w.x, wr, w.z);
    const spin = new THREE.Group();
    const t = new THREE.Mesh(ws.tire, tireMat), r = new THREE.Mesh(ws.rim, rimMat);
    t.castShadow = true;
    spin.add(t, r);
    spin.scale.set(ww, wr, wr);
    if (!w.left) spin.rotation.y = Math.PI;
    const holder = new THREE.Group();
    holder.add(spin);
    if (!w.left) { holder.rotation.y = 0; }
    pivot.add(holder);
    group.add(pivot);
    wheels.push({ ...w, pivot, spin, holder, r: wr });
  }
  return { group, meshes, panels, split, mats: { ...mats, rim: rimMat, tire: tireMat }, wheels, geo, def, map };
}

function fixGreenhouseUV(g) { return g; }

const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
export function randomPlate(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < 3; i++) s += LETTERS[Math.floor(rnd() * LETTERS.length)];
  s += ' ';
  for (let i = 0; i < 4; i++) s += Math.floor(rnd() * 10);
  return s;
}

// A car built from an external glTF model: nodes wheel_fl / wheel_fr / wheel_rl / wheel_rr spin and steer, materials named
// paint / body take the vehicle colour, glass / window become the tinted glass. Forward is +z, the origin sits on the ground.
function createGltfCar(def, custom = {}) {
  const { root, e } = Assets.clone('car:' + def.id);
  const b = def.body, group = new THREE.Group(), sc = e.scale ?? 1;
  root.scale.setScalar(sc); root.rotation.y = e.yaw ?? 0;
  group.add(root);
  const base = custom.color || def.colors[0];
  const paint = makePaintMaterial({ color: base, finish: custom.finish || 'metallic' });
  const glass = makeGlassMaterial(custom.tint ?? 0.35);
  const lights = makeLightsMaterial(false);
  const trim = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.6 });
  root.traverse((o) => {
    if (!o.isMesh) return;
    const n = String(o.material?.name || '').toLowerCase();
    if (n.includes('paint') || n.includes('body')) o.material = paint;
    else if (n.includes('glass') || n.includes('window')) { o.material = glass; o.renderOrder = 2; }
  });
  group.updateMatrixWorld(true);
  const wheels = [];
  for (const [nm, front, left] of [['wheel_fl', true, true], ['wheel_fr', true, false], ['wheel_rl', false, true], ['wheel_rr', false, false]]) {
    const node = root.getObjectByName(nm);
    if (!node) continue;
    const wp = new THREE.Vector3(); node.getWorldPosition(wp); group.worldToLocal(wp);
    const pivot = new THREE.Group(), holder = new THREE.Group();
    pivot.position.copy(wp); pivot.add(holder); holder.add(node);
    node.position.set(0, 0, 0); node.scale.multiplyScalar(sc);
    group.add(pivot);
    wheels.push({ x: wp.x, z: wp.z, front, left, pivot, spin: node, holder, r: wp.y });
  }
  const geo = { layout: { zF: b.L / 2 - b.ohF, zR: b.L / 2 - b.ohF - b.wb, track: b.trk, wr: b.wr, ww: b.ww }, dims: { L: b.L, W: b.W, H: b.H }, seat: e.seat || { x: 0.37, y: 0.5, z: -0.1 }, eye: e.eye, P: null, wheels: [] };
  const mats = { paint, glass, trim, chrome: trim, lights, plates: trim, rim: trim, tire: trim };
  return { group, meshes: {}, panels: null, split: null, mats, wheels, geo, def, map: null };
}
