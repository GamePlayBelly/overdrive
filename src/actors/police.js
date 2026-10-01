import * as THREE from 'three';
import { AIDriver } from '../vehicles/aiDriver.js';
import { buildHuman, poseFor, applyPose, blendPose, REST } from './human.js';
import { clamp, lerp, damp, dampAngle, smoothstep, wrapAngle } from '../core/math.js';
import { RNG } from '../core/rng.js';
import { VEHICLE_BY_ID } from '../data/vehicles.js';

export const WANTED_NAMES = ['', 'Investigation', 'Active pursuit', 'Multiple units', 'Roadblocks', 'Advanced pursuit', 'City-wide response'];
const UNITS_BY_LEVEL = [0, 1, 2, 4, 5, 6, 8];
const SPEED_BY_LEVEL = [0, 26, 36, 42, 46, 52, 58];
const OFFICER_LOOK = { height: 1.8, build: 0.55, skin: '#c69272', hair: { style: 'buzz', color: '#2b1e16' }, facial: 'none', top: { type: 'shirt', color: '#1f2a3d' }, jacket: { type: 'none', color: '#1f2a3d' }, pants: { type: 'suit', color: '#161c28' }, shoes: { type: 'boots', color: '#111111' }, hat: { type: 'cap', color: '#161c28' }, glasses: 'none', watch: 'smart' };

// --------------- helicopter ---------------
class Helicopter {
  constructor(game) {
    this.game = game;
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x1a2438, metalness: 0.4, roughness: 0.4 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e6, metalness: 0.2, roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0a0e14, metalness: 0.8, roughness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), body); cab.scale.set(1, 0.95, 1.7); g.add(cab);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), glass); canopy.scale.set(0.95, 0.9, 1.2); canopy.rotation.x = 1.0; canopy.position.set(0, 0.1, 1.1); g.add(canopy);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.35, 16, 1, true), white); stripe.rotation.x = Math.PI / 2; stripe.scale.set(1, 1.7, 0.95); stripe.position.y = -0.25; g.add(stripe);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 5.5, 10), body); boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.3, -4.2); g.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.8), body); fin.position.set(0, 0.9, -6.8); g.add(fin);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), body); stab.position.set(0, 0.35, -6.1); g.add(stab);
    for (const s of [1, -1]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), dark); skid.rotation.x = Math.PI / 2; skid.position.set(s * 0.95, -1.55, 0.2); g.add(skid);
      for (const z of [-0.6, 0.9]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 5), dark); st.position.set(s * 0.85, -1.25, z); st.rotation.z = s * 0.3; g.add(st); }
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8), dark); mast.position.y = 1.45; g.add(mast);
    this.rotor = new THREE.Group(); this.rotor.position.y = 1.72; g.add(this.rotor);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 5.2), dark); b.position.z = 2.6; const h = new THREE.Group(); h.rotation.y = (k / 4) * Math.PI * 2; h.add(b); this.rotor.add(h); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.3, 32), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; this.rotor.add(disc);
    this.tail = new THREE.Group(); this.tail.position.set(0.15, 0.9, -6.8); g.add(this.tail);
    for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.12), dark); b.rotation.x = k * Math.PI / 2; this.tail.add(b); }
    // navigation lights & searchlight
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
    this.beacon.position.set(0, -1.2, -1); g.add(this.beacon);
    this.spot = new THREE.SpotLight(0xf4f6ff, 0, 220, 0.16, 0.5, 1.1);
    this.spot.position.set(0, -1.3, 1.8);
    g.add(this.spot, this.spot.target);
    const coneG = new THREE.ConeGeometry(9, 80, 20, 1, true); coneG.translate(0, -40, 0);
    this.cone = new THREE.Mesh(coneG, new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    g.add(this.cone);
    g.traverse((o) => { if (o.isMesh) o.castShadow = o !== disc && o !== this.cone; });
    this.group = g;
    game.scene.add(g);
    this.x = 0; this.y = 80; this.z = 0; this.yaw = 0; this.vx = 0; this.vz = 0; this.bank = 0;
    this.orbit = Math.random() * 6;
  }
  update(dt, target, night) {
    this.orbit += dt * 0.35;
    const want = { x: target.x + Math.cos(this.orbit) * 45 - target.vx * 0.8, z: target.z + Math.sin(this.orbit) * 45 - target.vz * 0.8 };
    const gy = this.game.world.groundY(this.x, this.z, 500);
    const ty = Math.max(gy + 55, target.y + 60);
    const ax = (want.x - this.x) * 0.8 - this.vx * 1.4 + target.vx * 1.2, az = (want.z - this.z) * 0.8 - this.vz * 1.4 + target.vz * 1.2;
    this.vx += ax * dt; this.vz += az * dt;
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 55) { this.vx *= 55 / sp; this.vz *= 55 / sp; }
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.y = damp(this.y, ty, 0.8, dt);
    this.yaw = dampAngle(this.yaw, Math.atan2(target.x - this.x, target.z - this.z), 1.5, dt);
    const fwd = this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw), lat = this.vx * -Math.cos(this.yaw) + this.vz * Math.sin(this.yaw);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.set(fwd * 0.006, this.yaw, -lat * 0.008, 'YXZ');
    this.rotor.rotation.y += dt * 38;
    this.tail.rotation.x += dt * 60;
    this.beacon.visible = Math.sin(performance.now() / 180) > 0.6;
    // searchlight
    this.spot.intensity = night > 0.3 ? 900 : 0;
    this.cone.visible = night > 0.3;
    this.spot.target.position.copy(this.group.worldToLocal(new THREE.Vector3(target.x, target.y, target.z)));
    const dir = new THREE.Vector3(target.x - this.x, target.y - this.y, target.z - this.z);
    const len = dir.length();
    this.cone.scale.set(1, len / 80, 1);
    this.cone.position.set(0, -1.3, 1.8);
    this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.group.worldToLocal(new THREE.Vector3(target.x, target.y, target.z)).sub(this.cone.position).normalize());
  }
  dispose() { this.game.scene.remove(this.group); }
}

