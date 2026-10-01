import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp, lerp, dampAngle, wrapAngle } from '../core/math.js';
import { poseFor, REST, BONES } from './human.js';
import { obbVsCircle } from '../world/collision.js';

// ---------------- appearance archetypes ----------------
const SKINS = ['#f1d0b5', '#e8b995', '#d6a078', '#c68e6a', '#a9714c', '#8d5a3b', '#6b4127', '#4e2f1d'];
const HAIRS = ['#1c1510', '#2b1e16', '#4a3222', '#6b4a2e', '#8a6a44', '#b89a6a', '#d8c090', '#9a9a9a', '#3a2a20'];
export const PED_TYPES = [
  { id: 'office', w: 5, speed: [1.25, 1.5], top: ['#e8e8e6', '#cfd8e0', '#f2efe8', '#dfe4ea'], jacket: ['#1f2530', '#2e3440', '#3a3a3a', '#474d56', '#2a2f3a'], pants: ['#1f2530', '#2e3440', '#3a3a3a'], shoes: ['#1a1a1a', '#3a2a1f'], bag: 0.3 },
  { id: 'student', w: 3, speed: [1.2, 1.5], top: ['#b3261e', '#1d4f91', '#2e7d32', '#6b3fa0', '#f2f2f0', '#e0a21a'], jacket: [null, null, '#5a5f66', '#2a3a55'], pants: ['#34465e', '#2a2a2a', '#5a4a3a'], shoes: ['#f2f2f0', '#1a1a1a', '#b3261e'], backpack: 0.8 },
  { id: 'tourist', w: 2, speed: [0.9, 1.2], top: ['#f2e6c8', '#9fd3e0', '#f2a07a', '#ffffff', '#e8d44d'], jacket: [null], pants: ['#c8b894', '#5a6a7a', '#e0d8c0'], shoes: ['#f2f2f0', '#8a6a44'], hat: 0.5, shorts: 0.6 },
  { id: 'parent', w: 2, speed: [1.1, 1.35], top: ['#7a9ab8', '#c87a7a', '#8ab87a', '#e8e0d0'], jacket: [null, '#4a5a6a', '#6a4a3a'], pants: ['#34465e', '#4a4a4a', '#6a5a4a'], shoes: ['#f2f2f0', '#3a3a3a'] },
  { id: 'jogger', w: 1.5, speed: [2.8, 3.4], top: ['#e2531a', '#1e88e5', '#f2f2f2', '#43a047', '#111111'], jacket: [null], pants: ['#111111', '#2a2a2a'], shoes: ['#f2f2f2', '#e2531a'], shorts: 0.8, run: true },
  { id: 'worker', w: 1.5, speed: [1.1, 1.3], top: ['#d9e021'], vest: true, jacket: [null], pants: ['#4a5a6a', '#6a5a4a'], shoes: ['#6b4a2b'], hardhat: 0.8 },
  { id: 'delivery', w: 1, speed: [1.4, 1.7], top: ['#6d4c41', '#1565c0', '#c62828'], jacket: [null], pants: ['#3a3a3a', '#5a4a3a'], shoes: ['#1a1a1a'], cap: 0.9, box: 0.7 },
  { id: 'shop', w: 1, speed: [1.1, 1.35], top: ['#2e7d32', '#b3261e', '#1d4f91', '#f9a825'], jacket: [null], pants: ['#2a2a2a', '#1f2530'], shoes: ['#1a1a1a'] },
  { id: 'guard', w: 0.6, speed: [1.0, 1.2], top: ['#1f2530'], jacket: ['#1f2530'], pants: ['#1f2530'], shoes: ['#111111'], cap: 0.6 },
  { id: 'elderly', w: 1.2, speed: [0.7, 0.95], top: ['#b8a58a', '#8a9aa8', '#a88a8a', '#d8d0c0'], jacket: ['#6a5a4a', '#4a4a4a', null], pants: ['#6a6a6a', '#8a7a6a', '#3a3a3a'], shoes: ['#3a2a1f', '#1a1a1a'], gray: true },
];

function makeLook(rng, type) {
  const T = PED_TYPES.find((t) => t.id === type) || PED_TYPES[0];
  const female = rng.chance(0.5);
  const jacket = rng.pick(T.jacket);
  return {
    type: T.id, female,
    skin: rng.pick(SKINS), hair: T.gray ? rng.pick(['#9a9a9a', '#c8c8c8', '#e0e0e0']) : rng.pick(HAIRS),
    hairLong: female && rng.chance(0.65), bald: !female && rng.chance(T.gray ? 0.4 : 0.1),
    top: rng.pick(T.top), jacket, pants: rng.pick(T.pants), shoes: rng.pick(T.shoes),
    shorts: rng.chance(T.shorts || 0), backpack: rng.chance(T.backpack || 0), bag: rng.chance(T.bag || 0),
    hat: rng.chance(T.hat || 0) ? 'hat' : rng.chance(T.cap || 0) ? 'cap' : rng.chance(T.hardhat || 0) ? 'hardhat' : null,
    hatColor: T.hardhat ? '#f2c12e' : rng.pick(['#1a1a1a', '#b3261e', '#1d4f91', '#f2f2f0', '#c8b894']),
    vest: !!T.vest, box: rng.chance(T.box || 0),
    height: (female ? 1.64 : 1.76) + rng.range(-0.08, 0.1), build: rng.range(0.2, 0.8),
    speed: rng.range(T.speed[0], T.speed[1]), run: !!T.run,
  };
}

