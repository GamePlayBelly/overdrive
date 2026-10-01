import * as THREE from 'three';
import { buildHuman, poseFor, applyPose, blendPose } from '../actors/human.js';
import { ARCHETYPES, BASE_LOOK } from '../data/avatars.js';
import { Loading } from './loading.js';
import { modal, h, btn, toast } from './ui.js';

// Walk into buildings: a door prompt on the facade, a curtain transition, and a small furnished room with a person to talk to and things to pick up.
const OX = 6000, OZ = 6000, OY = 200, WALL = 3.6;
const rgb = (c) => new THREE.Color(c);
const mats = new Map();
const mat = (c, r = 0.85, m = 0, o = {}) => { const k = c + r + m + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...o })); return mats.get(k); };
const hash = (a, b) => { let x = (Math.imul(Math.round(a), 73856093) ^ Math.imul(Math.round(b), 19349663)) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995) >>> 0; return (x ^ (x >>> 15)) >>> 0; };
const pick = (arr, s) => arr[s % arr.length];

const NAMES = {
  market: ['Corner Market', 'Fresh Basket', 'Quick Stop', 'Maple Grocers'], cafe: ['Brew & Bean', 'The Daily Cup', 'Kettle Corner', 'Moonlight Cafe'], office: ['Ortiz & Daughters', 'Halden Logistics', 'Brightline Realty', 'Northgate Insurance'],
  workshop: ['Stratton Auto', 'Gearhead Garage', 'Foundry Works', 'Quick Torque'], bar: ['The Rusty Anchor', 'Low Gear Lounge', 'Neon Fox', 'Old City Tap'], house: ['Private home', 'Family residence', 'Apartment', 'Cottage'],
  warehouse: ['Dockside Storage', 'Riverton Freight', 'Foundry Supply', 'Bay Cargo'], police: ['RCPD Precinct'], gym: ['Iron Works Gym', 'Pulse Fitness'],
};
const ROLES = { market: 'Clerk', cafe: 'Barista', office: 'Manager', workshop: 'Mechanic', bar: 'Bartender', house: 'Resident', warehouse: 'Foreman', police: 'Desk sergeant', gym: 'Trainer' };
const LOOKS = ['rookie', 'dj', 'sunny', 'operator', 'glitch', 'neko', 'elf', 'rookie'];
const SIZE = { market: [14, 10], cafe: [12, 9], office: [16, 11], workshop: [16, 12], bar: [14, 10], house: [12, 9], warehouse: [18, 14], police: [14, 10], gym: [14, 11] };
const STYLE_TYPES = { cbd: ['office', 'cafe', 'market', 'gym', 'office'], oldtown: ['bar', 'cafe', 'market', 'gym'], suburb: ['house', 'house', 'market', 'house', 'cafe'], industrial: ['warehouse', 'workshop', 'warehouse', 'workshop'], harbor: ['warehouse', 'workshop', 'bar'], hills: ['house', 'workshop'], country: ['house', 'warehouse'], forest: ['house', 'cafe'] };

export class Interiors {
  constructor(app) {
    this.app = app; this.g = app.game;
    this.inside = null; this.busy = false; this.prompt = null; this.looted = new Set();
    this.group = new THREE.Group(); this.group.visible = false; this.g.scene.add(this.group);
  }

  get active() { return !!this.inside || this.busy; }

