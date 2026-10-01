import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { roadSignUV } from './textures.js';

const C = (h) => new THREE.Color(h);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

function cyl(b, x, y, z, r0, r1, h, seg, col, rx = 0, rz = 0, ry = 0) {
  b.addGeo(new THREE.CylinderGeometry(r1, r0, h, seg, 1, false), x, y + h / 2, z, ry, 1, 1, 1, col, rx, rz);
}
function box(b, x, y, z, sx, sy, sz, col, ry = 0) { b.box(x, y + sy / 2, z, sx, sy, sz, col, ry, 0, false); }
function sphere(b, x, y, z, r, col, sx = 1, sy = 1, sz = 1, seg = 10) { b.addGeo(new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)), x, y, z, 0, sx, sy, sz, col); }
function remapUV(geo, [u0, v0, u1, v1]) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return geo;
}
function signFace(b, key, x, y, z, w, h, ry = 0, shape = 'rect') {
  const g = shape === 'oct' ? new THREE.CircleGeometry(w / 2, 8, Math.PI / 8) : shape === 'tri' ? new THREE.CircleGeometry(w / 2, 3, -Math.PI / 2) : shape === 'diamond' ? new THREE.CircleGeometry(w / 2, 4, 0) : new THREE.PlaneGeometry(w, h);
  if (shape !== 'rect') {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
  }
  remapUV(g, roadSignUV(key));
  b.addGeo(g, x, y, z, ry);
  const back = g.clone(); back.rotateY(Math.PI);
  const ba = back.attributes.uv; for (let i = 0; i < ba.count; i++) ba.setXY(i, 0.005, 0.005);
  b.addGeo(back, x, y, z - 0.01 * Math.cos(ry), ry);
}

const GREY = C('#6d7073'), DARK = C('#2b2d30'), BLACK = C('#161718'), GALV = C('#a4a8ab'), GREEN = C('#2f5d3a'), RED = C('#b3261e');

