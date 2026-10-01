import * as THREE from 'three';
import { SURF } from './terrain.js';
import { canvas, toTex } from './textures.js';
import { noise2 } from '../core/rng.js';
import { WATER_LEVEL } from '../data/world.js';

// Instanced grass around the camera. Three layers share one shader: geometry tufts close up, crossed alpha cards further out,
// and fern / bush cards under the forest canopy. Tiles of instances are generated on the CPU from the terrain surface raster
// (lawns, parks, meadows, forest floor) and streamed into one buffer per layer; wind, trampling and fading happen on the GPU.
const MOWED = new Set(['cbd', 'oldtown', 'eastside', 'industrial', 'harbor', 'marlow']);
const STRIDE = 10; // x y z | rot height tint thin | r g b
const hash = (i, j, k = 0) => {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- geometry
function addBlade(P, N, U, I, o) {
  const { cx, cz, ang, lean, hgt, w0 } = o;
  const base = P.length / 3, ca = Math.cos(ang), sa = Math.sin(ang);
  const rows = [[0, 1], [0.5, 0.72]];
  // the blade spans its local x axis (ca, -sa) and arches along its facing direction (sa, ca)
  const push = (lx, h, u) => {
    const bend = (lean * h * h + 0.12 * h * h * h) * hgt;
    P.push(cx + ca * lx + sa * bend, h * hgt, cz - sa * lx + ca * bend);
    N.push(sa * 0.9, 0.4, ca * 0.9); U.push(u, h);
  };
  for (const [h, wf] of rows) { const w = w0 * wf * hgt; push(-w, h, 0); push(w, h, 1); }
  push(0.04, 1, 0.5);
  I.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
}

function tuftGeo() {
  const P = [], N = [], U = [], I = [];
  const n = 5;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.5, r = 0.24;
    addBlade(P, N, U, I, { cx: Math.cos(a) * r * 0.55, cz: Math.sin(a) * r * 0.55, ang: a * 1.7 + 1.1, lean: 0.2 + (k % 2) * 0.14, hgt: 0.8 + (k % 3) * 0.16, w0: 0.2 });
  }
  return toGeo(P, N, U, I);
}

