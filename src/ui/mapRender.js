import { DISTRICTS, BAY_X, WATER_LEVEL, MARLOW } from '../data/world.js';

// Pre-renders the county map to an offscreen canvas (1 px = SCALE m) for the minimap, world map and phone.
export const MAP = { x0: -3150, z0: -2550, x1: 3550, z1: 2750, scale: 0.7 };

export function renderMapCanvas(world) {
  const S = MAP.scale;
  const W = Math.round((MAP.x1 - MAP.x0) * S), H = Math.round((MAP.z1 - MAP.z0) * S);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const X = (x) => (x - MAP.x0) * S, Z = (z) => (z - MAP.z0) * S;
  // land with terrain shading (rendered at 1/3 resolution, upscaled)
  const q = 2, w3 = Math.ceil(W / q), h3 = Math.ceil(H / q);
  const lc = document.createElement('canvas'); lc.width = w3; lc.height = h3;
  const lx = lc.getContext('2d');
  const img = lx.createImageData(w3, h3), d = img.data;
  const T = world.terrain;
  for (let j = 0; j < h3; j++) for (let i = 0; i < w3; i++) {
    const x = MAP.x0 + (i * q) / S, z = MAP.z0 + (j * q) / S;
    const h = T.height(x, z);
    const k = (j * w3 + i) * 4;
    if (h < WATER_LEVEL + 0.4) { d[k] = 22; d[k + 1] = 44; d[k + 2] = 58; }
    else if ((z > 2270 && h < 0.8) || (x < -1500 && h < 1.4)) { d[k] = 96; d[k + 1] = 88; d[k + 2] = 68; }
    else {
      const e = Math.max(0, Math.min(1, h / 250));
      const hx = T.height(x + 4, z) - h;
      const shade = Math.max(-18, Math.min(18, -hx * 5));
      let base = z < -470 || x > 1010 || z > 495 ? [44, 58, 42] : [40, 44, 48];
      if (x > 1950) { const q2 = Math.min(1, (x - 1950) / 400); base = [44 + 66 * q2, 58 + 34 * q2, 42 + 6 * q2]; }
      let r0 = base[0] + e * 40 + shade, g0 = base[1] + e * 34 + shade, b0 = base[2] + e * 30 + shade;
      const sn = Math.max(0, Math.min(1, (h - 190) / 70)) * (x > 2100 ? 0 : 1);
      d[k] = r0 + (176 - r0) * sn; d[k + 1] = g0 + (184 - g0) * sn; d[k + 2] = b0 + (196 - b0) * sn;
    }
    d[k + 3] = 255;
  }
  lx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lc, 0, 0, W, H);
  // district tints
  for (const D of DISTRICTS) {
    if (!D.xs) continue;
    ctx.fillStyle = D.color + '26';
    ctx.fillRect(X(D.x0), Z(D.z0), (D.x1 - D.x0) * S, (D.z1 - D.z0) * S);
  }
  // blocks
  for (const B of world.blocks) {
    const c2 = B.curb;
    ctx.fillStyle = B.special === 'park' ? '#3f5a3a' : B.style === 'suburb' ? '#3c4a3e' : B.style === 'industrial' ? '#4a4844' : B.style === 'oldtown' ? '#4d4540' : '#474c55';
    ctx.fillRect(X(c2.x0), Z(c2.z0), (c2.x1 - c2.x0) * S, (c2.z1 - c2.z0) * S);
  }
  // buildings from colliders
  ctx.fillStyle = 'rgba(120,128,138,0.55)';
  for (const col of world.colliders.list) {
    if (col.kind !== 'building' || col.removed) continue;
    if (col.type === 'circle') { ctx.beginPath(); ctx.arc(X(col.x), Z(col.z), col.r * S, 0, 7); ctx.fill(); continue; }
    ctx.save(); ctx.translate(X(col.x), Z(col.z)); ctx.rotate(col.rot);
    ctx.fillRect(-col.hx * S, -col.hz * S, col.hx * 2 * S, col.hz * 2 * S);
    ctx.restore();
  }
  // harbor yard
  ctx.fillStyle = '#4a4c50';
  ctx.fillRect(X(BAY_X), Z(-268), (-882 - BAY_X) * S, (558) * S);
  // roads: casing then fill, by class
  const R = world.roads;
  const order = ['local', 'oldtown', 'industrial', 'rural', 'arterial', 'avenue', 'ramp', 'freeway'];
  const fill = { local: '#9aa0a8', oldtown: '#a09890', industrial: '#9a968e', rural: '#b8a878', arterial: '#d8dce2', avenue: '#e6d8a8', ramp: '#e8c070', freeway: '#f0b44c' };
  for (const pass of [0, 1]) for (const cls of order) for (const e of R.edges) {
    if (e.clsName !== cls) continue;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = pass ? fill[cls] : '#1d2024';
    ctx.lineWidth = Math.max(pass ? 1.6 : 3, e.halfW * 2 * S * (pass ? 0.8 : 1) + (pass ? 0 : 1.6));
    ctx.beginPath();
    e.pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z))));
    ctx.stroke();
  }
  return c;
}

export function worldToMap(x, z) { return [(x - MAP.x0) * MAP.scale, (z - MAP.z0) * MAP.scale]; }
export function mapToWorld(px, py) { return [px / MAP.scale + MAP.x0, py / MAP.scale + MAP.z0]; }

export const BLIP = {
  player: '#ffffff', mission: '#f2c12e', garage: '#e5383b', police: '#2f80ed', dealer: '#2fb36a', home: '#c77dff', race: '#ff7a1a', event: '#5fb3e8', collect: '#d4a72c', waypoint: '#ff4d6d', shop: '#8fd3ff', friend: '#7cf29c', rival: '#ff9f1c',
};
