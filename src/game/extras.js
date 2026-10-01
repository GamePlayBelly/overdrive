import * as THREE from 'three';
import { COLLECTIBLES, HIDDEN_LOCATIONS, RARE_VEHICLES, DYNAMIC_EVENTS } from '../data/meta.js';
import { DISTRICTS } from '../data/world.js';
import { Markers } from './markers.js';
import { clamp } from '../core/math.js';

// Things scattered through the open world: collectibles, hidden places, conditional rare cars and dynamic events.
const TYPE_STYLE = {
  key: { color: '#ffcf3a', label: 'Key' }, token: { color: '#36d6ff', label: 'Token' }, plate: { color: '#e9eef2', label: 'Plate' },
  part: { color: '#ff8a3a', label: 'Part' }, memorabilia: { color: '#c77dff', label: 'Memorabilia' }, photo: { color: '#46e08a', label: 'Photo spot' },
};

function pickupMesh(type) {
  const col = new THREE.Color(TYPE_STYLE[type]?.color || '#ffffff');
  const mat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), toneMapped: false, fog: false });
  const g = new THREE.Group();
  const add = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  if (type === 'key') { add(new THREE.TorusGeometry(0.2, 0.05, 6, 14), 0, 0.3); add(new THREE.BoxGeometry(0.07, 0.5, 0.05), 0, -0.1); add(new THREE.BoxGeometry(0.16, 0.06, 0.05), 0.1, -0.28); add(new THREE.BoxGeometry(0.12, 0.06, 0.05), 0.08, -0.14); }
  else if (type === 'token') { add(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 18), 0, 0, 0, Math.PI / 2); add(new THREE.TorusGeometry(0.34, 0.03, 6, 18), 0, 0, 0.0); }
  else if (type === 'plate') { add(new THREE.BoxGeometry(0.62, 0.3, 0.04)); }
  else if (type === 'part') { add(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 10), 0, 0, 0, Math.PI / 2); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; add(new THREE.BoxGeometry(0.1, 0.12, 0.1), Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0, 0, 0, a); } }
  else if (type === 'photo') { add(new THREE.BoxGeometry(0.5, 0.34, 0.26)); add(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 12), 0, 0, 0.2, Math.PI / 2); add(new THREE.BoxGeometry(0.16, 0.08, 0.1), -0.14, 0.2, 0); }
  else add(new THREE.BoxGeometry(0.42, 0.56, 0.03));
  g.traverse((o) => { o.frustumCulled = true; });
  return g;
}

export class Extras {
  constructor(app) {
    this.app = app; this.g = app.game;
    this.items = []; this.t = 0; this.chk = 0; this.markers = new Markers(this.g);
    this.rares = new Map();
    this.offer = null; this.evCool = 90; this.district = null;
    this.g.on('photo:taken', () => this.onPhoto());
    this.g.on('player:entered', (e) => { if (e.v.rare) this.foundRare(e.v); });
  }

  get P() { return this.g.player; }

  // ---------------------------------------------------------------- collectibles
  build() {
    const p = this.app.profile;
    for (const c of COLLECTIBLES) {
      if (p?.collectibles.includes(c.id)) continue;
      const m = pickupMesh(c.type), y = this.g.world.groundY(c.x, c.z, 60) + (c.type === 'photo' ? 1.4 : 1.0);
      m.position.set(c.x, y, c.z); m.visible = false;
      this.g.scene.add(m);
      this.items.push({ c, m, y, ph: Math.random() * 6 });
    }
  }

  collect(it) {
    const { c } = it;
    this.app.store.act({ type: 'collect', id: c.id });
    this.g.audio.ui('unlock');
    this.g.scene.remove(it.m);
    this.items = this.items.filter((q) => q !== it);
    const col = TYPE_STYLE[c.type].color;
    for (let k = 0; k < 26; k++) this.g.fx.pt.emit({ x: it.m.position.x, y: it.m.position.y, z: it.m.position.z, vx: (Math.random() - 0.5) * 5, vy: 1 + Math.random() * 4, vz: (Math.random() - 0.5) * 5, life: 0.9, s0: 0.2, s1: 0.04, c0: [1.6, 1.4, 0.6, 1], c1: [1, 0.6, 0.1, 0], drag: 0.6, grav: 4, add: 1, kind: 1, spin: 0 });
    this.app.hud.big('COLLECTED', c.name, '');
    void col;
  }

