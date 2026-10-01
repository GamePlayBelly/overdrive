import * as THREE from 'three';
import { MISSION_BY_ID } from '../data/missions.js';
import { NPCS, RIVALS } from '../data/npcs.js';
import { AIDriver } from '../vehicles/aiDriver.js';
import { Markers } from './markers.js';
import { clamp } from '../core/math.js';
import { buildJob, buildLeagueRace, buildCustomRace } from './jobs.js';

const fmtT = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GOLD = '#ffd23f', RED = '#ff3b4d', BLUE = '#4da3ff', GREEN = '#46e08a';

export function resolvePt(g, p) {
  if (!p) return null;
  if (Array.isArray(p)) return { x: p[0], z: p[1] };
  if (p.poi) { const o = g.world.poi[p.poi]; return o ? { x: o.x, z: o.z } : null; }
  return { x: p.x, z: p.z, yaw: p.yaw };
}

// ------------------------------------------------------------------------------------------------ steps
class Step {
  constructor(run, s) { this.run = run; this.g = run.g; this.s = s; this.t = 0; this.done = false; this.fail = null; this.text = s.text || ''; this.suffix = ''; this.progress = null; this.alive = true; }
  get P() { return this.g.player; }
  who() { const P = this.P, v = P.vehicle; return v && P.state === 'driving' ? { x: v.x, y: v.y, z: v.z, speed: v.speed, veh: v } : { x: P.x, y: P.y, z: P.z, speed: P.speed, veh: null }; }
  enter() {}
  update() {}
  exit() { this.alive = false; }
  limitCheck() { const s = this.s; if (s.limit) { const left = s.limit - this.t; this.suffix = `  ${fmtT(left)}`; if (left <= 0) this.fail = 'Time is up.'; } }
  blips() { return []; }
  // an AI car that has been wedged for a few seconds hops to a point further along its path
  unstick(car, ai, dt) {
    this.stuckT = car.phys.speed < 0.8 && !car.disabled ? (this.stuckT || 0) + dt : 0;
    if (this.stuckT < 5) return;
    this.stuckT = 0;
    const q = ai.path[Math.min(ai.path.length - 1, ai.pi + 4)];
    if (!q) return;
    car.place(q.x, this.g.world.groundY(q.x, q.z, car.y + 3), q.z, Math.atan2(q.x - car.x, q.z - car.z));
    ai.pi = Math.min(ai.path.length - 1, ai.pi + 4);
  }
  mark(pt, r, color, o = {}) { const m = this.run.markers.add({ x: pt.x, z: pt.z, r, color, ...o }); this.run.own(m); return m; }
}

class Goto extends Step {
  enter() {
    this.pt = resolvePt(this.g, this.s.to); this.r = this.s.r || 8; this.hold = 0;
    this.m = this.mark(this.pt, this.r, GOLD); this.run.app.setWaypoint(this.pt);
  }
  update(dt) {
    this.t += dt;
    const w = this.who(), d = Math.hypot(w.x - this.pt.x, w.z - this.pt.z);
    this.suffix = `  ${Math.round(d)} m`;
    if (d < this.r) {
      if (this.s.stop) { this.hold = w.speed < 2 ? this.hold + dt : 0; if (this.hold > 0.6) this.done = true; } else this.done = true;
    } else this.hold = 0;
    if (this.s.limit) this.limitCheck();
  }
  exit() { super.exit(); this.run.markers.remove(this.m); this.run.app.setWaypoint(null); }
  blips() { return [{ x: this.pt.x, z: this.pt.z, color: GOLD, r: 5 }]; }
}

class Deliver extends Goto {
  enter() {
    super.enter();
    const w = this.who(); this.veh = w.veh; this.dmg0 = this.veh ? this.veh.damage.total : 0; this.limit = this.s.limit || 0;
  }
  update(dt) {
    this.t += dt;
    const w = this.who();
    if (!w.veh) { this.suffix = '  get back in the vehicle'; return; }
    if (w.veh !== this.veh) { this.veh = w.veh; this.dmg0 = Math.min(this.dmg0, this.veh.damage.total); }
    const d = Math.hypot(w.x - this.pt.x, w.z - this.pt.z);
    this.suffix = `  ${Math.round(d)} m` + (this.limit ? `  ${fmtT(this.limit - this.t)}` : '');
    if (this.limit && this.t > this.limit) { this.fail = 'You ran out of time.'; return; }
    if (this.s.fragile !== undefined) {
      const lost = this.veh.damage.total - this.dmg0;
      this.progress = clamp(1 - lost / this.s.fragile, 0, 1);
      if (lost > this.s.fragile) { this.fail = 'The cargo was damaged.'; return; }
    }
    if (this.s.clean && this.g.police.level > 0) { this.fail = 'The police noticed you.'; return; }
    if (d < this.r) { this.hold = w.speed < 3 ? this.hold + dt : 0; if (this.s.stop === false || this.hold > 0.4 || w.speed < 6) this.done = true; } else this.hold = 0;
  }
}

