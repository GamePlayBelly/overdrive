import * as THREE from 'three';
import { BONES, REST, DEFAULT_LOOK } from './human.js';
import { HEAD, headGeo, eyeParts, eyePos, earGeo, limbGeo, handGeo, shoeGeo, soleGeo, hairGeo } from './avatarParts.js';
import { addGear } from './avatarGear.js';

const geoCache = new Map();
const memo = (k, f) => { if (!geoCache.has(k)) geoCache.set(k, f()); return geoCache.get(k); };
const matCache = new Map();
export function mat(color, rough = 0.8, metal = 0, o = {}) {
  const k = color + rough + metal + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...o }));
  return matCache.get(k);
}
const skinMat = (color, vertex = false) => {
  const k = 'skin' + color + vertex;
  if (!matCache.has(k)) { const c = new THREE.Color(vertex ? '#ffffff' : color); matCache.set(k, new THREE.MeshPhysicalMaterial({ color: c, vertexColors: vertex, roughness: 0.74, envMapIntensity: 0.55, sheen: 0.12, sheenRoughness: 0.6, sheenColor: new THREE.Color(color) })); }
  return matCache.get(k);
};

function torsoGeo(build) {
  return memo('torso' + build.toFixed(2), () => {
    const w = 1 + build * 0.35;
    const ctrl = [[0.001, -0.02], [0.15 * w, 0], [0.16 * w, 0.08], [0.145 * w, 0.2], [0.162 * w, 0.34], [0.182 * w, 0.44], [0.15 * w, 0.505], [0.072, 0.535], [0.001, 0.55]].map(([r, y]) => new THREE.Vector2(r, y));
    const curve = new THREE.SplineCurve(ctrl), pts = curve.getPoints(26);
    const g = new THREE.LatheGeometry(pts, 28);
    g.scale(1, 1, 0.64);
    return g;
  });
}