// --------------- police system ---------------
export class Police {
  constructor(game) {
    this.game = game;
    this.rng = new RNG('police');
    this.level = 0;
    this.escape = 0;
    this.seen = false;
    this.seenT = 0;
    this.unseenT = 0;
    this.lastSeen = null;
    this.units = [];
    this.helis = [];
    this.roadblocks = [];
    this.officers = [];
    this.bust = 0;
    this.bounty = 0;
    this.pursuitT = 0;
    this.points = 0;
    this.reports = [];
    this.disabledUnits = 0;
    this.pullOver = null;
    this.state = 'idle';
    this.patrolT = 0;
    this.checkT = 0;
    this.rbT = 15;
    this.radioT = 4;
    this.lastVehicle = null;
    this.heatMult = 1;
    this.cooldown = 0;
    this.enabled = true;
    this.stats = { maxLevel: 0, escapes: 0, arrests: 0, pursuitTime: 0, unitsDisabled: 0 };
  }

  get target() {
    const P = this.game.player;
    const v = P.vehicle;
    return v ? { x: v.x, y: v.y, z: v.z, vx: v.phys.vx, vz: v.phys.vz, yaw: v.yaw, speed: v.speed, veh: v } : { x: P.x, y: P.y, z: P.z, vx: P.vx, vz: P.vz, yaw: P.yaw, speed: P.speed, veh: null };
  }

  // ---------- crimes ----------
  crime(type, x, z, sev = 1) {
    if (!this.enabled || this.cooldown > 0 || this.game.mission?.noPolice) return;
    const witnessed = this.witnessedBy(x, z);
    const district = this.game.world.districtAt(x, z);
    const heat = this.game.heat?.get(district.id) || 0;
    this.game.heat?.add(district.id, sev * 2);
    const map = { speeding: 1, redlight: 1, hitCar: 1, hitPed: 2, carjack: 1, assault: 1, hitPolice: 2, ramPolice: 3, sidewalk: 1, prop: 0, evade: 2, trespass: 1 };
    let lvl = map[type] ?? 1;
    this.points += sev;
    if (type === 'hitCar' && this.points < 3 && !witnessed) lvl = 0;
    if (type === 'prop' && this.points < 6) lvl = 0;
    if (type === 'prop' && this.points >= 6) lvl = 1;
    if (!lvl) return;
    if (witnessed) {
      this.raise(Math.max(this.level + (this.level >= lvl ? (type === 'hitPolice' || type === 'ramPolice' ? 1 : 0) : 0), lvl), type);
      this.markSeen();
    } else {
      const delay = lerp(4, 1.5, clamp(heat / 60, 0, 1)) + this.rng.f() * 2;
      this.reports.push({ t: delay, x, z, lvl: Math.min(lvl, 2), type });
    }
    this.game.emit('police:crime', { type, witnessed });
  }