function cardGeo(w = 0.78, rows = 3) {
  const P = [], N = [], U = [], I = [];
  for (let c = 0; c < 2; c++) {
    const a = c * Math.PI / 2 + 0.3, ca = Math.cos(a), sa = Math.sin(a), base = P.length / 3;
    for (let r = 0; r < rows; r++) {
      const h = r / (rows - 1), sway = h * h * 0.06;
      for (const u of [-0.5, 0.5]) { P.push(ca * u * w + sa * sway, h, -sa * u * w + ca * sway); N.push(sa, 0.4, ca); U.push(u + 0.5, h); }
    }
    for (let r = 0; r < rows - 1; r++) { const i = base + r * 2; I.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  return toGeo(P, N, U, I);
}

function toGeo(P, N, U, I) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return g;
}

// ---------------------------------------------------------------- card textures (luminance only, the hue comes from the terrain)
function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function grassTexture() {
  const S = 128, c = canvas(S, S), x = c.getContext('2d'), r = seeded(11);
  for (let i = 0; i < 18; i++) {
    const bx = S * (0.1 + 0.8 * r()), w = 3 + r() * 5, h = S * (0.42 + 0.55 * r()), lean = (r() - 0.5) * S * 0.34;
    const g = x.createLinearGradient(0, S, 0, S - h); g.addColorStop(0, '#8a8a8a'); g.addColorStop(0.45, '#d8d8d8'); g.addColorStop(1, '#ffffff');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(bx - w / 2, S); x.quadraticCurveTo(bx + lean * 0.25 - w * 0.3, S - h * 0.55, bx + lean, S - h); x.quadraticCurveTo(bx + lean * 0.3 + w * 0.3, S - h * 0.55, bx + w / 2, S); x.closePath(); x.fill();
  }
  return toTex(c, { repeat: false });
}
function fernTexture() {
  const S = 128, c = canvas(S, S), x = c.getContext('2d'), r = seeded(23);
  for (let f = 0; f < 4; f++) {
    const a0 = -0.9 + f * 0.6 + (r() - 0.5) * 0.2, len = S * (0.62 + 0.3 * r());
    const pt = (t) => ({ x: S * 0.5 + Math.sin(a0) * len * t * 0.9 + Math.sin(a0) * t * t * len * 0.15, y: S - len * t + t * t * len * 0.45 });
    x.strokeStyle = '#9a9a9a'; x.lineWidth = 2; x.beginPath(); for (let i = 0; i <= 16; i++) { const p = pt(i / 16); if (i) x.lineTo(p.x, p.y); else x.moveTo(p.x, p.y); } x.stroke();
    for (let i = 2; i < 16; i++) {
      const t = i / 16, p = pt(t), q = pt(t + 0.03), dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, ll = (1 - t) * S * 0.2 + 5;
      for (const s of [-1, 1]) {
        const ex = p.x + (-dy / l * s) * ll + dx / l * ll * 0.35, ey = p.y + (dx / l * s) * ll + dy / l * ll * 0.35;
        const g = x.createLinearGradient(p.x, p.y, ex, ey); g.addColorStop(0, '#6a6a6a'); g.addColorStop(1, '#f2f2f2');
        x.strokeStyle = g; x.lineWidth = 3.4 * (1 - t) + 1.2; x.lineCap = 'round'; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(ex, ey); x.stroke();
      }
    }
  }
  return toTex(c, { repeat: false });
}

// ---------------------------------------------------------------- material
function makeMaterial(U, map, cards) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, vertexColors: true, side: THREE.DoubleSide, map: map || null, alphaTest: cards ? 0.42 : 0, alphaToCoverage: !!cards });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `attribute vec3 aPos; attribute vec4 aInfo; attribute vec3 aCol;
uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform vec3 uCam; uniform float uR; uniform vec4 uPush[6];
` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(vec3(normal.x * 0.45, 1.0, normal.z * 0.45));')
      .replace('#include <color_vertex>', `vColor = aCol * (0.75 + 0.35 * aInfo.z) * mix(0.36, 1.0, pow(uv.y, 0.8)); vColor.r *= 1.0 + 0.3 * uv.y * uv.y; vColor.b *= 1.0 - 0.35 * uv.y;`)
      .replace('#include <begin_vertex>', `
        float rot = aInfo.x * 6.2831853;
        float dist = length(aPos.xz - uCam.xz);
        float fade = 1.0 - smoothstep(uR * 0.7, uR, dist);
        float keep = step(aInfo.w, mix(1.0, 0.3, smoothstep(uR * 0.3, uR, dist)));
        float S = aInfo.y * fade * keep;
        float hh = uv.y;
        float cr = cos(rot), sr = sin(rot);
        vec3 p = position;
        p.xz = vec2(cr * p.x - sr * p.z, sr * p.x + cr * p.z);
        p *= S;
        float gust = sin(aPos.x * 0.045 + uTime * 0.55) * 0.5 + 0.5;
        float sway = sin(uTime * (1.3 + uWind) + aPos.x * 0.37 + aPos.z * 0.29 + aInfo.z * 6.0);
        float amp = (0.035 + 0.17 * uWind) * (0.5 + 0.75 * gust) * S;
        p.xz += uWindDir * amp * (0.55 + 0.45 * sway) * hh * hh;
        p.xz += vec2(cos(uTime * 2.3 + aPos.z * 0.7), sin(uTime * 2.1 + aPos.x * 0.7)) * 0.012 * (0.3 + uWind) * hh * S;
        for (int i = 0; i < 6; i++) {
          vec4 q = uPush[i];
          vec2 d = aPos.xz - q.xy;
          float l = length(d);
          if (q.z > 0.0 && l < q.z) { float k = 1.0 - l / q.z; k *= k; p.xz += d / max(l, 0.05) * k * hh * 0.8 * S; p.y *= 1.0 - k * 0.5 * hh; }
        }
        vec3 transformed = aPos + p;`);
    // the faces are lit as a soft up normal from both sides
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(/normal \*= faceDirection;/g, ''));
  };
  return m;
}

