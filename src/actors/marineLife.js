import * as THREE from 'three';
import { WATER_LEVEL } from '../data/world.js';
import { FAUNA } from '../data/sea.js';
import { hash2, RNG } from '../core/rng.js';
import { WATER_FX, WATER_FX_GLSL } from '../world/waterFx.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

const CELL = 64, ACT = 115, DROP = 170;
const _o = new THREE.Object3D(), _c = new THREE.Color(), _e = new THREE.Euler();
const T_UNI = { value: 0 };

function noise(x, z, s) { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }

function tri(list, a, b, c, col) { for (const v of [a, b, c]) list.push(v[0], v[1], v[2], col, col, col); }
function build(list) {
  const n = list.length / 6, pos = new Float32Array(n * 3), colr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = list[i * 6]; pos[i * 3 + 1] = list[i * 6 + 1]; pos[i * 3 + 2] = list[i * 6 + 2]; colr[i * 3] = list[i * 6 + 3]; colr[i * 3 + 1] = list[i * 6 + 4]; colr[i * 3 + 2] = list[i * 6 + 5]; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3)); g.computeVertexNormals();
  return g;
}
function addGeo(list, geo, shade) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = shade(p.getX(i), p.getY(i), p.getZ(i)); list.push(p.getX(i), p.getY(i), p.getZ(i), k, k, k); }
}

// unit-length bodies along +z; the vertex shader bends them, so a school never swims in lockstep
function fishGeo(s) {
  const L = [];
  addGeo(L, new THREE.SphereGeometry(0.5, 10, 7).scale(s.w, s.h, 1), (x, y) => 0.6 + 0.55 * smoothstep(0.2 * s.h, -0.25 * s.h, y));
  const t = s.tail, f = 0.78, d = s.h * 0.46;
  tri(L, [0, 0, -0.4], [0, t, -f], [0, -t, -f], 0.8); tri(L, [0, 0, -0.4], [0, -t, -f], [0, t, -f], 0.8);
  tri(L, [0, d, 0.2], [0, d, -0.22], [0, d + s.dorsal, -0.14], 0.7); tri(L, [0, d, 0.2], [0, d + s.dorsal, -0.14], [0, d, -0.22], 0.7);
  for (const k of [1, -1]) { const x = k * s.w * 0.4; tri(L, [x, -s.h * 0.1, 0.18], [x + k * 0.12, -s.h * 0.28, 0.02], [x, -s.h * 0.1, 0.0], 0.85); tri(L, [x, -s.h * 0.1, 0.18], [x, -s.h * 0.1, 0.0], [x + k * 0.12, -s.h * 0.28, 0.02], 0.85); }
  return build(L);
}
function rayGeo() {
  const L = [], P = [[0, 0.45], [0.5, 0.05], [0.32, -0.2], [0, -0.28], [-0.32, -0.2], [-0.5, 0.05]];
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; tri(L, [0, 0.05, 0.05], [a[0], 0, a[1]], [b[0], 0, b[1]], 0.75); tri(L, [0, 0.05, 0.05], [b[0], 0, b[1]], [a[0], 0, a[1]], 0.45); }
  tri(L, [0, 0, -0.25], [0.025, 0, -0.25], [0, 0, -0.95], 0.4); tri(L, [0, 0, -0.25], [0, 0, -0.95], [0.025, 0, -0.25], 0.4);
  return build(L);
}
function jellyGeo() {
  const L = [];
  addGeo(L, new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1), (x, y) => 0.7 + 0.5 * y);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283, r = 0.26, x = Math.cos(a) * r, z = Math.sin(a) * r, l = 0.7 + (i % 3) * 0.3; tri(L, [x, 0, z], [x + 0.03, 0, z], [x * 0.7, -l, z * 0.7], 0.55); tri(L, [x, 0, z], [x * 0.7, -l, z * 0.7], [x + 0.03, 0, z], 0.55); }
  return build(L);
}

function faunaMaterial(kind) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: kind === 'jelly' ? 0x302848 : 0x2a3a42 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFT = T_UNI; Object.assign(sh.uniforms, WATER_FX);
    const bend = kind === 'fish' ? 'transformed.x += sin(uFT * aSp + aPh - position.z * 5.0) * 0.1 * smoothstep(0.15, -0.75, position.z) + sin(uFT * aSp * 0.5 + aPh) * 0.015 * (0.5 - position.z);'
      : kind === 'ray' ? 'transformed.y += sin(uFT * aSp * 0.4 + aPh - abs(position.x) * 2.0) * 0.14 * abs(position.x);'
        : 'float pl = sin(uFT * aSp + aPh); transformed.xz *= 1.0 + 0.14 * pl * step(-0.02, position.y); transformed.y *= 1.0 - 0.1 * pl * step(-0.02, position.y);';
    sh.vertexShader = 'uniform float uFT; attribute float aPh; attribute float aSp; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${bend}\nvWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = WATER_FX_GLSL + 'varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n      diffuseColor.rgb = wfxApply(diffuseColor.rgb, vWP, length(vViewPosition));');
  };
  return m;
}

