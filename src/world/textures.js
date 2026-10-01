import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { BRANDS } from '../data/brands.js';

export let MAX_ANISO = 8;
export function setMaxAniso(v) { MAX_ANISO = v; }

export function canvas(w, h = w) {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function toTex(c, { repeat = true, srgb = true, aniso = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso ? MAX_ANISO : 1;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function tileNoise(w, h, cells, rnd, octaves = 4) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cw = cells << o, ch = Math.max(1, Math.round((cells * h) / w)) << o;
    const g = new Float32Array(cw * ch);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * ch, y0 = Math.floor(fy), ty = fy - y0, y1 = (y0 + 1) % ch;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * cw, x0 = Math.floor(fx), tx = fx - x0, x1 = (x0 + 1) % cw;
        const sx = tx * tx * (3 - 2 * tx);
        const a = g[y0 * cw + x0], b = g[y0 * cw + x1], c = g[y1 * cw + x0], d = g[y1 * cw + x1];
        out[y * w + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function heightToNormal(heights, w, h, strength = 2) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  const H = (x, y) => heights[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c, { srgb: false });
}

function pixelFill(w, h, fn) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  const o = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    fn(x, y, o);
    d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function makeAsphalt(seed = 11) {
  const S = 512, rnd = mulberry32(seed);
  const big = tileNoise(S, S, 4, rnd, 5), mid = tileNoise(S, S, 24, rnd, 3);
  const heights = new Float32Array(S * S);
  const c = pixelFill(S, S, (x, y, o) => {
    const i = y * S + x;
    let v = 70 + (big[i] - 0.5) * 22 + (mid[i] - 0.5) * 14 + (rnd() - 0.5) * 26;
    const sp = rnd();
    if (sp < 0.035) v += 30 + rnd() * 30;
    else if (sp < 0.07) v -= 18;
    heights[i] = sp < 0.035 ? 1 : rnd() * 0.4;
    o[0] = v; o[1] = v; o[2] = v * 1.03; return;
  });
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(20,20,22,0.55)';
  for (let k = 0; k < 8; k++) {
    ctx.lineWidth = 0.6 + rnd() * 1.0;
    let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 40 + rnd() * 60; s++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 4; y += Math.sin(a) * 4; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let k = 0; k < 7; k++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '30,30,32' : '95,95,98'},${0.12 + rnd() * 0.15})`;
    const w = 30 + rnd() * 100, h = 20 + rnd() * 80;
    ctx.fillRect(rnd() * S, rnd() * S, w, h);
  }
  return { map: toTex(c), normal: heightToNormal(heights, S, S, 1.0), size: 7 };
}

export function makeConcrete(seed = 3, panel = true, tint = [178, 176, 170]) {
  const S = 512, rnd = mulberry32(seed);
  const big = tileNoise(S, S, 3, rnd, 5);
  const heights = new Float32Array(S * S);
  const c = pixelFill(S, S, (x, y, o) => {
    const i = y * S + x;
    const n = (big[i] - 0.5) * 26 + (rnd() - 0.5) * 16;
    heights[i] = rnd() * 0.2;
    o[0] = tint[0] + n; o[1] = tint[1] + n; o[2] = tint[2] + n; return;
  });
  const ctx = c.getContext('2d');
  if (panel) {
    ctx.fillStyle = 'rgba(70,70,68,0.7)';
    for (const p of [0, 256]) { ctx.fillRect(p, 0, 3, S); ctx.fillRect(0, p, S, 3); }
    for (let y = 0; y < S; y++) for (const p of [0, 1, 2, 256, 257, 258]) { heights[y * S + p] = -1; heights[p * S + y] = -1; }
  }
  for (let k = 0; k < 10; k++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(60,58,50,0.18)'); g.addColorStop(1, 'rgba(60,58,50,0)');
    ctx.save(); ctx.translate(rnd() * S, rnd() * S); ctx.scale(20 + rnd() * 50, 20 + rnd() * 50);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill(); ctx.restore();
  }
  return { map: toTex(c), normal: heightToNormal(heights, S, S, 1.5), size: 3 };
}

export function makePavers(seed = 5) {
  const S = 512, rnd = mulberry32(seed);
  const c = canvas(S), ctx = c.getContext('2d');
  const heights = new Float32Array(S * S).fill(1);
  ctx.fillStyle = '#6c6660'; ctx.fillRect(0, 0, S, S);
  const bw = 64, bh = 32;
  for (let y = 0; y < S / bh; y++) for (let x = -1; x < S / bw + 1; x++) {
    const ox = (y % 2) * bw / 2;
    const r = 150 + rnd() * 40, g = 120 + rnd() * 30, b = 110 + rnd() * 25;
    const k = rnd() < 0.25 ? 0.75 : 1;
    ctx.fillStyle = `rgb(${r * k},${g * k},${b * k})`;
    ctx.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
  }
  const d = ctx.getImageData(0, 0, S, S).data;
  for (let i = 0; i < S * S; i++) heights[i] = d[i * 4] > 115 ? 1 : 0;
  addGrain(ctx, S, S, rnd, 18);
  return { map: toTex(c), normal: heightToNormal(heights, S, S, 1.2), size: 2.4 };
}

function addGrain(ctx, w, h, rnd, amp) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amp;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function makeGrass(seed = 7) {
  const S = 512, rnd = mulberry32(seed);
  const big = tileNoise(S, S, 3, rnd, 5), mid = tileNoise(S, S, 16, rnd, 2);
  const c = pixelFill(S, S, (x, y, o) => {
    const i = y * S + x;
    const n = big[i], m = mid[i], r = rnd();
    let R = 62 + n * 40 + r * 20, G = 92 + n * 38 + m * 20 + r * 28, B = 38 + n * 16 + r * 10;
    if (m > 0.72 && r < 0.4) { R += 40; G += 20; B += 10; }
    o[0] = R; o[1] = G; o[2] = B; return;
  });
  const ctx = c.getContext('2d');
  for (let k = 0; k < 2500; k++) {
    ctx.strokeStyle = `rgba(${40 + rnd() * 60},${80 + rnd() * 70},${30 + rnd() * 20},0.5)`;
    ctx.lineWidth = 1;
    const x = rnd() * S, y = rnd() * S;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6); ctx.stroke();
  }
  return { map: toTex(c), size: 5 };
}

export function makeDirt(seed = 9, gravel = false) {
  const S = 512, rnd = mulberry32(seed);
  const big = tileNoise(S, S, 4, rnd, 5);
  const heights = new Float32Array(S * S);
  const c = pixelFill(S, S, (x, y, o) => {
    const i = y * S + x, n = big[i], r = rnd();
    heights[i] = gravel ? r : n;
    if (gravel) { const v = 110 + n * 40 + (r - 0.5) * 70; o[0] = v; o[1] = v * 0.97; o[2] = v * 0.92; return; }
    o[0] = 110 + n * 50 + r * 18; o[1] = 92 + n * 40 + r * 14; o[2] = 68 + n * 30 + r * 10; return;
  });
  return { map: toTex(c), normal: heightToNormal(heights, S, S, gravel ? 2.5 : 3), size: gravel ? 3 : 6 };
}

export function makeSand(seed = 21) {
  const S = 512, rnd = mulberry32(seed);
  const big = tileNoise(S, S, 5, rnd, 4);
  const c = pixelFill(S, S, (x, y, o) => {
    const n = big[y * S + x], r = rnd();
    o[0] = 196 + n * 30 + r * 16; o[1] = 178 + n * 26 + r * 14; o[2] = 140 + n * 20 + r * 10; return;
  });
  return { map: toTex(c), size: 6 };
}

export function makeBrick(seed = 13) {
  const S = 512, rnd = mulberry32(seed);
  const c = canvas(S), ctx = c.getContext('2d');
  const heights = new Float32Array(S * S);
  ctx.fillStyle = '#c9c3b8'; ctx.fillRect(0, 0, S, S);
  const bw = 64, bh = 20, m = 3;
  const rows = Math.round(S / bh);
  const bhh = S / rows;
  for (let y = 0; y < rows; y++) for (let x = -1; x < S / bw + 1; x++) {
    const ox = (y % 2) * bw / 2;
    const v = 0.78 + rnd() * 0.3, dk = rnd() < 0.08 ? 0.7 : 1;
    ctx.fillStyle = `rgb(${235 * v * dk},${222 * v * dk},${212 * v * dk})`;
    ctx.fillRect(x * bw + ox + m / 2, y * bhh + m / 2, bw - m, bhh - m);
  }
  const d = ctx.getImageData(0, 0, S, S).data;
  for (let i = 0; i < S * S; i++) heights[i] = d[i * 4] < 205 && Math.abs(d[i * 4] - 201) < 3 ? 0 : 1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const yy = (y % bhh), row = Math.floor(y / bhh), xx = ((x - (row % 2) * bw / 2) % bw + bw) % bw;
    heights[y * S + x] = yy < m / 2 || yy > bhh - m / 2 || xx < m / 2 || xx > bw - m / 2 ? 0 : 1;
  }
  addGrain(ctx, S, S, rnd, 22);
  return { map: toTex(c), normal: heightToNormal(heights, S, S, 1.6), size: 3.2 };
}

export function makeStucco(seed = 15) {
  const S = 512, rnd = mulberry32(seed);
  const big = tileNoise(S, S, 4, rnd, 5);
  const c = pixelFill(S, S, (x, y, o) => {
    const n = big[y * S + x], r = rnd();
    const v = 214 + (n - 0.5) * 22 + (r - 0.5) * 16;
    o[0] = v; o[1] = v * 0.985; o[2] = v * 0.96; return;
  });
  return { map: toTex(c), size: 4 };
}

export function makeSiding(seed = 17) {
  const S = 512, rnd = mulberry32(seed);
  const c = canvas(S), ctx = c.getContext('2d');
  const heights = new Float32Array(S * S);
  const bh = 32;
  for (let y = 0; y < S; y++) {
    const t = (y % bh) / bh;
    const v = 238 - t * 26 + (t > 0.93 ? -60 : 0);
    ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(0, y, S, 1);
    for (let x = 0; x < S; x++) heights[y * S + x] = t;
  }
  addGrain(ctx, S, S, rnd, 10);
  return { map: toTex(c), normal: heightToNormal(heights, S, S, 4), size: 2.4 };
}

export function makeCorrugated(seed = 19) {
  const S = 512, rnd = mulberry32(seed);
  const c = canvas(S), ctx = c.getContext('2d');
  const heights = new Float32Array(S * S);
  const big = tileNoise(S, S, 3, rnd, 4);
  const img = ctx.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = (x % 32) / 32, h = Math.sin(t * Math.PI * 2);
    heights[y * S + x] = h;
    const i = (y * S + x) * 4, n = big[y * S + x];
    const v = 205 + h * 22 - n * 30 + (rnd() - 0.5) * 8;
    d[i] = v; d[i + 1] = v; d[i + 2] = v * 1.01; d[i + 3] = 255;
    if (n > 0.72) { d[i] -= 20; d[i + 1] -= 30; d[i + 2] -= 38; }
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTex(c), normal: heightToNormal(heights, S, S, 2.2), size: 3.2 };
}

export function makeShingles(seed = 23) {
  const S = 512, rnd = mulberry32(seed);
  const c = canvas(S), ctx = c.getContext('2d');
  const heights = new Float32Array(S * S);
  ctx.fillStyle = '#555'; ctx.fillRect(0, 0, S, S);
  const rh = 32, sw = 48;
  for (let r = 0; r < S / rh; r++) for (let k = -1; k < S / sw + 1; k++) {
    const ox = (r % 2) * sw / 2 + (rnd() - 0.5) * 6;
    const v = 150 + rnd() * 60;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(k * sw + ox + 1, r * rh, sw - 2, rh - 3);
    for (let y = r * rh; y < r * rh + rh; y++) for (let x = Math.max(0, Math.floor(k * sw + ox)); x < Math.min(S, k * sw + ox + sw); x++) heights[y * S + x] = (y - r * rh) / rh;
  }
  addGrain(ctx, S, S, rnd, 40);
  return { map: toTex(c), normal: heightToNormal(heights, S, S, 3), size: 3 };
}

export function makeRoofMembrane(seed = 25) {
  const S = 512, rnd = mulberry32(seed);
  const big = tileNoise(S, S, 3, rnd, 5);
  const c = pixelFill(S, S, (x, y, o) => {
    const n = big[y * S + x], r = rnd();
    const v = 150 + (n - 0.5) * 50 + (r - 0.5) * 30;
    o[0] = v; o[1] = v; o[2] = v * 0.98; return;
  });
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(90,90,90,0.35)';
  for (let k = 0; k < S; k += 128) ctx.fillRect(k, 0, 2, S);
  return { map: toTex(c), size: 8 };
}

// ---------- facade textures for towers (full facade in one tile) ----------
export function makeTowerFacade(kind, seed) {
  const W = 1024, H = 1024, rnd = mulberry32(seed);
  const c = canvas(W, H), ctx = c.getContext('2d');
  const e = canvas(W, H), ex = e.getContext('2d');
  const r = canvas(W, H), rx = r.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  const cfg = {
    glass: { bays: 8, floors: 8, bayW: 1.6, floorH: 3.9 },
    glassBand: { bays: 8, floors: 8, bayW: 1.8, floorH: 3.8 },
    concrete: { bays: 8, floors: 8, bayW: 2.4, floorH: 3.5 },
    apartment: { bays: 8, floors: 8, bayW: 2.8, floorH: 3.1 },
    brickTower: { bays: 8, floors: 8, bayW: 2.6, floorH: 3.4 },
  }[kind];
  const bw = W / cfg.bays, fh = H / cfg.floors;
  const litColor = () => {
    const t = rnd();
    return t < 0.6 ? `rgba(255,${200 + rnd() * 30},${140 + rnd() * 40},1)` : t < 0.85 ? `rgba(235,240,255,1)` : `rgba(255,236,200,1)`;
  };
  const glassGrad = (x, y, w, h, base) => {
    const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
    g.addColorStop(0, base[0]); g.addColorStop(0.55, base[1]); g.addColorStop(1, base[2]);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  };
  rx.fillStyle = '#fff'; rx.fillRect(0, 0, W, H);
  if (kind === 'glass' || kind === 'glassBand') {
    ctx.fillStyle = kind === 'glass' ? '#9aa3a8' : '#c9c7c0';
    ctx.fillRect(0, 0, W, H);
    for (let f = 0; f < cfg.floors; f++) {
      const spand = kind === 'glass' ? fh * 0.14 : fh * 0.34;
      for (let b = 0; b < cfg.bays; b++) {
        const x = b * bw + 3, y = f * fh + spand, w = bw - 6, h = fh - spand - 3;
        const t = 0.8 + rnd() * 0.25;
        glassGrad(x, y, w, h, [`rgb(${150 * t},${170 * t},${180 * t})`, `rgb(${70 * t},${86 * t},${98 * t})`, `rgb(${40 * t},${52 * t},${60 * t})`]);
        rx.fillStyle = '#1a1a1a'; rx.fillRect(x, y, w, h);
        if (rnd() < 0.35) {
          ex.fillStyle = litColor(); ex.globalAlpha = 0.5 + rnd() * 0.5; ex.fillRect(x, y, w, h);
          ex.globalAlpha = 1;
          if (rnd() < 0.5) { ex.fillStyle = 'rgba(0,0,0,0.45)'; ex.fillRect(x, y + h * 0.6, w, h * 0.4); }
        } else if (rnd() < 0.3) {
          ctx.fillStyle = 'rgba(200,200,190,0.25)'; ctx.fillRect(x, y, w, h * (0.2 + rnd() * 0.6));
        }
      }
      ctx.fillStyle = kind === 'glass' ? '#6f777c' : '#b8b5ad';
      ctx.fillRect(0, f * fh, W, spand);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, f * fh + spand - 3, W, 3);
    }
    ctx.fillStyle = kind === 'glass' ? '#50575c' : '#8f8c85';
    for (let b = 0; b <= cfg.bays; b++) ctx.fillRect(b * bw - 3, 0, 6, H);
  } else if (kind === 'concrete' || kind === 'apartment' || kind === 'brickTower') {
    const base = kind === 'concrete' ? '#bdb8ae' : kind === 'apartment' ? '#d8d2c6' : '#9a5a44';
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    addGrain(ctx, W, H, rnd, kind === 'brickTower' ? 40 : 16);
    if (kind === 'brickTower') {
      ctx.fillStyle = 'rgba(40,20,10,0.12)';
      for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 1);
    }
    for (let f = 0; f < cfg.floors; f++) for (let b = 0; b < cfg.bays; b++) {
      const wx = kind === 'concrete' ? bw * 0.12 : bw * 0.2, wy = fh * 0.22;
      const x = b * bw + wx, y = f * fh + wy, w = bw - wx * 2, h = fh - wy * 1.7;
      ctx.fillStyle = kind === 'brickTower' ? '#e8e2d6' : '#8a8680';
      ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
      const t = 0.8 + rnd() * 0.3;
      glassGrad(x, y, w, h, [`rgb(${120 * t},${135 * t},${145 * t})`, `rgb(${55 * t},${64 * t},${72 * t})`, `rgb(${35 * t},${40 * t},${46 * t})`]);
      rx.fillStyle = '#222'; rx.fillRect(x, y, w, h);
      if (kind !== 'concrete') { ctx.fillStyle = '#ddd'; ctx.fillRect(x + w / 2 - 2, y, 4, h); }
      if (rnd() < 0.4) {
        ctx.fillStyle = `rgba(${200 + rnd() * 55},${190 + rnd() * 50},${170 + rnd() * 40},0.55)`;
        ctx.fillRect(x, y, w, h * (0.3 + rnd() * 0.5));
      }
      if (rnd() < 0.3) { ex.fillStyle = litColor(); ex.globalAlpha = 0.45 + rnd() * 0.5; ex.fillRect(x, y, w, h); ex.globalAlpha = 1; }
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 5, y + h + 5, w + 10, 5);
      if (kind === 'apartment' && b % 2 === 0) {
        ctx.fillStyle = '#9a968e'; ctx.fillRect(x - 8, y + h - 4, w * 2 + bw * 0.4, 10);
      }
    }
  }
  const map = toTex(c), emissive = toTex(e), rough = toTex(r, { srgb: false });
  return { map, emissive, rough, tileW: cfg.bayW * cfg.bays, tileH: cfg.floorH * cfg.floors, ...cfg };
}

// ---------- window atlas for low-rise buildings (8x4 cells: col=style, row=state) ----------
export const WINDOW_STYLES = ['sash', 'casement', 'modern', 'shop', 'door', 'garage', 'loft', 'warehouse'];
export function makeWindowAtlas(seed = 31) {
  const S = 1024, cols = 8, rows = 4, cw = S / cols, ch = S / rows, rnd = mulberry32(seed);
  const c = canvas(S), ctx = c.getContext('2d');
  const e = canvas(S), ex = e.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x0 = col * cw, y0 = row * ch, style = WINDOW_STYLES[col];
    const lit = row === 1 || row === 2, curtain = row === 3 || row === 2;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, cw, ch); ctx.clip();
    const frame = style === 'modern' || style === 'shop' ? '#2e3034' : style === 'warehouse' ? '#6d7074' : '#f1efe9';
    ctx.fillStyle = frame; ctx.fillRect(x0, y0, cw, ch);
    const pad = style === 'shop' ? 6 : 10;
    const gx = x0 + pad, gy = y0 + pad, gw = cw - pad * 2, gh = ch - pad * 2;
    if (style === 'door') {
      ctx.fillStyle = ['#5b3a24', '#23364f', '#6b1f1f', '#2d4a33'][row];
      ctx.fillRect(gx, gy, gw, ch - pad);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(gx + 10, gy + 12, gw - 20, gh * 0.35); ctx.fillRect(gx + 10, gy + gh * 0.55, gw - 20, gh * 0.35);
      ctx.fillStyle = '#c9b370'; ctx.fillRect(gx + gw - 20, gy + gh * 0.5, 8, 8);
      if (lit) { ex.fillStyle = 'rgba(255,210,150,0.5)'; ex.fillRect(gx + 10, gy + 10, gw - 20, 24); }
    } else if (style === 'garage') {
      ctx.fillStyle = ['#e7e5df', '#cfcac0', '#8c8f93', '#6a4b36'][row];
      ctx.fillRect(gx, gy, gw, ch - pad);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let k = 1; k < 5; k++) ctx.fillRect(gx, gy + (gh / 4.5) * k, gw, 3);
    } else {
      const t = 0.85 + rnd() * 0.2;
      const g = ctx.createLinearGradient(gx, gy, gx + gw * 0.4, gy + gh);
      g.addColorStop(0, `rgb(${150 * t},${165 * t},${175 * t})`); g.addColorStop(0.5, `rgb(${60 * t},${70 * t},${80 * t})`); g.addColorStop(1, `rgb(${35 * t},${40 * t},${48 * t})`);
      ctx.fillStyle = g; ctx.fillRect(gx, gy, gw, gh);
      if (curtain && style !== 'shop' && style !== 'warehouse') {
        ctx.fillStyle = ['rgba(230,220,200,0.8)', 'rgba(210,190,170,0.8)', 'rgba(180,195,210,0.8)'][Math.floor(rnd() * 3)];
        ctx.fillRect(gx, gy, gw * 0.3, gh); ctx.fillRect(gx + gw * 0.7, gy, gw * 0.3, gh);
      }
      if (style === 'shop') {
        ctx.fillStyle = 'rgba(210,200,185,0.35)';
        for (let k = 0; k < 6; k++) ctx.fillRect(gx + rnd() * gw * 0.8, gy + gh * 0.45 + rnd() * gh * 0.4, 10 + rnd() * 20, 6 + rnd() * 20);
      }
      ctx.fillStyle = frame;
      if (style === 'sash') { ctx.fillRect(gx, gy + gh / 2 - 4, gw, 8); ctx.fillRect(gx + gw / 2 - 3, gy, 6, gh); }
      if (style === 'casement') { ctx.fillRect(gx + gw / 2 - 4, gy, 8, gh); ctx.fillRect(gx, gy + gh * 0.3, gw, 6); }
      if (style === 'loft') { for (let k = 1; k < 4; k++) ctx.fillRect(gx + (gw / 4) * k - 2, gy, 4, gh); for (let k = 1; k < 3; k++) ctx.fillRect(gx, gy + (gh / 3) * k - 2, gw, 4); }
      if (style === 'warehouse') { for (let k = 1; k < 6; k++) ctx.fillRect(gx + (gw / 6) * k - 2, gy, 4, gh); for (let k = 1; k < 3; k++) ctx.fillRect(gx, gy + (gh / 3) * k - 2, gw, 4); }
      if (style === 'modern') { ctx.fillRect(gx + gw * 0.62, gy, 5, gh); }
      if (lit) {
        const warm = row === 1;
        ex.fillStyle = warm ? 'rgb(255,205,140)' : 'rgb(235,238,250)';
        ex.globalAlpha = style === 'shop' ? 0.95 : 0.8;
        ex.fillRect(gx, gy, gw, gh);
        ex.globalAlpha = 1;
        if (curtain) { ex.fillStyle = 'rgba(120,80,40,0.8)'; ex.fillRect(gx, gy, gw * 0.3, gh); ex.fillRect(gx + gw * 0.7, gy, gw * 0.3, gh); }
        ex.fillStyle = frame === '#f1efe9' ? '#000' : '#000';
        if (style === 'sash') { ex.fillRect(gx, gy + gh / 2 - 4, gw, 8); ex.fillRect(gx + gw / 2 - 3, gy, 6, gh); }
        if (style === 'loft' || style === 'warehouse') { const n = style === 'loft' ? 4 : 6; for (let k = 1; k < n; k++) ex.fillRect(gx + (gw / n) * k - 2, gy, 4, gh); }
      }
    }
    ctx.restore();
  }
  return { map: toTex(c, { repeat: false }), emissive: toTex(e, { repeat: false }), cols, rows };
}

export function windowUV(style, state) {
  const col = WINDOW_STYLES.indexOf(style);
  const u0 = col / 8, u1 = (col + 1) / 8;
  const v1 = 1 - state / 4, v0 = 1 - (state + 1) / 4;
  return [u0 + 0.002, v0 + 0.002, u1 - 0.002, v1 - 0.002];
}

// ---------- storefront signs atlas ----------
export function makeSignAtlas() {
  const W = 1024, H = 1024, cols = 4, rows = 16;
  const c = canvas(W, H), ctx = c.getContext('2d');
  const e = canvas(W, H), ex = e.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  const cw = W / cols, ch = H / rows;
  BRANDS.forEach((b, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    ctx.fillStyle = b.bg; ctx.fillRect(x, y, cw, ch);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, cw, ch * 0.45);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + ch - 3, cw, 3);
    ctx.font = `${b.weight || 700} ${(b.size || 60) * 0.5}px ${b.font || 'Georgia, serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = b.fg;
    ctx.fillText(b.name, x + cw / 2, y + ch / 2 + 1, cw - 14);
    ex.font = ctx.font; ex.textAlign = 'center'; ex.textBaseline = 'middle';
    ex.fillStyle = b.fg; ex.globalAlpha = 0.85;
    ex.fillText(b.name, x + cw / 2, y + ch / 2 + 1, cw - 14);
    ex.globalAlpha = 1;
  });
  return { map: toTex(c, { repeat: false }), emissive: toTex(e, { repeat: false }), cols, rows };
}

export function signUV(i) {
  const cols = 4, rows = 16, col = i % cols, row = Math.floor(i / cols);
  return [col / cols, 1 - (row + 1) / rows, (col + 1) / cols, 1 - row / rows];
}

// ---------- traffic sign atlas ----------
export const ROAD_SIGNS = ['stop', 'yield', 'speed30', 'speed40', 'speed50', 'speed70', 'speed90', 'speed110', 'oneway', 'noparking', 'busstop', 'ped', 'parking', 'noentry', 'signalahead', 'curve'];
export function makeRoadSignAtlas() {
  const S = 1024, n = 4, cs = S / n;
  const c = canvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = '#777'; ctx.fillRect(0, 0, S, S);
  ROAD_SIGNS.forEach((k, i) => {
    const x = (i % n) * cs, y = Math.floor(i / n) * cs, cx = x + cs / 2, cy = y + cs / 2, R = cs * 0.46;
    ctx.save();
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(x, y, cs, cs);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (k === 'stop') {
      ctx.fillStyle = '#fff'; poly(ctx, cx, cy, R, 8, Math.PI / 8); ctx.fill();
      ctx.fillStyle = '#b3141b'; poly(ctx, cx, cy, R * 0.92, 8, Math.PI / 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${cs * 0.26}px Arial`; ctx.fillText('STOP', cx, cy + 4);
    } else if (k === 'yield') {
      ctx.fillStyle = '#b3141b'; tri(ctx, cx, cy, R, true); ctx.fill();
      ctx.fillStyle = '#fff'; tri(ctx, cx, cy - 8, R * 0.6, true); ctx.fill();
    } else if (k.startsWith('speed')) {
      ctx.fillStyle = '#fff'; ctx.fillRect(x + cs * 0.14, y + cs * 0.04, cs * 0.72, cs * 0.92);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.strokeRect(x + cs * 0.17, y + cs * 0.07, cs * 0.66, cs * 0.86);
      ctx.fillStyle = '#111'; ctx.font = `bold ${cs * 0.1}px Arial`;
      ctx.fillText('SPEED', cx, y + cs * 0.2); ctx.fillText('LIMIT', cx, y + cs * 0.32);
      ctx.font = `bold ${cs * 0.34}px Arial`; ctx.fillText(k.slice(5), cx, y + cs * 0.64);
      ctx.font = `bold ${cs * 0.07}px Arial`; ctx.fillText('KM/H', cx, y + cs * 0.86);
    } else if (k === 'oneway') {
      ctx.fillStyle = '#111'; ctx.fillRect(x + 6, cy - cs * 0.18, cs - 12, cs * 0.36);
      ctx.fillStyle = '#fff'; ctx.fillRect(x + 14, cy - cs * 0.13, cs - 28, cs * 0.26);
      ctx.fillStyle = '#111'; ctx.font = `bold ${cs * 0.12}px Arial`; ctx.fillText('ONE WAY', cx - 10, cy + 2);
    } else if (k === 'noparking') {
      ctx.fillStyle = '#fff'; ctx.fillRect(x + cs * 0.15, y + 6, cs * 0.7, cs - 12);
      ctx.strokeStyle = '#b3141b'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, 7); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = `bold ${cs * 0.3}px Arial`; ctx.fillText('P', cx, cy + 4);
      ctx.beginPath(); ctx.moveTo(cx - R * 0.4, cy - R * 0.4); ctx.lineTo(cx + R * 0.4, cy + R * 0.4); ctx.stroke();
    } else if (k === 'busstop') {
      ctx.fillStyle = '#1d4f91'; ctx.fillRect(x + 8, y + 8, cs - 16, cs - 16);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${cs * 0.16}px Arial`; ctx.fillText('BUS', cx, cy - 20);
      ctx.font = `bold ${cs * 0.09}px Arial`; ctx.fillText('RIVERTON TRANSIT', cx, cy + 36, cs - 30);
    } else if (k === 'ped') {
      ctx.fillStyle = '#e8c21b'; poly(ctx, cx, cy, R, 4, 0); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx, cy - 36, 12, 0, 7); ctx.fill();
      ctx.fillRect(cx - 8, cy - 22, 16, 40); ctx.fillRect(cx - 22, cy + 16, 12, 34); ctx.fillRect(cx + 10, cy + 16, 12, 34);
    } else if (k === 'parking') {
      ctx.fillStyle = '#1d4f91'; ctx.fillRect(x + 12, y + 12, cs - 24, cs - 24);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${cs * 0.55}px Arial`; ctx.fillText('P', cx, cy + 8);
    } else if (k === 'noentry') {
      ctx.fillStyle = '#b3141b'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - R * 0.7, cy - R * 0.16, R * 1.4, R * 0.32);
    } else if (k === 'signalahead' || k === 'curve') {
      ctx.fillStyle = '#e8c21b'; poly(ctx, cx, cy, R, 4, 0); ctx.fill();
      ctx.fillStyle = '#111';
      if (k === 'signalahead') { ctx.fillRect(cx - 14, cy - 40, 28, 80); for (const [dy, cc] of [[-26, '#c00'], [0, '#eb0'], [26, '#0a0']]) { ctx.fillStyle = cc; ctx.beginPath(); ctx.arc(cx, cy + dy, 9, 0, 7); ctx.fill(); } }
      else { ctx.lineWidth = 14; ctx.strokeStyle = '#111'; ctx.beginPath(); ctx.moveTo(cx - 20, cy + 50); ctx.quadraticCurveTo(cx - 20, cy - 20, cx + 30, cy - 30); ctx.stroke(); }
    }
    ctx.restore();
  });
  return { map: toTex(c, { repeat: false }), n };
}

export function roadSignUV(key) {
  const i = ROAD_SIGNS.indexOf(key), n = 4, col = i % n, row = Math.floor(i / n);
  return [col / n + 0.004, 1 - (row + 1) / n + 0.004, (col + 1) / n - 0.004, 1 - row / n - 0.004];
}

function poly(ctx, cx, cy, r, n, rot) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  ctx.closePath();
}
function tri(ctx, cx, cy, r, down) {
  ctx.beginPath();
  const s = down ? 1 : -1;
  ctx.moveTo(cx - r, cy - s * r * 0.6); ctx.lineTo(cx + r, cy - s * r * 0.6); ctx.lineTo(cx, cy + s * r * 0.9); ctx.closePath();
}

// ---------- text panel (street name / freeway gantry) ----------
export function textTexture(lines, { w = 512, h = 128, bg = '#1f6b3a', fg = '#fff', font = 'bold 56px Arial', border = true, sub } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  if (border) { ctx.strokeStyle = fg; ctx.lineWidth = Math.max(3, h * 0.03); ctx.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1); }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font;
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((l, i) => ctx.fillText(l, w / 2, h * ((i + 1) / (arr.length + 1)) + (sub ? -h * 0.08 : 0), w - 30));
  if (sub) { ctx.font = `bold ${Math.round(h * 0.16)}px Arial`; ctx.fillText(sub, w / 2, h * 0.84); }
  return toTex(c, { repeat: false });
}

export function makeBillboardAtlas() {
  const W = 2048, H = 1024, cols = 2, rows = 4;
  const c = canvas(W, H), ctx = c.getContext('2d');
  const ads = [
    { bg: ['#0f2a47', '#1b5e9a'], title: 'CASTELL BANK', sub: 'Home loans that move with you', accent: '#f2c14e' },
    { bg: ['#f5efe4', '#e2d5bf'], title: 'Brightside Coffee', sub: 'Fresh roast. Every morning.', accent: '#6b3e1f', dark: true },
    { bg: ['#1c1c1c', '#3a3a3a'], title: 'VANTOR RX7 SPORT', sub: 'Engineered for every road', accent: '#d7263d' },
    { bg: ['#2f6f4f', '#52a36f'], title: 'Parkline Grocers', sub: 'Local produce, fair prices', accent: '#fff' },
    { bg: ['#6a1b1b', '#b23a2c'], title: 'MESA BURGER', sub: 'Open late on Harbor Blvd', accent: '#ffd166' },
    { bg: ['#e8eef3', '#c3d3df'], title: 'Summit Insurance', sub: 'Drive safe. We have your back.', accent: '#1d4f91', dark: true },
    { bg: ['#23233a', '#40407a'], title: 'Riverton Radio 94.1', sub: 'The sound of the county', accent: '#ff9f1c' },
    { bg: ['#f3f1ea', '#dcd6c6'], title: 'Grand Meridian Hotel', sub: 'Downtown Riverton since 1928', accent: '#8a6d3b', dark: true },
  ];
  const cw = W / cols, ch = H / rows;
  ads.forEach((a, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
    g.addColorStop(0, a.bg[0]); g.addColorStop(1, a.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(x, y, cw, ch);
    ctx.fillStyle = a.accent; ctx.fillRect(x + 40, y + ch - 50, 180, 10);
    ctx.fillStyle = a.dark ? '#1a1a1a' : '#fff';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `800 ${Math.round(ch * 0.26)}px Arial`; ctx.fillText(a.title, x + 40, y + ch * 0.45, cw - 80);
    ctx.font = `500 ${Math.round(ch * 0.12)}px Arial`; ctx.fillText(a.sub, x + 40, y + ch * 0.66, cw - 80);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.arc(x + cw * 0.86, y + ch * 0.4, ch * 0.34, 0, 7); ctx.fill();
  });
  return { map: toTex(c, { repeat: false }), cols, rows, count: ads.length };
}

export function billboardUV(i) {
  const cols = 2, rows = 4, col = i % cols, row = Math.floor(i / cols);
  return [col / cols, 1 - (row + 1) / rows, (col + 1) / cols, 1 - row / rows];
}

// ---------- foliage (alpha leaf clusters) ----------
export function makeLeaves(seed = 41, conifer = false) {
  const S = 256, rnd = mulberry32(seed);
  const c = canvas(S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const n = conifer ? 420 : 260;
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * S * 0.46;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    const v = 0.65 + rnd() * 0.5;
    ctx.fillStyle = `rgb(${Math.min(255, 150 * v)},${Math.min(255, 190 * v)},${Math.min(255, 120 * v)})`;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * Math.PI * 2);
    ctx.beginPath();
    if (conifer) { ctx.fillRect(-1, -9, 2.2, 18); }
    else { ctx.ellipse(0, 0, 5 + rnd() * 4, 2.6 + rnd() * 2, 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  const t = toTex(c, { repeat: false });
  return t;
}

export function makeBark(seed = 43) {
  const S = 256, rnd = mulberry32(seed);
  const big = tileNoise(S, S, 8, rnd, 3);
  const c = pixelFill(S, S, (x, y, o) => {
    const n = big[y * S + x], stripe = Math.sin(x * 0.25 + n * 6) * 0.5 + 0.5;
    const v = 70 + stripe * 30 + n * 30 + rnd() * 10;
    o[0] = v; o[1] = v * 0.82; o[2] = v * 0.66; return;
  });
  return toTex(c);
}

// ---------- misc ----------
export function makeRadial(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', S = 128) {
  const c = canvas(S), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return toTex(c, { repeat: false, srgb: false });
}

export function makeLightPool() {
  const S = 128, c = canvas(S), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return toTex(c, { repeat: false, srgb: false });
}

export function makeHeadlightCone() {
  const W = 64, H = 256, c = canvas(W, H), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createLinearGradient(0, 0, W, 0);
  g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  return toTex(c, { repeat: false, srgb: false });
}

export function makeContainerTex(seed = 51) {
  const W = 512, H = 256, rnd = mulberry32(seed);
  const c = canvas(W, H), ctx = c.getContext('2d');
  for (let x = 0; x < W; x++) {
    const t = (x % 16) / 16, v = 215 + Math.sin(t * Math.PI * 2) * 25;
    ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(x, 0, 1, H);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, 8); ctx.fillRect(0, H - 8, W, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 34px Arial'; ctx.textAlign = 'left';
  ctx.fillText(['TRANSOCEAN', 'NORDLINE', 'KESTREL LOG.', 'BAYLINE'][Math.floor(rnd() * 4)], 30, 60);
  ctx.font = '18px monospace'; ctx.fillText(`RCSU ${Math.floor(100000 + rnd() * 899999)} 4`, 30, 90);
  addGrain(ctx, W, H, rnd, 20);
  return toTex(c);
}

export function makeParkingLot() {
  const S = 512, c = canvas(S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(235,235,230,0.9)';
  for (let k = 0; k <= 4; k++) ctx.fillRect((k * S) / 4 - 3, 0, 6, S * 0.42);
  for (let k = 0; k <= 4; k++) ctx.fillRect((k * S) / 4 - 3, S * 0.58, 6, S * 0.42);
  return toTex(c);
}

export function makeCloudNoise() {
  const S = 256, rnd = mulberry32(61);
  const n = tileNoise(S, S, 4, rnd, 6);
  const c = pixelFill(S, S, (x, y, o) => { const v = n[y * S + x] * 255; o[0] = v; o[1] = v; o[2] = v; return; });
  const t = toTex(c, { srgb: false });
  return t;
}

export function makeDirtMask() {
  const S = 256, rnd = mulberry32(71);
  const n = tileNoise(S, S, 6, rnd, 5);
  const c = pixelFill(S, S, (x, y, o) => { const v = n[y * S + x] * 255; o[0] = v; o[1] = v; o[2] = v; return; });
  return toTex(c, { srgb: false });
}

export function makeRainStreak() {
  const W = 16, H = 128, c = canvas(W, H), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(W / 2 - 1.5, 0, 3, H);
  return toTex(c, { repeat: false, srgb: false });
}

export function makePlate(text, state = 'RIVERTON COUNTY') {
  const c = canvas(256, 128), ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f2ea'; ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#1d4f91'; ctx.lineWidth = 6; ctx.strokeRect(4, 4, 248, 120);
  ctx.fillStyle = '#1d4f91'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.fillText(state, 128, 28);
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 58px "Arial Narrow", Arial'; ctx.fillText(text, 128, 92, 236);
  return toTex(c, { repeat: false });
}

export function makeChainLink() {
  const S = 128, c = canvas(S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 2.2;
  const n = 4, st = S / n;
  for (let k = -n; k <= n * 2; k++) {
    ctx.beginPath(); ctx.moveTo(k * st, 0); ctx.lineTo(k * st + S, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(k * st, 0); ctx.lineTo(k * st - S, S); ctx.stroke();
  }
  return toTex(c, { srgb: false });
}

// photo-scanned layer with the same shape as the procedural generators ({ map, size }) plus the packed normal/roughness image
export function fromPhoto(P) {
  const c = canvas(512); c.getContext('2d').drawImage(P.a, 0, 0, 512, 512);
  return { map: toTex(c), size: P.size, nr: P.nr, photo: true };
}
// packed normal xy + roughness as a linear texture (terrain detail)
export function nrTexture(nr) {
  const c = canvas(512); c.getContext('2d').drawImage(nr, 0, 0, 512, 512);
  return toTex(c, { srgb: false });
}
export function makeNormalNoise(seed = 5, S = 128) {
  const rnd = mulberry32(seed);
  return heightToNormal(tileNoise(S, S, 8, rnd, 4), S, S, 2);
}
