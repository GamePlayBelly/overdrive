import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

// Procedural anatomy for the characters: shaped skull with nose, lips and brows, hair volumes, tapered limbs, hands, shoes.
const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));

export const HEAD = { rx: 0.083, ry: 0.114, rz: 0.098 };

function surfaceZ(ux, uy) { return Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy)) * HEAD.rz; }
export const eyePos = (s) => ({ x: s * 0.38 * HEAD.rx, y: 0.06 * HEAD.ry, z: surfaceZ(0.38, 0.06) - 0.0035 });

export function headGeo(face, skin) {
  return memo(`head${face.jaw.toFixed(2)}${face.nose.toFixed(2)}${face.brow.toFixed(2)}${skin}`, () => {
    const g = new THREE.SphereGeometry(1, 48, 36), p = g.attributes.position, col = new Float32Array(p.count * 3);
    const sk = new THREE.Color(skin), lip = sk.clone().lerp(new THREE.Color('#8a2f35'), 0.62), shade = sk.clone().multiplyScalar(0.8), blush = sk.clone().lerp(new THREE.Color('#d9776e'), 0.22);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const ux = p.getX(i), uy = p.getY(i), uz = p.getZ(i);
      let X = ux * HEAD.rx, Y = uy * HEAD.ry, Z = uz * HEAD.rz;
      const low = smoothstep(0.1, -0.95, uy);
      X *= 1 - low * (0.22 - face.jaw * 0.1);
      Z *= 1 - low * 0.12;
      if (uz < 0) Z *= 1.06;
      if (uy > 0.2 && uz > 0) Z *= 1 - (uy - 0.2) * 0.1;
      const front = smoothstep(0.1, 0.85, uz);
      // chin and jaw line
      if (uz > 0 && uy < -0.55) { Z += gauss(ux, 0.28) * smoothstep(-0.55, -0.88, uy) * 0.008; Y -= gauss(ux, 0.3) * 0.004 * front; }
      // cheekbones
      X += Math.sign(ux) * gauss(Math.abs(ux) - 0.62, 0.17) * gauss(uy + 0.08, 0.2) * front * 0.0035;
      // brow ridge and eye sockets
      Z += gauss(uy - 0.2, 0.09) * gauss(ux, 0.55) * front * (0.003 + face.brow * 0.005);
      for (const s of [1, -1]) Z -= gauss(ux - s * 0.38, 0.11) * gauss(uy - 0.05, 0.095) * front * 0.0065;
      // nose: bridge, tip and wings
      const nx = gauss(ux, 0.075 + (1 - face.nose) * 0.02), tip = gauss(uy + 0.27, 0.06);
      Z += nx * smoothstep(0.1, -0.1, uy) * smoothstep(-0.34, 0.0, uy) * front * (0.005 + face.nose * 0.004);
      Z += nx * tip * front * (0.008 + face.nose * 0.006);
      Z += (gauss(ux - 0.12, 0.05) + gauss(ux + 0.12, 0.05)) * gauss(uy + 0.31, 0.05) * front * 0.0045;
      // lips
      const lipB = gauss(uy + 0.55, 0.045), lipT = gauss(uy + 0.5, 0.032), mouth = gauss(ux, 0.27);
      Z += (lipB * 0.0065 + lipT * 0.005) * mouth * front;
      Z -= gauss(uy + 0.52, 0.012) * mouth * front * 0.0022;
      p.setXYZ(i, X, Y, Z);
      c.copy(sk);
      const mouthMask = mouth * (gauss(uy + 0.53, 0.07)) * front;
      if (mouthMask > 0.05) c.lerp(lip, clamp(mouthMask * 1.4, 0, 0.95));
      const eyeMask = (gauss(ux - 0.38, 0.14) + gauss(ux + 0.38, 0.14)) * gauss(uy - 0.02, 0.13) * front;
      if (eyeMask > 0.02) c.lerp(shade, clamp(eyeMask * 0.35, 0, 0.35));
      const cheek = (gauss(ux - 0.6, 0.16) + gauss(ux + 0.6, 0.16)) * gauss(uy + 0.2, 0.15) * front;
      if (cheek > 0.02) c.lerp(blush, clamp(cheek * 0.5, 0, 0.5));
      const nostril = (gauss(ux - 0.07, 0.035) + gauss(ux + 0.07, 0.035)) * gauss(uy + 0.37, 0.03) * front;
      if (nostril > 0.05) c.lerp(shade, clamp(nostril * 0.8, 0, 0.7));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  });
}