  witnessedBy(x, z) {
    for (const u of this.units) if (Math.hypot(u.v.x - x, u.v.z - z) < 70 && this.los(u.v.x, u.v.z, u.v.y, x, z)) return u;
    for (const c of this.game.traffic.cars) if (c.role === 'police' && Math.hypot(c.x - x, c.z - z) < 55 && this.los(c.x, c.z, c.y, x, z)) return c;
    return null;
  }

  los(ax, az, ay, bx, bz) {
    return this.game.world.colliders.raycast(ax, az, bx, bz, ay + 0.8, ay + 2.2, (c) => c.kind === 'building' || c.kind === 'wall' || c.kind === 'pier') >= 1;
  }

  raise(lvl, reason = '') {
    lvl = clamp(lvl, 0, 6);
    if (lvl <= this.level) return;
    const prev = this.level;
    this.level = lvl;
    this.escape = 0;
    this.stats.maxLevel = Math.max(this.stats.maxLevel, lvl);
    if (prev === 0) { this.bounty = 0; this.pursuitT = 0; this.disabledUnits = 0; this.game.emit('police:start', { level: lvl, reason }); }
    this.game.emit('police:level', { level: lvl, prev, reason });
    this.radio(prev === 0 ? `All units, ${reason === 'speeding' ? 'speeding vehicle' : 'suspect'} reported ${this.locText()}.` : `Suspect still at large. Escalating to level ${lvl} response.`);
  }

  clear(reason = 'escape') {
    const lvl = this.level;
    this.level = 0; this.escape = 0; this.bust = 0; this.points = 0; this.pullOver = null;
    for (const u of this.units) { u.mode = 'return'; u.returnT = 20; u.v.lights.bar = false; u.v.lights.siren = false; }
    for (const h of this.helis) h.leaving = true;
    this.clearRoadblocks();
    this.game.emit('police:clear', { reason, level: lvl, bounty: this.bounty, time: this.pursuitT });
    this.cooldown = reason === 'escape' ? 3 : 8;
  }

  markSeen() {
    const T = this.target;
    this.lastSeen = { x: T.x, z: T.z, vx: T.vx, vz: T.vz, t: this.game.time };
    this.seen = true;
    this.unseenT = 0;
  }

  locText() {
    const T = this.target;
    const n = this.game.world.roads.nearest(T.x, T.z, null, 40);
    const d = this.game.world.districtAt(T.x, T.z);
    const h = Math.atan2(T.vx, -T.vz);
    const dir = T.speed > 3 ? ['northbound', 'eastbound', 'southbound', 'westbound'][((Math.round(h / (Math.PI / 2)) % 4) + 4) % 4] : '';
    return n ? `${dir} on ${n.e.name}, ${d.short}` : `in ${d.short}`;
  }

  radio(text) {
    this.game.emit('police:radio', { text });
  }