  // building under the player's hands, if any
  doorway() {
    const g = this.g, P = g.player;
    let best = null, bd = 2.6;
    g.world.colliders.query(P.x, P.z, 3.5, P.y + 0.2, P.y + 2, (c) => {
      if (c.kind !== 'building' || c.type !== 'box' || c.removed || c.hx < 3 || c.hz < 3 || c.y1 - Math.max(c.y0, 0) < 3.5) return;
      const dx = P.x - c.x, dz = P.z - c.z, lx = dx * c.cos + dz * c.sin, lz = -dx * c.sin + dz * c.cos;
      const ox = Math.max(Math.abs(lx) - c.hx, 0), oz = Math.max(Math.abs(lz) - c.hz, 0), d = Math.hypot(ox, oz);
      if (d >= bd) return;
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), vx = c.x - P.x, vz = c.z - P.z, l = Math.hypot(vx, vz) || 1;
      if ((fx * vx + fz * vz) / l < 0.1) return;
      bd = d; best = c;
    });
    if (!best) return null;
    const c = best, seed = hash(c.x, c.z), W = g.world, poi = W.poi;
    let type;
    const near = (p, r) => p && Math.hypot(p.x - c.x, p.z - c.z) < r;
    if (near(poi.police, 45)) type = 'police'; else if (near(poi.garage, 30)) type = 'workshop'; else if (near(poi.diner, 25)) type = 'cafe'; else if (near(poi.motorClub, 40)) type = 'bar';
    else type = pick(STYLE_TYPES[W.districtAt(c.x, c.z).style] || ['market', 'cafe', 'house'], seed >>> 3);
    return { c, type, seed, name: pick(NAMES[type], seed >>> 5), x: c.x, z: c.z };
  }

  update(dt) {
    const app = this.app, g = this.g, P = g.player;
    this.prompt = null;
    if (this.busy || app.mode !== 'play' || g.lock) return;
    if (this.inside) { this.updateInside(dt); return; }
    if (P.vehicle || P.state !== 'foot' || P.seq) return;
    const d = this.doorway();
    if (!d) return;
    this.prompt = { key: 'E', text: `Enter ${d.name}` };
    if (g.input.hit('interact')) this.enter(d);
  }

  // ---------------------------------------------------------------- transitions
  hideWorld() {
    this.hidden = [];
    for (const o of this.g.scene.children) { if (o === this.group || o.isLight || o === this.g.player.rig?.root || o.isCamera || o === this.g.sky.sun?.target) continue; if (o.visible) { this.hidden.push(o); o.visible = false; } }
  }

  async enter(d) {
    const g = this.g, P = g.player, app = this.app;
    this.busy = true; g.input.enabled = false;
    P.state = 'foot';
    await Loading.curtain(true);
    this.ret = { x: P.x, y: P.y, z: P.z, yaw: P.yaw, key: `${Math.round(d.x)},${Math.round(d.z)}` };
    this.hideWorld();
    this.grassQ = g.grass?.quality; g.grass?.setQuality(0);
    this.envI = g.scene.environmentIntensity; g.scene.environmentIntensity = 0.12;
    const R = this.build(d);
    this.group.visible = true;
    P.place(OX + R.door.x, OZ + R.door.z, 0); P.y = OY; P.vx = P.vz = 0; P.yaw = 0;
    g.rig.footYaw = 0; g.rig.snapBehind();
    g.sky.sun.castShadow = false;
    this.inside = R;
    g.input.enabled = true; g.input.pressed.clear();
    app.hud.big(d.name, ROLES[d.type] + ' inside', '');
    await Loading.curtain(false);
    this.busy = false;
  }

  async leave() {
    const g = this.g, P = g.player;
    if (this.busy || !this.inside) return;
    this.busy = true; g.input.enabled = false;
    await Loading.curtain(true);
    this.teardown();
    for (const o of this.hidden) o.visible = true;
    this.hidden = [];
    g.sky.sun.castShadow = true; g.scene.environmentIntensity = this.envI ?? 1; if (this.grassQ !== undefined) g.grass?.setQuality(this.grassQ);
    const r = this.ret;
    const yaw = r.yaw + Math.PI;
    P.place(r.x - Math.sin(r.yaw) * 0.8, r.z - Math.cos(r.yaw) * 0.8, yaw); P.y = g.world.groundY(P.x, P.z, r.y + 2);
    g.rig.footYaw = yaw; g.rig.snapBehind();
    this.inside = null;
    g.input.enabled = true; g.input.pressed.clear();
    await Loading.curtain(false);
    this.busy = false;
  }

  teardown() {
    const R = this.inside, W = this.g.world;
    if (!R) return;
    for (const c of R.colliders) W.colliders.remove(c);
    const i = W.platforms.indexOf(R.platform); if (i >= 0) W.platforms.splice(i, 1);
    for (const n of R.npcs) this.group.remove(n.rig.root);
    this.group.clear(); this.group.visible = false;
  }

  // ---------------------------------------------------------------- inside
  updateInside(dt) {
    const R = this.inside, g = this.g, P = g.player, I = g.input;
    g.sky.hemi.intensity = 0.2; g.sky.sun.intensity = 0;
    for (const n of R.npcs) { n.t += dt; const tgt = poseFor(n.anim, n.t, 0); blendPose(n.rig.pose, tgt, 1 - Math.exp(-dt * 8), n.rig.pose); applyPose(n.rig, n.rig.pose); const dx = P.x - n.x, dz = P.z - n.z; if (Math.hypot(dx, dz) < 7) n.rig.root.rotation.y = Math.atan2(dx, dz); }
    for (const it of R.items) if (!it.taken) { it.mesh.rotation.y += dt * 1.6; it.mesh.position.y = it.y + Math.sin(performance.now() / 400 + it.x) * 0.06; }
    let near = null, nd = 2.3;
    for (const n of R.npcs) { const d = Math.hypot(n.x - P.x, n.z - P.z); if (d < nd) { nd = d; near = { type: 'npc', n }; } }
    for (const it of R.items) if (!it.taken) { const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < Math.min(nd, 1.6)) { nd = d; near = { type: 'item', it }; } }
    const lx = P.x - OX, lz = P.z - OZ;
    if (!near && lz < 1.6 && Math.abs(lx) < 2.2) near = { type: 'door' };
    if (!near) return;
    const text = near.type === 'npc' ? `Talk to ${near.n.name}` : near.type === 'item' ? `Take ${near.it.label}` : 'Leave';
    this.prompt = { key: 'E', text };
    if (!I.hit('interact')) return;
    if (near.type === 'door') this.leave(); else if (near.type === 'item') this.take(near.it); else this.talk(near.n);
  }

  take(it) {
    const key = `${this.g.sky.day}|${this.ret.key}|${it.i}`;
    it.taken = true; this.group.remove(it.mesh);
    this.g.audio.ui?.('unlock');
    if (this.looted.has(key)) { toast({ title: 'Nothing else useful', icon: 'x', ms: 1400 }); return; }
    this.looted.add(key);
    const r = it.reward;
    this.app.store.act({ type: 'reward', money: r.money || 0, xp: r.xp || 0, tokens: r.tokens || 0, reason: it.label });
    this.app.hud.gain(r.money ? `+$${r.money}` : r.tokens ? `+${r.tokens} token` : `+${r.xp} XP`, '#ffd27a');
  }

  talk(n) {
    const app = this.app, g = this.g, T = n.def;
    g.input.enabled = false;
    const close = () => { g.input.enabled = true; g.input.pressed.clear(); };
    const body = h('div', { class: 'col', style: 'gap:10px;min-width:min(420px,80vw)' }, h('div', { class: 'muted' }, T.line(n.seed)), ...T.options.map((o) => btn(o.label + (o.cost ? `  ($${o.cost})` : ''), { kind: 'primary', on: () => { const r = o.run(app, this); if (r !== false) m.close(); close(); } })));
    const m = modal({ title: `${n.name}  -  ${ROLES[n.type]}`, body, actions: [{ label: 'Goodbye' }], onClose: close });
  }

  // ---------------------------------------------------------------- room building
  build(d) {
    const g = this.g, W = g.world, T = TYPES[d.type], [w, dp] = SIZE[d.type], seed = d.seed;
    const root = this.group, R = { colliders: [], npcs: [], items: [], door: { x: 0, z: 4.8 }, w, d: dp };
    const wallC = pick(T.walls, seed), floorC = T.floor;
    const add = (geo, m, x, y, z, shadow = false) => { const o = new THREE.Mesh(geo, m); o.position.set(OX + x, OY + y, OZ + z); o.receiveShadow = true; o.castShadow = shadow; root.add(o); return o; };
    const solid = (x, z, hx, hz, h = 3) => R.colliders.push(W.colliders.box(OX + x, OZ + z, hx, hz, 0, OY - 1, OY + h, { kind: 'wall' }));
    const box = (x, y, z, sx, sy, sz, c, collide = true, r = 0.8, m = 0) => { const o = add(new THREE.BoxGeometry(sx, sy, sz), mat(c, r, m), x, y + sy / 2, z, true); if (collide) solid(x, z, sx / 2, sz / 2, Math.min(sy + y, 2.4)); return o; };
    // shell
    add(new THREE.PlaneGeometry(w, dp), mat(floorC, 0.55), 0, 0.01, dp / 2).rotation.x = -Math.PI / 2;
    add(new THREE.PlaneGeometry(w, dp), mat(T.ceiling || '#f0eee8', 0.9), 0, WALL, dp / 2).rotation.x = Math.PI / 2;
    const wm = mat(wallC, 0.9);
    for (const [x, z, sx, sz] of [[0, dp, w, 0.3], [-w / 2, dp / 2, 0.3, dp], [w / 2, dp / 2, 0.3, dp], [-(w / 2 + 1.1) / 2, 0, w / 2 - 1.1, 0.3], [(w / 2 + 1.1) / 2, 0, w / 2 - 1.1, 0.3]]) { add(new THREE.BoxGeometry(sx, WALL, sz), wm, x, WALL / 2, z); solid(x, z, sx / 2, sz / 2, WALL); }
    add(new THREE.BoxGeometry(2.4, 0.9, 0.3), wm, 0, WALL - 0.45, 0);
    add(new THREE.BoxGeometry(2.0, 2.6, 0.12), mat('#3a2f27', 0.6), 0, 1.3, 0.12);
    add(new THREE.BoxGeometry(w - 0.5, 0.14, 0.05), mat(T.trim || '#8a8f96', 0.5), 0, 0.07, dp - 0.18);
    for (let i = 0; i < Math.ceil(w / 5); i++) { const x = -w / 2 + 2.5 + i * 5, lamp = add(new THREE.BoxGeometry(1.6, 0.06, 0.5), new THREE.MeshBasicMaterial({ color: T.lamp || '#fff4d6' }), x, WALL - 0.04, dp / 2); void lamp; }
    for (const [x, z] of [[-w / 4, dp * 0.3], [w / 4, dp * 0.3], [-w / 4, dp * 0.75], [w / 4, dp * 0.75]]) { const l = new THREE.PointLight(T.lamp || '#fff1d0', 7, w * 1.6, 1.6); l.position.set(OX + x, OY + 3.0, OZ + z); root.add(l); }
    const H = { box, add, solid, w, d: dp, rnd: (i) => ((hash(seed, i) % 1000) / 1000) };
    root.add(new THREE.AmbientLight('#ffffff', 0.45));
    // dressing: rug, framed pictures, plants
    add(new THREE.PlaneGeometry(w * 0.4, dp * 0.3), mat(pick(['#7a3a3a', '#3a5a7a', '#4a6a4a', '#6a5a3a'], seed >>> 4), 0.95), 0, 0.02, dp * 0.55).rotation.x = -Math.PI / 2;
    for (let i = 0; i < 3; i++) { const x = -w / 2 + 3 + i * (w - 6) / 2; add(new THREE.BoxGeometry(1.3, 0.9, 0.05), mat(['#c9a24a', '#4a7aa8', '#a84a4a'][(i + seed) % 3], 0.6), x, 2.0, dp - 0.2); add(new THREE.BoxGeometry(1.5, 1.1, 0.04), mat('#2a2018', 0.7), x, 2.0, dp - 0.18); }
    for (const sx of [-1, 1]) { const px = sx * (w / 2 - 0.7); add(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 10), mat('#8a5a3a', 0.8), px, 0.2, 0.9, true); add(new THREE.SphereGeometry(0.45, 10, 8), mat('#3f8a4a', 0.9), px, 0.85, 0.9, true); solid(px, 0.9, 0.25, 0.25, 1.4); }
    T.build(H);
    // person
    const lookId = pick(LOOKS, seed >>> 2), arche = ARCHETYPES.find((a) => a.id === lookId) || ARCHETYPES[0];
    const look = { name: ROLES[d.type], height: 1.62 + (seed % 20) / 100, build: 0.3 + (seed % 5) / 10, face: { jaw: 0.5, nose: 0.5, brow: 0.5 }, ...JSON.parse(JSON.stringify(BASE_LOOK)), ...JSON.parse(JSON.stringify(arche.look)) };
    if (d.type === 'police') { look.top = { type: 'shirt', color: '#2a4a7a' }; look.jacket = { type: 'none', color: '#000000' }; look.acc = []; }
    const rig = buildHuman(look); rig.root.position.set(OX + T.npc[0] * w, OY, OZ + T.npc[1] * dp); rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); root.add(rig.root);
    const npc = { rig, x: OX + T.npc[0] * w, z: OZ + T.npc[1] * dp, t: 0, anim: 'idle', name: pick(['Sam', 'Maria', 'Dev', 'Ines', 'Walt', 'Rosa', 'Kai', 'Nora'], seed >>> 7), type: d.type, def: T, seed };
    R.colliders.push(W.colliders.circle(npc.x, npc.z, 0.4, OY - 1, OY + 2, { kind: 'pole' }));
    R.npcs.push(npc);
    // things to pick up
    const spots = T.items(H);
    spots.forEach(([x, y, z], i) => {
      const k = i % 3, label = ['stack of cash', 'old watch', 'gift voucher'][k], reward = k === 0 ? { money: 80 + (hash(seed, i) % 5) * 60 } : k === 1 ? { xp: 90 } : (hash(seed, i + 9) % 4 === 0 ? { tokens: 1 } : { money: 120 });
      const geo = k === 0 ? new THREE.BoxGeometry(0.22, 0.08, 0.12) : k === 1 ? new THREE.OctahedronGeometry(0.1) : new THREE.BoxGeometry(0.16, 0.02, 0.1);
      const mesh = add(geo, new THREE.MeshStandardMaterial({ color: ['#3fa65a', '#ffd24a', '#35d3ff'][k], emissive: ['#0f3a1c', '#6a4a00', '#0a4a66'][k], emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.4 }), x, y + 0.12, z);
      R.items.push({ i, mesh, x: OX + x, z: OZ + z, y: OY + y + 0.12, taken: false, label, reward });
    });
    R.platform = { x0: OX - w / 2 - 2, x1: OX + w / 2 + 2, z0: OZ - 2, z1: OZ + dp + 2, y0: OY, y1: OY };
    W.platforms.push(R.platform);
    return R;
  }
}

