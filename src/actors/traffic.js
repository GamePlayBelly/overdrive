import * as THREE from 'three';
import { CarBatch } from '../vehicles/carBatch.js';
import { CarPhysics } from '../vehicles/physics.js';
import { Vehicle } from '../vehicles/vehicle.js';
import { carGeometry } from '../vehicles/carMesh.js';
import { VEHICLE_BY_ID, TRAFFIC_POOL } from '../data/vehicles.js';
import { RNG } from '../core/rng.js';
import { clamp, lerp, wrapAngle, dampAngle, smoothstep } from '../core/math.js';
import { collide } from '../world/collision.js';

const MODELS = [...new Set([...TRAFFIC_POOL.map((d) => d.id), 'police', 'policeSuv', 'taxi', 'bus', 'boxtruck'])];
let CID = 1;
const _rc = {};

// A traffic participant. Kinematic lane follower until disturbed, then a physics body.
class TCar {
  constructor(sys, def, color) {
    this.id = CID++;
    this.sys = sys;
    this.game = sys.game;
    this.world = sys.game.world;
    this.def = def;
    const geo = carGeometry(def);
    this.dims = geo.dims;
    this.hx = geo.dims.L / 2; this.hz = geo.dims.W / 2;
    this.len = geo.dims.L;
    this.color = new THREE.Color(color);
    this.spin = 0; this.steer = 0; this.roll = 0;
    this.light = [0, 0, 0, 0];
    this.piece = null; this.s = 0; this.v = 0; this.next = [];
    this.state = 'drive';
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.pitch = 0;
    this.aggr = sys.rng.range(0.85, 1.15);
    this.wait = 0; this.stuck = 0; this.honkT = 0; this.pullOver = 0; this.lat = 0;
    this.damage = { total: 0, front: 0, rear: 0, left: 0, right: 0 };
    this.events = [];
    this.hitCooldown = 0;
    this.deformable = false;
    this.lights = { head: false, indL: 0, indR: 0, hazard: false, brake: 0 };
    this.role = 'civilian';
    this.cOff = 0;
    this.phys = null;
    this.parkedRef = null;
  }

  obb() {
    if (this.phys) return Vehicle.prototype.obb.call(this);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw), th = Math.atan2(c, s);
    return { x: this.x, z: this.z, hx: this.hx, hz: this.hz, cos: Math.cos(th), sin: Math.sin(th), type: 'box' };
  }
  get speed() { return this.phys ? this.phys.speed : this.v; }
  get kmh() { return this.speed * 3.6; }
}
// borrow rigid-body helpers from Vehicle
TCar.prototype.resolve = Vehicle.prototype.resolve;
TCar.prototype.outline = Vehicle.prototype.outline;
TCar.prototype.collideStatic = Vehicle.prototype.collideStatic;
TCar.prototype.applyDamage = function (px, pz, impact) {
  const amt = clamp((impact - 2.2) * 0.02, 0, 0.5);
  this.damage.total = Math.min(1, this.damage.total + amt);
  if (this.phys) this.phys.health.engine = clamp(1 - this.damage.total, 0.1, 1);
};