  // ---------- units ----------
  spawnUnit(near = true, kind = null) {
    const g = this.game, T = this.target, R = g.world.roads;
    const lvl = this.level;
    kind = kind || (lvl >= 5 && this.rng.chance(0.35) ? 'interceptor' : lvl >= 3 && this.rng.chance(0.4) ? 'policeSuv' : 'police');
    // off-screen point on a road 120-260 m from the target
    for (let tries = 0; tries < 14; tries++) {
      const d = near ? this.rng.range(60, 150) : this.rng.range(120, 220);
      const a = this.rng.f() * Math.PI * 2;
      const px = T.x + Math.cos(a) * d, pz = T.z + Math.sin(a) * d;
      const n = R.nearestLane(px, pz, 0, 0, null, 40);
      if (!n) continue;
      const p = n.lane.pl.at(n.s);
      if (Math.abs(p.y - T.y) > 15) continue;
      const scr = new THREE.Vector3(p.x, p.y + 1, p.z).project(g.camera);
      if (d < 110 && Math.abs(scr.x) < 1.1 && Math.abs(scr.y) < 1.1 && scr.z < 1) continue;
      const v = g.spawnVehicle(kind, p.x, p.z, Math.atan2(p.dx, p.dz), { plate: 'RCPD ' + (10 + this.units.length) }, { kind: 'police', yRef: p.y + 2, assist: 0.8 });
      const ai = new AIDriver(g, v, { maxSpeed: SPEED_BY_LEVEL[Math.max(1, lvl)], aggr: 0.4 + lvl * 0.1, skill: 0.6 + lvl * 0.05 });
      const u = { v, ai, mode: 'pursue', id: v.id, spawnT: g.time, lostT: 0 };
      v.lights.bar = lvl >= 1; v.lights.siren = lvl >= 2;
      this.units.push(u);
      return u;
    }
    return null;
  }

  removeUnit(u) {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    if (this.game.player.vehicle !== u.v) this.game.removeVehicle(u.v);
  }