// ---------- prop definitions: each returns { parts: {mat: GeoBuilder}, col, h, break } ----------
const DEF = {
  lampCobra() {
    const m = new GeoBuilder(), g = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.14, 0.09, 9, 8, GALV);
    box(m, 0, 0, 0, 0.3, 0.5, 0.3, GALV);
    m.addGeo(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), 0, 8.95, 1.25, 0, 1, 1, 1, GALV, Math.PI / 2);
    box(m, 0, 8.85, 2.6, 0.42, 0.2, 0.9, GALV);
    box(g, 0, 8.8, 2.6, 0.32, 0.06, 0.7, null);
    return { parts: { metal: m, glow: g }, col: { r: 0.2 }, h: 9.2, light: { dz: 2.6, y: 8.8, r: 11 }, brk: { speed: 11, mass: 180 } };
  },
  lampDouble() {
    const m = new GeoBuilder(), g = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.16, 0.1, 11, 8, GALV);
    for (const s of [1, -1]) {
      m.addGeo(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), s * 1.15, 10.95, 0, 0, 1, 1, 1, GALV, 0, Math.PI / 2);
      box(m, s * 2.4, 10.85, 0, 0.9, 0.2, 0.42, GALV);
      box(g, s * 2.4, 10.8, 0, 0.7, 0.06, 0.32, null);
    }
    return { parts: { metal: m, glow: g }, col: { r: 0.22 }, h: 11.2, light: { dx: 2.4, both: true, y: 10.8, r: 13 } };
  },
  lampPost() {
    const m = new GeoBuilder(), g = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.08, 0.06, 4.6, 8, DARK);
    cyl(m, 0, 4.6, 0, 0.22, 0.12, 0.12, 8, DARK);
    cyl(g, 0, 4.72, 0, 0.18, 0.2, 0.42, 8, null);
    cyl(m, 0, 5.14, 0, 0.26, 0.05, 0.22, 8, DARK);
    return { parts: { metal: m, glow: g }, col: { r: 0.14 }, h: 5.4, light: { y: 4.9, r: 7 }, brk: { speed: 7, mass: 90 } };
  },
  lampHeritage() {
    const m = new GeoBuilder(), g = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.2, 0.16, 0.8, 10, BLACK);
    cyl(m, 0, 0.8, 0, 0.1, 0.07, 3.4, 8, BLACK);
    cyl(m, 0, 4.2, 0, 0.12, 0.24, 0.12, 8, BLACK);
    cyl(g, 0, 4.32, 0, 0.2, 0.26, 0.55, 6, null);
    cyl(m, 0, 4.87, 0, 0.3, 0.06, 0.3, 6, BLACK);
    sphere(m, 0, 5.22, 0, 0.06, BLACK);
    return { parts: { metal: m, glow: g }, col: { r: 0.2 }, h: 5.3, light: { y: 4.6, r: 7 }, brk: { speed: 8, mass: 120 } };
  },
  stopSign() {
    const m = new GeoBuilder(), s = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.035, 0.035, 2.5, 6, GALV);
    signFace(s, 'stop', 0, 2.3, 0.05, 0.76, 0.76, 0, 'oct');
    return { parts: { metal: m, sign: s }, col: { r: 0.08 }, h: 2.7, brk: { speed: 4, mass: 15 } };
  },
  signCurve() { return warnSign('curve'); },
  signSpeed50() { return speedSign('speed50'); },
  signSpeed40() { return speedSign('speed40'); },
  signSpeed30() { return speedSign('speed30'); },
  signSpeed60() { return speedSign('speed50'); },
  signSpeed80() { return speedSign('speed70'); },
  signSpeed110() { return speedSign('speed110'); },
  signBus() {
    const m = new GeoBuilder(), s = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.035, 0.035, 2.8, 6, GALV);
    signFace(s, 'busstop', 0, 2.5, 0.05, 0.5, 0.5);
    return { parts: { metal: m, sign: s }, col: { r: 0.08 }, h: 2.8, brk: { speed: 4, mass: 15 } };
  },
  signNoParking() {
    const m = new GeoBuilder(), s = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.035, 0.035, 2.6, 6, GALV);
    signFace(s, 'noparking', 0, 2.3, 0.05, 0.45, 0.6);
    return { parts: { metal: m, sign: s }, col: { r: 0.08 }, h: 2.6, brk: { speed: 4, mass: 15 } };
  },
  hydrant() {
    const m = new GeoBuilder();
    const c = C('#c9a227');
    cyl(m, 0, 0, 0, 0.16, 0.14, 0.6, 10, c);
    cyl(m, 0, 0.6, 0, 0.17, 0.17, 0.08, 10, c);
    sphere(m, 0, 0.72, 0, 0.13, c, 1, 0.8, 1);
    for (const s of [1, -1]) cyl(m, s * 0.18, 0.4, 0, 0.06, 0.06, 0.14, 8, c, 0, Math.PI / 2);
    return { parts: { paint: m }, col: { r: 0.22 }, h: 0.85, brk: { speed: 5, mass: 260, water: true } };
  },
  trashCity() {
    const m = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.32, 0.34, 0.95, 12, GREEN);
    cyl(m, 0, 0.95, 0, 0.36, 0.3, 0.12, 12, GREEN);
    return { parts: { metal: m }, col: { r: 0.36 }, h: 1.05, brk: { speed: 2.5, mass: 35 } };
  },
  trashBin() {
    const m = new GeoBuilder();
    box(m, 0, 0.05, 0, 0.58, 0.95, 0.72, C('#ffffff'));
    box(m, 0, 1.0, -0.02, 0.62, 0.06, 0.78, C('#e0e0e0'));
    for (const s of [1, -1]) cyl(m, s * 0.24, 0.06, 0.32, 0.1, 0.1, 0.06, 10, BLACK, 0, Math.PI / 2);
    return { parts: { plastic: m }, col: { box: [0.32, 0.4] }, h: 1.06, brk: { speed: 2, mass: 20 }, tint: ['#2e4a2f', '#1f3550', '#4a4a4a', '#6b5a2b', '#2e4a2f'] };
  },
  bench() {
    const m = new GeoBuilder(), w = new GeoBuilder();
    for (const s of [0.8, -0.8]) { box(m, s, 0, 0.05, 0.08, 0.42, 0.5, BLACK); box(m, s, 0.42, -0.2, 0.08, 0.5, 0.08, BLACK); }
    for (let k = 0; k < 3; k++) box(w, 0, 0.42, -0.15 + k * 0.14, 1.8, 0.04, 0.11, C('#8a6a45'));
    for (let k = 0; k < 2; k++) box(w, 0, 0.6 + k * 0.16, -0.25, 1.8, 0.1, 0.03, C('#8a6a45'));
    return { parts: { metal: m, wood: w }, col: { box: [0.95, 0.3] }, h: 0.9, brk: { speed: 5, mass: 60 } };
  },
  busShelter() {
    const m = new GeoBuilder(), gl = new GeoBuilder(), w = new GeoBuilder();
    for (const [x, z] of [[-1.9, -0.7], [1.9, -0.7], [-1.9, 0.7], [1.9, 0.7]]) box(m, x, 0, z, 0.08, 2.5, 0.08, DARK);
    box(m, 0, 2.5, 0, 4.1, 0.12, 1.7, DARK);
    box(gl, 0, 0.1, -0.72, 3.7, 2.3, 0.03, null);
    box(gl, -1.9, 0.1, 0, 0.03, 2.3, 1.3, null);
    for (let k = 0; k < 4; k++) box(w, -1 + k * 0.6, 0.45, -0.45, 0.5, 0.05, 0.4, C('#9a9da0'));
    return { parts: { metal: m, glass: gl, metal2: w }, col: { box: [2.05, 0.85] }, h: 2.6, brk: null };
  },
  newsBox() {
    const m = new GeoBuilder();
    box(m, 0, 0, 0, 0.5, 0.95, 0.45, C('#1d4f91'));
    box(m, 0, 0.55, 0.23, 0.4, 0.28, 0.02, C('#dfe6ee'));
    return { parts: { paint: m }, col: { box: [0.25, 0.23] }, h: 0.95, brk: { speed: 2.5, mass: 30 }, tint: ['#1d4f91', '#b3261e', '#e0b12a', '#2f5d3a'] };
  },
  mailboxBlue() {
    const m = new GeoBuilder();
    box(m, 0, 0.1, 0, 0.5, 0.95, 0.55, C('#1d4f91'));
    m.addGeo(new THREE.CylinderGeometry(0.275, 0.275, 0.5, 12, 1, false, 0, Math.PI), 0, 1.05, 0, 0, 1, 1, 1, C('#1d4f91'), 0, Math.PI / 2);
    for (const [x, z] of [[-0.2, -0.22], [0.2, -0.22], [-0.2, 0.22], [0.2, 0.22]]) box(m, x, 0, z, 0.06, 0.1, 0.06, BLACK);
    return { parts: { paint: m }, col: { box: [0.25, 0.28] }, h: 1.3, brk: { speed: 4, mass: 90 } };
  },
  mailboxRes() {
    const m = new GeoBuilder(), w = new GeoBuilder();
    box(w, 0, 0, 0, 0.1, 1.05, 0.1, C('#e9e5dc'));
    box(m, 0, 1.05, 0, 0.22, 0.2, 0.48, C('#2d2f33'));
    return { parts: { paint: m, wood: w }, col: { r: 0.15 }, h: 1.3, brk: { speed: 2, mass: 10 }, tint: ['#2d2f33', '#8c2a1e', '#1d3f6b', '#e8e2d4'] };
  },
  parkingMeter() {
    const m = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.04, 0.04, 1.1, 6, GALV);
    box(m, 0, 1.1, 0, 0.2, 0.36, 0.16, C('#39424a'));
    box(m, 0, 1.25, 0.08, 0.14, 0.1, 0.01, C('#9fb5c0'));
    return { parts: { metal: m }, col: { r: 0.1 }, h: 1.46, brk: { speed: 2.5, mass: 25 } };
  },
  bollard() {
    const m = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.12, 0.12, 0.95, 10, C('#3a3c3f'));
    cyl(m, 0, 0.8, 0, 0.125, 0.125, 0.06, 10, C('#d8d8d8'));
    return { parts: { metal: m }, col: { r: 0.13 }, h: 0.95, brk: null };
  },
  planter() {
    const c = new GeoBuilder(), l = new GeoBuilder();
    box(c, 0, 0, 0, 1.3, 0.6, 1.3, C('#b8b2a6'));
    box(c, 0, 0.6, 0, 1.12, 0.05, 1.12, C('#4a3a2a'));
    sphere(l, 0, 0.95, 0, 0.62, C('#3f6a34'), 1, 0.7, 1, 8);
    return { parts: { concrete: c, paint: l }, col: { box: [0.65, 0.65] }, h: 1.4, brk: null };
  },
  utilityBox() {
    const m = new GeoBuilder();
    box(m, 0, 0, 0, 0.9, 1.3, 0.5, C('#6f7a6a'));
    box(m, 0, 1.3, 0, 0.95, 0.05, 0.55, C('#5d6758'));
    return { parts: { paint: m }, col: { box: [0.45, 0.25] }, h: 1.35, brk: null, tint: ['#6f7a6a', '#8d9296', '#556270'] };
  },
  bikeRack() {
    const m = new GeoBuilder();
    for (let k = 0; k < 4; k++) {
      const g = new THREE.TorusGeometry(0.38, 0.025, 6, 12, Math.PI);
      m.addGeo(g, -0.9 + k * 0.6, 0, 0, 0, 1, 1.5, 1, GALV);
    }
    return { parts: { metal: m }, col: { box: [1.2, 0.1] }, h: 0.6, brk: null };
  },
  vending() {
    const m = new GeoBuilder(), gl = new GeoBuilder();
    box(m, 0, 0, 0, 0.95, 1.85, 0.8, C('#c62828'));
    box(gl, -0.12, 0.7, 0.41, 0.6, 1.0, 0.01, null);
    return { parts: { paint: m, glow: gl }, col: { box: [0.48, 0.4] }, h: 1.85, brk: null, tint: ['#c62828', '#1565c0', '#2e7d32'] };
  },
  cone() {
    const m = new GeoBuilder();
    box(m, 0, 0, 0, 0.4, 0.03, 0.4, C('#e2531a'));
    m.addGeo(new THREE.ConeGeometry(0.15, 0.68, 10, 1, true), 0, 0.37, 0, 0, 1, 1, 1, C('#e2531a'));
    cyl(m, 0, 0.35, 0, 0.1, 0.085, 0.1, 10, C('#f0f0f0'));
    return { parts: { plastic: m }, col: { r: 0.17 }, h: 0.72, brk: { speed: 0.5, mass: 3 } };
  },
  barricade() {
    const m = new GeoBuilder(), w = new GeoBuilder();
    for (const s of [-0.7, 0.7]) { box(m, s, 0, 0.2, 0.05, 1.0, 0.05, GREY); box(m, s, 0, -0.2, 0.05, 1.0, 0.05, GREY); }
    for (let k = 0; k < 2; k++) box(w, 0, 0.55 + k * 0.3, 0, 1.6, 0.2, 0.03, k ? C('#f2f2f2') : C('#e2531a'));
    return { parts: { metal: m, plastic: w }, col: { box: [0.8, 0.25] }, h: 1.0, brk: { speed: 1, mass: 12 } };
  },
  waterBarrier() {
    const m = new GeoBuilder();
    box(m, 0, 0, 0, 1.8, 0.85, 0.5, C('#ffffff'));
    box(m, 0, 0.85, 0, 1.6, 0.12, 0.3, C('#ffffff'));
    return { parts: { plastic: m }, col: { box: [0.9, 0.25] }, h: 0.97, brk: { speed: 3, mass: 60 }, tint: ['#e2531a', '#f2f2f2', '#e2531a'] };
  },
  utilityPole() {
    const w = new GeoBuilder(), m = new GeoBuilder();
    cyl(w, 0, 0, 0, 0.16, 0.12, 10.5, 8, C('#6b5842'));
    box(w, 0, 9.4, 0, 2.4, 0.12, 0.12, C('#5f4d3a'));
    for (const s of [-1.05, -0.35, 0.35, 1.05]) cyl(m, s, 9.46, 0, 0.04, 0.04, 0.16, 6, C('#d8d8d8'));
    return { parts: { wood: w, metal: m }, col: { r: 0.2 }, h: 10.5, brk: null, wires: { y: 9.5, xs: [-1.05, -0.35, 0.35, 1.05] } };
  },
  transformer() {
    const m = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.3, 0.3, 0.9, 10, C('#8e969b'));
    return { parts: { metal: m }, col: null, h: 1 };
  },
  acUnit() {
    const m = new GeoBuilder();
    box(m, 0, 0, 0, 1.6, 1.1, 1.2, C('#b9bcbf'));
    cyl(m, 0, 1.1, 0, 0.45, 0.45, 0.05, 14, C('#5d6063'));
    return { parts: { metal: m }, col: null, h: 1.15 };
  },
  waterTank() {
    const w = new GeoBuilder(), m = new GeoBuilder();
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) box(m, x, 0, z, 0.15, 2.4, 0.15, C('#3a3c3f'));
    cyl(w, 0, 2.4, 0, 1.7, 1.7, 3.2, 14, C('#7a5e44'));
    w.addGeo(new THREE.ConeGeometry(1.8, 1.1, 14), 0, 6.15, 0, 0, 1, 1, 1, C('#4b4b4b'));
    return { parts: { wood: w, metal: m }, col: null, h: 6.7 };
  },
  roofVent() {
    const m = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.35, 0.35, 0.9, 10, C('#a6aaad'));
    cyl(m, 0, 0.9, 0, 0.55, 0.1, 0.35, 10, C('#8e9295'));
    return { parts: { metal: m }, col: null, h: 1.2 };
  },
  antenna() {
    const m = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.08, 0.03, 9, 6, C('#8e9295'));
    for (let k = 0; k < 3; k++) box(m, 0, 4 + k * 1.6, 0, 1.4 - k * 0.3, 0.05, 0.05, C('#8e9295'));
    return { parts: { metal: m }, col: null, h: 9 };
  },
  pallet() {
    const w = new GeoBuilder();
    for (let k = 0; k < 5; k++) box(w, -0.5 + k * 0.25, 0.1, 0, 0.12, 0.03, 1.2, C('#b08a5a'));
    for (const s of [-0.5, 0, 0.5]) box(w, s, 0, 0, 0.1, 0.1, 1.2, C('#9a7648'));
    return { parts: { wood: w }, col: { box: [0.6, 0.6] }, h: 0.13, brk: { speed: 1, mass: 15 } };
  },
  crate() {
    const w = new GeoBuilder();
    box(w, 0, 0, 0, 1.1, 1.0, 1.1, C('#a88458'));
    return { parts: { wood: w }, col: { box: [0.55, 0.55] }, h: 1.0, brk: { speed: 3, mass: 60 } };
  },
  container() {
    const m = new GeoBuilder();
    m.box(0, 1.3, 0, 2.44, 2.6, 12.2, C('#ffffff'), 0, 0, false);
    return { parts: { container: m }, col: { box: [1.22, 6.1] }, h: 2.6, tint: ['#b3261e', '#1d4f91', '#2e7d32', '#d98c1f', '#6d4c41', '#546e7a', '#8e2438', '#f2f2f2', '#0f6e6e'] };
  },
  forklift() {
    const m = new GeoBuilder(), d = new GeoBuilder();
    box(m, 0, 0.25, 0, 1.1, 1.0, 2.0, C('#e0a21a'));
    box(d, 0, 1.25, -0.2, 1.0, 0.08, 1.2, BLACK);
    for (const [x, z] of [[-0.45, 0.5], [0.45, 0.5], [-0.45, -0.3], [0.45, -0.3]]) box(d, x, 0.25, z - 0.2, 0.06, 1.0, 0.06, BLACK);
    box(d, 0, 0, 1.3, 1.0, 2.4, 0.12, DARK);
    for (const s of [-0.3, 0.3]) box(d, s, 0.05, 1.8, 0.12, 0.06, 1.0, DARK);
    for (const [x, z] of [[-0.55, 0.6], [0.55, 0.6], [-0.55, -0.6], [0.55, -0.6]]) cyl(d, x, 0.25, z, 0.25, 0.25, 0.2, 10, BLACK, 0, Math.PI / 2);
    return { parts: { paint: m, metal: d }, col: { box: [0.6, 1.3] }, h: 2.4, brk: null };
  },
  hayBale() {
    const w = new GeoBuilder();
    cyl(w, 0, 0.8, 0, 0.8, 0.8, 1.3, 14, C('#d6b86a'), 0, Math.PI / 2);
    return { parts: { wood: w }, col: { r: 0.8 }, h: 1.6, brk: null };
  },
  picnicTable() {
    const w = new GeoBuilder();
    box(w, 0, 0.72, 0, 1.8, 0.05, 0.8, C('#8a6a45'));
    for (const s of [-0.62, 0.62]) box(w, 0, 0.42, s, 1.8, 0.05, 0.28, C('#8a6a45'));
    for (const s of [-0.7, 0.7]) box(w, s, 0, 0, 0.08, 0.72, 1.4, C('#6a5035'));
    return { parts: { wood: w }, col: { box: [0.9, 0.7] }, h: 0.8, brk: null };
  },
  hoop() {
    const m = new GeoBuilder(), w = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.09, 0.09, 3.3, 8, GREY);
    box(w, 0, 3.0, 0.5, 1.8, 1.05, 0.05, C('#f2f2f2'));
    m.addGeo(new THREE.TorusGeometry(0.23, 0.02, 6, 16), 0, 3.05, 0.8, 0, 1, 1, 1, C('#e2531a'), Math.PI / 2);
    return { parts: { metal: m, plastic: w }, col: { r: 0.12 }, h: 4 };
  },
  flagpole() {
    const m = new GeoBuilder(), f = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.08, 0.05, 10, 8, C('#d9d9d9'));
    box(f, 0.8, 8.4, 0, 1.6, 1.0, 0.02, C('#1d4f91'));
    return { parts: { metal: m, paint: f }, col: { r: 0.1 }, h: 10 };
  },
  fuelPump() {
    const m = new GeoBuilder(), g = new GeoBuilder();
    box(m, 0, 0, 0, 1.1, 0.25, 0.6, C('#bdbdbd'));
    box(m, 0, 0.25, 0, 0.8, 1.6, 0.45, C('#f2f2f2'));
    box(m, 0, 1.85, 0, 0.85, 0.2, 0.5, C('#1e88e5'));
    box(g, 0, 1.2, 0.23, 0.5, 0.3, 0.01, null);
    return { parts: { paint: m, glow: g }, col: { box: [0.55, 0.3] }, h: 2.05, brk: null };
  },
  guardrail() {
    const m = new GeoBuilder();
    box(m, 0, 0.52, 0, 4.0, 0.3, 0.07, GALV);
    box(m, 0, 0.0, 0, 0.1, 0.62, 0.1, DARK);
    box(m, 1.95, 0.0, 0, 0.1, 0.62, 0.1, DARK);
    box(m, -1.95, 0.0, 0, 0.1, 0.62, 0.1, DARK);
    return { parts: { metal: m }, col: { box: [2.0, 0.15] }, h: 0.85 };
  },
  waterTower() {
    const w = new GeoBuilder(), m = new GeoBuilder();
    for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) box(m, x, 0, z, 0.3, 11, 0.3, C('#5b4636'));
    for (const y of [3.6, 7.2]) for (const s of [-2.2, 2.2]) { box(m, 0, y, s, 4.7, 0.14, 0.14, C('#5b4636')); box(m, s, y, 0, 0.14, 0.14, 4.7, C('#5b4636')); }
    cyl(w, 0, 11, 0, 3.2, 3.2, 4.6, 18, C('#8a6a4a'));
    for (const y of [11.6, 13.4, 15.0]) cyl(m, 0, y, 0, 3.3, 3.3, 0.14, 18, C('#3a3c3f'));
    w.addGeo(new THREE.ConeGeometry(3.5, 1.9, 18), 0, 16.55, 0, 0, 1, 1, 1, C('#6a5a4a'));
    return { parts: { wood: w, metal: m }, col: { r: 3.3 }, h: 17.6 };
  },
  windmill() {
    const m = new GeoBuilder();
    const leg = (x0, z0, x1, z1, h) => {
      const v = new THREE.Vector3(x1 - x0, h, z1 - z0), len = v.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
      m.add(new THREE.CylinderGeometry(0.06, 0.08, len, 4), new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, h / 2, (z0 + z1) / 2), q, new THREE.Vector3(1, 1, 1)), C('#8f979c'));
    };
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) leg(sx * 1.3, sz * 1.3, sx * 0.35, sz * 0.35, 10);
    for (const y of [3, 6, 8.5]) { const k = 1.3 - (y / 10) * 0.95; box(m, 0, y, k, k * 2, 0.06, 0.06, C('#8f979c')); box(m, 0, y, -k, k * 2, 0.06, 0.06, C('#8f979c')); box(m, k, y, 0, 0.06, 0.06, k * 2, C('#8f979c')); box(m, -k, y, 0, 0.06, 0.06, k * 2, C('#8f979c')); }
    cyl(m, 0, 10, 0, 0.3, 0.3, 0.6, 8, C('#6a6f73'));
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; m.addGeo(new THREE.BoxGeometry(0.22, 1.9, 0.04), Math.sin(a) * 1.1, 10.6 + Math.cos(a) * 1.1, 0.7, 0, 1, 1, 1, C('#c9ccd0'), 0, -a); }
    box(m, 0, 10.35, -1.5, 0.05, 1.1, 1.9, C('#a8321f'));
    return { parts: { metal: m }, col: { r: 1.6 }, h: 12.6 };
  },
  skiPole() {
    const m = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.14, 0.1, 9.6, 6, GALV);
    box(m, 0, 9.3, 0, 2.6, 0.14, 0.18, GALV);
    for (const s of [-1.2, 1.2]) box(m, s, 9.0, 0, 0.12, 0.3, 0.25, DARK);
    return { parts: { metal: m }, col: { r: 0.2 }, h: 9.8 };
  },
  shrub() {
    const l = new GeoBuilder();
    sphere(l, 0, 0.5, 0, 0.75, C('#4b6f3a'), 1.1, 0.8, 1.1, 8);
    sphere(l, 0.4, 0.45, 0.2, 0.5, C('#557a40'), 1, 0.8, 1, 7);
    return { parts: { foliage: l }, col: null, h: 1.1 };
  },
  hedge() {
    const l = new GeoBuilder();
    l.box(0, 0.6, 0, 3, 1.2, 0.9, C('#44683a'), 0, 0, false);
    return { parts: { foliage: l }, col: { box: [1.5, 0.45] }, h: 1.2 };
  },
  rock() {
    const r = new GeoBuilder();
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.75 + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); }
    g.computeVertexNormals();
    r.addGeo(g, 0, 0.3, 0, 0, 1, 1, 1, C('#8a8580'));
    return { parts: { concrete: r }, col: { r: 0.9 }, h: 1.2 };
  },
  playground() {
    const m = new GeoBuilder(), p = new GeoBuilder();
    for (const [x, z] of [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]]) box(m, x, 0, z, 0.12, 2.6, 0.12, C('#2f6fb3'));
    box(p, 0, 1.3, 0, 3.2, 0.1, 2.2, C('#d9a21b'));
    box(p, 0, 2.6, 0, 3.4, 0.3, 2.4, C('#c0392b'));
    b3(m, p);
    return { parts: { metal: m, plastic: p }, col: { box: [1.8, 1.4] }, h: 2.9 };
  },
};
function b3(m, p) {
  const g = new THREE.BoxGeometry(0.8, 0.06, 3.2);
  p.addGeo(g, 2.2, 0.7, 0, 0, 1, 1, 1, C('#d9a21b'), 0.45, 0);
}
function warnSign(key) {
  const m = new GeoBuilder(), s = new GeoBuilder();
  cyl(m, 0, 0, 0, 0.035, 0.035, 2.6, 6, GALV);
  signFace(s, key, 0, 2.2, 0.05, 0.95, 0.95, 0, 'diamond');
  return { parts: { metal: m, sign: s }, col: { r: 0.08 }, h: 2.6, brk: { speed: 4, mass: 15 } };
}
function speedSign(key) {
  const m = new GeoBuilder(), s = new GeoBuilder();
  cyl(m, 0, 0, 0, 0.035, 0.035, 2.8, 6, GALV);
  signFace(s, key, 0, 2.3, 0.05, 0.6, 0.75);
  return { parts: { metal: m, sign: s }, col: { r: 0.08 }, h: 2.8, brk: { speed: 4, mass: 15 } };
}

