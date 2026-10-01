import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { RNG, noise2 } from '../core/rng.js';
import { canvas, toTex } from './textures.js';

const C = (h) => new THREE.Color(h);
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// ---------- textures ----------
function leafPath(ctx, len, wid) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(wid * 0.55, len * 0.12, wid * 0.62, len * 0.62, 0, len);
  ctx.bezierCurveTo(-wid * 0.62, len * 0.62, -wid * 0.55, len * 0.12, 0, 0);
  ctx.closePath();
}
function drawLeaf(ctx, x, y, ang, len, wid, v, hue) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const r = 120 * v * hue[0], g = 158 * v * hue[1], b = 84 * v * hue[2];
  const gr = ctx.createLinearGradient(0, 0, 0, len);
  gr.addColorStop(0, `rgb(${Math.min(255, r * 0.78)},${Math.min(255, g * 0.8)},${Math.min(255, b * 0.8)})`);
  gr.addColorStop(1, `rgb(${Math.min(255, r * 1.12)},${Math.min(255, g * 1.12)},${Math.min(255, b * 1.05)})`);
  ctx.fillStyle = gr; leafPath(ctx, len, wid); ctx.fill();
  ctx.strokeStyle = `rgba(20,34,14,0.38)`; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.strokeStyle = `rgba(210,230,160,0.35)`; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, len * 0.9); ctx.stroke();
  ctx.restore();
}
function leafNoiseTex(seed = 5) {
  const S = 256, c = canvas(S), ctx = c.getContext('2d');
  const rnd = new RNG(seed);
  ctx.fillStyle = '#4c6a3a'; ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 1500; k++) {
    const x = rnd.f() * S, y = rnd.f() * S;
    for (const dx of [0, S, -S]) for (const dy of [0, S, -S]) if (x + dx > -24 && x + dx < S + 24 && y + dy > -24 && y + dy < S + 24) drawLeaf(ctx, x + dx, y + dy, rnd.f() * 6.283, 9 + rnd.f() * 8, 5 + rnd.f() * 3, rnd.range(0.55, 1.2), [1, 1, 1]);
  }
  return toTex(c);
}
function needleTex(seed = 6) {
  const S = 128, c = canvas(S), ctx = c.getContext('2d');
  const rnd = new RNG(seed);
  ctx.fillStyle = '#6f8068'; ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 1400; k++) {
    const x = rnd.f() * S, y = rnd.f() * S, v = rnd.range(0.6, 1.3);
    ctx.strokeStyle = `rgb(${Math.min(255, 96 * v)},${Math.min(255, 126 * v)},${Math.min(255, 92 * v)})`;
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y); const a = rnd.range(0.4, 2.6); ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); ctx.stroke();
  }
  return toTex(c);
}
function cardTex(seed = 7) {
  const S = 256, c = canvas(S), ctx = c.getContext('2d');
  const rnd = new RNG(seed);
  ctx.clearRect(0, 0, S, S);
  // twigs
  ctx.strokeStyle = 'rgba(58,44,30,0.9)'; ctx.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const a = rnd.range(0, 6.283), r = rnd.range(30, 80);
    ctx.lineWidth = rnd.range(1.4, 2.4); ctx.beginPath(); ctx.moveTo(S / 2, S / 2); ctx.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); ctx.stroke();
  }
  const leaves = [];
  for (let k = 0; k < 150; k++) {
    const a = rnd.f() * 6.283, r = Math.pow(rnd.f(), 0.7) * S * 0.42;
    leaves.push({ x: S / 2 + Math.cos(a) * r * (0.9 + rnd.f() * 0.2), y: S / 2 + Math.sin(a) * r, ang: a + rnd.range(-0.9, 0.9) + Math.PI / 2, len: 22 + rnd.f() * 18, wid: 11 + rnd.f() * 8, v: 0.62 + (1 - r / (S * 0.42)) * 0.28 + rnd.f() * 0.4 });
  }
  leaves.sort((p, q) => p.v - q.v);
  for (const l of leaves) drawLeaf(ctx, l.x, l.y, l.ang, l.len, l.wid, l.v, [1, 1, 1]);
  return toTex(c, { repeat: false });
}
// a spray of needles on a stem, drooping from the left; used as droopy branch cards on conifers
function branchTex(seed = 8) {
  const W = 256, H = 128, c = canvas(W, H), ctx = c.getContext('2d'), rnd = new RNG(seed);
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgb(66,50,36)'; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(2, H * 0.5); ctx.quadraticCurveTo(W * 0.5, H * 0.47, W - 6, H * 0.53); ctx.stroke();
  for (let k = 0; k < 520; k++) {
    const t = Math.pow(rnd.f(), 0.85), x = 8 + t * (W - 26), y = H * (0.5 + 0.03 * t);
    const side = rnd.f() < 0.5 ? -1 : 1, env = 0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.06)), len = (11 + rnd.f() * 26) * env, a = rnd.range(0.4, 1.25);
    const v = rnd.range(0.7, 1.25);
    ctx.strokeStyle = `rgb(${Math.min(255, 62 * v)},${Math.min(255, 98 * v)},${Math.min(255, 56 * v)})`; ctx.lineWidth = rnd.range(2.6, 3.8);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len * 0.7, y + side * Math.sin(a) * len); ctx.stroke();
  }
  return toTex(c, { repeat: false });
}
function frondTex() {
  const W = 64, H = 128, c = canvas(W, H), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#7a9a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2, H); ctx.lineTo(W / 2, 4); ctx.stroke();
  for (let k = 0; k < 26; k++) {
    const y = H - 6 - k * 4.6, len = 26 * Math.sin((k / 26) * Math.PI * 0.9 + 0.2) + 4;
    ctx.strokeStyle = `rgb(${90 + (k % 3) * 10},${140 + (k % 4) * 8},${60})`; ctx.lineWidth = 2.4;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(W / 2, y); ctx.lineTo(W / 2 + s * len, y + 10 + len * 0.15); ctx.stroke(); }
  }
  return toTex(c, { repeat: false });
}