// eyeball, iris, pupil and lids as a small group of geometries by role
export function eyeParts() {
  return memo('eye', () => ({
    ball: new THREE.SphereGeometry(0.0122, 20, 14),
    iris: new THREE.CircleGeometry(0.0072, 20),
    pupil: new THREE.CircleGeometry(0.0033, 14),
    glint: new THREE.SphereGeometry(0.0013, 6, 5),
    lidTop: new THREE.SphereGeometry(0.0136, 20, 8, 0, Math.PI * 2, 0, 1.32),
    lidBot: new THREE.SphereGeometry(0.0136, 20, 6, 0, Math.PI * 2, 2.38, 0.76),
  }));
}

export function earGeo(pointy = 0) {
  return memo('ear' + pointy, () => {
    if (pointy) { const g = new THREE.ConeGeometry(0.02, 0.1 * pointy, 8); g.translate(0, 0.05 * pointy, 0); g.scale(0.55, 1, 0.35); return g; }
    const g = new THREE.SphereGeometry(0.0235, 14, 10); g.scale(0.32, 1, 0.62); return g;
  });
}

// tapered limb segment hanging from y = 0 to y = -len with a gentle muscle bulge
export function limbGeo(r0, r1, len, bulge = 0.08, at = 0.3) {
  return memo(`limb${r0.toFixed(3)}${r1.toFixed(3)}${len.toFixed(3)}${bulge}${at}`, () => {
    const pole = (r, y, dir, k) => { const f = (k / 3) * Math.PI / 2; return new THREE.Vector2(Math.max(0.0001, r * Math.sin(f)), y + dir * r * 0.55 * Math.cos(f)); };
    const pts = [];
    for (let k = 0; k < 3; k++) pts.push(pole(r1, -len, -1, k));
    const n = 9;
    for (let i = n; i >= 0; i--) { const t = i / n; pts.push(new THREE.Vector2(lerp(r0, r1, t) * (1 + bulge * gauss(t - at, 0.25)), -t * len)); }
    for (let k = 2; k >= 0; k--) pts.push(pole(r0, 0, 1, k));
    return new THREE.LatheGeometry(pts, 16);
  });
}

export function handGeo(side = 1, fist = false) {
  return memo(`hand${side}${fist}`, () => {
    const parts = [];
    const palm = new THREE.SphereGeometry(1, 12, 8); palm.scale(0.034, 0.05, 0.017); palm.translate(0, -0.05, 0); parts.push(palm);
    for (let i = 0; i < 4; i++) {
      const len = [0.036, 0.042, 0.04, 0.032][i], f = new THREE.CapsuleGeometry(0.0078, len, 3, 6);
      f.translate(0, -len / 2 - 0.0078, 0); f.rotateX(fist ? 1.15 : 0.12 + i * 0.03); f.translate(-0.0225 + i * 0.015, -0.093, 0.004); parts.push(f);
    }
    const th = new THREE.CapsuleGeometry(0.0085, 0.034, 3, 6); th.translate(0, -0.02, 0); th.rotateZ(side * -0.7); th.rotateX(fist ? 0.9 : 0.35); th.translate(side * 0.03, -0.045, 0.007); parts.push(th);
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  });
}

export function shoeGeo(kind) {
  return memo('shoe' + kind, () => {
    const boots = kind === 'boots', parts = [];
    const upper = new THREE.SphereGeometry(1, 16, 12); upper.scale(0.046, boots ? 0.09 : 0.05, 0.13); upper.translate(0, boots ? 0.02 : -0.004, 0.045); parts.push(upper);
    const toe = new THREE.SphereGeometry(1, 12, 8); toe.scale(0.046, 0.034, 0.05); toe.translate(0, -0.026, 0.135); parts.push(toe);
    if (boots) { const shaft = new THREE.CylinderGeometry(0.052, 0.058, 0.11, 14); shaft.translate(0, 0.085, 0); parts.push(shaft); }
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  });
}