  onPhoto() {
    const cam = this.g.camera, f = new THREE.Vector3();
    cam.getWorldDirection(f);
    for (const it of [...this.items]) {
      if (!it.c.photo) continue;
      const d = new THREE.Vector3(it.c.x - cam.position.x, 0, it.c.z - cam.position.z);
      if (d.length() < 55 && d.normalize().dot(new THREE.Vector3(f.x, 0, f.z).normalize()) > 0.6) this.collect(it);
    }
  }

  blips() {
    const P = this.P, w = P.vehicle || P, out = [];
    for (const it of this.items) { if (Math.hypot(it.c.x - w.x, it.c.z - w.z) < 170) out.push({ x: it.c.x, z: it.c.z, color: TYPE_STYLE[it.c.type].color, r: 3.5 }); }
    if (this.offer) out.push({ x: this.offer.x, z: this.offer.z, color: '#4da3ff', r: 6 });
    return out;
  }

  // ---------------------------------------------------------------- rare cars
  updateRares(dt) {
    const g = this.g, p = this.app.profile, P = this.P, w = P.vehicle || P;
    const night = g.sky.night > 0.6, rain = g.sky.w.rain > 0.3;
    for (const r of RARE_VEHICLES) {
      const ok = (!r.cond.night || night) && (!r.cond.rain || rain) && p.level >= (r.cond.level || 1);
      const d = Math.hypot(r.x - w.x, r.z - w.z), cur = this.rares.get(r.id);
      if (ok && !cur && d < 320) {
        const v = g.spawnVehicle(r.model, r.x, r.z, r.yaw, { color: r.color }, { yRef: 80 });
        v.rare = r; v.input = { throttle: 0, brake: 1, steer: 0, hand: true };
        this.rares.set(r.id, v);
      } else if (cur && (!ok || d > 520) && g.player.vehicle !== cur && !cur.driver) { g.removeVehicle(cur); this.rares.delete(r.id); }
    }
  }

  foundRare(v) {
    const r = v.rare, p = this.app.profile;
    if (!r || p.rares.includes(r.id)) return;
    this.app.store.act({ type: 'rareFound', id: r.id });
    this.app.hud.big('RARE FIND', r.name, 'green');
    this.app.hud.say('', r.story, 7000);
  }

  // ---------------------------------------------------------------- discoveries
  updateDiscoveries() {
    const p = this.app.profile, P = this.P, w = P.vehicle || P, W = this.g.world;
    for (const h of HIDDEN_LOCATIONS) if (!p.discovered.includes(h.id) && Math.hypot(h.x - w.x, h.z - w.z) < 28) this.app.store.act({ type: 'discover', id: h.id, name: h.name });
    const d = W.districtAt(w.x, w.z);
    if (d && d.id !== this.district) {
      this.district = d.id;
      if (DISTRICTS.some((q) => q.id === d.id) && !p.discovered.includes(d.id)) this.app.store.act({ type: 'discover', id: d.id, name: d.name, district: true });
      this.app.hud.big(d.short || d.name, d.name, '');
    }
  }

  // ---------------------------------------------------------------- dynamic events
  pickPoint(minD, maxD) {
    const R = this.g.world.roads, w = this.P.vehicle || this.P;
    for (let k = 0; k < 80; k++) {
      const n = R.nodes[Math.floor(Math.random() * R.nodes.length)], d = Math.hypot(n.x - w.x, n.z - w.z);
      if (d > minD && d < maxD && Math.abs(n.y - this.g.world.terrain.height(n.x, n.z)) < 3) return n;
    }
    return null;
  }

  nodeFrom(from, dmin, dmax) {
    const R = this.g.world.roads, T = this.g.world.terrain;
    for (let k = 0; k < 120; k++) {
      const n = R.nodes[Math.floor(Math.random() * R.nodes.length)], d = Math.hypot(n.x - from.x, n.z - from.z);
      if (d > dmin && d < dmax && Math.abs(n.y - T.height(n.x, n.z)) < 3) return n;
    }
    return null;
  }