class Pickup extends Step {
  enter() { this.dur = this.s.dur || 2; this.hold = 0; }
  update(dt) {
    const w = this.who();
    this.hold = w.speed < 1.4 ? this.hold + dt : Math.max(0, this.hold - dt * 2);
    this.progress = clamp(this.hold / this.dur, 0, 1);
    this.suffix = w.speed < 1.4 ? '' : '  stay still';
    if (this.hold >= this.dur) this.done = true;
  }
}

class Onfoot extends Step {
  enter() { this.pt = resolvePt(this.g, this.s.to); this.r = this.s.r || 3; this.m = this.mark(this.pt, this.r, BLUE); this.run.app.setWaypoint(this.pt); }
  update(dt) {
    this.t += dt;
    const w = this.who(), d = Math.hypot(w.x - this.pt.x, w.z - this.pt.z);
    this.suffix = w.veh ? '  get out of the vehicle' : `  ${Math.round(d)} m`;
    if (!w.veh && d < this.r) { if (this.s.t !== 'interact' || this.g.input.hit('enter')) this.done = true; }
    this.limitCheck();
  }
  exit() { super.exit(); this.run.markers.remove(this.m); this.run.app.setWaypoint(null); }
  blips() { return [{ x: this.pt.x, z: this.pt.z, color: BLUE, r: 5 }]; }
}

class Talk extends Step {
  enter() { this.run.say(this.s.lines || []).then(() => { this.done = true; }); }
}

class Escape extends Step {
  enter() {
    const P = this.g.police;
    this.level = this.s.level || 2;
    P.cooldown = 0; P.enabled = true;
    if (P.level < this.level) P.raise(this.level, 'mission');
    this.onClear = (e) => { if (!this.alive) return; if (e.reason === 'escape' || e.reason === 'ticket') this.done = true; };
    this.onArrest = () => { if (this.alive) this.fail = 'You were busted.'; };
    this.g.on('police:clear', this.onClear); this.g.on('police:arrest', this.onArrest);
  }
  update(dt) {
    const P = this.g.police;
    this.t += dt;
    this.suffix = P.level ? `  wanted level ${P.level}` : '';
    this.progress = P.level ? clamp(P.escape, 0, 1) : null;
    if (P.level === 0 && this.t > 2) this.done = true;
  }
  exit() { super.exit(); this.g.off?.('police:clear', this.onClear); this.g.off?.('police:arrest', this.onArrest); }
}

class Recover extends Step {
  enter() {
    const s = this.s, at = s.at, g = this.g;
    this.car = g.spawnVehicle(s.model, at.x, at.z, at.yaw || 0, { color: s.color }, { yRef: 80 });
    this.car.input = { throttle: 0, brake: 0.6, steer: 0, hand: true, boost: false };
    this.run.ents.push(this.car);
    this.m = this.mark({ x: at.x, z: at.z }, 3.5, RED, { beam: true });
  }
  update() {
    const P = this.P;
    this.m.x = this.car.x; this.m.z = this.car.z; this.run.markers.place(this.m);
    if (P.vehicle === this.car && P.state === 'driving') { this.run.vehicle = this.car; this.done = true; }
  }
  exit() { super.exit(); this.run.markers.remove(this.m); }
  blips() { return [{ x: this.car.x, z: this.car.z, color: RED, r: 5 }]; }
}