// ---------------- crowd instanced renderer ----------------
const PARTS = ['pelvis', 'torso', 'head', 'hair', 'uaL', 'uaR', 'faL', 'faR', 'thL', 'thR', 'shL', 'shR', 'ftL', 'ftR', 'acc', 'hat', 'umb'];
function partGeos() {
  const cap = (r, l) => { const g = new THREE.CapsuleGeometry(r, l, 2, 6); g.translate(0, -l / 2 - r * 0.2, 0); return g; };
  const torso = new THREE.LatheGeometry([[0.001, -0.02], [0.15, 0], [0.155, 0.1], [0.145, 0.22], [0.17, 0.38], [0.18, 0.46], [0.13, 0.52], [0.05, 0.55], [0.001, 0.55]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
  torso.scale(1, 1, 0.66);
  const head = new THREE.SphereGeometry(0.105, 10, 8); head.scale(1, 1.18, 1.02); head.translate(0, 0.11, 0);
  const hair = new THREE.SphereGeometry(0.113, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.58); hair.scale(1, 1.2, 1.06); hair.translate(0, 0.115, -0.006);
  const pelvis = new THREE.SphereGeometry(0.16, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55); pelvis.scale(1, 0.9, 0.72); pelvis.rotateX(Math.PI); pelvis.translate(0, 0.03, 0);
  const foot = new THREE.BoxGeometry(0.095, 0.075, 0.25); foot.translate(0, -0.035, 0.05);
  const acc = new THREE.BoxGeometry(0.28, 0.36, 0.14); acc.translate(0, 0.28, -0.15);
  const hat = new THREE.SphereGeometry(0.118, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); hat.translate(0, 0.14, 0);
  const umb = new THREE.ConeGeometry(0.55, 0.28, 10, 1, true); umb.translate(0, 0.7, 0);
  const stick = new THREE.CylinderGeometry(0.01, 0.01, 0.75, 4); stick.translate(0, 0.33, 0);
  const umbG = mergeSimple([umb, stick]);
  return {
    pelvis, torso, head, hair, uaL: cap(0.05, 0.24), uaR: cap(0.05, 0.24), faL: cap(0.042, 0.22), faR: cap(0.042, 0.22),
    thL: cap(0.068, 0.38), thR: cap(0.068, 0.38), shL: cap(0.055, 0.37), shR: cap(0.055, 0.37), ftL: foot, ftR: foot, acc, hat, umb: umbG,
  };
}
function mergeSimple(gs) {
  const pos = [], nor = [], idx = [];
  let off = 0;
  for (const g of gs) {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
    for (const i of g.index.array) idx.push(i + off);
    off += p.count;
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  o.setIndex(idx);
  return o;
}

const _M = {}; for (const k of ['root', 'hip', 'sp', 'hd', 'a', 'b', 'c', 't']) _M[k] = new THREE.Matrix4();
const PIDX = Object.fromEntries(PARTS.map((k, i) => [k, i]));
const _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _zero = new THREE.Matrix4().makeScale(0, 0, 0);
function rotM(m, x, y, z, px = 0, py = 0, pz = 0, order = 'XYZ') { _e.set(x, y, z, order); _q.setFromEuler(_e); return m.compose(_v.set(px, py, pz), _q, _one); }

class CrowdRenderer {
  constructor(scene, cap) {
    this.cap = cap;
    const geos = partGeos();
    // merge all parts into one geometry tagged with a part id; part matrices and colours live in data textures (GPU skinning-style)
    const pos = [], nor = [], part = [], idx = [];
    let off = 0;
    PARTS.forEach((k, pi) => {
      const g = geos[k], p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); part.push(pi); }
      if (g.index) for (const i of g.index.array) idx.push(i + off); else for (let i = 0; i < p.count; i++) idx.push(i + off);
      off += p.count;
    });
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
    geo.setIndex(idx);
    geo.instanceCount = 0;
    const NP = PARTS.length;
    this.NP = NP;
    this.mData = new Float32Array(NP * 4 * cap * 4);
    this.cData = new Uint8Array(NP * cap * 4);
    this.mTex = new THREE.DataTexture(this.mData, NP * 4, cap, THREE.RGBAFormat, THREE.FloatType);
    this.cTex = new THREE.DataTexture(this.cData, NP, cap, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.cTex.colorSpace = THREE.SRGBColorSpace;
    for (const t of [this.mTex, this.cTex]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPM = { value: this.mTex }; sh.uniforms.uPC = { value: this.cTex };
      sh.vertexShader = 'attribute float aPart; uniform sampler2D uPM; uniform sampler2D uPC; varying vec3 vPC;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `int pInst = gl_InstanceID; int pPart = int(aPart + 0.5); int pBase = pPart * 4;
          mat4 pMat = mat4(texelFetch(uPM, ivec2(pBase, pInst), 0), texelFetch(uPM, ivec2(pBase + 1, pInst), 0), texelFetch(uPM, ivec2(pBase + 2, pInst), 0), texelFetch(uPM, ivec2(pBase + 3, pInst), 0));
          vPC = texelFetch(uPC, ivec2(pPart, pInst), 0).rgb;
          vec3 objectNormal = normalize(mat3(pMat) * normal);
          #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
          #endif`)
        .replace('#include <begin_vertex>', 'vec3 transformed = (pMat * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vPC;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vPC;');
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.meshes = { crowd: this.mesh };
    this.n = 0;
    this._c = new THREE.Color();
  }
  begin() { this.n = 0; }
  put(part, m) { this.mData.set(m.elements, (this.n - 1) * this.NP * 16 + part * 16); }
  colr(part, c) { const o = ((this.n - 1) * this.NP + part) * 4; const d = this.cData; this._c.copy(c).convertLinearToSRGB(); d[o] = Math.min(255, this._c.r * 255 + 0.5); d[o + 1] = Math.min(255, this._c.g * 255 + 0.5); d[o + 2] = Math.min(255, this._c.b * 255 + 0.5); d[o + 3] = 255; }
  // write one pedestrian
  write(p, pose) {
    if (this.n >= this.cap) return;
    this.n++;
    const L = p.look, S = L.height / 1.76;
    const set = (k, m) => this.put(PIDX[k], m);
    if (p.rag) {
      _q.setFromEuler(_e.set(p.rot.pitch, p.yaw, p.rot.roll, 'YXZ'));
      _v.set(0, 0.9 * S, 0).applyQuaternion(_q);
      _M.root.compose(_v3.set(p.x - _v.x, p.y - _v.y, p.z - _v.z), _q, _v2.setScalar(S));
    } else _M.root.compose(_v.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.fallRot || 0, p.yaw, 0, 'YXZ')), _v2.setScalar(S));
    rotM(_M.hip, 0, pose.twist * 0.5, 0, 0, BONES.hipY + pose.hipY, 0);
    _M.hip.premultiply(_M.root);
    set('pelvis', _M.hip);
    rotM(_M.sp, pose.lean, -pose.twist, 0, 0, 0.02, 0); _M.sp.premultiply(_M.hip);
    _M.t.copy(_M.sp).scale(_v.set(1 + L.build * 0.3, 1, 1 + L.build * 0.3));
    set('torso', _M.t);
    rotM(_M.hd, pose.headX - pose.lean * 0.6, pose.headY, 0, 0, BONES.neckY + 0.05, 0); _M.hd.premultiply(_M.sp);
    set('head', _M.hd);
    if (L.bald && !L.hat) set('hair', _zero); else { _M.t.copy(_M.hd); if (L.hairLong) _M.t.scale(_v.set(1.05, 1.25, 1.1)); set('hair', _M.t); }
    set('hat', L.hat ? _M.hd : _zero);
    for (const [s, sx, sz, el, ua, fa] of [[1, pose.shLx, pose.shLz, pose.elL, 'uaL', 'faL'], [-1, pose.shRx, pose.shRz, pose.elR, 'uaR', 'faR']]) {
      let ax = sx, az = sz, ae = el;
      if (s < 0 && p.umbrella) { ax = -1.35; az = 0.05; ae = -1.1; }
      if (s > 0 && L.box) { ax = -0.9; az = -0.1; ae = -1.2; }
      rotM(_M.a, ax, 0, az, s * BONES.shoulderX * (1 + L.build * 0.12), BONES.shoulderY, 0); _M.a.premultiply(_M.sp);
      set(ua, _M.a);
      rotM(_M.b, ae, 0, 0, 0, -BONES.upper, 0); _M.b.premultiply(_M.a);
      set(fa, _M.b);
      if (s < 0) { if (p.umbrella) { rotM(_M.c, 1.2, 0, 0, 0, -BONES.fore, 0); _M.c.premultiply(_M.b); set('umb', _M.c); } else set('umb', _zero); }
    }
    for (const [s, hx, hz, kn, an, th, sh, ft] of [[1, pose.hpLx, pose.hpLz, pose.knL, pose.anL, 'thL', 'shL', 'ftL'], [-1, pose.hpRx, pose.hpRz, pose.knR, pose.anR, 'thR', 'shR', 'ftR']]) {
      rotM(_M.a, hx, 0, hz, s * BONES.hipX * (1 + L.build * 0.15), -0.03, 0); _M.a.premultiply(_M.hip);
      set(th, _M.a);
      rotM(_M.b, kn, 0, 0, 0, -BONES.thigh, 0); _M.b.premultiply(_M.a);
      set(sh, _M.b);
      rotM(_M.c, an - (hx + kn) * 0.25, 0, 0, 0, -BONES.shin, 0); _M.c.premultiply(_M.b);
      set(ft, _M.c);
    }
    if (L.backpack || L.box) { if (L.box) { rotM(_M.t, 0, 0, 0, 0, 0.12, 0.42); _M.t.premultiply(_M.sp); } else _M.t.copy(_M.sp); set('acc', _M.t); } else set('acc', _zero);
    const C = p.cols, k = this.colr.bind(this);
    k(PIDX.pelvis, C.pants); k(PIDX.torso, C.torsoC); k(PIDX.head, C.skin); k(PIDX.hair, C.hair); k(PIDX.hat, C.hat);
    k(PIDX.uaL, C.sleeve); k(PIDX.uaR, C.sleeve); k(PIDX.faL, C.fore); k(PIDX.faR, C.fore);
    k(PIDX.thL, C.pants); k(PIDX.thR, C.pants); k(PIDX.shL, C.shin); k(PIDX.shR, C.shin); k(PIDX.ftL, C.shoes); k(PIDX.ftR, C.shoes); k(PIDX.acc, C.acc); k(PIDX.umb, C.umb);
  }
  end() {
    this.mesh.geometry.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n) { this.mTex.needsUpdate = true; this.cTex.needsUpdate = true; }
  }
}