// ---------------------------------------------------------------- layers
class Layer {
  constructor(grass, o) {
    this.g = grass; this.o = o;
    this.tiles = new Map();
    this.geo = o.geo; this.max = o.max;
    this.buf = new THREE.InstancedInterleavedBuffer(new Float32Array(o.max * STRIDE), STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', new THREE.InterleavedBufferAttribute(this.buf, 3, 0));
    this.geo.setAttribute('aInfo', new THREE.InterleavedBufferAttribute(this.buf, 4, 3));
    this.geo.setAttribute('aCol', new THREE.InterleavedBufferAttribute(this.buf, 3, 7));
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(this.geo, o.material);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.castShadow = false; this.mesh.renderOrder = 1;
    this.mesh.matrixAutoUpdate = false;
    this.key = ''; this.radius = o.radius; this.spacing = o.spacing; this.dirty = true; this.count = 0;
  }

  configure(q) {
    const o = this.o, s = Math.sqrt(q);
    this.radius = o.radius * Math.min(1.2, s);
    this.spacing = o.spacing / Math.max(0.55, s);
    this.tiles.clear(); this.dirty = true; this.key = '';
  }

  tileKey(tx, tz) { return tx * 65536 + tz; }

  generate(tx, tz) {
    const g = this.g, T = g.world.terrain, W = g.world, o = this.o, tile = o.tile, sp = this.spacing;
    const n = Math.max(2, Math.round(tile / sp)), step = tile / n;
    const x0 = tx * tile, z0 = tz * tile;
    const out = [];
    const colCache = new Map();
    const tint = new THREE.Color();
    const nv = g._v;
    const mow = MOWED.has(W.districtAt(x0 + tile / 2, z0 + tile / 2).id) ? 0.72 : 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const gi = tx * n + i, gj = tz * n + j;
      const x = x0 + (i + hash(gi, gj, 1)) * step, z = z0 + (j + hash(gi, gj, 2)) * step;
      const s = T.surfAt(x, z);
      if (s !== SURF.GRASS && s !== SURF.FIELD) continue;
      if (o.filter && !o.filter(x, z, hash(gi, gj, 9))) continue;
      let y = T.height(x, z);
      if (y < WATER_LEVEL + 0.4) continue;
      const r = W.raised.raiseAt(x, z);
      if (r > 0) { const e = W.raised.lastElev; if (y < e + 1 && y > e - 0.5) y = Math.max(y, r); }
      T.normal(x, z, nv);
      if (nv.y < 0.74) continue;
      let blocked = false;
      W.colliders.query(x, z, 0.7, y - 0.6, y + 3, (c) => { if (c.kind === 'building' || c.kind === 'wall') { blocked = true; return false; } });
      if (blocked) continue;
      // meadow patchiness
      const patch = 0.5 + 0.5 * noise2(x / 11 + 3, z / 11 - 5);
      if (hash(gi, gj, 3) > o.density * (0.45 + 0.55 * patch)) continue;
      const ck = ((x / 2) | 0) * 4096 + ((z / 2) | 0);
      let c = colCache.get(ck);
      if (!c) {
        // lush green by default, drier toward the countryside and darker on the forest floor, following the terrain tint
        T.terrainColor(x, y, z, nv.y, tint);
        const dry = Math.min(1, Math.max(0, (tint.r / Math.max(tint.g, 0.01) - 0.8) / 0.35)), sh = o.shade ?? 1;
        const n1 = 0.85 + 0.3 * (0.5 + 0.5 * noise2(x / 37 + 1, z / 37));
        c = [(0.1 * (1 - dry) + 0.3 * dry) * n1 * sh, (0.36 * (1 - dry) + 0.29 * dry) * n1 * sh, (0.05 * (1 - dry) + 0.09 * dry) * n1 * sh];
        colCache.set(ck, c);
      }
      const v = hash(gi, gj, 4), hgt = mow * (o.h0 + (o.h1 - o.h0) * hash(gi, gj, 5) * (0.6 + 0.6 * patch));
      const k = o.bright;
      out.push(x, y - 0.02, z, hash(gi, gj, 6), hgt, v, hash(gi, gj, 7), c[0] * k, c[1] * k, c[2] * k);
    }
    return new Float32Array(out);
  }