export class Traffic {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.roads = game.world.roads;
    this.rng = new RNG('traffic');
    this.batch = new CarBatch(game.scene, MODELS);
    this.cars = [];
    this.parkedActive = [];
    this.density = 1;
    this.maxCars = 46;
    this.spawnT = 0;
    this.parkT = 0;
    this.lastParkPos = new THREE.Vector3(1e9, 0, 1e9);
    this.lanes = this.roads.lanes.filter((l) => l.len > 12);
    this.pool = TRAFFIC_POOL.filter((d) => !d.npc || d.id === 'taxi' || d.id === 'bus' || d.id === 'boxtruck');
    this.poolW = this.pool.reduce((s, d) => s + d.traffic, 0);
    for (const n of this.roads.nodes) n.occ = new Set();
    this.probeList = [];
    this.t = 0;
  }

  pickDef(lane) {
    const e = this.roads.edges[lane.edge];
    let r = this.rng.f() * this.poolW;
    for (const d of this.pool) {
      r -= d.traffic;
      if (r <= 0) {
        if ((d.id === 'bus') && !(e.clsName === 'arterial' || e.clsName === 'avenue')) return VEHICLE_BY_ID.meridian;
        if (d.id === 'boxtruck' && e.clsName === 'local') return VEHICLE_BY_ID.porter;
        return d;
      }
    }
    return this.pool[0];
  }

  // --------- lane graph helpers ---------
  piece(kind, id) { return kind === 'lane' ? this.roads.lanes[id] : this.roads.conns[id]; }
  chooseConn(lane, avoidU = true) {
    const R = this.roads;
    const opts = lane.out.map((id) => R.conns[id]).filter((c) => !avoidU || c.turn !== 'U' || lane.out.length === 1);
    if (!opts.length) return null;
    const w = (c) => ({ S: 5, R: 2, L: 1.8, M: 5, D: 0.5, U: 0.1 }[c.turn] || 1);
    let tot = opts.reduce((s, c) => s + w(c), 0), r = this.rng.f() * tot;
    for (const c of opts) { r -= w(c); if (r <= 0) return c; }
    return opts[0];
  }
  setPiece(car, p, s) {
    if (car.piece) {
      const a = car.piece.cars, i = a.indexOf(car);
      if (i >= 0) a.splice(i, 1);
      if (car.piece.kind === 'conn') this.roads.nodes[car.piece.node].occ.delete(car);
    }
    car.piece = p; car.s = s;
    if (!p) return;
    const a = p.cars;
    let i = a.length;
    while (i > 0 && a[i - 1].s > s) i--;
    a.splice(i, 0, car);
    if (p.kind === 'conn') this.roads.nodes[p.node].occ.add(car);
    if (p.kind === 'lane') {
      const c = this.chooseConn(p);
      car.next = c ? [c, this.roads.lanes[c.to]] : [];
      car.turn = c ? c.turn : 'S';
    }
  }

  spawnAt(lane, s, def, color, v = null) {
    const car = new TCar(this, def, color || this.rng.pick(def.colors));
    this.setPiece(car, lane, s);
    car.v = v ?? lane.speed * 0.8;
    this.pose(car, 0);
    this.cars.push(car);
    return car;
  }

  despawn(car) {
    this.setPiece(car, null, 0);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    car.dead = true;
  }

  // --------- spawning ---------
  targetCount() {
    const h = this.game.sky.time;
    const tod = h < 5 ? 0.3 : h < 7 ? 0.65 : h < 10 ? 1.15 : h < 16 ? 0.95 : h < 19 ? 1.15 : h < 22 ? 0.75 : 0.45;
    return Math.round(this.maxCars * this.density * tod);
  }

  trySpawn(focus, cam) {
    const R = this.roads;
    const d = this.rng.range(110, 320), a = this.rng.f() * Math.PI * 2;
    const px = focus.x + Math.cos(a) * d, pz = focus.z + Math.sin(a) * d;
    const n = R.nearestLane(px, pz, 0, 0, null, 40);
    if (!n || n.lane.len < 12) return;
    const lane = n.lane;
    const s = clamp(n.s, 4, lane.len - 6);
    const p = lane.pl.at(s);
    if (Math.abs(p.y - focus.y) > 25 && d < 150) return;
    // not in view when close
    if (d < 230 && cam) {
      const v = new THREE.Vector3(p.x, p.y + 1, p.z).project(cam);
      if (Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && v.z < 1) return;
    }
    for (const c of lane.cars) if (Math.abs(c.s - s) < 22) return;
    for (const c of this.cars) if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 < 200) return;
    this.spawnAt(lane, s, this.pickDef(lane));
  }

  // --------- per-frame ---------
  update(dt, focus, cam, view) {
    this.t += dt;
    const g = this.game;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.12;
      const cnt = this.cars.filter((c) => c.role === 'civilian').length;
      if (cnt < this.targetCount()) this.trySpawn(focus, cam);
    }
    // obstacles: full vehicles + physics traffic + pedestrians on road
    const obs = this.probeList;
    obs.length = 0;
    for (const v of g.vehicles) obs.push({ x: v.group.position.x, z: v.group.position.z, y: v.y, r: v.hz + 0.3, len: v.hx, v: v.speed, yaw: v.yaw, ref: v });
    for (const c of this.cars) if (c.state === 'phys') obs.push({ x: c.x, z: c.z, y: c.y, r: c.hz + 0.3, len: c.hx, v: c.speed, yaw: c.yaw, ref: c });
    if (g.peds) for (const p of g.peds.onRoad) obs.push({ x: p.x, z: p.z, y: p.y, r: 0.45, len: 0.3, v: 0, ped: true, ref: p });
    if (!g.player.vehicle) obs.push({ x: g.player.x, z: g.player.z, y: g.player.y, r: 0.45, len: 0.3, v: 0, ped: true, ref: g.player });

    const despawnR2 = 390 * 390;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const d2 = (car.x - focus.x) ** 2 + (car.z - focus.z) ** 2;
      if (car.role === 'civilian' && d2 > despawnR2) { this.despawn(car); continue; }
      if (car.state === 'drive') this.drive(car, dt, obs);
      else if (car.state === 'phys') this.physics(car, dt);
      car.hitCooldown -= dt;
    }
    this.collidePlayer(dt);
    this.updateParked(focus, dt);
    this.render(view || this.game.view);
  }

  leaderGap(car) {
    const p = car.piece, a = p.cars;
    const i = a.indexOf(car);
    if (i >= 0 && i < a.length - 1) { const o = a[i + 1]; return { gap: o.s - car.s - (o.len + car.len) / 2, v: o.v, car: o }; }
    let dist = p.len - car.s;
    for (const q of car.next) {
      if (q.cars.length) { const o = q.cars[0]; return { gap: dist + o.s - (o.len + car.len) / 2, v: o.v, car: o }; }
      dist += q.len;
      if (dist > 120) break;
    }
    return { gap: 999, v: 30, car: null };
  }

  drive(car, dt, obs) {
    const R = this.roads, lane = car.piece;
    if (!lane) { this.despawn(car); return; }
    let v0 = lane.speed * car.aggr * (car.role === 'police' && car.pursuit ? 1.6 : 1);
    if (car.pullOver > 0) { car.pullOver -= dt; v0 = Math.min(v0, 2); car.lat = lerp(car.lat, 1.4, dt * 1.5); } else car.lat = lerp(car.lat, 0, dt);
    // slow for upcoming turn connector
    let distEnd = lane.len - car.s;
    const nc = car.next[0];
    if (lane.kind === 'lane' && nc) v0 = Math.min(v0, Math.sqrt(nc.speed ** 2 + 2 * 2.2 * Math.max(0, distEnd - 2)));
    // leader
    const L = this.leaderGap(car);
    let gap = L.gap, vl = L.v;
    // control at end of lane
    if (lane.kind === 'lane' && nc) {
      const node = R.nodes[lane.node];
      const stopD = lane.stopS - car.s;
      let mustStop = false;
      if (node.control === 'signal') {
        const st = R.signal(node, lane.edge, this.t);
        if (st === 'R' && stopD > -0.5) mustStop = true;
        if (st === 'Y' && stopD > car.v * car.v / (2 * 3.2) + 1) mustStop = true;
        if (!mustStop && nc.turn === 'L' && stopD < 12) mustStop = this.opposingTraffic(car, node, lane);
      } else if (node.control === 'allstop' || (node.control === 'minorstop' && !['arterial', 'avenue', 'rural', 'freeway', 'ramp'].includes(R.edges[lane.edge].clsName))) {
        if (!car.stopped || car.stoppedNode !== node.id) {
          if (stopD > -0.5) { mustStop = true; if (stopD < 2.2 && car.v < 0.4) { car.stopped = true; car.stoppedNode = node.id; car.waitGo = 0.9; } }
        } else {
          car.waitGo -= dt;
          const busy = [...node.occ].some((o) => o !== car);
          const majorComing = node.control === 'minorstop' && this.majorApproaching(node);
          if (car.waitGo > 0 || busy || majorComing) mustStop = stopD > -0.5;
        }
      } else if (node.control === 'merge' && nc.turn === 'M') {
        if (this.mergeBlocked(car, nc)) { mustStop = distEnd > -1; }
      }
      if (mustStop) { const g2 = stopD - car.len / 2 + 0.5; if (g2 < gap) { gap = Math.max(0.01, g2 + car.len / 2); vl = 0; } }
    }
    // probe dynamic obstacles ahead
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const probe = 10 + car.v * 2.2;
    let blockedByPlayer = false;
    for (const o of obs) {
      if (o.ref === car) continue;
      if (Math.abs(o.y - car.y) > 3) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 0 || ahead > probe) continue;
      const lat = Math.abs(dx * -fz + dz * fx);
      if (lat > car.hz + o.r + (o.ped ? 0.9 : 0.25)) continue;
      const gg = ahead - car.hx - (o.len || 0.5) * (o.ped ? 1 : 0.7) - (o.ped ? 1.5 : 0.4);
      if (gg < gap) { gap = Math.max(0.01, gg); vl = o.ped ? 0 : Math.max(0, o.v * Math.cos(wrapAngle((o.yaw || 0) - car.yaw))); if (o.ref === this.game.player.vehicle || o.ref === this.game.player) blockedByPlayer = true; }
    }
    // cross traffic inside junction connectors
    if (lane.kind === 'conn') {
      for (const o of R.nodes[lane.node].occ) {
        if (o === car || o.piece === lane) continue;
        const dx = o.x - car.x, dz = o.z - car.z, ahead = dx * fx + dz * fz;
        if (ahead < 0 || ahead > 12) continue;
        const lat = Math.abs(dx * -fz + dz * fx);
        if (lat < 2.2 && o.id < car.id) { const gg = ahead - car.len; if (gg < gap) { gap = Math.max(0.01, gg); vl = 0; } }
      }
    }
    // IDM
    const a = 1.7 * (car.role === 'police' && car.pursuit ? 2 : 1), b = 3.0, T = 1.25, s0 = 2.4;
    const dv = car.v - vl;
    const sStar = s0 + Math.max(0, car.v * T + (car.v * dv) / (2 * Math.sqrt(a * b)));
    let acc = a * (1 - Math.pow(car.v / Math.max(0.1, v0), 4) - (sStar / Math.max(0.1, gap)) ** 2);
    acc = clamp(acc, -9, a);
    car.v = Math.max(0, car.v + acc * dt);
    if (gap < 0.3) car.v = Math.min(car.v, 0.2);
    car.lights.brake = acc < -0.4 || car.v < 0.1 ? 1 : 0;
    // horn when the player blocks
    if (blockedByPlayer && car.v < 0.5) { car.stuck += dt; if (car.stuck > 3.5 && car.honkT <= 0) { car.honkT = 4 + this.rng.f() * 4; this.game.emit('traffic:honk', car); } }
    else car.stuck = Math.max(0, car.stuck - dt);
    car.honkT -= dt;
    if (car.v < 0.1 && gap > 30 && !car.stopped) car.idle = (car.idle || 0) + dt; else car.idle = 0;
    // advance
    car.s += car.v * dt;
    while (car.piece && car.s > car.piece.len) {
      const over = car.s - car.piece.len;
      const nxt = car.next.shift();
      if (!nxt) { this.despawn(car); return; }
      car.stopped = false;
      const keep = car.next.slice();
      this.setPiece(car, nxt, over);
      if (nxt.kind === 'conn') car.next = keep;
    }
    // keep sorted within piece
    const arr = car.piece.cars, idx = arr.indexOf(car);
    if (idx > 0 && arr[idx - 1].s > car.s) { arr.splice(idx, 1); let j = idx - 1; while (j > 0 && arr[j - 1].s > car.s) j--; arr.splice(j, 0, car); }
    this.pose(car, dt);
    // indicators ahead of turns
    const soon = car.piece.kind === 'lane' ? car.piece.len - car.s < 45 : true;
    const turn = car.piece.kind === 'conn' ? car.piece.turn : car.turn;
    car.lights.indL = soon && turn === 'L' ? 1 : 0;
    car.lights.indR = soon && (turn === 'R' || turn === 'D') ? 1 : 0;
    this.writeInst(car);
  }

  opposingTraffic(car, node, lane) {
    const R = this.roads;
    const myDir = lane.pl.at(lane.len);
    for (const id of node.edges) {
      if (id === lane.edge) continue;
      const e = R.edges[id];
      const incoming = e.b === node.id ? e.fwd : e.bwd;
      for (const lid of incoming) {
        const L = R.lanes[lid];
        const d = L.pl.at(L.len);
        if (d.dx * myDir.dx + d.dz * myDir.dz > -0.8) continue;
        for (const o of L.cars) if (L.len - o.s < 35 && o.v > 1.5) return true;
      }
    }
    for (const o of node.occ) if (o.piece?.turn === 'S') { const d = o.piece.pl.at(0); if (d.dx * myDir.dx + d.dz * myDir.dz < -0.8) return true; }
    return false;
  }

  majorApproaching(node) {
    const R = this.roads;
    for (const id of node.edges) {
      const e = R.edges[id];
      if (!['arterial', 'avenue', 'rural'].includes(e.clsName)) continue;
      const incoming = e.b === node.id ? e.fwd : e.bwd;
      for (const lid of incoming) for (const o of R.lanes[lid].cars) { const L = R.lanes[lid]; if (L.len - o.s < 40 && o.v > 1) return true; }
    }
    return false;
  }

  mergeBlocked(car, conn) {
    const R = this.roads, target = R.lanes[conn.to];
    const into = target.pl.at(0);
    // cars on the same lane (target) near the start, and cars about to enter it from the freeway lane
    for (const o of target.cars) if (o.s < 18) return true;
    for (const o of this.cars) {
      if (o === car || o.state !== 'drive' || !o.piece) continue;
      if (o.next[1] === target || (o.piece.kind === 'conn' && o.piece.to === target.id)) {
        const d = Math.hypot(o.x - into.x, o.z - into.z);
        if (d < 30 + o.v * 1.5) return true;
      }
    }
    return false;
  }

  pose(car, dt) {
    const p = car.piece.pl.at(car.s);
    const h = Math.atan2(p.dx, p.dz);
    const prevYaw = car.yaw;
    car.yaw = dt > 0 ? dampAngle(car.yaw, h, 12, dt) : h;
    const rx = -Math.cos(car.yaw), rz = Math.sin(car.yaw);
    car.x = p.x + rx * car.lat; car.z = p.z + rz * car.lat;
    car.y = p.y;
    car.pitch = -Math.atan(p.slope || 0);
    const yr = dt > 0 ? wrapAngle(car.yaw - prevYaw) / dt : 0;
    car.steerV = clamp((yr * 2.7) / Math.max(1, car.v), -0.6, 0.6);
  }

  writeInst(car) {
    const zc = car.phys ? car.phys.zCG : 0;
    car.bx = car.x - Math.sin(car.yaw) * zc; car.bz = car.z - Math.cos(car.yaw) * zc;
    car.steer = car.phys ? car.phys.steer : lerp(car.steer, car.steerV || 0, 0.2);
    car.spin = car.phys ? car.phys.wheelRot : (car.spin + (car.v / car.def.body.wr) * (1 / 60)) % (Math.PI * 2);
    const sky = this.game.sky;
    const night = sky.night > 0.35 || sky.w.rain > 0.4;
    const blink = Math.sin(this.t * 9) > 0 ? 1 : 0;
    const hz = car.lights.hazard;
    const L = car.light;
    L[0] = night && car.state !== 'parked' ? 1 : 0;
    L[1] = car.lights.brake;
    L[2] = (car.lights.indL || hz) && blink ? 1 : 0;
    L[3] = (car.lights.indR || hz) && blink ? 1 : 0;
  }

  render(view) {
    const B = this.batch, CS = this.game.contact;
    B.begin();
    for (const c of this.cars) {
      if (c.state === 'parked' || c.state === 'phys' || c.state === 'drive') {
        if (c.state === 'parked') { c.bx = c.x; c.bz = c.z; }
        _rc.def = c.def; _rc.x = c.bx ?? c.x; _rc.y = c.y; _rc.z = c.bz ?? c.z; _rc.yaw = c.yaw; _rc.pitch = c.pitch || 0; _rc.roll = c.roll || 0;
        _rc.steer = c.steer; _rc.spin = c.spin; _rc.color = c.color; _rc.light = c.light;
        const tier = B.push(_rc, view);
        if (tier === 'near' || tier === 'mid') { const b = c.def.body; CS.add(_rc.x, c.y, _rc.z, c.yaw, b.W * 1.22, b.L * 1.12, 0.62, 1); }
      }
    }
    B.end();
  }

  // --------- physics (after collisions) ---------
  toPhysics(car) {
    if (car.phys) return;
    const p = new CarPhysics(car.def);
    p.place(car.x, car.y, car.z, car.yaw);
    // car.x/z is body origin; physics tracks CG
    p.x = car.x + Math.sin(car.yaw) * p.zCG; p.z = car.z + Math.cos(car.yaw) * p.zCG;
    p.vx = Math.sin(car.yaw) * car.v; p.vz = Math.cos(car.yaw) * car.v;
    car.phys = p;
    car.cOff = -p.zCG;
    car.state = 'phys';
    car.restT = 0;
    this.setPiece(car, null, 0);
    if (car.parkedRef) { car.parkedRef.taken = true; car.parkedRef = null; }
    car.lights.brake = 1;
  }

  physics(car, dt) {
    const p = car.phys;
    const env = (x, z, y) => this.world.ground(x, z, y);
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const input = { throttle: 0, brake: car.restT > 0.4 ? 1 : 0.35, steer: 0, hand: false };
    for (let k = 0; k < steps; k++) { p.step(dt / steps, input, env); car.collideStatic(dt / steps); }
    car.x = p.x - Math.sin(p.yaw) * p.zCG; car.z = p.z - Math.cos(p.yaw) * p.zCG; car.y = p.y; car.yaw = p.yaw; car.pitch = p.visPitch; car.roll = p.visRoll;
    if (p.speed < 0.4) car.restT += dt; else car.restT = 0;
    car.lights.hazard = car.damage.total > 0.05 || car.restT > 1;
    // recover: drive on if lightly damaged and aligned with a lane
    if (car.restT > 5 && car.damage.total < 0.35 && car.role === 'civilian' && !car.recoverFailed) {
      const n = this.roads.nearestLane(p.x, p.z, Math.sin(p.yaw), Math.cos(p.yaw), p.y, 5);
      if (n && n.align > 0.8) {
        car.phys = null; car.cOff = 0; car.state = 'drive'; car.v = 0; car.lat = 0;
        this.setPiece(car, n.lane, clamp(n.s, 0, n.lane.len - 1));
        car.lights.hazard = false;
      } else car.recoverFailed = true;
    }
    this.writeInst(car);
  }

  collidePlayer() {
    const g = this.game;
    for (const v of g.vehicles) {
      const vo = v.obb();
      for (const car of this.cars) {
        if (Math.abs(car.y - v.y) > 2.5) continue;
        const dx = car.x - v.group.position.x, dz = car.z - v.group.position.z;
        if (dx * dx + dz * dz > (car.hx + v.hx + 1) ** 2) continue;
        const hit = collide(vo, car.obb());
        if (!hit) continue;
        const rel = Math.hypot(v.phys.vx - Math.sin(car.yaw) * car.speed, v.phys.vz - Math.cos(car.yaw) * car.speed);
        if (car.state === 'drive' && rel < 0.8 && v.speed < 1) { v.phys.x += hit.nx * hit.depth; v.phys.z += hit.nz * hit.depth; continue; }
        this.toPhysics(car);
        const B = car.obb();
        const h2 = collide(vo, B);
        if (!h2) continue;
        const imp = v.resolve(h2, null, car.phys.mass, car);
        if (imp > 2.2) {
          car.applyDamage(h2.px, h2.pz, imp);
          this.game.emit('traffic:hit', { car, by: v, impact: imp, x: h2.px, z: h2.pz });
        }
      }
    }
    // traffic physics cars vs each other and vs driving cars
    for (let i = 0; i < this.cars.length; i++) {
      const a = this.cars[i];
      if (a.state !== 'phys') continue;
      for (let j = 0; j < this.cars.length; j++) {
        const b = this.cars[j];
        if (a === b || (b.state === 'phys' && j < i)) continue;
        if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 > (a.hx + b.hx + 1) ** 2) continue;
        const hit = collide(a.obb(), b.obb());
        if (!hit) continue;
        if (a.phys.speed < 1 && b.state === 'drive') { b.v = 0; continue; }
        this.toPhysics(b);
        const h2 = collide(a.obb(), b.obb());
        if (h2) a.resolve(h2, null, b.phys.mass, b);
      }
    }
  }

  // --------- parked cars ---------
  updateParked(focus, dt) {
    this.parkT -= dt;
    if (this.parkT > 0) return;
    this.parkT = 0.4;
    if (focus.distanceToSquared(this.lastParkPos) < 20 * 20) return;
    this.lastParkPos.copy(focus);
    const R2 = 245 * 245;
    const want = new Set();
    for (const p of this.world.parked) {
      if (p.taken) continue;
      if ((p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 < R2) want.add(p);
    }
    for (let i = this.parkedActive.length - 1; i >= 0; i--) {
      const car = this.parkedActive[i];
      if (car.state !== 'parked') { this.parkedActive.splice(i, 1); continue; }
      if (!want.has(car.parkedRef) || car.parkedRef.taken) {
        if (car.col) this.world.colliders.remove(car.col);
        const k = this.cars.indexOf(car); if (k >= 0) this.cars.splice(k, 1);
        this.parkedActive.splice(i, 1);
        car.parkedRef.active = null;
      }
    }
    for (const p of want) {
      if (p.active) continue;
      if (!p.def) {
        const r = new RNG(Math.floor(p.x * 13 + p.z * 7));
        const opts = p.model ? [VEHICLE_BY_ID[p.model]] : this.pool.filter((d) => d.id !== 'bus' && d.id !== 'boxtruck' && d.id !== 'taxi' && (p.street || d.body.L < 5.6));
        let tot = opts.reduce((s, d) => s + (d.traffic || 1), 0), rr = r.f() * tot;
        p.def = opts[0];
        for (const d of opts) { rr -= d.traffic || 1; if (rr <= 0) { p.def = d; break; } }
        if (p.display) p.def = r.pick([VEHICLE_BY_ID.arc, VEHICLE_BY_ID.gts, VEHICLE_BY_ID.thunder, VEHICLE_BY_ID.ridge, VEHICLE_BY_ID.meridian, VEHICLE_BY_ID.trek]);
        p.color = r.pick(p.def.colors);
      }
      const car = new TCar(this, p.def, p.color);
      car.state = 'parked';
      car.role = 'parked';
      car.x = p.x; car.y = p.y; car.z = p.z; car.yaw = p.rot;
      car.parkedRef = p;
      p.active = car;
      const o = car.obb();
      car.col = this.world.colliders.box(o.x, o.z, o.hx, o.hz, Math.atan2(o.sin, o.cos), p.y - 0.5, p.y + car.dims.H, { kind: 'parked', mat: 'metal', ref: car });
      this.writeInst(car);
      this.cars.push(car);
      this.parkedActive.push(car);
    }
  }

  // a parked car was struck by a vehicle
  wakeParked(car) {
    if (car.col) { this.world.colliders.remove(car.col); car.col = null; }
    this.toPhysics(car);
    car.phys.vx = car.phys.vz = 0;
    car.role = 'civilian';
  }

  // take a traffic/parked car as a full Vehicle (player enters)
  takeOver(car) {
    const g = this.game;
    const yaw = car.yaw;
    const v = g.spawnVehicle(car.def.id, car.x, car.z, yaw, { color: '#' + car.color.getHexString() }, { yRef: car.y + 1 });
    if (car.phys) { v.phys.vx = car.phys.vx; v.phys.vz = car.phys.vz; }
    if (car.parkedRef) car.parkedRef.taken = true;
    if (car.col) this.world.colliders.remove(car.col);
    this.despawn(car);
    const k = this.parkedActive.indexOf(car); if (k >= 0) this.parkedActive.splice(k, 1);
    return v;
  }

  nearestCar(x, z, maxD = 4.5) {
    let best = null, bd = maxD;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z) - c.hz;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  siren(v) {
    // traffic ahead of a police vehicle with siren pulls over
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    for (const c of this.cars) {
      if (c.state !== 'drive' || c.role !== 'civilian') continue;
      const dx = c.x - v.x, dz = c.z - v.z, ahead = dx * fx + dz * fz;
      if (ahead > 0 && ahead < 45 && Math.abs(dx * -fz + dz * fx) < 6) c.pullOver = 3;
    }
  }
}