  // convert nearest traffic police car into a responding unit
  dispatchPatrol() {
    const T = this.target;
    let best = null, bd = 700;
    for (const c of this.game.traffic.cars) {
      if (c.role !== 'police' || c.state !== 'drive') continue;
      const d = Math.hypot(c.x - T.x, c.z - T.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return null;
    const g = this.game;
    const v = g.spawnVehicle(best.def.id, best.x, best.z, best.yaw, {}, { kind: 'police', yRef: best.y + 2, assist: 0.8 });
    v.phys.vx = Math.sin(best.yaw) * best.v; v.phys.vz = Math.cos(best.yaw) * best.v;
    g.traffic.despawn(best);
    const ai = new AIDriver(g, v, { maxSpeed: SPEED_BY_LEVEL[Math.max(1, this.level)], aggr: 0.5, skill: 0.7 });
    const u = { v, ai, mode: 'pursue', id: v.id, spawnT: g.time, lostT: 0 };
    v.lights.bar = true;
    this.units.push(u);
    return u;
  }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.game;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.patrols(dt);
    // pending civilian reports
    for (let i = this.reports.length - 1; i >= 0; i--) {
      const r = this.reports[i];
      r.t -= dt;
      if (r.t <= 0) {
        this.reports.splice(i, 1);
        if (this.level < r.lvl) {
          this.raise(r.lvl, r.type);
          this.lastSeen = { x: r.x, z: r.z, vx: 0, vz: 0, t: g.time };
          this.seen = false; this.unseenT = 3;
        }
      }
    }
    if (this.level === 0) {
      for (let i = this.units.length - 1; i >= 0; i--) {
        const u = this.units[i];
        u.returnT = (u.returnT ?? 10) - dt;
        const d = Math.hypot(u.v.x - g.player.x, u.v.z - g.player.z);
        if (u.returnT <= 0 || d > 250) this.removeUnit(u);
        else if (u.ai) { u.ai.mode = 'idle'; u.ai.path = []; u.ai.update(dt); }
      }
      for (let i = this.helis.length - 1; i >= 0; i--) { const h = this.helis[i]; h.y += dt * 12; h.group.position.y = h.y; h.x += h.vx * dt; h.z += h.vz * dt; h.group.position.x = h.x; h.group.position.z = h.z; h.rotor.rotation.y += dt * 38; if (h.y > 260) { h.dispose(); this.helis.splice(i, 1); } }
      this.updateOfficers(dt);
      return;
    }
    const T = this.target;
    this.pursuitT += dt;
    this.stats.pursuitTime += dt;
    // vehicle swap while unseen reduces attention
    if (T.veh !== this.lastVehicle) {
      if (!this.seen && this.lastVehicle && this.level > 1) { this.level = Math.max(1, this.level - 1); this.escape = Math.max(this.escape, 0.35); g.emit('police:level', { level: this.level, prev: this.level + 1, reason: 'vehicleSwap' }); g.emit('toast', { text: 'Vehicle change — police lost your description' }); }
      this.lastVehicle = T.veh;
    }
    // visibility
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.25;
      const sky = g.sky;
      const range = 95 * (1 - sky.night * 0.3) * (1 - sky.w.rain * 0.25) * (sky.w.fog > 0.004 ? 0.5 : 1);
      let seen = false;
      for (const u of this.units) {
        const d = Math.hypot(u.v.x - T.x, u.v.z - T.z);
        if (d < range && Math.abs(u.v.y - T.y) < 7 && this.los(u.v.x, u.v.z, u.v.y, T.x, T.z)) { seen = true; break; }
      }
      for (const h of this.helis) {
        const d = Math.hypot(h.x - T.x, h.z - T.z);
        const covered = this.game.world.decks.at(T.x, T.z, T.y + 20) !== null && this.game.world.decks.at(T.x, T.z, T.y + 20) > T.y + 3;
        if (d < 200 && !covered) { seen = true; break; }
      }
      if (seen) this.markSeen(); else this.seen = false;
    }
    if (!this.seen) this.unseenT += dt;
    // escape progress
    const escapeTime = (10 + this.level * 7) * (this.game.heat ? 1 + this.game.heat.get(g.world.districtAt(T.x, T.z).id) / 200 : 1);
    if (!this.seen && this.unseenT > 2) {
      const hidden = this.isHidden(T);
      this.escape = Math.min(1, this.escape + (dt / escapeTime) * (hidden ? 1.8 : 1));
      if (this.escape >= 1) { this.stats.escapes++; this.clear('escape'); return; }
    } else if (this.seen) this.escape = Math.max(0, this.escape - dt * 0.35);
    // escalation over time while pursued
    if (this.seen && this.level >= 2) {
      this.escalateT = (this.escalateT || 0) + dt;
      if (this.escalateT > 55 && this.level < 5) { this.escalateT = 0; this.raise(this.level + 1, 'evade'); }
      if (this.level === 5 && this.pursuitT > 240 && this.disabledUnits >= 6) this.raise(6, 'severe');
    }
    // level 1: pull-over opportunity
    if (this.level === 1 && this.seen) {
      const u = this.units.find((q) => Math.hypot(q.v.x - T.x, q.v.z - T.z) < 30);
      if (u) {
        this.pullOver = this.pullOver || { t: 0 };
        if (T.speed < 1.5) { this.pullOver.t += dt; if (this.pullOver.t > 2.5) { this.ticket(u); return; } }
        else if (T.speed > 16) { this.raise(2, 'evade'); this.pullOver = null; }
      }
    } else this.pullOver = null;
    // bounty
    this.bounty += dt * this.level * 6 * (this.seen ? 1.4 : 0.6);
    // manage units
    const want = UNITS_BY_LEVEL[this.level];
    this.spawnCd = (this.spawnCd || 0) - dt;
    if (this.units.length < want && this.spawnCd <= 0) {
      this.spawnCd = this.level >= 5 ? 1 : 2;
      if (this.units.length === 0 && this.level === 1) this.dispatchPatrol() || this.spawnUnit(true);
      else this.spawnUnit(true);
    }
    const heliWant = this.level >= 6 ? 2 : this.level >= 5 ? 1 : 0;
    if (this.helis.filter((h) => !h.leaving).length < heliWant) {
      const h = new Helicopter(g);
      h.x = T.x + 300; h.z = T.z - 200; h.y = 120;
      this.helis.push(h);
      this.radio('Air unit Riverton One en route.');
    }
    for (let i = this.helis.length - 1; i >= 0; i--) {
      const h = this.helis[i];
      if (h.leaving) { h.y += dt * 15; h.x += 25 * dt; h.group.position.set(h.x, h.y, h.z); h.rotor.rotation.y += dt * 38; if (h.y > 250) { h.dispose(); this.helis.splice(i, 1); } continue; }
      const tgt = this.seen ? T : { ...T, x: this.lastSeen?.x ?? T.x, z: this.lastSeen?.z ?? T.z };
      h.update(dt, tgt, g.sky.night);
    }
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const v = u.v;
      v.lights.bar = true; v.lights.siren = this.level >= 2;
      if (v.disabled || v.sunk) {
        if (!u.counted) { u.counted = true; this.disabledUnits++; this.stats.unitsDisabled++; this.bounty += 250; g.emit('police:unitDown', { u }); }
        u.deadT = (u.deadT || 0) + dt;
        if (u.deadT > 25 && Math.hypot(v.x - T.x, v.z - T.z) > 80) this.removeUnit(u);
        continue;
      }
      const d = Math.hypot(v.x - T.x, v.z - T.z);
      if (d > 480) { this.removeUnit(u); continue; }
      u.ai.maxSpeed = SPEED_BY_LEVEL[this.level] * (u.v.def.id === 'interceptor' ? 1.15 : 1);
      u.ai.aggr = this.level >= 3 ? 0.75 + (this.level - 3) * 0.08 : 0.45;
      if (this.seen || (this.lastSeen && this.unseenT < 6)) {
        const tgt = this.seen ? T : { x: this.lastSeen.x + this.lastSeen.vx * Math.min(4, this.unseenT), z: this.lastSeen.z + this.lastSeen.vz * Math.min(4, this.unseenT), vx: 0, vz: 0, yaw: 0 };
        u.ai.chase(tgt);
        u.ai.target = tgt;
      } else {
        // search pattern near last known position
        u.ai.mode = 'search';
        u.searchT = (u.searchT || 0) - dt;
        if (u.searchT <= 0 || u.ai.arrived || !u.ai.path.length) {
          u.searchT = 12; u.ai.arrived = false;
          const r = 60 + Math.min(200, this.unseenT * 8);
          const lx = (this.lastSeen?.x ?? T.x) + this.rng.range(-r, r), lz = (this.lastSeen?.z ?? T.z) + this.rng.range(-r, r);
          u.ai.routeTo(lx, lz, true);
          u.ai.maxSpeed = 18;
        }
      }
      u.ai.update(dt);
      if (v.lights.siren) g.traffic.siren(v);
    }
    // roadblocks
    if (this.level >= 4) {
      this.rbT -= dt;
      if (this.rbT <= 0 && this.seen && T.speed > 8) { this.rbT = this.level >= 6 ? 14 : 24; this.makeRoadblock(); }
    }
    this.updateRoadblocks(dt);
    // busted meter
    const close = this.units.some((u) => !u.v.disabled && Math.hypot(u.v.x - T.x, u.v.z - T.z) < (T.veh ? 9 : 6) && Math.abs(u.v.y - T.y) < 3) || this.officers.some((o) => Math.hypot(o.x - T.x, o.z - T.z) < 2.5) || (g.seaTraffic && g.seaTraffic.boats.some((b) => b.patrol && !b.v.disabled && Math.hypot(b.v.x - T.x, b.v.z - T.z) < 12));
    const slow = T.veh ? T.speed < 2.2 || T.veh.disabled : T.speed < 3.5;
    if (close && slow && this.level >= 2) this.bust = Math.min(1, this.bust + dt / (T.veh ? 3.2 : 2));
    else this.bust = Math.max(0, this.bust - dt * 0.6);
    if (this.bust >= 1) { this.stats.arrests++; this.arrest(); return; }
    // radio chatter
    this.radioT -= dt;
    if (this.radioT <= 0) {
      this.radioT = 9 + this.rng.f() * 8;
      const lines = this.seen
        ? [`Suspect ${this.locText()}.`, `Unit ${10 + this.rng.int(1, 30)} in pursuit, suspect ${this.locText()}.`, 'Suspect is driving recklessly, use caution.', `Requesting backup, ${this.locText()}.`]
        : ['Lost visual on the suspect. Units, begin search.', `Last seen ${this.locText()}.`, 'All units, set up a perimeter.', 'Check the side streets and parking lots.'];
      this.radio(this.rng.pick(lines));
    }
    this.updateOfficers(dt);
  }

  isHidden(T) {
    const w = this.game.world;
    const deck = w.decks.at(T.x, T.z, T.y + 20);
    if (deck !== null && deck > T.y + 3) return true;
    if (T.veh && T.speed < 1) {
      const g = w.poi.garage;
      if (Math.hypot(T.x - g.x, T.z - g.z) < 10) return true;
    }
    return false;
  }

  patrols(dt) {
    // keep a few police cars in regular traffic
    this.patrolT -= dt;
    if (this.patrolT > 0) return;
    this.patrolT = 3;
    const tr = this.game.traffic;
    const n = tr.cars.filter((c) => c.role === 'police').length;
    const want = 2 + Math.floor((this.game.heat?.nearby(this.game.player) || 0) / 30);
    if (n >= Math.min(5, want)) return;
    const T = this.target;
    const d = this.rng.range(160, 300), a = this.rng.f() * Math.PI * 2;
    const L = tr.roads.nearestLane(T.x + Math.cos(a) * d, T.z + Math.sin(a) * d, 0, 0, null, 40);
    if (!L) return;
    const def = this.rng.chance(0.7) ? VEHICLE_BY_ID.police : VEHICLE_BY_ID.policeSuv;
    const c = tr.spawnAt(L.lane, clamp(L.s, 3, L.lane.len - 5), def, '#f4f4f2');
    if (c) c.role = 'police';
  }

  ticket(u) {
    const fine = 150 + Math.round(this.points * 60);
    this.game.emit('police:ticket', { fine });
    this.radio('Suspect pulled over. Issuing citation.');
    this.clear('ticket');
    this.cooldown = 10;
  }

  // ---------- roadblocks ----------
  makeRoadblock() {
    const g = this.game, T = this.target, R = g.world.roads;
    const n = R.nearest(T.x, T.z, T.y, 30);
    if (!n) return;
    // walk forward along the graph ~260 m following the travel direction
    let e = n.e, dir = (T.vx * n.dx + T.vz * n.dz) >= 0 ? 1 : -1, s = n.s, dist = 0;
    for (let k = 0; k < 8 && dist < 260; k++) {
      const rem = dir > 0 ? e.pl.len - s : s;
      if (dist + rem > 260) { s = dir > 0 ? s + (260 - dist) : s - (260 - dist); dist = 260; break; }
      dist += rem;
      const node = R.nodes[dir > 0 ? e.b : e.a];
      const h = Math.atan2(T.vx, T.vz);
      let best = null, bs = -2;
      for (const id of node.edges) {
        if (id === e.id) continue;
        const f = R.edges[id];
        const d = R.dirFrom(f, node);
        const sc = Math.sin(h) * d.x + Math.cos(h) * d.z;
        if (sc > bs) { bs = sc; best = f; }
      }
      if (!best) return;
      e = best; dir = e.a === node.id ? 1 : -1; s = dir > 0 ? 0 : e.pl.len;
    }
    if (e.structure && e.clsName === 'freeway' && this.level < 5) return;
    s = clamp(s, e.sbA + 10, e.pl.len - e.sbB - 10);
    const p = e.pl.at(s);
    if (Math.hypot(p.x - T.x, p.z - T.z) < 120) return;
    const rx = -p.dz, rz = p.dx, hw = e.halfW;
    const rb = { x: p.x, z: p.z, cars: [], props: [], t: 0 };
    const heading = Math.atan2(p.dx, p.dz);
    for (const [off, ang] of [[-hw * 0.45, 0.9], [hw * 0.45, -0.9]]) {
      const kind = this.level >= 5 && this.rng.chance(0.5) ? 'policeSuv' : 'police';
      const v = g.spawnVehicle(kind, p.x + rx * off, p.z + rz * off, heading + Math.PI / 2 + ang * 0.4, {}, { kind: 'police', yRef: p.y + 2 });
      v.lights.bar = true;
      rb.cars.push(v);
    }
    for (let k = -2; k <= 2; k++) {
      const inst = g.world.props.place('barricade', p.x + rx * k * hw * 0.38 - p.dx * 4, p.y, p.z + rz * k * hw * 0.38 - p.dz * 4, heading + Math.PI / 2, 1, { noCollide: false });
      rb.props.push(inst);
    }
    if (this.level >= 5) rb.spikes = { x: p.x - p.dx * 9, z: p.z - p.dz * 9, dx: p.dx, dz: p.dz, hw, y: p.y };
    g.world.props.dirty = true;
    // officers standing guard
    for (const s2 of [-1, 1]) this.addOfficer(p.x + rx * s2 * (hw + 1.5) + p.dx * 2, p.z + rz * s2 * (hw + 1.5) + p.dz * 2, heading + Math.PI, 'guard', rb);
    this.roadblocks.push(rb);
    this.radio(`Roadblock set up on ${e.name || 'the road'}.`);
    g.emit('police:roadblock', rb);
  }

  updateRoadblocks(dt) {
    const T = this.target, g = this.game;
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const rb = this.roadblocks[i];
      rb.t += dt;
      const d = Math.hypot(rb.x - T.x, rb.z - T.z);
      if (rb.spikes && T.veh && !T.veh.spiked) {
        const S = rb.spikes;
        const ax = T.x - S.x, az = T.z - S.z;
        const along = ax * S.dx + az * S.dz, lat = Math.abs(ax * -S.dz + az * S.dx);
        if (Math.abs(along) < 1.2 && lat < S.hw) { T.veh.spiked = true; T.veh.phys.mu *= 0.6; T.veh.phys.health.engine *= 0.8; g.emit('vehicle:spiked', { v: T.veh }); }
      }
      if ((rb.t > 40 && d > 150) || rb.t > 120) this.removeRoadblock(rb, i);
    }
  }
  removeRoadblock(rb, i) {
    const g = this.game;
    for (const v of rb.cars) if (g.player.vehicle !== v && g.vehicles.includes(v)) g.removeVehicle(v);
    for (const p of rb.props) { g.world.props.knock(p); }
    this.officers = this.officers.filter((o) => { if (o.rb === rb) { g.scene.remove(o.rig.root); return false; } return true; });
    this.roadblocks.splice(i, 1);
  }
  clearRoadblocks() { for (let i = this.roadblocks.length - 1; i >= 0; i--) this.removeRoadblock(this.roadblocks[i], i); }

  // ---------- officers on foot ----------
  addOfficer(x, z, yaw, role, rb = null) {
    const rig = buildHuman({ ...OFFICER_LOOK, skin: this.rng.pick(['#e8b995', '#c68e6a', '#8d5a3b', '#a9714c', '#f1d0b5']) });
    rig.root.rotation.order = 'YXZ';
    this.game.scene.add(rig.root);
    const o = { rig, x, z, y: this.game.world.groundY(x, z, 20), yaw, role, rb, pose: { ...REST }, t: Math.random() * 5, phase: 0, speed: 0, target: null };
    this.officers.push(o);
    return o;
  }

  updateOfficers(dt) {
    for (const o of this.officers) {
      o.t += dt;
      let anim = o.anim || 'idle';
      if (o.target) {
        const dx = o.target.x - o.x, dz = o.target.z - o.z, d = Math.hypot(dx, dz);
        if (d > (o.stopAt ?? 1.2)) { const sp = o.run ? 3.6 : 1.5; o.x += (dx / d) * sp * dt; o.z += (dz / d) * sp * dt; o.yaw = dampAngle(o.yaw, Math.atan2(dx, dz), 8, dt); anim = o.run ? 'run' : 'walk'; o.phase += sp / (o.run ? 2.2 : 1.45) * Math.PI * dt; }
        else { o.yaw = dampAngle(o.yaw, Math.atan2(dx, dz), 8, dt); o.arrived = true; }
      }
      o.y = this.game.world.groundY(o.x, o.z, o.y + 0.5);
      const p = poseFor(anim, o.t, o.phase, 1);
      blendPose(o.pose, p, 1 - Math.exp(-dt * 10), o.pose);
      applyPose(o.rig, o.pose);
      o.rig.root.position.set(o.x, o.y, o.z);
      o.rig.root.rotation.y = o.yaw;
    }
  }

  // ---------- arrest ----------
  arrest() {
    const g = this.game;
    const T = this.target;
    this.state = 'arrest';
    const unit = this.units.filter((u) => !u.v.disabled).sort((a, b) => Math.hypot(a.v.x - T.x, a.v.z - T.z) - Math.hypot(b.v.x - T.x, b.v.z - T.z))[0];
    for (const u of this.units) { u.ai.mode = 'idle'; u.ai.path = []; u.v.input = { throttle: 0, brake: 1, steer: 0, hand: true }; }
    const lvl = this.level;
    this.level = 0;
    this.bust = 0;
    g.emit('police:arrest', { level: lvl, bounty: this.bounty, unit });
    this.clearRoadblocks();
    return unit;
  }
}