// ---------- instanced system ----------
export class PropSystem {
  constructor(world) {
    this.world = world;
    this.M = world.M;
    this.types = new Map();
    this.group = new THREE.Group();
    this.poolMesh = null;
    this.pools = [];
    this.wires = [];
    this.dirty = true;
    this.lodScale = 1;
  }

  matFor(name) {
    const M = this.M;
    return {
      metal: M.metal, metal2: M.metal, paint: M.paint, plastic: M.plastic, wood: M.wood, glow: M.lampOff, sign: M.roadSigns,
      glass: M.glassLight, concrete: M.wallConcrete, container: M.container, foliage: M.paint,
    }[name];
  }

  type(name) {
    let t = this.types.get(name);
    if (t) return t;
    const d = DEF[name]();
    t = { name, def: d, inst: [], meshes: [], geos: {} };
    for (const [k, b] of Object.entries(d.parts)) t.geos[k] = b.build();
    this.types.set(name, t);
    return t;
  }

  place(name, x, y, z, rot = 0, scale = 1, opts = {}) {
    const t = this.type(name);
    const d = t.def;
    const inst = { t: name, x, y, z, rot, s: scale, color: null, hidden: false, id: t.inst.length };
    if (d.tint) inst.color = new THREE.Color(opts.tint || d.tint[Math.floor((opts.rnd ?? Math.random()) * d.tint.length)]);
    if (opts.color) inst.color = new THREE.Color(opts.color);
    t.inst.push(inst);
    if (d.col && !opts.noCollide) {
      const C = this.world.colliders;
      const o = { kind: 'prop', mat: 'metal', ref: inst, solid: !d.brk || d.brk.speed > 3 };
      if (d.col.r) inst.col = C.circle(x, z, d.col.r * scale, y - 0.5, y + d.h * scale, o);
      else if (d.col.box) inst.col = C.box(x, z, d.col.box[0] * scale, d.col.box[1] * scale, -rot, y - 0.5, y + d.h * scale, o);
    }
    if (d.light) {
      const L = d.light;
      const pos = [];
      if (L.both) pos.push([L.dx, 0], [-L.dx, 0]); else pos.push([L.dx || 0, L.dz || 0]);
      for (const [lx, lz] of pos) {
        const c = Math.cos(rot), s = Math.sin(rot);
        this.pools.push({ x: x + lx * c + lz * s, y: this.world.groundY(x + lx * c + lz * s, z - lx * s + lz * c, y + 1), z: z - lx * s + lz * c, r: L.r, hy: y + L.y, inst });
      }
    }
    if (d.wires) inst.wires = d.wires;
    if (this.final) { this.buildType(t); this.dirty = true; }
    return inst;
  }

