import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Proportions (meters) for a 1.76 m adult; scaled by appearance.height
export const BONES = {
  hipY: 0.95, chestY: 0.3, neckY: 0.52, shoulderX: 0.19, shoulderY: 0.47, upper: 0.29, fore: 0.26, hipX: 0.095, thigh: 0.44, shin: 0.43,
};

export const DEFAULT_LOOK = {
  name: 'Driver', height: 1.78, build: 0.45, skin: '#c69272', eyes: '#4a3526',
  hair: { style: 'short', color: '#2b1e16' }, facial: 'stubble',
  top: { type: 'tshirt', color: '#e9e9e6' }, jacket: { type: 'bomber', color: '#2c3440' },
  pants: { type: 'jeans', color: '#34465e' }, shoes: { type: 'sneakers', color: '#f2f2f0' },
  hat: { type: 'none', color: '#222222' }, glasses: 'none', watch: 'steel', chain: 'none', bag: 'none', face: { jaw: 0.5, nose: 0.5, brow: 0.5 },
};

export { buildHuman } from './buildHuman.js';

export const REST = { hipY: 0, hipRot: 0, lean: 0, twist: 0, headX: 0, headY: 0, shLx: 0, shLz: 0.08, elL: -0.12, shRx: 0, shRz: -0.08, elR: -0.12, hpLx: 0, hpLz: 0, knL: 0.05, hpRx: 0, hpRz: 0, knR: 0.05, anL: 0, anR: 0 };