// ---------- geometry helpers ----------
function blob(rx, ry, rz, detail, seed, rough = 0.22) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + rough * (noise2(x * 2.2 + seed, z * 2.2 + y * 1.7) * 0.7 + noise2(y * 4.1 - seed, x * 3.3) * 0.3);
    p.setXYZ(i, x * rx * n, y * ry * n, z * rz * n);
  }
  const nr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (rx * rx), y = p.getY(i) / (ry * ry), z = p.getZ(i) / (rz * rz), l = Math.hypot(x, y, z) || 1;
    nr[i * 3] = x / l; nr[i * 3 + 1] = y / l * 0.9 + 0.1; nr[i * 3 + 2] = z / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
  const uv = g.attributes.uv, rep = Math.max(3, Math.round(Math.max(rx, rz) * 2.0));
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep, uv.getY(i) * rep * 0.5);
  return g;
}

function shade(geo, base, cy, ry, low = 0.6, high = 1.18) {
  const p = geo.attributes.position, n = p.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - (cy - ry)) / (ry * 2)));
    const k = low + (high - low) * t;
    col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function cyl(b, x, y, z, r0, r1, h, seg, col, tiltX = 0, tiltZ = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, false);
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.uv.count * 2).fill(-5), 2));
  g.translate(0, h / 2, 0);
  b.addGeo(g, x, y, z, 0, 1, 1, 1, col, tiltX, tiltZ);
}