  buildType(t) {
    const n = t.inst.length;
    if (!n) return;
    t.mat = new Float32Array(n * 16);
    t.inst.forEach((i, k) => {
      _q.setFromAxisAngle(_e.set(0, 1, 0), i.rot); _p.set(i.x, i.y, i.z); _s.setScalar(i.s);
      _m.compose(_p, _q, _s); t.mat.set(_m.elements, k * 16); i.idx = k;
    });
    const h = t.def.h;
    t.lim = h < 1.2 ? 75 : h < 3 ? 130 : h < 12 ? 240 : 420;
    t.cells = new Map(); t.cellList = [];
    for (const i of t.inst) {
      const cx = Math.floor(i.x / 48), cz = Math.floor(i.z / 48), key = cx * 65536 + cz;
      let c = t.cells.get(key);
      if (!c) { c = { x: (cx + 0.5) * 48, z: (cz + 0.5) * 48, ids: [], ymax: -1e9 }; t.cells.set(key, c); t.cellList.push(c); }
      c.ids.push(i.idx); c.ymax = Math.max(c.ymax, i.y + h * i.s);
    }
    const want = Math.min(this.final ? Math.max(n, 64) : n, h < 1.2 ? 500 : 900);
    if (t.meshes.length && t.cap >= want) return;
    for (const m of t.meshes) { this.group.remove(m); m.dispose(); }
    t.meshes = [];
    t.cap = want;
    for (const [k, geo] of Object.entries(t.geos)) {
      const mesh = new THREE.InstancedMesh(geo, this.matFor(k), want);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (t.def.tint) { mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(want * 3).fill(1), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.userData.part = k;
      t.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  finalize() {
    for (const t of this.types.values()) this.buildType(t);
    this.final = true;
    if (this.pools.length) {
      const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
      this.poolMesh = new THREE.InstancedMesh(g, this.M.lightPool, Math.min(this.pools.length, 260));
      this.poolMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.min(this.pools.length, 260) * 3).fill(1), 3);
      this.poolMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.poolMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.poolMesh.frustumCulled = false; this.poolMesh.count = 0; this.poolMesh.renderOrder = 2;
      this.group.add(this.poolMesh);
    }
    this.buildWires();
  }

  buildWires() {
    // connect consecutive utility poles tagged with a line id
    const pts = [];
    const byLine = new Map();
    for (const t of this.types.values()) for (const i of t.inst) if (i.wires && i.line != null) { if (!byLine.has(i.line)) byLine.set(i.line, []); byLine.get(i.line).push(i); }
    for (const list of byLine.values()) {
      for (let k = 0; k < list.length - 1; k++) {
        const a = list[k], b = list[k + 1];
        if (Math.hypot(a.x - b.x, a.z - b.z) > 60) continue;
        for (const wx of a.wires.xs) {
          const ca = Math.cos(a.rot), sa = Math.sin(a.rot), cb = Math.cos(b.rot), sb = Math.sin(b.rot);
          const A = [a.x + wx * ca, a.y + a.wires.y + 0.15, a.z - wx * sa], B = [b.x + wx * cb, b.y + b.wires.y + 0.15, b.z - wx * sb];
          const N = 8;
          for (let s = 0; s < N; s++) {
            const t0 = s / N, t1 = (s + 1) / N;
            const sag = (t) => -Math.sin(t * Math.PI) * 0.6;
            pts.push(A[0] + (B[0] - A[0]) * t0, A[1] + (B[1] - A[1]) * t0 + sag(t0), A[2] + (B[2] - A[2]) * t0);
            pts.push(A[0] + (B[0] - A[0]) * t1, A[1] + (B[1] - A[1]) * t1 + sag(t1), A[2] + (B[2] - A[2]) * t1);
          }
        }
      }
    }
    if (!pts.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8 }));
    lines.frustumCulled = true;
    this.group.add(lines);
  }

  update(view, force = false) {
    if (!force && !this.dirty && view.moved < 0.8) return;
    this.dirty = false;
    const cx = view.pos.x, cz = view.pos.z, lodS = this.lodScale;
    for (const t of this.types.values()) {
      if (!t.meshes.length) continue;
      const lim = t.lim * lodS, lim2 = lim * lim;
      const shadowLim2 = 110 * 110;
      let n = 0;
      const cap = t.cap;
      for (const c of t.cellList) {
        const dx = c.x - cx, dz = c.z - cz;
        const dc = Math.sqrt(dx * dx + dz * dz);
        if (dc - 42 > lim) continue;
        if (dc > 60 && !view.sphere(c.x, c.ymax * 0.5, c.z, 44 + t.def.h)) continue;
        for (let j = 0; j < c.ids.length; j++) {
          const id = c.ids[j], inst = t.inst[id];
          if (inst.hidden) continue;
          const ddx = inst.x - cx, ddz = inst.z - cz;
          let d2 = ddx * ddx + ddz * ddz;
          if (d2 > 1600) { const b = view.bias(inst.x, inst.y + 1, inst.z); d2 /= b * b; }
          if (d2 > lim2 || n >= cap) continue;
          const src = id * 16;
          for (const mesh of t.meshes) {
            mesh.instanceMatrix.array.set(t.mat.subarray(src, src + 16), n * 16);
            if (mesh.instanceColor && inst.color) { const ic = mesh.instanceColor.array; ic[n * 3] = inst.color.r; ic[n * 3 + 1] = inst.color.g; ic[n * 3 + 2] = inst.color.b; }
          }
          n++;
        }
      }
      for (const mesh of t.meshes) {
        mesh.count = n; mesh.visible = n > 0;
        if (n) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
      }
    }
    if (this.poolMesh) {
      let n = 0;
      const cap = this.poolMesh.instanceMatrix.count, R2 = 150 * 150;
      for (const p of this.pools) {
        if (p.inst.hidden) continue;
        const dx = p.x - cx, dz = p.z - cz;
        if (dx * dx + dz * dz > R2 || n >= cap) continue;
        if (!view.sphere(p.x, p.y, p.z, p.r)) continue;
        _p.set(p.x, p.y + 0.06, p.z); _q.identity(); _s.set(p.r * 2, 1, p.r * 2);
        _m.compose(_p, _q, _s);
        const ic = this.poolMesh.instanceColor.array, f = p.fade ?? 1; ic[n * 3] = ic[n * 3 + 1] = ic[n * 3 + 2] = f;
        this.poolMesh.setMatrixAt(n++, _m);
      }
      this.poolMesh.count = n;
      this.poolMesh.visible = n > 0;
      this.poolMesh.instanceMatrix.needsUpdate = true; this.poolMesh.instanceColor.needsUpdate = true;
    }
  }

  // detach an instance so it can become debris
  knock(inst) {
    if (inst.hidden) return null;
    inst.hidden = true;
    if (inst.col) this.world.colliders.remove(inst.col);
    this.dirty = true;
    const t = this.types.get(inst.t);
    return { geos: t.geos, mats: Object.keys(t.geos).map((k) => this.matFor(k)), def: t.def, inst };
  }

  restore(inst) {
    inst.hidden = false;
    if (inst.col) this.world.colliders.restore(inst.col);
    this.dirty = true;
  }

  lampsNear(x, z, r) {
    return this.pools.filter((p) => !p.inst.hidden && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);
  }
}