class Tail extends Step {
  enter() {
    const s = this.s, g = this.g, r0 = s.route[0], r1 = s.route[1] || r0;
    this.car = g.spawnVehicle(s.model, r0[0], r0[1], Math.atan2(r1[0] - r0[0], r1[1] - r0[1]), { color: s.color }, { yRef: 80 });
    this.run.ents.push(this.car);
    this.ai = new AIDriver(g, this.car, { maxSpeed: s.speed || 13, aggr: 0, skill: 0.7 });
    this.i = 1; this.lost = 0; this.close = 0; this.end = 0;
    this.ai.routeTo(s.route[this.i][0], s.route[this.i][1], true);
    this.m = this.mark({ x: r0[0], z: r0[1] }, 2.5, RED);
  }
  update(dt) {
    this.t += dt;
    const s = this.s, w = this.who(), car = this.car;
    this.ai.update(dt); this.unstick(car, this.ai, dt);
    this.m.x = car.x; this.m.z = car.z; this.run.markers.place(this.m);
    if (this.ai.arrived || Math.hypot(car.x - s.route[this.i][0], car.z - s.route[this.i][1]) < 12) {
      this.ai.arrived = false;
      if (this.i < s.route.length - 1) { this.i++; this.ai.routeTo(s.route[this.i][0], s.route[this.i][1], true); }
      else this.finish = true;
    }
    const d = Math.hypot(w.x - car.x, w.z - car.z);
    this.suffix = `  ${Math.round(d)} m`;
    this.progress = clamp(this.i / s.route.length, 0, 1);
    this.lost = d > s.max ? this.lost + dt : Math.max(0, this.lost - dt);
    this.close = d < s.min ? this.close + dt : Math.max(0, this.close - dt * 0.5);
    if (this.lost > 6) this.fail = 'You lost the target.';
    else if (this.close > 6) this.fail = 'You were spotted.';
    if (this.lost > 1.5) this.suffix += '  too far!'; else if (this.close > 1.5) this.suffix += '  too close!';
    if (this.finish) { car.input = { throttle: 0, brake: 1, steer: 0, hand: true }; this.end += d < 60 ? dt : 0; if (this.end > 1.5) this.done = true; }
    if (car.disabled) this.fail = 'The target was wrecked.';
  }
  exit() { super.exit(); this.run.markers.remove(this.m); }
  blips() { return [{ x: this.car.x, z: this.car.z, color: RED, r: 5 }]; }
}

class Escort extends Step {
  enter() {
    const s = this.s, g = this.g, f = s.from;
    this.car = g.spawnVehicle(s.model, f.x, f.z, f.yaw || 0, { color: s.color }, { yRef: 80 });
    this.run.ents.push(this.car);
    this.ai = new AIDriver(g, this.car, { maxSpeed: 16, aggr: 0, skill: 0.6 });
    this.to = resolvePt(g, s.to);
    this.ai.routeTo(this.to.x, this.to.z, true);
    this.start = Math.hypot(f.x - this.to.x, f.z - this.to.z);
    this.enemies = [];
    const n = s.enemies || 3;
    for (let k = 0; k < n; k++) this.enemySpawn(k);
    this.m = this.mark({ x: f.x, z: f.z }, 3, GREEN);
    this.far = 0;
  }
  enemySpawn(k) {
    const g = this.g, c = this.car, a = this.run.rng() * 6.28, d = 130 + k * 40 + this.run.rng() * 40;
    const R = g.world.roads, n = R.nearestLane(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 0, 0, null, 60);
    if (!n) return;
    const p = n.lane.pl.at(n.s);
    const v = g.spawnVehicle('utility', p.x, p.z, Math.atan2(p.dx, p.dz), { color: '#e07a1a' }, { yRef: p.y + 2, assist: 0.8 });
    const ai = new AIDriver(g, v, { maxSpeed: 27, aggr: 0.8, skill: 0.6 });
    this.run.ents.push(v);
    this.enemies.push({ v, ai });
  }
  update(dt) {
    this.t += dt;
    const car = this.car, w = this.who();
    this.ai.update(dt); this.unstick(car, this.ai, dt);
    this.m.x = car.x; this.m.z = car.z; this.run.markers.place(this.m);
    const dTo = Math.hypot(car.x - this.to.x, car.z - this.to.z);
    this.progress = clamp(1 - dTo / this.start, 0, 1);
    this.suffix = `  ${Math.round(dTo)} m to go`;
    for (const e of this.enemies) {
      if (e.v.disabled) { if (!e.down) { e.down = true; e.t = 0; } e.t += dt; if (e.t > 12) { this.g.removeVehicle(e.v); this.run.ents = this.run.ents.filter((q) => q !== e.v); e.gone = true; } continue; }
      e.ai.chase({ x: car.x, z: car.z, vx: car.phys.vx, vz: car.phys.vz, yaw: car.yaw });
      e.ai.update(dt);
    }
    this.enemies = this.enemies.filter((e) => !e.gone);
    const dp = Math.hypot(w.x - car.x, w.z - car.z);
    this.far = dp > 220 ? this.far + dt : 0;
    if (this.far > 12) this.fail = 'You left the convoy behind.';
    if (car.disabled || car.damage.total > 0.97 || car.sunk) this.fail = 'The convoy truck was wrecked.';
    if (dTo < 14) { this.ai.path = []; car.input = { throttle: 0, brake: 1, steer: 0, hand: true }; this.done = true; }
  }
  exit() { super.exit(); this.run.markers.remove(this.m); }
  blips() { return [{ x: this.car.x, z: this.car.z, color: GREEN, r: 5 }, ...this.enemies.map((e) => ({ x: e.v.x, z: e.v.z, color: RED, r: 4 }))]; }
}