// ---------- kind definitions ----------
const BROAD = (o) => ({ type: 'broad', ...o });
const KINDS = {
  street: BROAD({ th: 3.6, tr: 0.2, crown: [[0, 6.6, 0, 2.9, 2.5, 2.9], [1.2, 5.6, 0.6, 1.8, 1.5, 1.8], [-1.1, 5.8, -0.7, 1.9, 1.6, 1.9]], leaf: '#78a850', bark: '#6f5a48', cards: 34, far: 3.4, h: 9.5 }),
  yard: BROAD({ th: 3.2, tr: 0.26, crown: [[0, 7.4, 0, 3.7, 3.1, 3.6], [1.9, 6.2, 0.8, 2.4, 2.0, 2.4], [-2.0, 6.4, -1.0, 2.5, 2.1, 2.5]], leaf: '#6b9a44', bark: '#5f4c3d', cards: 44, far: 4.4, h: 11 }),
  park: BROAD({ th: 3.8, tr: 0.4, crown: [[0, 9.0, 0, 5.6, 4.2, 5.4], [3.0, 7.2, 1.2, 3.2, 2.6, 3.2], [-3.2, 7.6, -1.4, 3.4, 2.8, 3.4], [0.6, 6.6, -3.0, 2.8, 2.3, 2.8]], leaf: '#5e9040', bark: '#54443a', cards: 56, far: 6.4, h: 14 }),
  oak: BROAD({ th: 4.6, tr: 0.5, crown: [[0, 10.5, 0, 6.6, 4.8, 6.4], [3.6, 8.4, 1.4, 3.8, 3.0, 3.8], [-3.8, 8.8, -1.6, 4.0, 3.2, 4.0], [0.8, 7.6, -3.6, 3.2, 2.6, 3.2]], leaf: '#587f3a', bark: '#4d3f34', cards: 60, far: 7.4, h: 16 }),
  birch: BROAD({ th: 5.6, tr: 0.14, crown: [[0, 8.2, 0, 2.3, 3.4, 2.3], [0.8, 6.4, 0.4, 1.6, 1.8, 1.6]], leaf: '#8fb857', bark: '#dcd8d0', cards: 26, far: 2.6, h: 11.5 }),
  conifer: { type: 'cone', H: 13, tiers: 7, rad: 3.1, tr: 0.28, leaf: '#3f6a45', bark: '#4a3a30', far: 3.4, h: 13.5 },
  pine: { type: 'cone', H: 19, tiers: 8, rad: 3.6, tr: 0.32, leaf: '#36613f', bark: '#4a3a30', far: 3.8, h: 19.5, bare: 5 },
  cactus: { type: 'cactus', H: 3.4, leaf: '#5f8a4a', bark: '#5f8a4a', far: 1.2, h: 4 },
  scrub: { type: 'low', crown: [[0, 0.65, 0, 1.2, 0.75, 1.15], [0.8, 0.45, 0.4, 0.8, 0.5, 0.8]], leaf: '#8a8650', bark: '#6b5a46', far: 1.3, h: 1.6 },
  palm: { type: 'palm', H: 8.5, tr: 0.22, leaf: '#6aa04a', bark: '#8a7358', far: 3.4, h: 9.5 },
};
export const TREE_KINDS = Object.keys(KINDS);