// Schools of fish, rays and jellyfish around the camera. Habitat cells are seeded by hash so a reef holds the same kind of life each visit,
// while behaviour is live: schools wander between targets, bunch up and swirl under attack, tuna hunt sardines, groupers and bream come to look at a still diver,
// and everything bolts from swimmers, fast boats and splashes. Only schools within reach are simulated.
export class MarineLife {
  constructor(game) {
    this.g = game; this.density = 1; this.schools = []; this.cells = new Map(); this.alarms = []; this.rng = new RNG('marine'); this.t = 0; this.cellT = 0; this.on = true;
    this.meshes = {};
    const caps = { sardine: 560, damsel: 180, bream: 180, mackerel: 220, grouper: 12, tuna: 40, ray: 8, jelly: 60, dolphin: 12 };
    for (const k in FAUNA) {
      const s = FAUNA[k], geo = s.geo === 'ray' ? rayGeo() : s.geo === 'jelly' ? jellyGeo() : fishGeo(s), cap = caps[k];
      geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1)); geo.setAttribute('aSp', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
      const m = new THREE.InstancedMesh(geo, faunaMaterial(s.geo), cap); m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); game.scene.add(m);
      this.meshes[k] = m;
    }
    game.on('player:splash', (e) => this.alarms.push({ x: e.x, y: e.y, z: e.z, t: 3, r: 14 + e.speed * 2 }));
    game.on('vehicle:bump', (e) => { if (e.v.isBoat && e.impact > 2) this.alarms.push({ x: e.v.x, y: e.v.y, z: e.v.z, t: 2, r: 12 + e.impact * 2 }); });
  }

  get count() { let n = 0; for (const s of this.schools) n += s.fish.length; return n; }

  habitat(x, z) {
    const T = this.g.world.terrain, depth = WATER_LEVEL - T.height(x, z);
    return { depth, rock: noise(x * 0.035 + 7, z * 0.035, 1) };
  }

  pickSpecies(cx, cz, depth, rock, r) {
    let tot = 0; const c = [];
    for (const k in FAUNA) { const s = FAUNA[k]; if (depth < s.depth[0] + 0.8 || depth > s.depth[1] + 3) continue; let w = s.weight; if (s.habitat === 'rock') w *= rock > 0.5 ? 1.5 : 0.04; if (k === 'tuna' && depth < 8) w *= 0.2; c.push([k, w]); tot += w; }
    let q = r * tot; for (const [k, w] of c) { q -= w; if (q <= 0) return k; }
    return null;
  }

  spawnSchool(key, x, z, seedI, seedJ) {
    const s = FAUNA[key], g = this.g, T = g.world.terrain, rng = new RNG(seedI * 7919 + seedJ * 104729 + key.length);
    const n = Math.max(1, Math.round(lerp(s.n[0], s.n[1], rng.f()) * (s.n[1] > 3 ? this.density : 1)));
    const bed = T.height(x, z), surf = g.world.sea.waveAt(x, z), D = surf - bed;
    const yFor = (px, pz) => { const b = T.height(px, pz), dd = surf - b; return s.rel === 'top' ? surf - 0.8 - rng.f() * Math.min(2.5, dd * 0.5) : s.rel === 'bed' ? b + 0.4 + rng.f() * 0.9 : b + dd * (0.3 + rng.f() * 0.5); };
    const fish = [];
    for (let i = 0; i < n; i++) {
      const a = rng.f() * 6.283, r = Math.sqrt(rng.f()) * (3 + n * 0.12), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const pal = s.col[rng.int(0, s.col.length - 1)], j = 0.88 + rng.f() * 0.24;
      fish.push({ x: px, y: Math.min(surf - 0.4, Math.max(T.height(px, pz) + 0.3, yFor(px, pz))), z: pz, vx: 0, vy: 0, vz: 0, ph: rng.f() * 6.283, pace: 0.8 + rng.f() * 0.4, sc: (0.85 + rng.f() * 0.3) * s.size, r: pal[0] * j, g: pal[1] * j, b: pal[2] * j });
    }
    const sc = { key, s, fish, hx: x, hz: z, tx: x, tz: z, ty: bed + D * 0.5, tT: 0, mode: 'calm', mT: 0, cx: x, cy: bed + D * 0.5, cz: z, rad: 4, rng, interest: 0, i: seedI, j: seedJ };
    this.schools.push(sc);
    return sc;
  }

  retarget(sc) {
    const g = this.g, T = g.world.terrain, s = sc.s, rng = sc.rng;
    for (let t = 0; t < 6; t++) {
      const a = rng.f() * 6.283, d = 8 + rng.f() * 28, x = sc.hx + Math.cos(a) * d, z = sc.hz + Math.sin(a) * d, D = WATER_LEVEL - T.height(x, z);
      if (D < s.depth[0] + 0.7) continue;
      if (sc.key === 'tuna' && D < 7) continue;
      sc.tx = x; sc.tz = z;
      const bed = T.height(x, z);
      sc.ty = s.rel === 'top' ? WATER_LEVEL - 1.2 - rng.f() * Math.min(2.5, D * 0.5) : s.rel === 'bed' ? bed + 0.5 + rng.f() : bed + D * (0.25 + rng.f() * 0.55);
      break;
    }
    sc.tT = 4 + rng.f() * 9;
  }

  update(dt) {
    const g = this.g, sea = g.world.sea;
    if (!this.on || !sea) { for (const k in this.meshes) this.meshes[k].visible = false; return; }
    this.t += dt; T_UNI.value = this.t;
    const cam = g.camera.position, P = g.player, F = sea.under ? cam : (P.vehicle || P);
    const near = sea.waterWithin(cam.x, cam.z, 160);
    for (const k in this.meshes) this.meshes[k].visible = near;
    if (!near) return;
    this.cellT -= dt;
    if (this.cellT <= 0) { this.cellT = 0.6; this.stream(F); }
    this.alarms = this.alarms.filter((a) => (a.t -= dt) > 0);
    const dtc = Math.min(dt, 0.05), swimmer = P.state === 'swim' ? P : null, boats = g.vehicles.filter((v) => v.isBoat && v.phys.speed > 1.8 && !v.sunk);
    const night = g.sky.night, storm = clamp(sea.waves.hs / 4, 0, 1);
    const used = {}; for (const k in this.meshes) used[k] = 0;
    for (const sc of this.schools) {
      const d2 = (sc.cx - F.x) ** 2 + (sc.cz - F.z) ** 2;
      sc.active = d2 < ACT * ACT;
      if (!sc.active) continue;
      if (!sc.manual) this.step(sc, dtc, swimmer, boats, night, storm);
      this.draw(sc, used);
    }
    for (const k in this.meshes) { const m = this.meshes[k]; m.count = used[k]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.geometry.attributes.aPh.needsUpdate = true; m.geometry.attributes.aSp.needsUpdate = true; }
  }

  stream(F) {
    const T = this.g.world.terrain, i0 = Math.floor((F.x - ACT) / CELL), i1 = Math.floor((F.x + ACT) / CELL), j0 = Math.floor((F.z - ACT) / CELL), j1 = Math.floor((F.z + ACT) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const key = i * 73856093 ^ j * 19349663;
      if (this.cells.has(key)) continue;
      const x = (i + 0.5 + (hash2(i, j, 5) - 0.5) * 0.6) * CELL, z = (j + 0.5 + (hash2(i, j, 6) - 0.5) * 0.6) * CELL;
      this.cells.set(key, null);
      if (hash2(i, j, 7) > 0.62 * this.density) continue;
      const { depth, rock } = this.habitat(x, z);
      if (depth < 1.2) continue;
      const k = this.pickSpecies(x, z, depth, rock, hash2(i, j, 8));
      if (k) { const sc = this.spawnSchool(k, x, z, i, j); sc.cell = key; this.cells.set(key, sc); }
    }
    for (let a = this.schools.length - 1; a >= 0; a--) {
      const sc = this.schools[a];
      if ((sc.cx - F.x) ** 2 + (sc.cz - F.z) ** 2 > DROP * DROP) { this.schools.splice(a, 1); this.cells.delete(sc.cell); }
    }
    if (this.cells.size > 900) for (const [k, v] of this.cells) if (!v) { this.cells.delete(k); if (this.cells.size < 600) break; }
  }

  step(sc, dt, swimmer, boats, night, storm) {
    const g = this.g, T = g.world.terrain, sea = g.world.sea, s = sc.s, fish = sc.fish, rng = sc.rng, n = fish.length;
    // school centre and spread
    let cx = 0, cy = 0, cz = 0;
    for (const f of fish) { cx += f.x; cy += f.y; cz += f.z; }
    cx /= n; cy /= n; cz /= n; sc.cx = cx; sc.cy = cy; sc.cz = cz;
    const surf = sea.waveAt(cx, cz);
    // threats
    let threat = 0, tx = 0, tz = 0;
    const consider = (x, y, z, R) => { const dx = cx - x, dz = cz - z, dy = cy - y, d = Math.hypot(dx, dz, dy * 1.5); if (d < R) { const w = 1 - d / R; if (w > threat) { threat = w; tx = dx; tz = dz; } } };
    if (s.flee) {
      if (swimmer) consider(swimmer.x, swimmer.y + 0.9, swimmer.z, s.flee * (swimmer.speed > 0.8 ? 1.4 : 1) * (swimmer.dive > 0.3 && swimmer.speed < 0.5 ? 0.6 : 1));
      for (const b of boats) consider(b.x, surf - 1, b.z, s.flee + b.phys.speed * 1.4);
      for (const a of this.alarms) consider(a.x, a.y, a.z, a.r);
    }
    if (threat > 0.05 && sc.mode !== 'panic') { sc.mode = 'panic'; sc.mT = 2.5 + threat * 2.5; const L = Math.hypot(tx, tz) || 1; sc.tx = cx + (tx / L) * 32; sc.tz = cz + (tz / L) * 32; sc.ty = clamp(cy + (threat > 0.5 ? -1.5 : 0), T.height(sc.tx, sc.tz) + 0.5, surf - 0.8); sc.tT = sc.mT; }
    else if (sc.mode === 'panic') { sc.mT -= dt; if (sc.mT <= 0) { sc.mode = 'calm'; sc.hx = cx; sc.hz = cz; sc.tT = 0; } }
    // curiosity: some fish drift over to look at a still diver
    if (sc.mode === 'calm' && s.curious && swimmer && swimmer.speed < 0.8 && Math.hypot(swimmer.x - cx, swimmer.z - cz) < 22 && Math.hypot(swimmer.x - cx, swimmer.z - cz) > 2.8 && sc.rng.f() < 0.4 * dt * s.curious) {
      sc.mode = 'look'; sc.mT = 6 + sc.rng.f() * 6;
    }
    if (sc.mode === 'look') {
      sc.mT -= dt;
      if (!swimmer || sc.mT <= 0 || swimmer.speed > 1.2) sc.mode = 'calm';
      else { const a = this.t * 0.4 + sc.i, R = 4 + 1.5 * Math.sin(this.t * 0.3); sc.tx = swimmer.x + Math.cos(a) * R; sc.tz = swimmer.z + Math.sin(a) * R; sc.ty = clamp(swimmer.y + 0.9, T.height(sc.tx, sc.tz) + 0.5, surf - 0.8); sc.tT = 1; }
    }
    // predators go for the nearest sardine school; the prey ball up and swirl
    if (s.hunts && sc.mode === 'calm') {
      let best = null, bd = 45 * 45;
      for (const o of this.schools) if (o.key === s.hunts && o.active) { const d = (o.cx - cx) ** 2 + (o.cz - cz) ** 2; if (d < bd) { bd = d; best = o; } }
      if (best) { sc.tx = best.cx; sc.tz = best.cz; sc.ty = best.cy; sc.tT = 1.5; if (bd < 15 * 15) { best.mode = 'bait'; best.mT = 7; } }
    }
    if (sc.mode === 'bait') { sc.mT -= dt; if (sc.mT <= 0) sc.mode = 'calm'; }
    sc.tT -= dt; if (sc.tT <= 0) this.retarget(sc);
    const spBase = s.speed * (sc.mode === 'panic' ? 2.1 : sc.mode === 'bait' ? 1.4 : sc.mode === 'look' ? 0.55 : 1) * (1 - 0.35 * storm) * (night > 0.6 && s.rel === 'bed' ? 0.5 : 1);
    const bedAt = (x, z) => T.height(x, z);
    const tight = sc.mode === 'bait' ? 3.5 : sc.mode === 'panic' ? 2.2 : 1 + n * 0.06;
    for (let i = 0; i < n; i++) {
      const f = fish[i];
      // goal: school target plus pull to the centre
      let ax = (sc.tx - f.x) * 0.06 + (cx - f.x) * (0.5 / tight), ay = (sc.ty - f.y) * 0.1 + (cy - f.y) * 0.3, az = (sc.tz - f.z) * 0.06 + (cz - f.z) * (0.5 / tight);
      if (sc.mode === 'bait') { const rx = f.x - cx, rz = f.z - cz; ax += -rz * 0.45; az += rx * 0.45; }
      // flock with a few random mates
      for (let k = 0; k < 3; k++) {
        const o = fish[(Math.random() * n) | 0]; if (o === f) continue;
        const dx = f.x - o.x, dy = f.y - o.y, dz = f.z - o.z, d2 = dx * dx + dy * dy + dz * dz, sep = f.sc * 2.2;
        if (d2 < sep * sep && d2 > 1e-4) { const w = (1 - Math.sqrt(d2) / sep) * 3; ax += dx * w; ay += dy * w; az += dz * w; }
        ax += (o.vx - f.vx) * 0.25; ay += (o.vy - f.vy) * 0.25; az += (o.vz - f.vz) * 0.25;
      }
      const wob = this.t * 0.7 + f.ph; ax += Math.sin(wob) * 0.12; az += Math.cos(wob * 1.3) * 0.12;
      // keep off the bed and below the surface; turn away from rising ground ahead
      const sp = Math.hypot(f.vx, f.vz) + 0.1, ahx = f.x + (f.vx / sp) * 1.4, ahz = f.z + (f.vz / sp) * 1.4, bed = bedAt(f.x, f.z), bAhead = bedAt(ahx, ahz);
      const clr = s.rel === 'bed' ? 0.2 : 0.55;
      if (f.y - bed < clr) ay += (clr - (f.y - bed)) * 6;
      if (bAhead > f.y - 0.1) { const bl = bedAt(f.x - f.vz / sp * 1.2 + (f.vx / sp), f.z + f.vx / sp * 1.2 + (f.vz / sp)), br = bedAt(f.x + f.vz / sp * 1.2 + (f.vx / sp), f.z - f.vx / sp * 1.2 + (f.vz / sp)), side = bl < br ? 1 : -1; ax += -f.vz / sp * side * 3; az += f.vx / sp * side * 3; ay += 1.2; }
      if (WATER_LEVEL - bAhead < 0.6) { ax -= f.vx * 2; az -= f.vz * 2; }
      if (f.y > surf - 0.4) ay -= (f.y - (surf - 0.4)) * 6;
      // velocity toward the desired heading at the school's pace
      const al = Math.hypot(ax, ay, az) || 1, want = spBase * f.pace;
      const k = 1 - Math.exp(-dt * (sc.mode === 'panic' ? 5 : 2.4));
      f.vx += (ax / al * want - f.vx) * k; f.vy += (ay / al * want * 0.6 - f.vy) * k; f.vz += (az / al * want - f.vz) * k;
      if (s.geo === 'jelly') { f.vx *= 0.9; f.vz *= 0.9; f.vy = Math.sin(this.t * 1.2 + f.ph) * 0.12; }
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    }
    sc.rad = 3 + n * 0.1;
  }

  draw(sc, used) {
    const view = this.g.view, m = this.meshes[sc.key], cap = m.instanceMatrix.count, aPh = m.geometry.attributes.aPh, aSp = m.geometry.attributes.aSp, s = sc.s;
    for (const f of sc.fish) {
      let i = used[sc.key]; if (i >= cap) break;
      if (!view.sphere(f.x, f.y, f.z, f.sc * 1.2 + 0.5)) continue;
      const sp = Math.hypot(f.vx, f.vy, f.vz) || 0.01, yaw = Math.atan2(f.vx, f.vz), pitch = -Math.asin(clamp(f.vy / sp, -0.9, 0.9));
      if (s.geo === 'jelly') _e.set(0, f.ph, 0); else _e.set(pitch, yaw, 0, 'YXZ');
      _o.position.set(f.x, f.y, f.z); _o.rotation.copy(_e); _o.scale.setScalar(f.sc); _o.updateMatrix();
      m.setMatrixAt(i, _o.matrix); _c.setRGB(f.r, f.g, f.b); m.setColorAt(i, _c);
      aPh.array[i] = f.ph; aSp.array[i] = s.geo === 'jelly' ? 2.4 : 4 + sp * 3.2 / Math.max(0.3, s.size * 2);
      used[sc.key] = i + 1;
    }
  }
}