class Stunt extends Step {
  enter() {
    this.air = 0; this.drift = 0; this.prev = null;
    this.onLand = (e) => { if (this.alive && e.v === this.g.player.vehicle && e.air >= (this.s.air || 0)) this.airOk = true; this.air = Math.max(this.air, e.air); };
    this.g.on('vehicle:landing', this.onLand);
  }
  update(dt) {
    this.t += dt;
    const v = this.P.vehicle;
    if (v) { const sc = v.phys.drift.score; if (this.prev !== null) this.drift += Math.max(0, sc - this.prev); this.prev = sc; if (v.phys.air > this.air) this.air = v.phys.air; if (v.phys.air >= (this.s.air || 0)) this.airOk = true; }
    const ad = this.s.air ? Math.min(1, this.air / this.s.air) : 1, dd = this.s.drift ? Math.min(1, this.drift / this.s.drift) : 1;
    this.progress = (ad + dd) / 2;
    this.suffix = `  air ${this.air.toFixed(1)} s / ${this.s.air || 0}   drift ${Math.round(this.drift)} / ${this.s.drift || 0}`;
    this.limitCheck();
    if ((this.airOk || !this.s.air) && (!this.s.drift || this.drift >= this.s.drift)) this.done = true;
  }
  exit() { super.exit(); this.g.off?.('vehicle:landing', this.onLand); }
}

class Photo extends Step {
  enter() {
    const g = this.g, o = g.world.poi.meet || g.world.poi.motorClub;
    this.targets = [];
    for (const t of this.s.targets) {
      const v = g.spawnVehicle(t.model, o.x + (t.dx || 0), o.z + (t.dz || 0) - 6, Math.PI / 2, { color: t.color }, { yRef: 80 });
      v.input = { throttle: 0, brake: 1, steer: 0, hand: true };
      this.run.ents.push(v); this.targets.push({ v, shot: false });
    }
    this.onPhoto = () => {
      if (!this.alive) return;
      const cam = g.camera, f = new THREE.Frustum(), m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      f.setFromProjectionMatrix(m);
      for (const t of this.targets) {
        if (t.shot) continue;
        const p = new THREE.Vector3(t.v.x, t.v.y + 0.7, t.v.z);
        if (p.distanceTo(cam.position) < 40 && f.containsPoint(p)) { t.shot = true; g.emit('toast', { text: 'Shot captured' }); }
      }
    };
    g.on('photo:taken', this.onPhoto);
    this.pt = { x: o.x, z: o.z };
  }
  update() {
    const n = this.targets.filter((t) => t.shot).length;
    this.progress = n / this.targets.length; this.suffix = `  ${n} / ${this.targets.length}`;
    if (n === this.targets.length) this.done = true;
  }
  exit() { super.exit(); this.g.off?.('photo:taken', this.onPhoto); }
  blips() { return this.targets.filter((t) => !t.shot).map((t) => ({ x: t.v.x, z: t.v.z, color: BLUE, r: 4 })); }
}

