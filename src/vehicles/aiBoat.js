import { clamp, wrapAngle } from '../core/math.js';
import { WATER_LEVEL } from '../data/world.js';

// Simple helmsman for physics boats: heads for a waypoint or chases a target, keeps to deep water and slows for turns.
export class AIBoat {
  constructor(game, boat, opts = {}) {
    this.game = game; this.v = boat; boat.ai = this;
    this.maxSpeed = opts.maxSpeed ?? boat.phys.vmax * 0.6;
    this.aggr = opts.aggr ?? 0.5;
    this.target = null; this.goal = null; this.mode = 'idle'; this.arrived = false; this.stuckT = 0; this.reverseT = 0;
  }

  goto(x, z) { this.goal = { x, z }; this.mode = 'goto'; this.arrived = false; }
  chase(t) { this.target = t; this.mode = 'chase'; }

  depthAt(x, z) { return WATER_LEVEL - this.game.world.terrain.height(x, z); }

  update(dt) {
    const v = this.v, p = v.phys, inp = v.input, sea = this.game.world.sea;
    if (v.disabled || v.sunk) { inp.throttle = 0; inp.brake = 0; inp.steer = 0; return; }
    let T = this.mode === 'chase' ? this.target : this.goal;
    if (!T) { inp.throttle = 0; inp.steer = 0; inp.brake = 0; return; }
    const speed = p.speed, need = Math.max(1.2, p.draft * 2.2 + 0.4);
    const dx = T.x - v.x, dz = T.z - v.z, dist = Math.hypot(dx, dz);
    if (this.mode === 'goto' && dist < 25) { this.arrived = true; inp.throttle = 0; inp.brake = speed > 2 ? 0.5 : 0; inp.steer = 0; return; }
    let want = Math.atan2(dx + (T.vx || 0) * 0.8, dz + (T.vz || 0) * 0.8);
    // probe ahead for shallows and steer toward the deeper side
    const look = 18 + speed * 2.6, yaw = p.yaw;
    const probe = (a) => this.depthAt(v.x + Math.sin(yaw + a) * look, v.z + Math.cos(yaw + a) * look);
    const dL = probe(0.55), dC = probe(0), dR = probe(-0.55);
    let avoid = 0;
    if (dC < need || dL < need || dR < need) { avoid = dL > dR ? 1 : -1; if (dC < need) want = yaw + avoid * 1.1; else want = yaw + avoid * 0.6; this.avoidT = 1.2; }
    else if (this.avoidT > 0) this.avoidT -= dt;
    const err = wrapAngle(want - yaw);
    inp.steer = clamp(-err * 1.7, -1, 1);
    let des = this.maxSpeed * (1 - 0.6 * Math.min(1, Math.abs(err) / 1.4));
    if (this.mode === 'chase') { const ts = Math.hypot(T.vx || 0, T.vz || 0); if (dist < 30) des = Math.max(ts + 2 + this.aggr * 4, 3); }
    if (avoid) des = Math.min(des, 6);
    const e = des - p.fwdSpeed;
    inp.throttle = e > 0.5 ? clamp(e * 0.3, 0.25, 1) : 0.05; inp.brake = e < -3 ? clamp(-e * 0.05, 0, 0.5) : 0;
    inp.hand = this.mode === 'chase' && Math.abs(err) > 0.9 && speed > 10;
    // wedged on a shallow: back out
    if (speed < 0.6 && des > 1.5) { this.stuckT += dt; if (this.stuckT > 3) { this.reverseT = 2; this.stuckT = 0; } } else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.reverseT > 0) { this.reverseT -= dt; inp.throttle = 0; inp.brake = 1; inp.steer = -inp.steer; }
    void sea;
  }
}