export function soleGeo() {
  return memo('sole', () => { const g = new THREE.SphereGeometry(1, 16, 6); g.scale(0.05, 0.013, 0.155); g.translate(0, -0.068, 0.05); return g; });
}

// ---------- hair ----------
function noisy(g, amp, freq = 38) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = Math.sin(x * freq + y * 11) * Math.sin(z * freq * 0.9 + x * 7) + 0.5 * Math.sin(y * freq * 1.3 + z * 5);
    const l = Math.hypot(x, y, z) || 1;
    p.setXYZ(i, x + (x / l) * n * amp, y + (y / l) * n * amp, z + (z / l) * n * amp);
  }
  g.computeVertexNormals();
  return g;
}

const capGeo = (rx, ry, rz, theta, amp = 0.0022) => { const g = new THREE.SphereGeometry(1, 40, 26, 0, Math.PI * 2, 0, theta); g.scale(rx, ry, rz); noisy(g, amp); return g; };
const place = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; };
const cone = (r, h, seg = 6) => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); return g; };
const lock = (len, r, bend = 0) => { const g = new THREE.CapsuleGeometry(r, len, 3, 7); g.translate(0, -len / 2, 0); if (bend) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - bend * (p.getY(i) / -len) ** 2); g.computeVertexNormals(); } return g; };