  makeEvent(ev) {
    const rnd = Math.random, n0 = this.pickPoint(180, 480);
    if (!n0) return null;
    // a chain of road points, each a little further from the last
    const chain = (count, dmin, dmax) => { const out = []; let cur = n0; for (let k = 0; k < count; k++) { cur = this.nodeFrom(cur, dmin, dmax) || cur; out.push([cur.x, cur.z]); } return out; };
    const base = { id: ev.id + '_' + Math.floor(rnd() * 1e4), title: ev.name, type: ev.name, kind: 'event', reward: { money: ev.money, xp: ev.xp, rep: 120 }, x: n0.x, z: n0.z };
    switch (ev.type) {
      case 'race': return { ...base, steps: [{ t: 'checkpoints', race: true, pts: chain(4, 180, 420), text: 'Win the street race', rivals: [{ id: 'local', name: 'Street racer', model: ['arc', 'gts', 'thunder'][Math.floor(rnd() * 3)], color: '#' + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0'), skill: 0.65 + rnd() * 0.15 }] }], fail: { race: 'You lost the race.' } };
      case 'convoy': return { ...base, steps: [{ t: 'tail', model: 'boxtruck', color: '#2f3a44', route: [[n0.x, n0.z], ...chain(3, 250, 520)], min: 14, max: 160, speed: 14, text: 'Follow the armored convoy to the depot' }] };
      case 'stunt': return { ...base, steps: [{ t: 'stunt', air: 1.6, drift: 2500, limit: 120, text: 'Beat the local stunt record: air time and drift' }] };
      case 'pursuit': return { ...base, steps: [{ t: 'ram', model: 'crown', color: '#8c1c1c', from: { x: n0.x, z: n0.z, yaw: 0 }, health: 0.8, limit: 200, text: 'Stop the stolen car' }] };
      case 'rush': { const c = chain(3, 250, 650); return { ...base, steps: c.map((q, i) => ({ t: 'deliver', to: { x: q[0], z: q[1] }, r: 9, limit: 110 + i * 15, text: `Delivery ${i + 1} of 3` })) }; }
      case 'hunt': { const c = chain(3, 120, 300); return { ...base, steps: c.map((q, i) => ({ t: 'goto', to: { x: q[0], z: q[1] }, r: 10, limit: 90, text: `Find token ${i + 1} of 3` })) }; }
      default: return null;
    }
  }

  offerEvent() {
    const pool = DYNAMIC_EVENTS.filter((e) => e.type !== 'rare' && e.type !== 'lockdown');
    const ev = pool[Math.floor(Math.random() * pool.length)], def = this.makeEvent(ev);
    if (!def) return;
    const m = this.markers.add({ x: def.x, z: def.z, r: 11, color: '#4da3ff' });
    this.offer = { def, ev, m, x: def.x, z: def.z, t: 0 };
    this.app.hud.big('EVENT', ev.name, '');
    this.app.toast({ title: ev.name, sub: ev.desc, kind: 'blue', icon: 'flag' });
    this.app.setWaypoint({ x: def.x, z: def.z });
    this.g.audio.ui('open');
  }

  dropOffer() { if (!this.offer) return; this.markers.remove(this.offer.m); this.offer = null; this.app.setWaypoint(null); }

  updateEvents(dt) {
    const app = this.app, M = app.missions, P = this.P, w = P.vehicle || P;
    if (M.run || this.g.police.level > 0 || !P.vehicle) { if (this.offer && M.run) this.dropOffer(); return; }
    if (this.offer) {
      const o = this.offer; o.t += dt;
      const d = Math.hypot(o.x - w.x, o.z - w.z);
      if (d < 13 && w.speed < 9) { const def = o.def; this.dropOffer(); M.begin(def); this.evCool = 150 + Math.random() * 120; return; }
      if (o.t > 160 || d > 1100) { this.dropOffer(); this.evCool = 60; }
      return;
    }
    this.evCool -= dt;
    if (this.evCool <= 0 && app.profile.level >= 2) { this.evCool = 200; this.offerEvent(); }
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    this.t += dt; this.chk += dt;
    this.markers.update(dt, this.g.camera.position);
    const P = this.P, w = P.vehicle || P;
    for (const it of this.items) {
      const d = Math.hypot(it.c.x - w.x, it.c.z - w.z);
      it.m.visible = d < 260;
      if (!it.m.visible) continue;
      it.m.rotation.y += dt * 1.6; it.m.position.y = it.y + Math.sin(this.t * 2 + it.ph) * 0.12;
    }
    if (this.chk < 0.25) return;
    this.chk = 0;
    for (const it of [...this.items]) {
      if (it.c.photo) continue;
      if (Math.hypot(it.c.x - w.x, it.c.z - w.z) < 3.4 && Math.abs(it.y - w.y) < 5) this.collect(it);
    }
    this.updateRares(0.25); this.updateDiscoveries();
  }
}