function beardGeo(face, skin, kind) {
  return memo(`beard${kind}${face.jaw}${face.nose}${face.brow}${skin}`, () => {
    const hg = headGeo(face, skin), p = hg.attributes.position, n = hg.attributes.normal, ix = hg.index.array;
    const top = kind === 'stubble' ? -0.004 : kind === 'goatee' ? -0.064 : kind === 'mustache' ? -0.034 : -0.018, bot = kind === 'mustache' ? -0.056 : -9;
    const out = kind === 'stubble' ? 0.0013 : kind === 'mustache' ? 0.0034 : 0.0048;
    const ok = (i) => { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y > top || y < bot || z < -0.05) return false; if (kind === 'goatee' && Math.abs(x) > 0.026) return false; if (kind === 'mustache' && Math.abs(x) > 0.034) return false; if (kind === 'beard' && z > 0.07 && Math.abs(x) < 0.024 && y > -0.074 && y < -0.046) return false; return true; };
    const pos = [], nor = [], idx = [], map = new Map();
    const get = (i) => { if (!map.has(i)) { map.set(i, pos.length / 3); pos.push(p.getX(i) + n.getX(i) * out, p.getY(i) + n.getY(i) * out, p.getZ(i) + n.getZ(i) * out); nor.push(n.getX(i), n.getY(i), n.getZ(i)); } return map.get(i); };
    for (let t = 0; t < ix.length; t += 3) if (ok(ix[t]) && ok(ix[t + 1]) && ok(ix[t + 2])) idx.push(get(ix[t]), get(ix[t + 1]), get(ix[t + 2]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    return g;
  });
}

// ---------- detailed character (player, story NPCs, police officers) ----------
export function buildHuman(look = DEFAULT_LOOK) {
  const L = { ...DEFAULT_LOOK, ...look };
  const sp = L.species || 'human', accs = new Set(L.acc || []);
  const SKIN = { android: '#dfe6ee', alien: '#8fd19e', skull: '#e8e4d6', cyber: '#27d3cc', fox: '#e08a4a' };
  if (SKIN[sp]) L.skin = SKIN[sp];
  if (accs.has('hood')) L.skin = '#16161a';
  const face = L.face || DEFAULT_LOOK.face;
  const S = L.height / 1.76, b = L.build;
  const root = new THREE.Group(), rig = { root, look: L, scale: S };
  const skin = skinMat(L.skin), skinHead = skinMat(L.skin, true);
  const android = sp === 'android';
  const top = android ? mat('#eef2f6', 0.22, 0.25) : mat(L.top.color, 0.88);
  const jacketOn = !android && L.jacket && L.jacket.type !== 'none';
  const jk = android ? top : jacketOn ? mat(L.jacket.color, L.jacket.type === 'leather' ? 0.4 : 0.82, L.jacket.type === 'leather' ? 0.12 : 0) : top;
  const pants = android ? mat('#d6dde5', 0.25, 0.3) : mat(L.pants.color, 0.86);
  const shoes = android ? mat('#2a3340', 0.4, 0.5) : mat(L.shoes.color, 0.55);
  const hairM = mat(L.hair.color, 0.5, 0.05, { side: THREE.DoubleSide });
  const dark = mat('#1b222b', 0.5, 0.6);
  const glowC = mat('#35d3ff', 0.2, 0, { emissive: '#35d3ff', emissiveIntensity: 2.2 });
  const add = (parent, geo, m, x = 0, y = 0, z = 0, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; parent.add(o); return o; };
  const inner = new THREE.Group(); inner.scale.setScalar(S); root.add(inner);
  const hips = new THREE.Group(); hips.position.y = BONES.hipY; inner.add(hips);
  const pelvis = add(hips, new THREE.SphereGeometry(0.155 + b * 0.04, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), pants, 0, 0.03, 0);
  pelvis.scale.set(1, 0.9, 0.72); pelvis.rotation.x = Math.PI;
  const spine = new THREE.Group(); spine.position.y = 0.02; hips.add(spine);
  const torso = add(spine, torsoGeo(b), jacketOn && L.jacket.type !== 'vest' ? jk : top, 0, -0.02, 0);
  if (jacketOn) {
    const collar = add(spine, new THREE.CylinderGeometry(0.06, 0.07, 0.035, 14, 1, true), top, 0, 0.545, 0.004, false);
    collar.material = collar.material.clone(); collar.material.side = THREE.DoubleSide;
    if (L.jacket.type === 'hoodie' || L.jacket.type === 'puffer') { const hood = add(spine, new THREE.TorusGeometry(0.1, 0.035, 8, 16), jk, 0, 0.52, -0.035); hood.rotation.x = Math.PI / 2 - 0.3; }
    else if (L.jacket.type !== 'vest') { const zip = add(spine, new THREE.BoxGeometry(0.008, 0.46, 0.006), mat('#c8ccd0', 0.3, 0.8), 0, 0.27, 0.118 + b * 0.02, false); zip.rotation.x = -0.05; }
  } else if (!android) { const collar = add(spine, new THREE.TorusGeometry(0.057, 0.0075, 8, 18), top, 0, 0.538, 0.004, false); collar.rotation.x = Math.PI / 2; }
  const belt = add(spine, new THREE.CylinderGeometry(0.162 * (1 + b * 0.35), 0.158 * (1 + b * 0.35), 0.045, 28), mat('#231c17', 0.55), 0, -0.012, 0, false);
  belt.scale.z = 0.7;
  add(spine, new THREE.BoxGeometry(0.036, 0.03, 0.01), mat('#b8bcc0', 0.25, 0.9), 0, -0.012, 0.115 + b * 0.02, false);
  add(spine, new THREE.CylinderGeometry(0.047, 0.056, 0.12, 18), skin, 0, BONES.neckY, 0);
  const headG = new THREE.Group(); headG.position.y = BONES.neckY + 0.05; spine.add(headG);
  const HY = 0.108, HZ = 0.012;
  const head = add(headG, headGeo(face, L.skin), skinHead, 0, HY, HZ);
  // lips
  { const lipM = mat(new THREE.Color(L.skin).lerp(new THREE.Color('#8a2f35'), 0.6).getStyle(), 0.5); const up = add(headG, new THREE.SphereGeometry(1, 14, 8), lipM, 0, HY - 0.0545, HZ + 0.0925, false); up.scale.set(0.0175, 0.0042, 0.0058); const lo = add(headG, new THREE.SphereGeometry(1, 14, 8), lipM, 0, HY - 0.0645, HZ + 0.091, false); lo.scale.set(0.0155, 0.0052, 0.0062); add(headG, new THREE.BoxGeometry(0.03, 0.0016, 0.004), mat('#3a1214', 0.8), 0, HY - 0.0595, HZ + 0.0925, false); }
  const ctx = { THREE, L, sp, accs, S, b, root, inner, hips, spine, torso, headG, HY, HZ, head, add, mat, skin, hairM, top, jk, dark, glowC, jacketOn, android };
  // eyes
  const E = eyeParts(), eyeW = mat('#f3efe8', 0.2), irisM = mat(L.eyes, 0.25), pupilM = mat('#050505', 0.2), lidM = skin;
  ctx.eyeGroups = [];
  const redEyes = accs.has('hood'), robot = android;
  for (const s of [1, -1]) {
    const pe = eyePos(s), g = new THREE.Group(); g.position.set(pe.x, HY + pe.y, HZ + pe.z); headG.add(g); ctx.eyeGroups.push(g);
    if (redEyes) { const m = add(g, new THREE.SphereGeometry(0.0085, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }), 0, 0, 0.004, false); m.scale.set(1.5, 0.8, 0.5); m.rotation.z = s * 0.25; continue; }
    if (robot) { const m = add(g, new THREE.SphereGeometry(0.0095, 10, 8), new THREE.MeshBasicMaterial({ color: '#35d3ff' }), 0, 0, 0.004, false); m.scale.set(1.3, 1.1, 0.5); continue; }
    add(g, E.ball, eyeW, 0, 0, 0, false);
    add(g, E.iris, irisM, 0, 0, 0.0113, false); add(g, E.pupil, pupilM, 0, 0, 0.0116, false);
    add(g, E.glint, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 0.0022 * s, 0.0026, 0.0121, false);
    add(g, E.lidTop, lidM, 0, 0.0006, 0, false).rotation.x = 0.1;
    add(g, E.lidBot, lidM, 0, 0, 0, false);
    const browM = mat(L.hair.color, 0.7), cu = new THREE.CatmullRomCurve3([[0.011 * s, 0.019, 0.003], [0.026 * s, 0.026 + face.brow * 0.003, 0.0045], [0.042 * s, 0.021, 0.0], [0.05 * s, 0.012, -0.004]].map((a) => new THREE.Vector3(...a)));
    const brow = add(g, new THREE.TubeGeometry(cu, 10, 0.0034, 5), browM, 0, 0, 0.0035, false); brow.scale.set(1, 0.75, 0.8);
  }
  // ears
  for (const s of [1, -1]) {
    const pt = sp === 'alien' ? 0 : (sp === 'elf' || accs.has('elf')) ? 1.2 : 0;
    const ear = add(headG, earGeo(pt), skin, s * (HEAD.rx * 0.97), HY + (pt ? 0.012 : 0), HZ - 0.006, false);
    if (pt) ear.rotation.z = s * -1.15; else ear.rotation.y = s * 0.22;
  }
  // facial hair
  if (L.facial && L.facial !== 'none' && sp === 'human') {
    const fm = L.facial === 'stubble' ? mat(L.hair.color, 1, 0, { transparent: true, opacity: 0.42 }) : mat(L.hair.color, 0.75);
    if (L.facial === 'beard') add(headG, beardGeo(face, L.skin, 'beard'), fm, 0, HY, HZ, false);
    else if (L.facial === 'stubble') add(headG, beardGeo(face, L.skin, 'stubble'), fm, 0, HY, HZ, false);
    else if (L.facial === 'goatee') { add(headG, beardGeo(face, L.skin, 'goatee'), fm, 0, HY, HZ, false); add(headG, beardGeo(face, L.skin, 'mustache'), fm, 0, HY, HZ, false); }
    else if (L.facial === 'mustache') add(headG, beardGeo(face, L.skin, 'mustache'), fm, 0, HY, HZ, false);
  }
  // hair
  const hatOn = L.hat && L.hat.type !== 'none';
  const hg = ['human', 'fox', 'cat', 'elf', 'cyber'].includes(sp) && !accs.has('hood') ? hairGeo(L.hair.style) : null;
  if (hg && !(hatOn && L.hat.type !== 'cap' && L.hat.type !== 'sun')) add(headG, hg, hairM, 0, HY, HZ, false);
  // arms
  const armR = 0.043 + b * 0.012, long = jacketOn || L.top.type === 'shirt' || L.top.type === 'hoodie' || android;
  const sleeve = jacketOn || L.top.type === 'shirt' || L.top.type === 'hoodie' ? jk : top;
  const mkArm = (s) => {
    const sh = new THREE.Group(); sh.position.set(s * BONES.shoulderX * (1 + b * 0.12), BONES.shoulderY, 0); spine.add(sh);
    add(sh, new THREE.SphereGeometry(armR * 1.32, 14, 10), L.top.type === 'tank' && !jacketOn ? skin : sleeve, 0, -0.02, 0);
    const up = BONES.upper, fo = BONES.fore;
    add(sh, limbGeo(armR * 1.1, armR * 0.88, up - 0.015, 0.1, 0.25), long || L.top.type === 'tshirt' || L.top.type === 'polo' ? (long ? sleeve : skin) : skin, 0, 0, 0);
    if (!long && (L.top.type === 'tshirt' || L.top.type === 'polo')) add(sh, limbGeo(armR * 1.2, armR * 1.12, 0.12, 0, 0.5), top, 0, -0.005, 0);
    const el = new THREE.Group(); el.position.y = -up; sh.add(el);
    add(el, new THREE.SphereGeometry(armR * 0.9, 12, 8), long ? sleeve : skin, 0, 0, 0);
    add(el, limbGeo(armR * 0.9, armR * 0.62, fo - 0.015, 0.1, 0.2), long ? sleeve : skin, 0, 0, 0);
    const hand = new THREE.Group(); hand.position.y = -fo - 0.005; el.add(hand);
    if (long) add(hand, new THREE.CylinderGeometry(armR * 0.72, armR * 0.78, 0.034, 14), android ? dark : mat(jacketOn ? L.jacket.color : L.top.color, 0.95), 0, 0.012, 0, false);
    add(hand, handGeo(s, false), android ? dark : skin, 0, 0, 0);
    if (s < 0 && L.watch && L.watch !== 'none') add(el, new THREE.CylinderGeometry(armR * 0.72, armR * 0.72, 0.025, 12), mat(L.watch === 'gold' ? '#c9a23a' : L.watch === 'smart' ? '#1a1a1a' : '#b8bcc0', 0.3, 0.8), 0, -fo + 0.015, 0, false);
    return { sh, el, hand };
  };
  const aL = mkArm(1), aR = mkArm(-1);
  // legs
  const legR = 0.062 + b * 0.02, shorts = L.pants.type === 'shorts' && !android;
  const mkLeg = (s) => {
    const hp = new THREE.Group(); hp.position.set(s * BONES.hipX * (1 + b * 0.15), -0.03, 0); hips.add(hp);
    add(hp, limbGeo(legR * 1.2, legR * 0.93, BONES.thigh - 0.02, 0.12, 0.2), pants, 0, 0, 0);
    const kn = new THREE.Group(); kn.position.y = -BONES.thigh; hp.add(kn);
    add(kn, new THREE.SphereGeometry(legR * 0.88, 12, 8), shorts ? skin : pants, 0, 0, 0);
    add(kn, limbGeo(legR * 0.9, legR * 0.56, BONES.shin - 0.03, 0.2, 0.28), shorts ? skin : pants, 0, 0, 0);
    const an = new THREE.Group(); an.position.y = -BONES.shin; kn.add(an);
    const kind = L.shoes.type === 'boots' ? 'boots' : 'sneakers';
    const shoe = add(an, shoeGeo(kind), shoes, 0, 0.02, 0);
    add(an, soleGeo(), mat(L.shoes.type === 'sneakers' || L.shoes.type === 'runners' ? '#f4f4f2' : '#15130f', 0.6), 0, 0.02, 0, false);
    return { hp, kn, an, shoe };
  };
  const lL = mkLeg(1), lR = mkLeg(-1);
  if (L.chain && L.chain !== 'none') { const c = add(spine, new THREE.TorusGeometry(0.075, L.chain === 'thick' ? 0.009 : 0.004, 5, 16), mat('#d4af37', 0.25, 1), 0, 0.46, 0.035, false); c.rotation.x = Math.PI / 2 + 0.35; }
  if (L.bag === 'backpack') add(spine, new THREE.BoxGeometry(0.28, 0.36, 0.14), mat('#2f3a2f', 0.8), 0, 0.28, -0.15);
  if (L.bag === 'messenger') add(spine, new THREE.BoxGeometry(0.3, 0.22, 0.08), mat('#5a4030', 0.7), 0.14, 0.02, -0.02);
  Object.assign(ctx, { aL, aR, lL, lR, hatOn });
  addGear(ctx);
  Object.assign(rig, { inner, hips, spine, headG, aL, aR, lL, lR, torso });
  rig.pose = { ...REST };
  return rig;
}