class Ram extends Step {
  enter() {
    const s = this.s, g = this.g, f = s.from;
    this.car = g.spawnVehicle(s.model, f.x, f.z, f.yaw || 0, { color: s.color }, { yRef: 80 });
    this.run.ents.push(this.car);
    this.ai = new AIDriver(g, this.car, { maxSpeed: 33, aggr: 0, skill: 0.75 });
    this.flee();
    this.m = this.mark({ x: f.x, z: f.z }, 3, RED);
    this.limit = s.limit || 240; this.health = s.health || 0.85; this.started = false;
  }
  flee() {
    const R = this.g.world.roads, car = this.car;
    let best = null, bd = 0;
    for (let k = 0; k < 8; k++) { const n = R.nodes[Math.floor(this.run.rng() * R.nodes.length)]; const d = Math.hypot(n.x - car.x, n.z - car.z); if (d > bd && d < 1400) { bd = d; best = n; } }
    if (best) this.ai.routeTo(best.x, best.z, true);
  }
  update(dt) {
    this.t += dt;
    const car = this.car, w = this.who();
    const d = Math.hypot(w.x - car.x, w.z - car.z);
    if (!this.started && d < 60) this.started = true;
    if (this.started && !car.disabled) { this.ai.update(dt); this.unstick(car, this.ai, dt); if (this.ai.arrived) { this.ai.arrived = false; this.flee(); } }
    else if (!this.started) car.input = { throttle: 0, brake: 1, steer: 0, hand: true };
    this.m.x = car.x; this.m.z = car.z; this.run.markers.place(this.m);
    const dmg = car.damage.total;
    this.progress = clamp(dmg / this.health, 0, 1);
    this.suffix = `  ${Math.round(d)} m  ${fmtT(this.limit - this.t)}`;
    if (dmg >= this.health || car.disabled) { car.disabled = true; car.input = { throttle: 0, brake: 1, steer: 0, hand: true }; this.done = true; }
    if (this.t > this.limit) this.fail = 'The target got away.';
    if (d > 500 && this.started) this.fail = 'The target got away.';
  }
  exit() { super.exit(); this.run.markers.remove(this.m); }
  blips() { return [{ x: this.car.x, z: this.car.z, color: RED, r: 5 }]; }
}