function buildKind(k, rng) {
  const d = KINDS[k];
  const solid = new GeoBuilder(), cards = new GeoBuilder(), mid = new GeoBuilder(), far = new GeoBuilder();
  const bark = C(d.bark).multiplyScalar(1.15), leaf = C(d.leaf).multiplyScalar(d.type === 'cone' ? 2.7 : 1.5);
  if (d.type === 'broad') {
    cyl(solid, 0, 0, 0, d.tr, d.tr * 0.55, d.th + 2.6, 7, bark);
    cyl(mid, 0, 0, 0, d.tr, d.tr * 0.55, d.th + 2.6, 5, bark);
    for (let b = 0; b < 3; b++) {
      const a = rng.f() * 6.28, L = d.th * rng.range(0.55, 0.9);
      cyl(solid, 0, d.th * rng.range(0.55, 0.9), 0, d.tr * 0.4, d.tr * 0.22, L, 5, bark, rng.range(0.5, 0.9) * Math.cos(a), rng.range(0.5, 0.9) * Math.sin(a));
    }
    let seed = rng.f() * 100;
    let top = 0;
    for (const [x, y, z, rx, ry, rz] of d.crown) {
      const g = shade(blob(rx, ry, rz, 2, seed++, 0.3), leaf, 0, ry, 0.5, 1.22).translate(x, y, z);
      solid.add(g, null, null);
      top = Math.max(top, y + ry);
    }
    // mid: one merged blob
    const cw = d.crown.reduce((m, c) => Math.max(m, Math.hypot(c[0], c[2]) + c[3]), 0), cy = d.crown.reduce((s, c) => s + c[1], 0) / d.crown.length, chh = d.crown.reduce((m, c) => Math.max(m, c[1] + c[4]), 0) - (cy - d.crown[0][4] * 0.6);
    mid.add(shade(blob(cw * 0.95, chh * 0.62, cw * 0.95, 1, seed++, 0.28), leaf, 0, chh * 0.62).translate(0, cy + chh * 0.05, 0), null, null);
    far.add(shade(blob(cw, chh * 0.62, cw, 0, seed++, 0.2), leaf, 0, chh * 0.62).translate(0, cy + chh * 0.05, 0), null, null);
    // leaf cards on blob surfaces
    for (let n = 0; n < d.cards * 2.3; n++) {
      const cr = d.crown[Math.floor(rng.f() * d.crown.length)];
      const th = rng.f() * 6.28, ph = Math.acos(rng.range(-0.55, 1));
      const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
      const R = rng.range(0.9, 1.13);
      const px = cr[0] + nx * cr[3] * R, py = cr[1] + ny * cr[4] * R, pz = cr[2] + nz * cr[5] * R;
      const s = rng.range(1.05, 1.9) * (d.crown[0][3] > 5 ? 1.25 : 1);
      const g = new THREE.PlaneGeometry(s, s);
      const dir = new THREE.Vector3(nx + rng.range(-0.5, 0.5), ny * 0.8 + rng.range(-0.35, 0.35), nz + rng.range(-0.5, 0.5)).normalize();
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const roll = rng.f() * 6.28;
      _m.compose(_p.set(px, py, pz), _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll)), _s.set(1, 1, 1));
      const shadeK = 0.7 + 0.55 * ((py - (cr[1] - cr[4])) / (cr[4] * 2 + 0.01));
      const col = leaf.clone().multiplyScalar(Math.min(1.25, shadeK) * rng.range(0.9, 1.1));
      cards.add(g, _m, col);
    }
  } else if (d.type === 'cone') {
    const H = d.H, tiers = d.tiers, bare = d.bare ?? 2.0;
    cyl(solid, 0, 0, 0, d.tr, d.tr * 0.25, H, 6, bark);
    cyl(mid, 0, 0, 0, d.tr, d.tr * 0.3, H * 0.6, 4, bark);
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1), y = bare + f * (H - bare - 1.2), r = d.rad * (1 - f * 0.86) + 0.35, h = (H - bare) / tiers * 2.3;
      const g = new THREE.ConeGeometry(r, h, 9, 1, false);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { if (p.getY(i) < 0) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.16 * Math.sin(a * 9 + t * 1.7); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
      g.computeVertexNormals();
      { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 2.2, uv.getY(i) * h * 0.9); }
      const shadeK = 0.72 + 0.4 * f;
      solid.addGeo(g, 0, y + h / 2, 0, t * 0.7, 1, 1, 1, leaf.clone().multiplyScalar(shadeK * 0.62));
      // droopy branch cards hang from the rim of the tier
      const nC = Math.round(20 + r * 5);
      for (let c = 0; c < nC; c++) {
        const a = (c / nC) * 6.283 + rng.f() * 0.6, rr = r * rng.range(0.5, 0.92), w = rng.range(2.0, 3.2) * (0.55 + 0.45 * (1 - f)), hh = w * 0.55, beta = rng.range(0.4, 0.8);
        const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(beta), sb = Math.sin(beta);
        const u = new THREE.Vector3(ca * cb, -sb, sa * cb), v = new THREE.Vector3(-sa, 0, ca), n = new THREE.Vector3().crossVectors(u, v);
        _m.makeBasis(u, v, n);
        _m.setPosition(ca * rr + u.x * w * 0.5, y + h * 0.18 + u.y * w * 0.5, sa * rr + u.z * w * 0.5);
        const pg = new THREE.PlaneGeometry(w, hh), nl = new THREE.Vector3(ca, 0.95, sa).normalize(), pn = pg.attributes.normal;
        for (let q = 0; q < pn.count; q++) pn.setXYZ(q, nl.dot(u), nl.dot(v), nl.dot(n));
        cards.add(pg, _m, leaf.clone().multiplyScalar(shadeK * rng.range(0.85, 1.12)));
      }
    }
    for (let t = 0; t < 4; t++) {
      const f = t / 3, y = bare + f * (H - bare - 1.4), r = (d.rad * (1 - f * 0.8) + 0.4) * 1.06, h = (H - bare) / 4 * 2.2;
      const g = new THREE.ConeGeometry(r, h, 6, 1, false);
      mid.addGeo(g, 0, y + h / 2, 0, t * 0.9, 1, 1, 1, leaf.clone().multiplyScalar((0.72 + 0.4 * f) * 0.85));
    }
    far.addGeo(new THREE.ConeGeometry(d.rad * 0.95, H - bare * 0.4, 6, 1, false), 0, bare * 0.4 + (H - bare * 0.4) / 2, 0, 0, 1, 1, 1, leaf.clone().multiplyScalar(0.85));
  } else if (d.type === 'low') {
    let seed = rng.f() * 100;
    for (const [x, y, z, rx, ry, rz] of d.crown) {
      solid.add(shade(blob(rx, ry, rz, 1, seed++, 0.3), leaf, 0, ry, 0.5, 1.2).translate(x, y, z), null, null);
      const lo = shade(blob(rx, ry, rz, 0, seed++, 0.25), leaf, 0, ry).translate(x, y, z);
      mid.add(lo, null, null); far.add(lo.clone(), null, null);
    }
  } else if (d.type === 'cactus') {
    const H = d.H, col = leaf.clone();
    cyl(solid, 0, 0, 0, 0.3, 0.26, H, 9, col);
    solid.addGeo(new THREE.SphereGeometry(0.27, 8, 6), 0, H, 0, 0, 1, 1, 1, col);
    for (const [s, hy, up] of [[1, 1.3, 1.1], [-1, 1.9, 0.8]]) {
      cyl(solid, s * 0.28, hy, 0, 0.17, 0.15, 0.7, 7, col, 0, -s * Math.PI / 2);
      cyl(solid, s * 0.95, hy - 0.1, 0, 0.16, 0.14, up, 7, col);
    }
    cyl(mid, 0, 0, 0, 0.3, 0.26, H, 5, col);
    cyl(mid, 0.75, 1.3, 0, 0.17, 0.14, 1.2, 4, col);
    cyl(mid, -0.75, 1.9, 0, 0.17, 0.14, 1.0, 4, col);
    cyl(far, 0, 0, 0, 0.5, 0.4, H, 4, col);
  } else if (d.type === 'palm') {
    const H = d.H, pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([Math.sin(t * 1.4) * 0.9 * t, t * H, 0]); }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const g = new THREE.CylinderGeometry(d.tr * (1 - (i + 1) / 8), d.tr * (1 - i / 8), L * 1.02, 6, 1, false);
      g.translate(0, L / 2, 0);
      const ang = Math.atan2(c[0] - a[0], c[1] - a[1]);
      solid.addGeo(g, a[0], a[1], 0, 0, 1, 1, 1, bark.clone().multiplyScalar(0.85 + (i % 2) * 0.15), 0, -ang);
      mid.addGeo(new THREE.CylinderGeometry(d.tr * (1 - (i + 1) / 8), d.tr * (1 - i / 8), L * 1.02, 4, 1, false), a[0], a[1] + L / 2, 0, 0, 1, 1, 1, bark, 0, -ang);
    }
    const top = pts[6];
    solid.addGeo(new THREE.SphereGeometry(0.32, 6, 5), top[0], top[1], 0, 0, 1, 1, 1, C('#5a6b3a'));
    for (let f = 0; f < 11; f++) {
      const a = (f / 11) * 6.28 + rng.f() * 0.3, len = rng.range(3.6, 4.6);
      const g = new THREE.PlaneGeometry(1.5, len, 1, 3);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) + len / 2; p.setZ(i, -Math.pow(y / len, 2) * len * 0.42); }
      g.translate(0, len / 2, 0);
      g.rotateX(-1.05); g.rotateY(a);
      const col = leaf.clone().multiplyScalar(rng.range(0.85, 1.15));
      cards.add(g, _m.compose(_p.set(top[0], top[1] - 0.1, 0), _q.identity(), _s.set(1, 1, 1)), col);
      mid.addGeo(new THREE.ConeGeometry(0.5, len * 0.9, 3, 1, false), top[0], top[1] - 0.3, 0, a, 1, 1, 1, leaf, 0, 1.25);
    }
    far.addGeo(new THREE.IcosahedronGeometry(2.6, 0), top[0], top[1] - 0.2, 0, 0, 1, 0.45, 1, leaf);
    far.addGeo(new THREE.CylinderGeometry(0.16, 0.24, H, 4), pts[3][0], H / 2, 0, 0, 1, 1, 1, bark);
  }
  const out = { def: d, solid: solid.build(), mid: mid.build(), far: far.build(), cards: cards.count ? cards.build() : null };
  out.tris = { solid: out.solid.index.count / 3, mid: out.mid.index.count / 3, far: out.far.index.count / 3 };
  return out;
}

