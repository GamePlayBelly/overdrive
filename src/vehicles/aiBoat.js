import { clamp, wrapAngle } from '../core/math.js';
import { WATER_LEVEL } from '../data/world.js';

// Helmsman for physics boats: follows a nav-grid route, heads for a waypoint or chases a target. It keeps to deep water, slows for turns and for the sea,
// gives way by the rules of the road (starboard turn, sail over power), and sails: tacks when the course is inside the no-go zone.
export class AIBoat {
  constructor(game, boat, opts = {}) {
    this.game = game; this.v = boat; boat.ai = this;
    this.maxSpeed = opts.maxSpeed ?? boat.phys.vmax * 0.6;
    this.aggr = opts.aggr ?? 0.5;
    this.target = null; this.goal = null; this.mode = 'idle'; this.arrived = false; this.stuckT = 0; this.reverseT = 0;
    this.path = null; this.pi = 0; this.tack = 0; this.tackT = 0; this.legX = boat.x; this.legZ = boat.z; this.calmT = 0; this.seaK = 1; this.avoidT = 0;
    this.yield = opts.yield ?? true; this.ignore = null;
  }

  goto(x, z) { this.goal = { x, z }; this.mode = 'goto'; this.arrived = false; this.path = null; this.legX = this.v.x; this.legZ = this.v.z; }
  chase(t) { this.target = t; this.mode = 'chase'; }
  follow(path) { this.path = path; this.pi = 0; this.mode = 'follow'; this.arrived = false; this.goal = path.length ? path[path.length - 1] : null; this.legX = this.v.x; this.legZ = this.v.z; }
  stop() { this.mode = 'idle'; this.goal = null; this.path = null; this.arrived = false; }

  depthAt(x, z) { return WATER_LEVEL - this.game.world.terrain.height(x, z); }

  // rules of the road against every other hull within reach: returns a course offset (negative = to starboard) and a speed factor
  encounter() {
    const v = this.v, p = v.phys, vs = this.game.vehicles;
    let off = 0, slow = 1;
    for (const o of vs) {
      if (o === v || !o.isBoat || o.sunk || this.ignore?.has(o)) continue;
      const rx = o.x - v.x, rz = o.z - v.z, dist = Math.hypot(rx, rz);
      if (dist > 150) continue;
      const q = o.phys, rvx = q.vx - p.vx, rvz = q.vz - p.vz, rv2 = rvx * rvx + rvz * rvz;
      const safe = (v.hx + o.hx) * 1.5 + 9 + p.speed * 0.8;
      let tc = rv2 > 0.05 ? -(rx * rvx + rz * rvz) / rv2 : 0;
      tc = clamp(tc, 0, 35);
      const cpa = Math.hypot(rx + rvx * tc, rz + rvz * tc);
      if (cpa > safe && dist > safe) continue;
      const b = wrapAngle(Math.atan2(rx, rz) - p.yaw);
      if (Math.abs(b) > 2.4 && dist > safe) continue;
      const mySail = !!p.sail, oSail = !!q.sail;
      let give = !(mySail && !oSail);
      if (mySail === oSail) give = !(b > 0.05 && b < 1.95) || Math.abs(b) < 0.3;
      const u = clamp(1 - Math.min(dist, tc * (p.speed + q.speed + 1) + 1) / 120, 0.15, 1);
      if (give) { off = Math.min(off, -0.75 * u - (dist < safe ? 0.5 : 0)); if (tc < 9 || dist < safe) slow = Math.min(slow, 0.55); }
      else if (cpa < safe * 0.55 && dist < safe) off = Math.min(off, -0.5);
    }
    return { off, slow };
  }