// all hair is modelled around the head centre (0, 0, 0); the caller places it
export function hairGeo(style) {
  return memo('hair' + style, () => {
    const R = HEAD, parts = [];
    const base = (theta = 1.72, s = 1.06) => place(capGeo(R.rx * s, R.ry * 1.04, R.rz * s, theta), 0, 0.006, -0.006, -0.3);
    switch (style) {
      case 'buzz': parts.push(place(capGeo(R.rx * 1.015, R.ry * 1.01, R.rz * 1.015, 1.62, 0.0008), 0, 0.004, -0.004, -0.34)); break;
      case 'short': parts.push(base(1.7)); for (const s of [1, -1]) parts.push(place(new THREE.BoxGeometry(0.01, 0.045, 0.03), s * R.rx * 0.98, -0.03, 0.01)); break;
      case 'slick': { parts.push(base(1.66, 1.04)); const g = capGeo(R.rx * 1.02, R.ry * 1.06, R.rz * 1.08, 1.2, 0.001); parts.push(place(g, 0, 0.018, -0.012, -0.5)); break; }
      case 'medium': parts.push(base(1.9, 1.09)); for (const s of [1, -1]) parts.push(place(lock(0.09, 0.03), s * R.rx * 0.92, -0.02, -0.02)); parts.push(place(lock(0.1, 0.05), 0, -0.02, -R.rz * 0.92)); break;
      case 'tousled': {
        parts.push(base(1.78, 1.08));
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, t = cone(0.014, 0.05 + 0.025 * Math.abs(Math.sin(i * 2.3)), 5); t.rotateX(0.5 * Math.cos(a)); t.rotateZ(-0.5 * Math.sin(a)); parts.push(place(t, Math.sin(a) * R.rx * 0.8, R.ry * (0.78 + 0.1 * Math.cos(i)), Math.cos(a) * R.rz * 0.8 - 0.006)); }
        for (let i = 0; i < 5; i++) { const t = cone(0.013, 0.055, 5); t.rotateX(Math.PI * 0.72); parts.push(place(t, -0.04 + i * 0.02, R.ry * 0.46, R.rz * 0.85)); }
        break;
      }
      case 'spiky': {
        parts.push(base(1.62, 1.04));
        for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2, r = i % 2 ? 0.8 : 0.45, t = cone(0.017, 0.085 + 0.05 * ((i * 7) % 3) / 2, 5); t.rotateX(0.55 * Math.cos(a) * r); t.rotateZ(-0.55 * Math.sin(a) * r); parts.push(place(t, Math.sin(a) * R.rx * r, R.ry * (0.85 - 0.25 * (r < 0.6 ? 0 : 1)) + 0.01, Math.cos(a) * R.rz * r - 0.006)); }
        for (let i = 0; i < 5; i++) { const t = cone(0.016, 0.06, 5); t.rotateX(Math.PI * 0.62 - i * 0.05); parts.push(place(t, -0.045 + i * 0.022, R.ry * 0.52, R.rz * 0.8)); }
        break;
      }
      case 'curly': { parts.push(base(1.7, 1.06)); for (let i = 0; i < 34; i++) { const a = i * 2.399, y = 1 - (i / 34) * 1.25, rr = Math.sqrt(Math.max(0, 1 - y * y)); const s = new THREE.SphereGeometry(0.02, 8, 6); parts.push(place(s, Math.cos(a) * rr * R.rx * 1.12, y * R.ry * 0.95 + 0.01, Math.sin(a) * rr * R.rz * 1.14 - 0.004)); } break; }
      case 'afro': { const g = new THREE.SphereGeometry(1, 36, 26, 0, Math.PI * 2, 0, 1.95); g.scale(0.15, 0.135, 0.15); noisy(g, 0.006, 22); parts.push(place(g, 0, 0.065, -0.012, -0.28)); break; }
      case 'bob': {
        parts.push(base(1.9, 1.1));
        for (const s of [1, -1]) parts.push(place(lock(0.1, 0.034, 0.01), s * R.rx * 1.02, -0.012, -0.004));
        parts.push(place(lock(0.1, 0.06, 0.02), 0, -0.012, -R.rz * 0.98));
        for (let i = 0; i < 7; i++) parts.push(place(lock(0.026, 0.016), -0.05 + i * 0.0165, R.ry * 0.56, R.rz * 0.9, 0.5));
        break;
      }
      case 'long': case 'wavy': {
        parts.push(base(1.95, 1.1));
        const w = style === 'wavy' ? 0.014 : 0.004;
        for (const s of [1, -1]) { const g = lock(0.34, 0.036, 0.02); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sin(p.getY(i) * 28) * w); parts.push(place(g, s * R.rx * 1.0, -0.01, -0.012)); }
        const back = new THREE.CylinderGeometry(R.rx * 1.1, R.rx * 0.95, 0.4, 20, 4, true, Math.PI * 0.35, Math.PI * 1.3); back.translate(0, -0.16, -0.012); parts.push(back);
        for (let i = 0; i < 8; i++) parts.push(place(lock(0.03, 0.016), -0.052 + i * 0.015, R.ry * 0.56, R.rz * 0.9, 0.5));
        break;
      }
      case 'ponytail': { parts.push(base(1.72, 1.07)); const t = lock(0.22, 0.03, 0.05); parts.push(place(t, 0, 0.03, -R.rz * 1.0, 0.45)); break; }
      case 'bun': { parts.push(base(1.72, 1.07)); parts.push(place(new THREE.SphereGeometry(0.044, 14, 10), 0, R.ry * 0.82, -R.rz * 0.72)); break; }
      case 'mohawk': { parts.push(place(capGeo(R.rx * 1.01, R.ry * 1.0, R.rz * 1.01, 1.55, 0.001), 0, 0.004, -0.004, -0.3)); for (let i = 0; i < 9; i++) { const t = cone(0.017, 0.09 - Math.abs(i - 4) * 0.007, 5); parts.push(place(t, 0, R.ry * 0.82 - Math.abs(i - 4) * 0.004, -0.07 + i * 0.019, -0.1 + i * 0.03)); } break; }
      default: return null;
    }
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }), false);
  });
}

// shell of a hood that frames the face
export function hoodGeo() {
  return memo('hood', () => {
    const g = new THREE.SphereGeometry(1, 36, 24, 0, Math.PI * 2, 0, 2.2); g.scale(0.108, 0.14, 0.125); g.translate(0, 0.0, -0.014);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); if (z > 0.03 && y < 0.07) p.setZ(i, z - (0.03 + 0.03 * Math.max(0, -y * 6)) * Math.min(1, (z - 0.03) * 12)); }
    g.computeVertexNormals();
    return g;
  });
}

export function brimGeo(r = 0.215, droop = 0.03) {
  return memo(`brim${r}${droop}`, () => {
    const g = new THREE.CylinderGeometry(r, r * 0.55, 0.012, 40, 3, true); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i)); p.setY(i, p.getY(i) - Math.max(0, d - r * 0.5) * droop * 6 + Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 5) * 0.003 * (d / r)); }
    g.computeVertexNormals();
    return g;
  });
}