class Checkpoints extends Step {
  enter() {
    const s = this.s, g = this.g;
    this.pts = s.pts.map((p) => resolvePt(g, p));
    this.laps = s.laps || 1; this.lap = 0; this.idx = 0; this.passed = 0; this.total = this.pts.length * this.laps;
    this.race = !!s.race; this.limit = s.limit || 0; this.rivals = []; this.order = []; this.phase = 'wait'; this.cd = 3.6; this.clock = 0;
    this.mA = this.mark(this.pts[0], 13, GOLD); this.mB = this.pts.length > 1 ? this.mark(this.pts[1], 8, '#9fb4c8', { beam: false }) : null;
    this.run.app.setWaypoint(this.pts[0]);
    if (this.race) this.spawnRivals();
    this.prev = null;
  }
  spawnRivals() {
    const g = this.g, P = this.P, w = this.who();
    const first = this.pts[0], yaw = Math.atan2(first.x - w.x, first.z - w.z);
    const s = Math.sin(yaw), c = Math.cos(yaw);
    (this.s.rivals || []).forEach((r, k) => {
      const meta = RIVALS.find((q) => q.id === r.id) || {};
      const side = k % 2 ? 1 : -1, back = 5 + Math.floor(k / 2) * 6;
      const x = w.x + c * side * 3.6 - s * back, z = w.z - s * side * 3.6 - c * back;
      const v = g.spawnVehicle(r.model || meta.car || 'arc', x, z, yaw, { color: r.color || meta.color }, { yRef: w.y + 3, assist: 0.9 });
      v.input = { throttle: 0, brake: 1, steer: 0, hand: true };
      const skill = r.skill ?? meta.skill ?? 0.7;
      const ai = new AIDriver(g, v, { maxSpeed: 22 + skill * 28, aggr: meta.aggr ?? 0.5, skill, recover: true });
      this.run.ents.push(v);
      this.rivals.push({ id: r.id, name: r.name || meta.name || r.id, v, ai, idx: 0, lap: 0, passed: 0, base: 22 + skill * 28 });
    });
    void P;
  }
  advanceMarkers() {
    const a = this.pts[this.idx % this.pts.length], b = this.pts[(this.idx + 1) % this.pts.length];
    this.mA.x = a.x; this.mA.z = a.z; this.run.markers.place(this.mA);
    if (this.mB) { this.mB.x = b.x; this.mB.z = b.z; this.run.markers.place(this.mB); this.mB.grp.visible = !(this.lap === this.laps - 1 && this.idx === this.pts.length - 1); }
    this.run.app.setWaypoint(a);
  }
  update(dt) {
    const g = this.g, w = this.who();
    if (this.phase === 'wait') {
      this.suffix = w.veh ? '' : '  get in a vehicle';
      if (w.veh) { this.phase = 'count'; }
      return;
    }
    if (this.phase === 'count') {
      g.lock = true;
      const before = Math.ceil(this.cd);
      this.cd -= dt;
      const now = Math.ceil(this.cd);
      if (now !== before && now >= 0) { if (now > 0) { g.emit('hud:big', { text: String(now), sub: this.race ? 'Get ready' : 'Get ready', kind: '' }); g.audio.play('tickHi', { bus: 'ui', vol: 0.6, jitter: 0 }); } }
      this.suffix = `  ${Math.max(0, now)}`;
      for (const r of this.rivals) r.v.input = { throttle: 0, brake: 1, steer: 0, hand: true };
      if (this.cd <= 0) {
        g.lock = false; this.phase = 'go'; this.clock = 0;
        g.emit('hud:big', { text: 'GO', sub: '', kind: 'green' });
        for (const r of this.rivals) { r.v.input = { throttle: 0, brake: 0, steer: 0, hand: false }; r.ai.routeTo(this.pts[0].x, this.pts[0].z, false, this.pts[1] || null); }
        this.prev = { x: w.x, z: w.z };
      }
      return;
    }
    this.clock += dt;
    const pt = this.pts[this.idx];
    if (w.veh) {
      const prev = this.prev || w;
      const dx = w.x - prev.x, dz = w.z - prev.z, L2 = dx * dx + dz * dz;
      let t = L2 > 1e-6 ? ((pt.x - prev.x) * dx + (pt.z - prev.z) * dz) / L2 : 0; t = clamp(t, 0, 1);
      const d = Math.hypot(prev.x + dx * t - pt.x, prev.z + dz * t - pt.z);
      if (d < 16) this.pass();
    }
    this.prev = { x: w.x, z: w.z };
    // rivals
    for (const r of this.rivals) {
      if (r.fin) { r.ai.update(dt); continue; }
      const tp = this.pts[r.idx];
      if (Math.hypot(r.v.x - tp.x, r.v.z - tp.z) < 20) {
        r.passed++; r.idx++;
        if (r.idx >= this.pts.length) { r.idx = 0; r.lap++; }
        if (r.lap >= this.laps) { r.fin = this.clock; this.order.push(r); if (!this.finished && this.run.def.fail?.race) { this.fail = this.run.def.fail.race; } r.ai.path = []; continue; }
        const np = this.pts[r.idx], nn = r.idx + 1 < this.pts.length ? this.pts[r.idx + 1] : r.lap < this.laps - 1 ? this.pts[0] : null;
        r.ai.routeTo(np.x, np.z, false, nn);
      }
      // gentle rubber banding toward the player's pace
      const lead = r.passed - this.passed;
      r.ai.maxSpeed = r.base * (1 - clamp(lead * 0.04, -0.06, 0.1));
      r.ai.update(dt);
    }
    const place = 1 + this.rivals.filter((r) => r.passed > this.passed || (r.passed === this.passed && Math.hypot(r.v.x - pt.x, r.v.z - pt.z) < Math.hypot(w.x - pt.x, w.z - pt.z) - 4)).length;
    this.progress = this.passed / this.total;
    this.suffix = `  ${this.passed} / ${this.total}` + (this.laps > 1 ? `  lap ${Math.min(this.lap + 1, this.laps)}/${this.laps}` : '') + (this.race ? `  ${place}${['st', 'nd', 'rd'][place - 1] || 'th'}/${this.rivals.length + 1}` : '') + (this.limit ? `  ${fmtT(this.limit - this.clock)}` : `  ${fmtT(this.clock)}`);
    if (this.limit && this.clock > this.limit) this.fail = 'Time is up.';
  }
  pass() {
    this.passed++; this.idx++;
    this.g.audio.ui('tickHi');
    if (this.idx >= this.pts.length) { this.idx = 0; this.lap++; if (this.lap < this.laps) this.g.emit('hud:gain', { text: `Lap ${this.lap + 1}`, color: '#8fb8ff' }); }
    if (this.lap >= this.laps) {
      this.finished = true;
      const place = 1 + this.order.length;
      this.run.result = { place, time: this.clock, rivals: this.rivals.length };
      this.done = true;
      return;
    }
    this.advanceMarkers();
  }
  exit() {
    super.exit();
    this.g.lock = false;
    this.run.markers.remove(this.mA); if (this.mB) this.run.markers.remove(this.mB);
    this.run.app.setWaypoint(null);
  }
  blips() { return [{ x: this.pts[this.idx].x, z: this.pts[this.idx].z, color: GOLD, r: 5 }, ...this.rivals.map((r) => ({ x: r.v.x, z: r.v.z, color: RED, r: 4 }))]; }
}