  update(dt) {
    const v = this.v, p = v.phys, inp = v.input;
    if (v.disabled || v.sunk) { inp.throttle = 0; inp.brake = 0; inp.steer = 0; return; }
    let T;
    if (this.mode === 'chase') T = this.target;
    else if (this.mode === 'follow' && this.path) {
      const w = this.path[this.pi];
      if (w) {
        const last = this.pi === this.path.length - 1, d = Math.hypot(w.x - v.x, w.z - v.z);
        if (d < (last ? 25 : Math.max(35, p.speed * 3.5))) { if (last) { this.arrived = true; } else { this.pi++; this.legX = v.x; this.legZ = v.z; } }
        T = this.path[Math.min(this.pi, this.path.length - 1)];
      }
    } else T = this.goal;
    if (!T || (this.mode === 'follow' && this.arrived)) { inp.throttle = 0; inp.steer = 0; inp.brake = p.speed > 1.5 ? 0.4 : 0; inp.hand = false; return; }
    const speed = p.speed, need = Math.max(1.2, p.draft * 2.2 + 0.4);
    const dx = T.x - v.x, dz = T.z - v.z, dist = Math.hypot(dx, dz);
    if (this.mode === 'goto' && dist < 25) { this.arrived = true; inp.throttle = 0; inp.brake = speed > 2 ? 0.5 : 0; inp.steer = 0; return; }
    let want = Math.atan2(dx + (T.noLead ? 0 : (T.vx || 0) * 0.8), dz + (T.noLead ? 0 : (T.vz || 0) * 0.8));
    const yaw = p.yaw;
    let motor = !p.sail;
    // sailing: stay out of the no-go zone, tack to the layline
    if (p.sail && this.game.sky?.wind) {
      const wd = this.game.sky.wind, from = Math.atan2(-wd.x, -wd.z), rel = wrapAngle(want - from), nogo = 1.12;
      this.tackT -= dt;
      if (Math.abs(rel) < nogo) {
        const lx = T.x - this.legX, lz = T.z - this.legZ, ll = Math.hypot(lx, lz) || 1, xt = ((v.x - this.legX) * lz - (v.z - this.legZ) * lx) / ll;
        if (!this.tack) this.tack = Math.sign(wrapAngle(yaw - from)) || 1;
        if (this.tackT <= 0 && this.tack * Math.sign(xt || 1) * Math.abs(xt) > 40 + 0.1 * dist) { this.tack = -this.tack; this.tackT = 8; }
        want = from + this.tack * (nogo + 0.04);
      } else this.tack = 0;
      this.calmT = speed < 1 ? this.calmT + dt : Math.max(0, this.calmT - dt * 2);
      motor = this.calmT > 8 || dist < 60 || this.mode === 'chase';
    }
    // shallows ahead: steer toward the deeper side
    const look = 18 + speed * 2.6;
    const probe = (a) => this.depthAt(v.x + Math.sin(yaw + a) * look, v.z + Math.cos(yaw + a) * look);
    const dL = probe(0.55), dC = probe(0), dR = probe(-0.55);
    let avoid = 0;
    if (dC < need || dL < need || dR < need) { avoid = dL > dR ? 1 : -1; if (dC < need) want = yaw + avoid * 1.1; else want = yaw + avoid * 0.6; this.avoidT = 1.2; }
    else if (this.avoidT > 0) this.avoidT -= dt;
    // other hulls
    let slow = 1;
    if (this.yield && !avoid) { const e = this.encounter(); if (e.off) want = wrapAngle(want + e.off); slow = e.slow; }
    const err = wrapAngle(want - yaw);
    inp.steer = clamp(-err * 1.7, -1, 1);
    let des = this.maxSpeed * this.seaK * slow * (1 - 0.6 * Math.min(1, Math.abs(err) / 1.4));
    if (this.mode === 'chase') { const ts = T.spd ?? Math.hypot(T.vx || 0, T.vz || 0); if (dist < 30) des = Math.max(ts + 2 + this.aggr * 4, 3); else if (T.run) des = this.maxSpeed * this.seaK; }
    else if (this.mode === 'follow' && this.pi === this.path.length - 1 && dist < 90) des = Math.min(des, 2 + dist * 0.12);
    if (avoid) des = Math.min(des, 6);
    const e = des - p.fwdSpeed;
    if (motor) { inp.throttle = e > 0.5 ? clamp(e * 0.3, 0.25, 1) : 0.05; inp.brake = e < -3 ? clamp(-e * 0.05, 0, 0.5) : 0; }
    else { inp.throttle = 0; inp.brake = e < -3 ? clamp(-e * 0.05, 0, 0.5) : 0; }
    inp.hand = this.mode === 'chase' && Math.abs(err) > 0.9 && speed > 10;
    // wedged on a shallow: back out
    if (speed < 0.6 && des > 1.5 && (motor || !p.sail)) { this.stuckT += dt; if (this.stuckT > 3) { this.reverseT = 2; this.stuckT = 0; } } else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.reverseT > 0) { this.reverseT -= dt; inp.throttle = 0; inp.brake = 1; inp.steer = -inp.steer; }
  }
}