// ---------- system ----------
const CELL = 64;
export const VEG_LOD = { hi: 40, mid: 160, far: 700 };

export class Vegetation {
  constructor(world) {
    this.world = world;
    this.M = world.M;
    this.group = new THREE.Group();
    this.kinds = {};
    this.kindIdx = {};
    this.trees = { x: [], y: [], z: [], rot: [], s: [], tint: [], k: [] };
    this.n = 0;
    this.cells = new Map();
    this.cellList = [];
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
    this.lodScale = 1;
    this.lastStamp = -1;
    this.colliderCells = new Set();
    this.lastColPos = new THREE.Vector3(1e9, 0, 1e9);
    const rng = new RNG('trees');
    this.tex = { leaf: leafNoiseTex(), needle: needleTex(), card: cardTex(), frond: frondTex(), branch: branchTex() };
    this.mats = {
      broad: new THREE.MeshStandardMaterial({ map: this.tex.leaf, vertexColors: true, roughness: 0.9 }),
      cone: new THREE.MeshStandardMaterial({ map: this.tex.needle, vertexColors: true, roughness: 0.95 }),
      cardBroad: new THREE.MeshStandardMaterial({ map: this.tex.card, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
      cardPalm: new THREE.MeshStandardMaterial({ map: this.tex.frond, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }),
      cardCone: new THREE.MeshStandardMaterial({ map: this.tex.branch, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92 }),
    };
    for (const m of Object.values(this.mats)) this.addWind(m);
    for (const k of TREE_KINDS) this.kinds[k] = buildKind(k, rng);
    TREE_KINDS.forEach((k, i) => (this.kindIdx[k] = i));
  }

  addWind(mat) {
    const U = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind;
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.1;').replace('#include <map_fragment>', `#ifdef USE_MAP
 vec4 sampledDiffuseColor = texture2D( map, vMapUv );
 if (vMapUv.x < -2.0) sampledDiffuseColor = vec4(1.0);
 diffuseColor *= sampledDiffuseColor;
#endif`);
      sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
        vec3 ip = vec3(0.0);
        #endif
        float hh = max(0.0, position.y - 2.2);
        float ph = ip.x * 0.11 + ip.z * 0.07 + position.x * 0.4;
        float sw = sin(uTime * (1.2 + uWind) + ph) * 0.5 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
        transformed.x += sw * uWind * 0.03 * hh;
        transformed.z += cos(uTime * 1.1 + ph) * uWind * 0.02 * hh;`);
    };
  }

  tree(x, y, z, kind, rng, scale = null) {
    const d = KINDS[kind] || KINDS.yard;
    const s = scale ?? rng.range(0.8, 1.2);
    const T = this.trees;
    T.x.push(x); T.y.push(y); T.z.push(z); T.rot.push(rng.f() * Math.PI * 2); T.s.push(s); T.tint.push(0.86 + rng.f() * 0.3); T.k.push(this.kindIdx[kind] ?? 0);
    return this.n++;
  }

  scatter(rng, x0, z0, x1, z1, count, kinds, test) {
    let placed = 0;
    for (let i = 0; i < count * 3 && placed < count; i++) {
      const x = rng.range(x0, x1), z = rng.range(z0, z1);
      if (test && !test(x, z)) continue;
      const y = this.world.terrain.height(x, z);
      this.tree(x, y - 0.1, z, rng.pick(kinds), rng, rng.range(0.75, 1.35));
      placed++;
    }
    return placed;
  }

  finalize() {
    const N = this.n, T = this.trees;
    this.mat = new Float32Array(N * 16);
    for (let i = 0; i < N; i++) {
      _q.setFromAxisAngle(UP, T.rot[i]);
      _m.compose(_p.set(T.x[i], T.y[i], T.z[i]), _q, _s.setScalar(T.s[i]));
      this.mat.set(_m.elements, i * 16);
    }
    for (let i = 0; i < N; i++) {
      const cx = Math.floor(T.x[i] / CELL), cz = Math.floor(T.z[i] / CELL), key = cx * 65536 + cz;
      let c = this.cells.get(key);
      if (!c) { c = { cx, cz, x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL, ids: [], ymax: 0, cols: null, r: CELL * 0.72 + 12 }; this.cells.set(key, c); this.cellList.push(c); }
      c.ids.push(i);
      c.ymax = Math.max(c.ymax, T.y[i]);
    }
    const caps = { hi: 260, mid: 2400, far: 9000 };
    this.meshes = {};
    for (const k of TREE_KINDS) {
      const K = this.kinds[k], d = K.def;
      const solidMat = d.type === 'cone' ? this.mats.cone : this.mats.broad;
      const mk = (geo, mat, cap, cast, tag) => {
        const im = new THREE.InstancedMesh(geo, mat, cap);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
        im.count = 0; im.frustumCulled = false; im.castShadow = cast; im.receiveShadow = true; im.visible = false; im.userData.veg = tag;
        this.group.add(im);
        return im;
      };
      this.meshes[k] = {
        solid: mk(K.solid, solidMat, caps.hi, true, 'solid'),
        cards: K.cards ? mk(K.cards, d.type === 'palm' ? this.mats.cardPalm : d.type === 'cone' ? this.mats.cardCone : this.mats.cardBroad, caps.hi, false, 'cards') : null,
        mid: mk(K.mid, solidMat, caps.mid, false, 'mid'),
        far: mk(K.far, solidMat, caps.far, false, 'far'),
        cnt: { hi: 0, mid: 0, far: 0 },
      };
    }
  }

  update(view, force = false) {
    if (!this.meshes) return;
    if (!force && view.moved < 1.2 && this.lastStamp >= 0) return;
    this.lastStamp = view.stamp;
    const HI = VEG_LOD.hi * this.lodScale, MID = VEG_LOD.mid * this.lodScale, FAR = VEG_LOD.far * this.lodScale;
    const HI2 = HI * HI, MID2 = MID * MID;
    const cx = view.pos.x, cz = view.pos.z, T = this.trees;
    for (const k of TREE_KINDS) { const c = this.meshes[k].cnt; c.hi = c.mid = c.far = 0; }
    const caps = { hi: 260, mid: 2400, far: 9000 };
    const KP = TREE_KINDS;
    for (const c of this.cellList) {
      const dx = c.x - cx, dz = c.z - cz, dc = Math.sqrt(dx * dx + dz * dz);
      if (dc - c.r > FAR) continue;
      if (dc > 90 && !view.sphere(c.x, c.ymax + 8, c.z, c.r + 10)) continue;
      const near = dc < c.r + HI + 20;
      const ids = c.ids;
      for (let j = 0; j < ids.length; j++) {
        const i = ids[j];
        const ddx = T.x[i] - cx, ddz = T.z[i] - cz;
        let d2 = ddx * ddx + ddz * ddz;
        if (d2 > 900) { const b = view.bias(T.x[i], T.y[i] + 6, T.z[i]); d2 /= b * b; }
        if (d2 > FAR * FAR) continue;
        const kn = KP[T.k[i]];
        const M = this.meshes[kn], cnt = M.cnt;
        const tint = T.tint[i];
        const src = i * 16;
        if (d2 < HI2 && near) {
          if (cnt.hi >= caps.hi) continue;
          const n = cnt.hi++;
          M.solid.instanceMatrix.array.set(this.mat.subarray(src, src + 16), n * 16);
          const hu = (tint - 0.86) / 0.3, ic = M.solid.instanceColor.array; ic[n * 3] = tint * (0.93 + 0.14 * hu); ic[n * 3 + 1] = tint; ic[n * 3 + 2] = tint * (0.98 - 0.14 * hu);
          if (M.cards) { M.cards.instanceMatrix.array.set(this.mat.subarray(src, src + 16), n * 16); const c2 = M.cards.instanceColor.array; c2[n * 3] = tint; c2[n * 3 + 1] = tint; c2[n * 3 + 2] = tint; }
        } else if (d2 < MID2) {
          if (cnt.mid >= caps.mid) continue;
          const n = cnt.mid++;
          M.mid.instanceMatrix.array.set(this.mat.subarray(src, src + 16), n * 16);
          const hu = (tint - 0.86) / 0.3, ic = M.mid.instanceColor.array; ic[n * 3] = tint * (0.93 + 0.14 * hu); ic[n * 3 + 1] = tint; ic[n * 3 + 2] = tint * (0.98 - 0.14 * hu);
        } else {
          if (cnt.far >= caps.far) continue;
          const n = cnt.far++;
          M.far.instanceMatrix.array.set(this.mat.subarray(src, src + 16), n * 16);
          const hu = (tint - 0.86) / 0.3, ic = M.far.instanceColor.array; ic[n * 3] = tint * 0.92 * (0.93 + 0.14 * hu); ic[n * 3 + 1] = tint * 0.92; ic[n * 3 + 2] = tint * 0.9 * (0.98 - 0.14 * hu);
        }
      }
    }
    let tris = 0;
    for (const k of TREE_KINDS) {
      const M = this.meshes[k], c = M.cnt, K = this.kinds[k];
      M.solid.count = c.hi; M.solid.visible = c.hi > 0; if (c.hi) { M.solid.instanceMatrix.needsUpdate = true; M.solid.instanceColor.needsUpdate = true; }
      if (M.cards) { M.cards.count = c.hi; M.cards.visible = c.hi > 0; if (c.hi) { M.cards.instanceMatrix.needsUpdate = true; M.cards.instanceColor.needsUpdate = true; } }
      M.mid.count = c.mid; M.mid.visible = c.mid > 0; if (c.mid) { M.mid.instanceMatrix.needsUpdate = true; M.mid.instanceColor.needsUpdate = true; }
      M.far.count = c.far; M.far.visible = c.far > 0; if (c.far) { M.far.instanceMatrix.needsUpdate = true; M.far.instanceColor.needsUpdate = true; }
      tris += c.hi * (K.tris.solid + (K.cards ? K.cards.index.count / 3 : 0)) + c.mid * K.tris.mid + c.far * K.tris.far;
    }
    this.lastTris = tris;
    this.updateColliders(view);
  }

  // trunk colliders are only active near the player
  updateColliders(view) {
    const p = view.pos;
    if (p.distanceToSquared(this.lastColPos) < 25 * 25) return;
    this.lastColPos.copy(p);
    const C = this.world.colliders, T = this.trees;
    const R = 120;
    for (const c of this.cellList) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < R + c.r) {
        if (!c.cols) {
          c.cols = [];
          for (const i of c.ids) {
            const d0 = KINDS[TREE_KINDS[T.k[i]]];
            c.cols.push(C.circle(T.x[i], T.z[i], (d0.tr || 0.25) * T.s[i] * 1.15, T.y[i] - 1, T.y[i] + (d0.h || 10) * T.s[i], { kind: 'tree', mat: 'wood' }));
          }
          c.active = true;
        } else if (!c.active) { for (const col of c.cols) C.restore(col); c.active = true; }
      } else if (c.active && d > R + 90 + c.r) {
        for (const col of c.cols) C.remove(col);
        c.active = false;
      }
    }
  }

  tick(dt, wind) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uWind.value += (wind - this.uniforms.uWind.value) * Math.min(1, dt);
  }
}