// pose generators; phase in radians, amt 0..1
export function poseFor(state, t, ph, amt = 1, out = { ...REST }) {
  Object.assign(out, REST);
  switch (state) {
    case 'idle': {
      const br = Math.sin(t * 1.6) * 0.012;
      out.hipY = br * 0.3; out.lean = br; out.shLx = br; out.shRx = br; out.headY = Math.sin(t * 0.37) * 0.15; break;
    }
    case 'walk': case 'run': case 'sprint': {
      const run = state === 'walk' ? 0 : state === 'run' ? 0.7 : 1;
      const s = Math.sin(ph), c = Math.cos(ph);
      const A = (0.42 + run * 0.28) * amt;
      out.hpLx = -s * A; out.hpRx = s * A;
      out.knL = 0.08 + Math.max(0, Math.sin(ph + 1.9)) * (0.7 + run * 0.9) * amt;
      out.knR = 0.08 + Math.max(0, Math.sin(ph + 1.9 + Math.PI)) * (0.7 + run * 0.9) * amt;
      out.shLx = s * (0.35 + run * 0.4) * amt; out.shRx = -s * (0.35 + run * 0.4) * amt;
      out.elL = -0.25 - run * 1.0 - Math.max(0, s) * 0.2; out.elR = -0.25 - run * 1.0 - Math.max(0, -s) * 0.2;
      out.hipY = (Math.abs(c) * 0.035 - 0.02) * (1 + run) * amt - run * 0.04;
      out.lean = 0.04 + run * 0.18; out.twist = s * 0.08 * amt;
      out.anL = Math.max(0, -s) * 0.3; out.anR = Math.max(0, s) * 0.3;
      break;
    }
    case 'jump': { const up = Math.max(0, Math.min(1, amt)); out.shLx = -1.3; out.shRx = -1.0; out.shLz = 0.55; out.shRz = -0.55; out.elL = -0.5; out.elR = -0.5; out.hpLx = -0.95; out.knL = 1.2; out.hpRx = 0.25; out.knR = 0.55; out.lean = 0.12 * up; out.hipY = 0.02; break; }
    case 'vault': { out.shLx = -1.5; out.shRx = -1.5; out.shLz = 0.35; out.shRz = -0.35; out.elL = -0.25; out.elR = -0.25; out.hpLx = -1.15; out.hpRx = -0.95; out.hpLz = 0.35; out.hpRz = -0.2; out.knL = 1.35; out.knR = 1.2; out.lean = 0.3; out.headX = -0.15; break; }
    case 'climb': { const s = Math.sin(ph); out.shLx = -2.7 + s * 0.35; out.shRx = -2.7 - s * 0.35; out.shLz = 0.2; out.shRz = -0.2; out.elL = -0.5 - Math.max(0, s) * 0.5; out.elR = -0.5 - Math.max(0, -s) * 0.5; out.hpLx = -0.9 + s * 0.35; out.hpRx = -0.9 - s * 0.35; out.knL = 1.2 + s * 0.2; out.knR = 1.2 - s * 0.2; out.lean = 0.08; out.headX = -0.3; break; }
    case 'hands': { out.shLx = -2.9; out.shRx = -2.9; out.shLz = 0.25; out.shRz = -0.25; out.elL = -0.3; out.elR = -0.3; out.headX = -0.05; break; }
    case 'cuffed': { out.shLx = 0.45; out.shRx = 0.45; out.shLz = -0.25; out.shRz = 0.25; out.elL = -0.6; out.elR = -0.6; out.lean = 0.12; out.headX = 0.15; break; }
    case 'sit': case 'drive': {
      out.hpLx = -1.45; out.hpRx = -1.45; out.knL = 1.45; out.knR = 1.45; out.hipY = -0.43;
      if (state === 'drive') { out.shLx = -1.05; out.shRx = -1.05; out.elL = -0.7; out.elR = -0.7; out.shLz = -0.12; out.shRz = 0.12; }
      else { out.shLx = -0.2; out.shRx = -0.2; out.elL = -0.9; out.elR = -0.9; }
      break;
    }
    case 'helm': { out.shLx = -0.85; out.shRx = -0.85; out.elL = -0.55; out.elR = -0.55; out.shLz = -0.12; out.shRz = 0.12; out.lean = 0.06; out.hipY = -0.03; out.knL = 0.1; out.knR = 0.1; out.headX = 0.02; break; }
    case 'ride': { out.hpLx = -1.0; out.hpRx = -1.0; out.hpLz = 0.35; out.hpRz = -0.35; out.knL = 1.15; out.knR = 1.15; out.hipY = -0.42; out.lean = 0.32; out.shLx = -1.3; out.shRx = -1.3; out.elL = -0.45; out.elR = -0.45; out.headX = -0.22; break; }
    case 'swim': {
      const s = Math.sin(ph), k = Math.sin(ph * 2);
      out.lean = 0.42; out.hipY = -0.08; out.headX = -0.38; out.headY = Math.sin(ph * 0.5) * 0.12;
      out.shLx = -1.9 + s * 1.1; out.shRx = -1.9 - s * 1.1; out.shLz = 0.22; out.shRz = -0.22;
      out.elL = -0.3 - Math.max(0, s) * 0.6; out.elR = -0.3 - Math.max(0, -s) * 0.6;
      out.hpLx = -0.22 + k * 0.4; out.hpRx = -0.22 - k * 0.4; out.knL = 0.35 + Math.max(0, Math.sin(ph * 2 + 1)) * 0.6; out.knR = 0.35 + Math.max(0, -Math.sin(ph * 2 + 1)) * 0.6;
      break;
    }
    case 'tread': {
      const s = Math.sin(t * 2.4);
      out.lean = 0.1; out.hipY = -0.05; out.shLx = -0.7 + s * 0.3; out.shRx = -0.7 - s * 0.3; out.shLz = 0.5; out.shRz = -0.5; out.elL = -1.0; out.elR = -1.0;
      out.hpLx = -0.3 + s * 0.25; out.hpRx = -0.3 - s * 0.25; out.knL = 0.6; out.knR = 0.6; out.headY = Math.sin(t * 0.6) * 0.2;
      break;
    }
    case 'phone': { out.shRx = -0.4; out.shRz = -0.5; out.elR = -2.4; out.headY = -0.15; out.headX = 0.05; break; }
    case 'punch': { const u = Math.min(1, t / 0.32), k = Math.sin(u * Math.PI); out.twist = -0.5 * k; out.lean = 0.12 * k; out.shRx = -1.55 * k; out.shRz = -0.1; out.elR = -0.2 - 0.2 * k; out.shLx = 0.3 * k; out.elL = -1.4; out.hpLx = -0.35 * k; out.hpRx = 0.35 * k; break; }
    case 'wave': { out.shRx = -0.3; out.shRz = -2.6; out.elR = -0.3 + Math.sin(t * 9) * 0.35; break; }
    case 'cheer': { out.shLx = -2.8 + Math.sin(t * 8) * 0.2; out.shRx = -2.8 + Math.sin(t * 8 + 1) * 0.2; out.hipY = Math.abs(Math.sin(t * 8)) * 0.08; break; }
    case 'dance': {
      const s = Math.sin(t * 7);
      out.hipY = Math.abs(s) * 0.05 - 0.03; out.twist = s * 0.3; out.shLx = -1 + s * 0.6; out.shRx = -1 - s * 0.6; out.elL = -1.5; out.elR = -1.5; out.knL = 0.3 + Math.max(0, s) * 0.3; out.knR = 0.3 + Math.max(0, -s) * 0.3; out.hpLx = -0.15; out.hpRx = -0.15; out.headY = s * 0.2;
      break;
    }
    case 'point': { out.shRx = -1.5; out.shRz = -0.1; out.elR = -0.05; break; }
    case 'shrug': { out.shLz = 0.5; out.shRz = -0.5; out.elL = -1.6; out.elR = -1.6; out.shLx = -0.3; out.shRx = -0.3; out.headX = -0.1; break; }
    case 'cower': { out.lean = 0.5; out.hipY = -0.25; out.knL = 1.0; out.knR = 1.0; out.hpLx = -0.8; out.hpRx = -0.8; out.shLx = -2.3; out.shRx = -2.3; out.elL = -2.1; out.elR = -2.1; out.headX = 0.4; break; }
    case 'down': { out.lean = 0; out.hipY = -0.8; break; }
    case 'lean': { out.lean = -0.05; out.shLx = 0.1; out.shRx = -0.2; out.elR = -1.2; out.hpLx = 0.1; out.hpRx = -0.15; out.knR = 0.3; break; }
    case 'salute': { out.shRx = -1.4; out.shRz = -0.9; out.elR = -2.2; break; }
    case 'clap': { const s = Math.sin(t * 14) * 0.15; out.shLx = -1.2; out.shRx = -1.2; out.shLz = -0.4 + s; out.shRz = 0.4 - s; out.elL = -1.2; out.elR = -1.2; break; }
  }
  return out;
}