  update(cam, budgetMs) {
    const tile = this.o.tile, R = this.radius + tile;
    const cx = Math.floor(cam.x / tile), cz = Math.floor(cam.z / tile), span = Math.ceil(R / tile);
    let changed = false;
    const t0 = performance.now();
    const need = [];
    for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) {
      const tx = cx + i, tz = cz + j;
      const dx = (tx + 0.5) * tile - cam.x, dz = (tz + 0.5) * tile - cam.z;
      const d = Math.hypot(dx, dz) - tile * 0.72;
      if (d > this.radius) continue;
      need.push({ tx, tz, d });
    }
    need.sort((a, b) => a.d - b.d);
    for (const t of need) {
      const k = this.tileKey(t.tx, t.tz);
      if (this.tiles.has(k)) continue;
      if (performance.now() - t0 > budgetMs && this.tiles.size > 0) break;
      this.tiles.set(k, { tx: t.tx, tz: t.tz, data: this.generate(t.tx, t.tz) });
      changed = true;
    }
    for (const [k, t] of this.tiles) {
      const dx = (t.tx + 0.5) * tile - cam.x, dz = (t.tz + 0.5) * tile - cam.z;
      if (Math.hypot(dx, dz) > this.radius + tile * 2.6) { this.tiles.delete(k); changed = true; }
    }
    const key = cx + ',' + cz;
    if (changed || this.dirty || key !== this.key) { this.key = key; this.dirty = false; this.rebuild(cam); }
  }

  rebuild(cam) {
    const arr = this.buf.array, tile = this.o.tile, R = this.radius + tile * 0.8;
    let n = 0;
    const list = [...this.tiles.values()].map((t) => ({ t, d: Math.hypot((t.tx + 0.5) * tile - cam.x, (t.tz + 0.5) * tile - cam.z) })).filter((e) => e.d < R + tile).sort((a, b) => a.d - b.d);
    for (const e of list) {
      const d = e.t.data, c = d.length / STRIDE;
      if (n + c > this.max) break;
      arr.set(d, n * STRIDE); n += c;
    }
    this.count = n; this.geo.instanceCount = n;
    this.buf.needsUpdate = true;
    this.mesh.visible = n > 0 && this.g.enabled;
  }
}

export class Grass {
  constructor(game) {
    this.game = game; this.world = game.world;
    this._v = new THREE.Vector3();
    this.enabled = true; this.quality = 1;
    this.U = {
      uTime: { value: 0 }, uWind: { value: 0.3 }, uWindDir: { value: new THREE.Vector2(0.8, 0.6) }, uCam: { value: new THREE.Vector3() }, uR: { value: 12 },
      uPush: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 1)) },
    };
    const shared = (R) => ({ ...this.U, uR: { value: R } });
    const tex = grassTexture(), fern = fernTexture();
    const near = { tile: 8, radius: 8.5, spacing: 0.26, density: 0.95, h0: 0.26, h1: 0.52, bright: 0.6, max: 4600, geo: tuftGeo(), U: shared(8.5) };
    const far = { tile: 16, radius: 30, spacing: 0.85, density: 0.9, h0: 0.38, h1: 0.66, bright: 1.45, max: 7500, geo: cardGeo(0.78), U: shared(30) };
    const under = { tile: 16, radius: 36, spacing: 2.2, density: 0.75, h0: 0.7, h1: 1.25, bright: 1.3, shade: 0.55, max: 2200, geo: cardGeo(1.3, 3), U: shared(36), filter: (x, z, r) => z > 940 && z < 1985 && noise2(x / 60 + 9, z / 60) > -0.15 && r < 0.9 };
    near.material = makeMaterial(near.U, null, false);
    far.material = makeMaterial(far.U, tex, true);
    under.material = makeMaterial(under.U, fern, true);
    this.layers = [new Layer(this, near), new Layer(this, far), new Layer(this, under)];
    this.layers.forEach((l, i) => { l.o.U.uR.value = l.radius; game.scene.add(l.mesh); void i; });
    this.pushers = [];
    this.setQuality(1);
  }

  setQuality(q) {
    if (q === this.quality && this._set) return;
    this._set = true; this.quality = q;
    this.enabled = q > 0.08;
    for (const l of this.layers) { l.configure(Math.max(0.2, q)); l.o.U.uR.value = l.radius; l.mesh.visible = this.enabled && l.count > 0; }
  }

  // pushers: [{ x, z, r, k }] up to six things that flatten the grass
  update(dt, cam, sky, pushers = []) {
    if (!this.enabled) return;
    const U = this.U;
    U.uTime.value += dt;
    const w = sky?.w?.wind ?? 0.3;
    U.uWind.value += (Math.min(1.4, w) - U.uWind.value) * Math.min(1, dt * 0.8);
    const a = sky?.wind?.dir ?? Math.sin(U.uTime.value * 0.03) * 0.6 + 0.9;
    U.uWindDir.value.set(Math.cos(a), Math.sin(a));
    U.uCam.value.copy(cam.position);
    const P = U.uPush.value;
    for (let i = 0; i < 6; i++) { const p = pushers[i]; if (p) P[i].set(p.x, p.z, p.r, p.k ?? 1); else P[i].set(0, 0, 0, 1); }
    // tiles are generated in a small time slice per frame
    const budget = this.first ? 4 : 40;
    this.first = true;
    for (const l of this.layers) l.update(cam.position, budget);
  }
}