// ---------------- sidewalk navigation ----------------
function buildNav(world) {
  const R = world.roads, nodes = [];
  const byBlock = new Map();
  for (const B of world.blocks) {
    if (['park', 'garage'].includes(B.special) && false) continue;
    const off = B.style === 'suburb' || B.style === 'alpine' || B.style === 'desert' ? B.verge + B.sw / 2 : B.sw / 2 + 0.2;
    const c = B.curb;
    const r = { x0: c.x0 + off, x1: c.x1 - off, z0: c.z0 + off, z1: c.z1 - off };
    const y = world.groundY((r.x0 + r.x1) / 2, r.z0, 5);
    const cs = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].map(([x, z]) => ({ id: nodes.length + 0, x, z, y, block: B, links: [] }));
    for (const n of cs) { n.id = nodes.length; nodes.push(n); }
    for (let i = 0; i < 4; i++) { const a = cs[i], b = cs[(i + 1) % 4]; a.links.push({ to: b.id }); b.links.push({ to: a.id }); }
    byBlock.set(B, cs);
  }
  // crosswalk links
  for (const n of R.nodes) {
    if (n.kind !== 'junction') continue;
    const near = nodes.filter((q) => Math.abs(q.x - n.x) < 22 && Math.abs(q.z - n.z) < 22);
    for (const id of n.edges) {
      const e = R.edges[id];
      const atA = e.a === n.id;
      if (!(atA ? e.hasCrosswalkA : e.hasCrosswalkB)) continue;
      const d = R.dirFrom(e, n);
      const rx = -d.z, rz = d.x;
      const side = (q, sg) => { const dx = q.x - n.x, dz = q.z - n.z; return dx * d.x + dz * d.z > 0 && (dx * rx + dz * rz) * sg > e.halfW * 0.8; };
      const L = near.filter((q) => side(q, 1)).sort((a, b) => Math.hypot(a.x - n.x, a.z - n.z) - Math.hypot(b.x - n.x, b.z - n.z))[0];
      const Rr = near.filter((q) => side(q, -1)).sort((a, b) => Math.hypot(a.x - n.x, a.z - n.z) - Math.hypot(b.x - n.x, b.z - n.z))[0];
      if (!L || !Rr) continue;
      const sb = atA ? e.sbA : e.sbB;
      const cx = n.x + d.x * (sb + 2.2), cz = n.z + d.z * (sb + 2.2);
      const cw = { a: [cx + rx * (e.halfW + 0.2), cz + rz * (e.halfW + 0.2)], b: [cx - rx * (e.halfW + 0.2), cz - rz * (e.halfW + 0.2)] };
      L.links.push({ to: Rr.id, cross: { node: n.id, edge: id, from: cw.a, to: cw.b } });
      Rr.links.push({ to: L.id, cross: { node: n.id, edge: id, from: cw.b, to: cw.a } });
    }
  }
  const grid = new Map();
  for (const q of nodes) { const k = `${Math.floor(q.x / 60)},${Math.floor(q.z / 60)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(q); }
  return { nodes, grid, byBlock };
}

function ragPose(pose, p) {
  const R = p.rag, t = R.t, k = R.settled ? 0 : 1;
  const id = p.id * 100;
  Object.assign(pose, REST);
  const fl = Math.sin(t * 11 + id) * k, fl2 = Math.sin(t * 9 + id * 2) * k;
  pose.shLx = -2.1 + fl * 0.7 + (1 - k) * 1.4; pose.shRx = -1.8 + fl2 * 0.8 + (1 - k) * 1.2;
  pose.shLz = 0.9 + fl * 0.3 - (1 - k) * 0.4; pose.shRz = -0.9 - fl2 * 0.3 + (1 - k) * 0.4;
  pose.elL = -0.6 + fl * 0.4; pose.elR = -0.5 + fl2 * 0.4;
  pose.hpLx = 0.5 + fl2 * 0.5 - (1 - k) * 0.3; pose.hpRx = -0.2 + fl * 0.5 + (1 - k) * 0.2;
  pose.hpLz = 0.25; pose.hpRz = -0.25;
  pose.knL = 0.7 + fl * 0.4 + (1 - k) * 0.2; pose.knR = 0.5 + fl2 * 0.4;
  pose.headX = 0.3 + fl * 0.2; pose.lean = 0.15 * k;
  pose.hipY = 0;
}

// ---------------- system ----------------
export class Peds {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.nav = buildNav(game.world);
    this.rng = new RNG('peds');
    this.list = [];
    this.max = 60;
    this.density = 1;
    this.renderer = new CrowdRenderer(game.scene, 90);
    this.onRoad = [];
    this.t = 0;
    this.spawnT = 0;
    this.bubbles = [];
    this.pose = { ...REST };
  }

  spawn(focus) {
    const d = this.rng.range(35, 150), a = this.rng.f() * Math.PI * 2;
    const x = focus.x + Math.cos(a) * d, z = focus.z + Math.sin(a) * d;
    const k = `${Math.floor(x / 60)},${Math.floor(z / 60)}`;
    const cands = this.nav.grid.get(k);
    if (!cands || !cands.length) return;
    const n = this.rng.pick(cands);
    const m = this.nav.nodes[this.rng.pick(n.links).to];
    if (m.block !== n.block) return;
    const t = this.rng.f();
    const px = lerp(n.x, m.x, t), pz = lerp(n.z, m.z, t);
    const cam = this.game.camera;
    if (d < 70) { const v = new THREE.Vector3(px, n.y + 1, pz).project(cam); if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1) return; }
    const style = n.block.style;
    const types = style === 'suburb' || style === 'alpine' || style === 'desert' ? ['parent', 'jogger', 'student', 'elderly', 'delivery'] : style === 'industrial' ? ['worker', 'worker', 'delivery', 'guard', 'office'] : style === 'oldtown' ? ['tourist', 'student', 'shop', 'parent', 'elderly', 'office'] : ['office', 'office', 'student', 'tourist', 'shop', 'delivery', 'guard', 'jogger', 'worker'];
    if (style === 'industrial' && this.rng.chance(0.6)) return;
    const look = makeLook(this.rng, this.rng.pick(types));
    const lateral = this.rng.range(-0.7, 0.7);
    const p = {
      look, x: px, y: n.y, z: pz, yaw: 0, from: n.id, to: m.id, lat: lateral, state: 'walk', speed: look.run ? look.speed : look.speed, phase: this.rng.f() * 6, t: 0,
      idleT: 0, cols: this.colors(look), umbrella: false, wait: 0, cross: null, panic: 0, fall: 0, fallRot: 0, id: Math.random(),
    };
    p.x += -Math.sin(Math.atan2(m.x - n.x, m.z - n.z) + Math.PI / 2) * 0;
    if (this.rng.chance(0.12) && !look.run) { p.state = 'idle'; p.idleT = this.rng.range(6, 25); p.idleAnim = this.rng.pick(['idle', 'phone', 'idle', 'lean']); }
    this.list.push(p);
  }

  // a person who stays where they are placed (car meets, events) until the owner removes them
  spawnStatic(x, z, yaw, type, anim = 'idle') {
    const look = makeLook(this.rng, type);
    const p = { look, x, y: this.world.groundY(x, z, 50), z, yaw, from: 0, to: 0, lat: 0, state: 'stay', stay: true, speed: 0, phase: this.rng.f() * 6, t: 0, idleT: 0, idleAnim: anim, cols: this.colors(look), umbrella: false, wait: 0, cross: null, panic: 0, fall: 0, fallRot: 0, id: Math.random() };
    this.list.push(p);
    return p;
  }

  colors(L) {
    const c = (h) => new THREE.Color(h);
    const top = c(L.vest ? '#d9e021' : L.top), jacket = L.jacket ? c(L.jacket) : null;
    const sleeveLong = !!jacket || L.type === 'office';
    return {
      pants: c(L.pants), torsoC: jacket || top, skin: c(L.skin), hair: c(L.hair), hat: c(L.hatColor),
      sleeve: jacket || top, fore: sleeveLong ? (jacket || top) : c(L.skin), shin: L.shorts ? c(L.skin) : c(L.pants), shoes: c(L.shoes),
      acc: L.box ? c('#b08a5a') : c('#2f3a2f'), umb: c(['#1a1a1a', '#1d4f91', '#b3261e', '#2e7d32', '#6b3fa0'][Math.floor(Math.random() * 5)]),
    };
  }

  nextTarget(p) {
    const cur = this.nav.nodes[p.to];
    const prev = p.from;
    let opts = cur.links.filter((l) => l.to !== prev);
    if (!opts.length) opts = cur.links;
    const crossing = opts.filter((l) => l.cross);
    let pick = this.rng.pick(opts);
    if (crossing.length && this.rng.chance(0.45)) pick = this.rng.pick(crossing);
    p.from = p.to; p.to = pick.to;
    p.cross = pick.cross ? { ...pick.cross, stage: 0 } : null;
  }

  update(dt, focus) {
    const g = this.game;
    this.t += dt;
    const rain = g.sky.w.rain;
    const night = g.sky.night;
    const target = Math.round(this.max * this.density * (night > 0.6 ? 0.4 : 1) * (rain > 0.5 ? 0.6 : 1));
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.list.length < target) { this.spawnT = 0.08; this.spawn(focus); }
    this.onRoad.length = 0;
    const vehicles = [...g.vehicles];
    const R = this.world.roads;
    this.renderer.begin();
    const V = g.view;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const d2 = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2;
      if (d2 > 200 * 200) { this.list.splice(i, 1); continue; }
      if (p.gone) { this.list.splice(i, 1); continue; }
      p.t += dt;
      p.umbrella = rain > 0.3 && !p.look.run && !p.look.box && (p.id * 10) % 1 < 0.6;
      // threats: vehicles approaching fast
      let threat = null;
      for (const v of vehicles) {
        if (v.speed < 3 || Math.abs(v.y - p.y) > 2.5) continue;
        const dx = p.x - v.group.position.x, dz = p.z - v.group.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 12) continue;
        const f = v.fwd();
        const ahead = dx * f.x + dz * f.z;
        const lat = dx * -f.z + dz * f.x;
        if (ahead > -1 && Math.abs(lat) < v.hz + 1.6) threat = { v, lat, dist, ahead };
        // contact
        if (p.state === 'ragdoll') continue;
        const hit = obbVsCircle(v.obb(), { x: p.x, z: p.z, r: 0.34 });
        if (hit) this.knock(p, v, hit);
      }
      if (threat) p.reactT = (p.reactT || 0) + dt; else p.reactT = 0;
      const react = p.reactT > (p.state === 'idle' || p.phone ? 0.75 : 0.32 + (p.id * 7 % 1) * 0.22);
      if (threat && react && !p.noDodge && p.state !== 'ragdoll' && p.state !== 'dive') {
        const f = threat.v.fwd();
        const side = threat.lat >= 0 ? 1 : -1;
        p.dive = { x: -f.z * side, z: f.x * side, t: 0.6 };
        p.state = 'dive'; p.panic = 6;
        g.emit('ped:scared', { p, v: threat.v });
      }
      this.step(p, dt, R);
      const sp = p.state === 'flee' ? 4.5 : p.state === 'walk' ? p.speed : 0;
      const running = p.state === 'flee' || p.look.run;
      p.phase += (sp / (running ? 2.2 : 1.45)) * Math.PI * dt;
      if (d2 < 135 * 135 && V.sphere(p.x, p.y + 0.9, p.z, 1.8)) {
        let anim = 'idle';
        if (p.state === 'walk' || p.state === 'flee') anim = running ? 'run' : 'walk';
        if (p.state === 'idle' || p.state === 'stay') anim = p.idleAnim || 'idle';
        if (p.state === 'wait') anim = p.phone ? 'phone' : 'idle';
        if (p.state === 'dive') anim = 'cower';
        if (p.state === 'ragdoll') anim = p.rag.settled ? 'lying' : 'flail';
        if (p.state === 'watch') anim = p.phone ? 'phone' : 'idle';
        const pose = poseFor(anim, p.t + p.id * 10, p.phase, 1, this.pose);
        if (p.state === 'ragdoll') ragPose(pose, p);
        this.renderer.write(p, pose);
        if (d2 < 60 * 60 && p.state !== 'ragdoll') g.contact.add(p.x, p.y, p.z, p.yaw, 0.75, 0.75, 0.5, 0.35);
      }
      if (p.onRoad) this.onRoad.push(p);
    }
    this.renderer.end();
  }

  step(p, dt, R) {
    const g = this.game;
    if (p.state === 'ragdoll') { this.stepRagdoll(p, dt); return; }
    if (p.state === 'dive') {
      p.dive.t -= dt;
      p.x += p.dive.x * 5 * dt; p.z += p.dive.z * 5 * dt;
      if (p.dive.t <= 0) { p.state = p.stay ? 'stay' : p.panic > 0 ? 'flee' : 'walk'; }
      p.y = this.world.groundY(p.x, p.z, p.y + 0.5);
      return;
    }
    if (p.state === 'stay') { p.y = this.world.groundY(p.x, p.z, p.y + 0.5) + (p.yOff || 0); return; }
    if (p.state === 'idle') { p.idleT -= dt; if (p.idleT <= 0) p.state = 'walk'; return; }
    if (p.state === 'watch') { p.watchT -= dt; if (p.watchT <= 0) p.state = 'walk'; return; }
    p.panic = Math.max(0, p.panic - dt);
    if (p.state === 'flee' && p.panic <= 0) p.state = 'walk';
    const speed = p.state === 'flee' ? 4.4 : p.speed * (g.sky.w.rain > 0.5 && !p.umbrella ? 1.25 : 1);
    // crossing sequence
    let tx, tz;
    const to = this.world ? this.nav.nodes[p.to] : null;
    if (p.cross) {
      const c = p.cross;
      if (c.stage === 0) { tx = c.from[0]; tz = c.from[1]; }
      else if (c.stage === 1) { tx = c.to[0]; tz = c.to[1]; }
      else { tx = to.x; tz = to.z; }
    } else { tx = to.x; tz = to.z; }
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (p.cross && p.cross.stage === 0 && d < 0.6) {
      const node = R.nodes[p.cross.node];
      const ok = R.walk(node, p.cross.edge, g.traffic.t) && !this.carsNear(p.cross);
      if (!ok && p.state !== 'flee') { p.state = 'wait'; p.phone = p.phone ?? Math.random() < 0.3; p.yaw = dampAngle(p.yaw, Math.atan2(p.cross.to[0] - p.x, p.cross.to[1] - p.z), 5, dt); return; }
      p.state = p.state === 'wait' ? 'walk' : p.state;
      p.cross.stage = 1;
    } else if (p.cross && p.cross.stage === 1 && d < 0.6) p.cross.stage = 2;
    else if (d < 0.5 && (!p.cross || p.cross.stage === 2)) { this.nextTarget(p); if (Math.random() < 0.08 && p.state === 'walk' && !p.look.run) { p.state = 'idle'; p.idleT = 3 + Math.random() * 8; p.idleAnim = Math.random() < 0.3 ? 'phone' : 'idle'; } return; }
    p.onRoad = !!(p.cross && p.cross.stage === 1);
    const hy = Math.atan2(dx, dz);
    p.yaw = dampAngle(p.yaw, hy, 8, dt);
    const lat = p.cross && p.cross.stage === 1 ? 0 : p.lat;
    const nx = dx / (d || 1), nz = dz / (d || 1);
    let mx = nx * speed * dt + (-nz * lat - 0) * 0, mz = nz * speed * dt;
    // simple separation from other peds
    for (const o of this.list) {
      if (o === p) continue;
      const ox = p.x - o.x, oz = p.z - o.z, od = ox * ox + oz * oz;
      if (od < 0.5 && od > 1e-4) { const k = (0.7 - Math.sqrt(od)) * 0.5; mx += (ox / Math.sqrt(od)) * k * dt * 4; mz += (oz / Math.sqrt(od)) * k * dt * 4; }
    }
    // avoid player
    const pl = g.player;
    if (!pl.vehicle) { const ox = p.x - pl.x, oz = p.z - pl.z, od = Math.hypot(ox, oz); if (od < 0.75 && od > 1e-3) { mx += (ox / od) * (0.75 - od); mz += (oz / od) * (0.75 - od); if (pl.speed > 4 && !p.bumped) { p.bumped = 2; this.say(p, ['Watch it!', 'Hey!', 'Excuse you!', 'Seriously?'][Math.floor(Math.random() * 4)]); } } }
    if (p.bumped) p.bumped = Math.max(0, p.bumped - dt);
    p.x += mx + -nz * (lat - (p.latNow || 0)) * Math.min(1, dt * 2);
    p.z += mz + nx * (lat - (p.latNow || 0)) * Math.min(1, dt * 2);
    p.latNow = lerp(p.latNow || 0, lat, Math.min(1, dt * 2));
    p.y = this.world.groundY(p.x, p.z, p.y + 0.5);
  }

  carsNear(cross) {
    const [x, z] = cross.to;
    for (const c of this.game.traffic.cars) if (c.state === 'drive' && c.v > 2 && (c.x - x) ** 2 + (c.z - z) ** 2 < 400) return true;
    return false;
  }

  // A vehicle strikes a pedestrian: launch a tumbling body (severity from closing speed), dent the car, scare the street.
  knock(p, v, hit) {
    const g = this.game, ph = v.phys;
    const rvx = ph.vx, rvz = ph.vz, rel = Math.hypot(rvx, rvz);
    const sp = Math.min(rel, 48);
    let nx = -hit.nx, nz = -hit.nz;
    let dx = rel > 1 ? (rvx / rel) * 0.8 + nx * 0.2 : nx, dz = rel > 1 ? (rvz / rel) * 0.8 + nz * 0.2 : nz;
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const sev = sp < 3.5 ? 0 : sp < 10 ? 1 : 2;
    p.state = 'ragdoll'; p.cross = null; p.onRoad = false; p.umbrella = false;
    const hv = Math.min(sp * 0.9, sp * 0.55 + 1.6);
    p.rv = { x: dx * hv, y: 1.8 + Math.min(sp, 30) * 0.17 + Math.random() * 0.8, z: dz * hv };
    p.y += 0.95; // centre of mass
    p.rot = { pitch: 0, roll: 0 };
    const front = (hit.nx * Math.sin(v.yaw) + hit.nz * Math.cos(v.yaw)) < -0.3;
    p.spin = { pitch: (front ? -1 : 1) * (2.5 + sp * 0.28) * (0.8 + Math.random() * 0.4), roll: (Math.random() - 0.5) * (1 + sp * 0.2), yaw: (Math.random() - 0.5) * sp * 0.15 };
    p.yaw = Math.atan2(-dx, -dz);
    p.rag = { t: 0, bounces: 0, settled: false, sev, lie: 0 };
    p.downT = sev === 2 ? 45 : sev === 1 ? 7 + Math.random() * 3 : 2.5;
    p.fatal = sev === 2 && sp > 16;
    // the car gives up a little momentum and is dented in proportion
    const k = Math.max(0.94, 1 - 0.0025 * sp - 0.01);
    ph.vx *= k; ph.vz *= k;
    if (sp > 5) { v.applyDamage?.(hit.px, hit.pz, Math.min(2.4 + sp * 0.45, 14), hit.nx, hit.nz); if (sp > 15 && v.damage) v.damage.glass = Math.min(1, v.damage.glass + 0.4); }
    g.emit('ped:hit', { p, v, speed: sp, severity: sev, fatal: p.fatal, female: p.look.female, x: p.x, y: p.y, z: p.z });
    this.alarm(p.x, p.z, 38);
  }

  stepRagdoll(p, dt) {
    const g = this.game, R = p.rag, W = this.world;
    R.t += dt;
    if (!R.settled) {
      p.rv.y -= 9.81 * dt;
      p.x += p.rv.x * dt; p.y += p.rv.y * dt; p.z += p.rv.z * dt;
      p.rot.pitch += p.spin.pitch * dt; p.rot.roll += p.spin.roll * dt; p.yaw += p.spin.yaw * dt;
      W.colliders.query(p.x, p.z, 0.7, p.y - 0.9, p.y + 0.9, (c) => {
        if (!c.solid) return;
        let hitN = null;
        if (c.type === 'circle') { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + 0.3; if (d < m && d > 1e-4) hitN = { nx: dx / d, nz: dz / d, depth: m - d }; }
        else { const h = obbVsCircle(c, { x: p.x, z: p.z, r: 0.3 }); if (h) hitN = { nx: -h.nx, nz: -h.nz, depth: h.depth }; }
        if (!hitN) return;
        p.x += hitN.nx * hitN.depth; p.z += hitN.nz * hitN.depth;
        const vn = p.rv.x * hitN.nx + p.rv.z * hitN.nz;
        if (vn < 0) { p.rv.x -= 1.35 * vn * hitN.nx; p.rv.z -= 1.35 * vn * hitN.nz; p.rv.x *= 0.5; p.rv.z *= 0.5; if (-vn > 4) g.emit('ped:bounce', { p, impact: -vn }); }
      });
      const gy = W.groundY(p.x, p.z, p.y + 1);
      const floor = gy + 0.15;
      if (p.y <= floor) {
        const impact = Math.max(0, -p.rv.y);
        p.y = floor;
        if (impact > 2.4 && R.bounces < 4) g.emit('ped:bounce', { p, impact });
        p.rv.y = impact > 2.4 ? impact * 0.26 : 0;
        const fr = 1 - Math.min(1, dt * (impact > 1 ? 9 : 5));
        p.rv.x *= fr * 0.85; p.rv.z *= fr * 0.85;
        p.spin.pitch *= 0.55; p.spin.roll *= 0.55; p.spin.yaw *= 0.6;
        R.bounces++;
        if (p.rv.y < 0.35 && Math.hypot(p.rv.x, p.rv.z) < 0.9 && R.bounces > 1) R.settled = true;
      }
      if (R.t > 5) R.settled = true;
      if (R.settled) { const a = ((p.rot.pitch % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI; R.lieTo = a >= 0 ? Math.PI / 2 : -Math.PI / 2; R.pitch0 = a; p.rot.pitch = a; }
    } else {
      R.lie = Math.min(1, R.lie + dt * 3);
      p.rot.pitch = R.pitch0 + (R.lieTo - R.pitch0) * (R.lie * R.lie * (3 - 2 * R.lie));
      p.rot.roll *= 1 - Math.min(1, dt * 6);
      p.y = W.groundY(p.x, p.z, p.y + 1) + 0.13;
      p.rv.x = p.rv.z = 0;
      p.downT -= dt;
      if (p.downT <= 0) {
        if (p.fatal) { p.state = 'gone'; p.gone = true; return; }
        p.rag = null; p.state = 'flee'; p.panic = 8; p.y = W.groundY(p.x, p.z, p.y + 1); p.rot = null; p.fallRot = 0;
      }
    }
  }

  // world reactions
  alarm(x, z, r = 30, kind = 'crash') {
    for (const p of this.list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > r || p.state === 'ragdoll') continue;
      if (Math.random() < 0.45) { p.state = 'flee'; p.panic = 5 + Math.random() * 4; }
      else { p.state = 'watch'; p.watchT = 4 + Math.random() * 6; p.phone = Math.random() < 0.6; p.yaw = Math.atan2(x - p.x, z - p.z); }
    }
  }

  say(p, text) {
    this.bubbles.push({ p, text, t: 2.5 });
    this.game.emit('ped:say', { p, text });
  }

  nearest(x, z, maxD = 3) {
    let best = null, bd = maxD;
    for (const p of this.list) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
}