const STEPS = { goto: Goto, deliver: Deliver, pickup: Pickup, onfoot: Onfoot, interact: Onfoot, talk: Talk, escape: Escape, recover: Recover, tail: Tail, escort: Escort, stunt: Stunt, photo: Photo, ram: Ram, checkpoints: Checkpoints };

// ------------------------------------------------------------------------------------------------ runner
export class Missions {
  constructor(app) {
    this.app = app; this.g = app.game;
    this.markers = new Markers(this.g);
    this.active = null; this.run = null;
    this._seed = 7;
    app.blipFns.push(() => this.blips());
    this.g.on('police:arrest', () => { if (this.run && this.run.phase === 'steps' && this.run.step && !(this.run.step instanceof Escape)) this.fail('You were busted.'); });
  }

  rngf() { this._seed = (this._seed * 16807) % 2147483647; return this._seed / 2147483647; }

  get busy() { return !!this.run; }

  startPoint(m) { return resolvePt(this.g, m.start) || null; }

  state(m) {
    const p = this.app.profile;
    if (p.level < (m.level || 1)) return 'level';
    if (!(m.requires || []).every((r) => p.missions.done[r])) return 'locked';
    return p.missions.done[m.id] ? 'done' : 'open';
  }

  async say(lines) {
    const hud = this.app.hud;
    for (const [who, text] of lines) {
      const n = NPCS[who];
      hud.say(n ? n.name : who, text, 1800 + text.length * 55);
      await sleep(1500 + text.length * 50);
    }
  }

  // ---------- story
  async startStory(id) {
    const m = MISSION_BY_ID[id];
    if (!m) return false;
    if (this.run) { this.app.toast?.({ title: 'Mission in progress', sub: 'Finish or cancel it first' }); return false; }
    const st = this.state(m);
    if (st === 'level' || st === 'locked') return false;
    return this.begin({ ...m, kind: 'story' });
  }

  async startJob(id) {
    if (this.run) return false;
    const def = buildJob(this, id);
    if (!def) return false;
    return this.begin({ ...def, kind: 'job' });
  }

  async startCustom(id) {
    if (this.run) return false;
    const r = this.app.profile.customRaces.find((x) => x.id === id);
    if (!r) return false;
    return this.begin({ ...buildCustomRace(this, r), kind: 'custom' });
  }

  async startLeague(id) {
    if (this.run) return false;
    const def = buildLeagueRace(this, id);
    if (!def) return false;
    return this.begin({ ...def, kind: 'league' });
  }

  async begin(def) {
    const app = this.app, g = this.g;
    this.run = { def, phase: 'intro', idx: -1, step: null, ents: [], owned: [], markers: this.markers, g, app, result: null, t0: performance.now(), rng: () => this.rngf(), say: (l) => this.say(l), own: (m) => this.run.owned.push(m), vehicle: null };
    const R = this.run;
    g.mission = def;
    this.active = { title: def.title, text: def.kind === 'story' ? 'Starting…' : '', progress: null, def };
    if (def.hours) { const h = g.sky.time; const [a, b] = def.hours; const ok = a < b ? h >= a && h < b : h >= a || h < b; if (!ok) { g.sky.time = a; app.hud?.gain('Time skipped', '#8fb8ff'); } }
    const sp = this.startPoint(def);
    if ((def.kind === 'story' || def.kind === 'custom') && sp) {
      const P = g.player, w = P.vehicle || P;
      if (def.kind === 'custom') await app.fastTravel(sp.x, sp.z, def.startYaw || 0, true);
      else if (Math.hypot(w.x - sp.x, w.z - sp.z) > 160) await app.fastTravel(sp.x, sp.z, 0);
    }
    if (!this.run || this.run !== R) return false;
    if (def.intro) await this.say(def.intro);
    if (!this.run || this.run !== R) return false;
    R.phase = 'steps';
    this.next();
    return true;
  }