export function applyPose(rig, p) {
  rig.hips.position.y = BONES.hipY + p.hipY;
  rig.hips.rotation.y = p.twist * 0.5;
  rig.spine.rotation.x = p.lean;
  rig.spine.rotation.y = -p.twist;
  rig.headG.rotation.x = p.headX - p.lean * 0.6;
  rig.headG.rotation.y = p.headY;
  rig.aL.sh.rotation.set(p.shLx, 0, p.shLz); rig.aL.el.rotation.x = p.elL;
  rig.aR.sh.rotation.set(p.shRx, 0, p.shRz); rig.aR.el.rotation.x = p.elR;
  rig.lL.hp.rotation.set(p.hpLx, 0, p.hpLz); rig.lL.kn.rotation.x = p.knL; rig.lL.an.rotation.x = p.anL - (p.hpLx + p.knL) * 0.25;
  rig.lR.hp.rotation.set(p.hpRx, 0, p.hpRz); rig.lR.kn.rotation.x = p.knR; rig.lR.an.rotation.x = p.anR - (p.hpRx + p.knR) * 0.25;
}

// blend helper
export function blendPose(a, b, t, out = {}) {
  for (const k in REST) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export function disposeHuman(rig) {
  rig.root.traverse((o) => { if (o.isMesh && o.material?.userData?.own) o.material.dispose(); });
}

// Bakes a posed rig into a handful of merged meshes (one per material): a cheap static copy for a driver seen through the windows.
export function bakeRig(rig, pose) {
  const saved = { ...rig.pose };
  applyPose(rig, pose);
  rig.root.position.set(0, 0, 0); rig.root.rotation.set(0, 0, 0);
  rig.root.updateMatrixWorld(true);
  const groups = new Map();
  const m = new THREE.Matrix4();
  rig.root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(m.copy(o.matrixWorld));
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.color && !o.material.vertexColors) g.deleteAttribute('color');
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    let a = groups.get(o.material);
    if (!a) groups.set(o.material, (a = []));
    a.push(g);
  });
  const out = new THREE.Group();
  for (const [mat, gs] of groups) {
    const g = mergeGeometries(gs, false);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = false;
    out.add(mesh);
  }
  applyPose(rig, saved);
  return out;
}