// ---------- traffic signal assemblies (static geometry + instanced lenses) ----------
export function buildSignals(world, list) {
  const b = new GeoBuilder(), s = new GeoBuilder();
  const lenses = [];
  for (const sg of list) {
    const { x, y, z, rx, rz, dx, dz } = sg;
    const col = new THREE.Color('#4b4f53'), yel = new THREE.Color('#2a2c2e');
    b.addGeo(new THREE.CylinderGeometry(0.13, 0.17, 6.6, 8), x, y + 3.3, z, 0, 1, 1, 1, col);
    const arm = Math.max(3, sg.arm);
    // arm points toward the lanes (-right)
    const ax = x - rx * arm / 2, az = z - rz * arm / 2;
    const ang = Math.atan2(-rx, -rz);
    b.addGeo(new THREE.CylinderGeometry(0.07, 0.1, arm, 6), ax, y + 6.3, az, ang, 1, 1, 1, col, Math.PI / 2);
    const face = Math.atan2(-dx, -dz);
    for (const d of sg.heads) {
      const hx = x - rx * d, hz = z - rz * d;
      b.box(hx, y + 5.55, hz, 0.36, 1.05, 0.3, yel, face, 0, false);
      b.box(hx, y + 5.55, hz - 0.0, 0.5, 1.2, 0.04, yel, face, 0, false);
      for (let k = 0; k < 3; k++) {
        const ly = y + 5.9 - k * 0.34;
        lenses.push({ x: hx + Math.sin(face) * 0.16, y: ly, z: hz + Math.cos(face) * 0.16, rot: face, node: sg.node, edge: sg.edge, k });
        b.box(hx + Math.sin(face) * 0.2, ly + 0.14, hz + Math.cos(face) * 0.2, 0.3, 0.03, 0.14, yel, face, 0, false);
      }
    }
    // pedestrian head on pole
    b.box(x, y + 2.6, z, 0.35, 0.35, 0.25, yel, face, 0, false);
    // street name blade
    s.push?.(0);
    void s;
  }
  const mesh = new THREE.Mesh(b.build(), world.M.metal);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
  const lg = new THREE.CircleGeometry(0.13, 12);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lensMesh = new THREE.InstancedMesh(lg, lensMat, Math.max(1, lenses.length));
  lensMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, lenses.length) * 3), 3);
  lenses.forEach((l, i) => {
    _p.set(l.x, l.y, l.z); _q.setFromAxisAngle(_e.set(0, 1, 0), l.rot); _s.setScalar(1);
    _m.compose(_p, _q, _s); lensMesh.setMatrixAt(i, _m);
  });
  lensMesh.count = lenses.length;
  return { mesh, lensMesh, lenses };
}

const LENS_ON = [new THREE.Color(3.2, 0.25, 0.15), new THREE.Color(3.0, 1.7, 0.1), new THREE.Color(0.2, 2.8, 1.0)];
const LENS_OFF = [new THREE.Color(0.16, 0.03, 0.02), new THREE.Color(0.16, 0.1, 0.01), new THREE.Color(0.02, 0.12, 0.06)];
export function updateSignalLenses(sig, roads, t) {
  const { lensMesh, lenses } = sig;
  for (let i = 0; i < lenses.length; i++) {
    const l = lenses[i];
    const st = roads.signal(roads.nodes[l.node], l.edge, t);
    const on = (st === 'R' && l.k === 0) || (st === 'Y' && l.k === 1) || (st === 'G' && l.k === 2);
    const c = on ? LENS_ON[l.k] : LENS_OFF[l.k];
    lensMesh.instanceColor.setXYZ(i, c.r, c.g, c.b);
  }
  lensMesh.instanceColor.needsUpdate = true;
}