const job = (id) => (app, I) => { I.leave().then(() => app.startJob?.(id)); return true; };
const reward = (money, xp, rep, note) => (app) => { app.store.act({ type: 'reward', money, xp, rep: rep || 0, reason: note }); app.hud.gain(money ? `+$${money}` : `+${xp} XP`, '#ffd27a'); };
const once = (key, fn) => (app, I) => { const k = `${app.game.sky.day}|${I.ret.key}|${key}`; if (I.looted.has(k)) { toast({ title: 'Come back tomorrow', icon: 'clock', ms: 1600 }); return false; } I.looted.add(k); return fn(app, I); };
const hint = (lines) => (s) => lines[s % lines.length];

const TYPES = {
  market: {
    walls: ['#e8e2d2', '#dfe8e2', '#efe4d6'], floor: '#cfd2d6', npc: [0.25, 0.22], lamp: '#fffbe8',
    build(H) { for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { H.box(-H.w / 2 + 3 + c * 5, 0, 4.5 + r * 2.1, 4, 1.7, 0.7, '#c9ccd2'); H.box(-H.w / 2 + 3 + c * 5, 1.7, 4.5 + r * 2.1, 4, 0.05, 0.7, '#e5e7eb', false); for (let k = 0; k < 6; k++) for (const sz of [0.4, -0.4]) { H.box(-H.w / 2 + 1.4 + c * 5 + k * 0.62, 0.55, 4.5 + r * 2.1 + sz, 0.4, 0.5, 0.12, ['#e5383b', '#2f80ed', '#f2c12e', '#2fb36a'][(k + r + (sz > 0 ? 1 : 0)) % 4], false); H.box(-H.w / 2 + 1.4 + c * 5 + k * 0.62, 1.15, 4.5 + r * 2.1 + sz, 0.4, 0.5, 0.12, ['#f2c12e', '#e5383b', '#2fb36a', '#2f80ed'][(k + r) % 4], false); } } H.box(-H.w / 4, 0, 2.2, 3.6, 1.0, 0.9, '#6b4a2e'); },
    items: (H) => [[-H.w / 4 + 1, 1.05, 2.2], [H.w / 2 - 1.2, 0.0, H.d - 1.2], [H.w / 2 - 2, 0, 3]],
    line: hint(['Anything I can help you find? Everything here is overpriced.', 'Heard there is a street race on the Eastside tonight.', 'Quiet day. The delivery trucks are late again.']),
    options: [{ label: 'Take a delivery job', run: job('job_delivery') }, { label: 'Buy a snack', cost: 6, run: (app) => { if (app.profile.money < 6) { toast({ title: 'Not enough cash', icon: 'x' }); return false; } app.store.act({ type: 'fine', amount: 6, reason: 'Snack' }); reward(0, 25, 0, 'Snack')(app); } }],
  },
  cafe: {
    walls: ['#e9d8c4', '#d9e6e0', '#f0e1d2'], floor: '#8c6a4a', npc: [0.7, 0.18], lamp: '#ffe2b0', trim: '#5a4030',
    build(H) { H.box(H.w / 4, 0, 2.0, 6, 1.05, 0.9, '#5a4030'); for (let i = 0; i < 4; i++) { const x = -H.w / 2 + 2.4 + (i % 2) * 3.6, z = 4.6 + Math.floor(i / 2) * 3; H.box(x, 0, z, 1.0, 0.75, 1.0, '#a07a52'); for (const s of [-1, 1]) H.box(x + s * 0.95, 0, z, 0.45, 0.45, 0.45, '#2b3a55'); } H.box(-H.w / 2 + 0.6, 0, H.d - 1.5, 0.9, 2.2, 2.6, '#7a5a3a'); },
    items: (H) => [[-H.w / 2 + 2.4, 0.76, 4.6], [H.w / 2 - 1.2, 0, H.d - 1.2], [H.w / 4 + 1, 1.05, 2.0]],
    line: hint(['Welcome in. The usual?', 'You look like you drive for a living. Coffee helps with that.', 'There is a rumor about a rare car parked by the ridge road.']),
    options: [{ label: 'Order a coffee', cost: 6, run: (app) => { if (app.profile.money < 6) { toast({ title: 'Not enough cash', icon: 'x' }); return false; } app.store.act({ type: 'fine', amount: 6, reason: 'Coffee' }); reward(0, 40, 0, 'Coffee')(app); } }, { label: 'Ask about work', run: job('job_taxi') }],
  },
  office: {
    walls: ['#e6e9ee', '#dfe3e8', '#efeee9'], floor: '#6b7480', npc: [0.78, 0.22], lamp: '#f2f6ff',
    build(H) { for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const x = -H.w / 2 + 3 + i * 4.8, z = 3.4 + j * 3.6; H.box(x, 0, z, 2.0, 0.76, 1.0, '#9aa3ad'); H.box(x, 0.76, z - 0.2, 0.7, 0.45, 0.06, '#15171b', false); H.box(x, 0, z + 1.0, 0.6, 0.5, 0.6, '#2f3a4a', false); } H.box(H.w / 2 - 2.2, 0, H.d - 1.6, 3.2, 0.78, 1.3, '#4a3a2c'); H.box(-H.w / 2 + 0.7, 0, H.d - 2.2, 0.6, 2.0, 3.8, '#6b5a48'); },
    items: (H) => [[H.w / 2 - 2.2, 0.8, H.d - 1.6], [-H.w / 2 + 3, 0.78, 3.4], [-H.w / 2 + 0.9, 0, H.d - 0.9]],
    line: hint(['Do you have an appointment? No? Fine, make it quick.', 'Business is good for people who can move things fast.', 'Legit work only. Mostly.']),
    options: [{ label: 'Ask for a job', run: job('job_trial') }, { label: 'Take a courier run', run: job('job_delivery') }],
  },
  workshop: {
    walls: ['#b9bec6', '#c9c2b3', '#aeb7c0'], floor: '#4a4d52', npc: [0.8, 0.3], lamp: '#fff7e0', ceiling: '#b9bcc2',
    build(H) { H.box(-H.w / 4, 0, H.d / 2, 4.2, 0.35, 2.2, '#d9a21a', false); H.box(-H.w / 4, 0.35, H.d / 2 - 0.9, 0.3, 1.8, 0.3, '#2a2d33'); H.box(-H.w / 4, 0.35, H.d / 2 + 0.9, 0.3, 1.8, 0.3, '#2a2d33'); H.box(H.w / 2 - 1.0, 0, 5, 1.2, 1.4, 4.2, '#a8302a'); for (let i = 0; i < 3; i++) H.box(-H.w / 2 + 1.6, 0, 3 + i * 3.2, 1.8, 0.9, 1.0, '#6a6f78'); for (const [x, z] of [[H.w / 4, 2.2], [H.w / 4 + 2, 2.2]]) H.box(x, 0, z, 0.9, 0.9, 0.9, '#3a4a3a'); },
    items: (H) => [[-H.w / 2 + 1.6, 0.92, 3], [H.w / 2 - 1.0, 1.42, 5], [H.w / 4, 0.92, 2.2]],
    line: hint(['Bring it in, I will take a look. Brakes, tires, anything.', 'I can patch the body. Engine tuning is at the garage menu.', 'Nothing a wrench and a coffee cannot fix.']),
    options: [{ label: 'Repair my vehicle', cost: 350, run: (app) => { if (app.profile.money < 350) { toast({ title: 'Not enough cash', icon: 'x' }); return false; } app.store.act({ type: 'fine', amount: 350, reason: 'Repairs' }); app.repairCurrent?.(); } }, { label: 'Open the garage', run: (app, I) => { I.leave().then(() => app.openMenu('garage')); return true; } }],
  },
  bar: {
    walls: ['#3a2f38', '#2f3a40', '#40302a'], floor: '#2a2024', npc: [0.5, 0.15], lamp: '#ffb36b', trim: '#6b4a2e', ceiling: '#2a2024',
    build(H) { H.box(0, 0, 2.2, H.w * 0.6, 1.1, 0.9, '#5a3a24'); for (let i = 0; i < 6; i++) H.box(-H.w * 0.25 + i * 1.8 * 0.55 + 0.4, 0, 3.0, 0.45, 0.7, 0.45, '#8a2a2a', false); for (let i = 0; i < 3; i++) H.box(-H.w / 2 + 2.6 + i * 3.6, 0, 7.2, 1.0, 0.75, 1.0, '#6b4a2e'); H.box(0, 1.2, 0.6, H.w * 0.6, 1.4, 0.2, '#4a3426', false); for (let i = 0; i < 8; i++) H.box(-H.w * 0.27 + i * 1.5, 1.55, 0.7, 0.2, 0.5, 0.2, ['#2fb36a', '#f2c12e', '#e5383b'][i % 3], false); },
    items: (H) => [[-H.w * 0.2, 1.12, 2.2], [H.w / 2 - 1.3, 0, H.d - 1.3], [-H.w / 2 + 2.6, 0.76, 7.2]],
    line: hint(['What are you drinking? Never mind, you are driving.', 'The Eastside crowd races when it rains. Bring a fast car.', 'Everybody here knows somebody who knows somebody.']),
    options: [{ label: 'Ask about street races', run: job('job_race') }, { label: 'Buy a round', cost: 40, run: (app) => { if (app.profile.money < 40) { toast({ title: 'Not enough cash', icon: 'x' }); return false; } app.store.act({ type: 'fine', amount: 40, reason: 'Round' }); reward(0, 0, 12, 'Round')(app); app.hud.gain('+12 REP', '#ffb4b6'); } }],
  },
  house: {
    walls: ['#efe6d6', '#e3ebe4', '#f0e3df'], floor: '#9a7a58', npc: [0.7, 0.55], lamp: '#ffe9c4',
    build(H) { H.box(-H.w / 4, 0, 3.4, 3.4, 0.5, 1.2, '#4a6a8a'); H.box(-H.w / 4, 0.5, 2.9, 3.4, 0.7, 0.3, '#4a6a8a'); H.box(-H.w / 4, 0, 7.0, 2.0, 0.45, 1.0, '#6b5a48'); H.box(-H.w / 4, 0.45, 7.45, 1.6, 0.8, 0.08, '#15171b', false); H.box(H.w / 2 - 1.4, 0, 6, 1.4, 0.8, 3.0, '#a07a52'); H.box(-H.w / 2 + 0.6, 0, 2.4, 0.8, 1.8, 2.4, '#7a5a3a'); },
    items: (H) => [[H.w / 2 - 1.4, 0.82, 6], [-H.w / 4, 0.46, 7.0], [-H.w / 2 + 0.7, 1.82, 2.4]],
    line: hint(['Oh, hello. I did not hear the door. Can I help you?', 'Please watch the carpet. The neighbors drive way too fast.', 'My son would love your car. He talks about nothing else.']),
    options: [{ label: 'Help move some boxes', run: once('boxes', (app) => { reward(160, 60, 0, 'Favor')(app); }) }],
  },
  warehouse: {
    walls: ['#a9b0b8', '#b4aea0'], floor: '#55585d', npc: [0.18, 0.12], lamp: '#fff4dc', ceiling: '#a0a4aa',
    build(H) { for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const x = -H.w / 2 + 3 + i * 4.2, z = 4.5 + j * 3.2; H.box(x, 0, z, 2.2, 1.4 + (i + j) % 2 * 0.8, 1.6, ['#a07a52', '#8a6a44', '#b08a5a'][(i + j) % 3]); } H.box(H.w / 2 - 1.4, 0, 3, 1.6, 1.0, 1.6, '#d9a21a'); },
    items: (H) => [[-H.w / 2 + 3, 1.42, 4.5], [H.w / 2 - 1.4, 1.02, 3], [-H.w / 2 + 7.2, 2.22, 7.7]],
    line: hint(['Truck is late and the manifest is wrong. What do you want?', 'We move anything. No questions on the paperwork.', 'Watch the forklift, it has no brakes.']),
    options: [{ label: 'Take a delivery run', run: job('job_delivery') }],
  },
  police: {
    walls: ['#dfe3ea', '#e4e8ee'], floor: '#6a7380', npc: [0.5, 0.22], lamp: '#f2f6ff', trim: '#2a4a7a',
    build(H) { H.box(0, 0, 2.4, H.w * 0.5, 1.05, 1.0, '#2a4a7a'); for (let i = 0; i < 3; i++) H.box(-H.w / 2 + 2.4 + i * 3.4, 0, 6.8, 2.0, 0.76, 1.0, '#8a9099'); H.box(H.w / 2 - 1.0, 0, 6.5, 1.2, 2.0, 5.0, '#5a6068'); H.box(-H.w / 2 + 1.2, 0, 3.6, 1.0, 0.45, 2.6, '#3a3f46', false); },
    items: (H) => [[-H.w / 2 + 2.4, 0.78, 6.8], [H.w / 4, 1.07, 2.4], [H.w / 2 - 1.0, 2.02, 6.5]],
    line: (s) => (s % 2 ? 'Precinct. State your business.' : 'Keep your hands where I can see them. Kidding. Mostly.'),
    options: [{ label: 'Pay bail and clear my record', cost: 1200, run: (app) => { const g = app.game; if (g.police.level <= 0) { toast({ title: 'No active warrant', icon: 'check' }); return false; } if (app.profile.money < 1200) { toast({ title: 'Not enough cash', icon: 'x' }); return false; } app.store.act({ type: 'fine', amount: 1200, reason: 'Bail' }); g.police.clear?.('escape'); app.hud.gain('Record cleared', '#8fb8ff'); } }, { label: 'Ask about open cases', run: (app, I) => { I.leave().then(() => app.openMenu('missions')); return true; } }],
  },
  gym: {
    walls: ['#dfe6ee', '#e8e2dc'], floor: '#3a3f46', npc: [0.8, 0.15], lamp: '#f2f6ff',
    build(H) { for (let i = 0; i < 3; i++) H.box(-H.w / 2 + 2.5 + i * 3.2, 0, 5, 1.0, 1.2, 2.0, '#2a2d33'); H.box(H.w / 2 - 1.4, 0, 6, 2.4, 0.9, 1.0, '#a8302a'); H.box(-H.w / 2 + 1.0, 0, H.d - 2.6, 0.8, 1.5, 2.4, '#6b7480'); },
    items: (H) => [[H.w / 2 - 1.4, 0.92, 6], [-H.w / 2 + 2.5, 1.22, 5], [-H.w / 2 + 1.0, 1.52, H.d - 2.6]],
    line: hint(['Warm up first. Then we talk about your form.', 'Strong legs make a steady driver. Seriously.', 'Day pass is cheap. Excuses are expensive.']),
    options: [{ label: 'Train for a session', cost: 30, run: once('train', (app) => { if (app.profile.money < 30) { toast({ title: 'Not enough cash', icon: 'x' }); return false; } app.store.act({ type: 'fine', amount: 30, reason: 'Gym' }); reward(0, 120, 15, 'Training')(app); app.hud.gain('+15 REP', '#ffb4b6'); }) }],
  },
};