  next() {
    const R = this.run;
    if (!R) return;
    if (R.step) { R.step.exit(); R.step = null; }
    R.idx++;
    if (R.idx >= R.def.steps.length) { this.complete().catch((e) => { console.error('mission complete failed', e); this.cleanup(); }); return; }
    const spec = R.def.steps[R.idx], Cls = STEPS[spec.t];
    if (!Cls) { console.warn('unknown mission step', spec.t); return this.next(); }
    R.step = new Cls(R, spec);
    R.step.enter();
    this.app.game.audio.ui('confirm');
  }

  update(dt) {
    const R = this.run;
    this.markers.update(dt, this.g.camera.position);
    if (!R || R.phase !== 'steps' || !R.step) return;
    const st = R.step;
    st.update(dt);
    this.active.text = (st.text || '') + (st.suffix || '');
    this.active.progress = st.progress;
    if (st.fail) return this.fail(st.fail);
    if (st.done) this.next();
  }

  blips() { const R = this.run; return R && R.step ? R.step.blips() : []; }

  cleanup() {
    const R = this.run;
    if (!R) return;
    if (R.step) { R.step.exit(); R.step = null; }
    this.markers.clear();
    const g = this.g;
    g.lock = false;
    for (const v of R.ents) if (v !== g.player.vehicle && g.vehicles.includes(v)) { const keep = v === R.vehicle; if (!keep) setTimeout(() => { if (g.vehicles.includes(v) && g.player.vehicle !== v) g.removeVehicle(v); }, 8000); }
    this.app.setWaypoint(null);
    g.mission = null;
    this.active = null; this.run = null;
  }

  cancel() { if (this.run) { this.app.hud?.big('Mission cancelled', this.run.def.title, ''); this.cleanup(); } }

  fail(reason) {
    const R = this.run;
    if (!R) return;
    const id = R.def.id;
    this.app.hud?.big('MISSION FAILED', reason, 'red');
    this.g.audio.ui('error');
    this.lastFailed = id;
    this.cleanup();
    this.app.toast?.({ title: 'Mission failed', sub: reason, kind: 'red', icon: 'lock' });
  }

  async complete() {
    const R = this.run;
    if (!R) return;
    const def = R.def, app = this.app, g = this.g;
    R.phase = 'outro';
    const time = (performance.now() - R.t0) / 1000;
    const res = R.result;
    app.hud?.big('MISSION PASSED', def.title, 'green');
    g.audio.ui('levelup');
    if (def.kind === 'story') {
      app.store.act({ type: 'missionComplete', id: def.id, time: res?.time || time });
    } else if (def.kind === 'job') {
      const pay = def.pay(time);
      app.store.act({ type: 'jobComplete', money: pay.money, xp: pay.xp, rep: pay.rep, delivery: def.delivery });
    } else if (def.kind === 'online') {
      const r = await app.net.request('race.finish', { time: res?.time || time });
      if (r.ok) app.hud.big(`Finished ${r.place}${['st', 'nd', 'rd'][r.place - 1] || 'th'}`, 'Waiting for other racers', 'green');
    } else if (def.kind === 'event') {
      app.store.act({ type: 'reward', money: def.reward.money, xp: def.reward.xp, rep: def.reward.rep, reason: def.title });
    } else if (def.kind === 'custom') {
      const place = res?.place || 1, st = def.steps[0];
      app.store.act({ type: 'customRaceDone', id: def.rawId, place, time: res?.time || time });
      app.hud?.big(st.race ? `${place}${['st', 'nd', 'rd'][place - 1] || 'th'} place` : 'Finished', fmtT(res?.time || time), place === 1 ? 'green' : '');
    } else if (def.kind === 'league') {
      const place = res?.place || 1;
      app.store.act({ type: 'raceResult', place, raceId: def.id, time: res?.time, purse: def.purse, xp: def.xp, league: true, rain: g.sky.w.rain > 0.3 });
      app.hud?.big(`${place}${['st', 'nd', 'rd'][place - 1] || 'th'} place`, def.title, place === 1 ? 'green' : '');
    }
    if (def.outro) { const cur = this.run; await this.say(def.outro); if (this.run !== cur) return; }
    this.cleanup();
  }
}
