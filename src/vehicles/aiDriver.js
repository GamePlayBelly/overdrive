import { clamp, wrapAngle, lerp, smoothstep } from '../core/math.js';

// Generic AI driver for physics vehicles: follows a waypoint polyline or chases a target.
export class AIDriver {
  constructor(game, vehicle, opts = {}) {
    this.game = game;
    this.v = vehicle;
    vehicle.ai = this;
    this.path = [];
    this.pi = 0;
    this.maxSpeed = opts.maxSpeed ?? 30;
    this.aggr = opts.aggr ?? 0.6;
    this.skill = opts.skill ?? 0.8;
    this.target = null;
    this.routeT = 0;
    this.stuckT = 0;
    this.reverseT = 0;
    this.mode = 'idle';
    this.laneOffset = opts.laneOffset ?? 1.8;
    this.goal = null;
    this.pit = 0;
    this.avoid = 0;
    this.recover = !!opts.recover;
    this.lostT = 0; this.progT = 0; this.lastPi = -1;
  }

  // route over road graph to a world position
  routeTo(x, z, laneSide = true, next = null) {
    const R = this.game.world.roads, v = this.v, off = laneSide ? this.laneOffset : 0;
    const f = v.fwd();
    const seg = R.pathBetween(v.x, v.z, v.y, f.x, f.z, x, z, off);
    if (seg && seg.length > 1) {
      const pts = [{ x: v.x, z: v.z, y: v.y }, ...seg];
      const n = pts.length;
      if (next) {
        // keep going past the target so the next bend is seen early
        const hx = pts[n - 1].x - pts[n - 2].x, hz = pts[n - 1].z - pts[n - 2].z;
        const more = R.pathBetween(pts[n - 1].x, pts[n - 1].z, pts[n - 1].y, hx, hz, next.x, next.z, off);
        if (more) pts.push(...more.slice(1)); else pts.push({ x, z });
      } else pts.push({ x, z });
      this.path = simplify(pts);
      this.pi = 0;
      this.goal = { x, z };
      return true;
    }
    return this.routeNodes(x, z, laneSide, next);
  }

  routeNodes(x, z, laneSide, next) {
    const R = this.game.world.roads;
    const v = this.v;
    const a = this.nodeAhead();
    const b = R.nearestNode(x, z);
    if (!a || !b) return false;
    const pts = [{ x: v.x, z: v.z }];
    const add = (path) => {
      if (!path) return;
      for (const step of path) {
        const e = R.edges[step.edge];
        const wide = e.cls.centerline === 'barrier' ? e.cls.median / 2 + e.cls.laneW * 0.5 : 0;
        const off = e.oneway ? 0 : Math.max(wide, laneSide ? this.laneOffset : 0);
        const pp = step.dir > 0 ? e.pl.offset(off) : e.pl.offset(-off).slice().reverse();
        for (const q of pp) pts.push({ x: q.x, z: q.z, y: q.y });
      }
    };
    add(R.route(a.id, b.id));
    // a checkpoint sitting on a node lets the path run on through it, so the next bend is seen before the corner is reached
    const c = next && Math.hypot(b.x - x, b.z - z) < 14 ? R.nearestNode(next.x, next.z) : null;
    const tail = c && c.id !== b.id ? R.route(b.id, c.id) : null;
    if (tail) { add(tail); pts.push({ x: next.x, z: next.z }); } else pts.push({ x, z });
    this.path = simplify(pts);
    this.pi = 0;
    this.goal = { x, z };
    return true;
  }

  nodeAhead() {
    const R = this.game.world.roads, v = this.v;
    const f = v.fwd();
    let best = null, bs = Infinity;
    for (const n of R.nodes) {
      const dx = n.x - v.x, dz = n.z - v.z, d = Math.hypot(dx, dz);
      if (d > 400) continue;
      const ahead = (dx * f.x + dz * f.z) / (d || 1);
      const score = d * (ahead > 0.2 ? 1 : 2.5) + (Math.abs(this.game.world.roads.nodes[n.id].y - v.y) > 4 ? 500 : 0);
      if (score < bs) { bs = score; best = n; }
    }
    return best;
  }

  // chase a moving entity {x,z,vx,vz}
  chase(target) { this.target = target; this.mode = 'chase'; }

  update(dt) {
    const v = this.v, p = v.phys, g = this.game;
    const inp = v.input;
    if (v.disabled) {
      inp.throttle = 0; inp.brake = 1; inp.steer = 0;
      if (this.recover && this.path.length > 3 && (this.lostT += dt) > 3) this.warp();
      return;
    }
    const speed = p.speed;
    let tx, tz, desired = this.maxSpeed;
    // target selection
    if (this.mode === 'chase' && this.target) {
      const T = this.target;
      const d = Math.hypot(T.x - v.x, T.z - v.z);
      this.routeT -= dt;
      const los = d < 60 && g.world.colliders.raycast(v.x, v.z, T.x, T.z, v.y + 0.6, v.y + 1.5, (c) => c.kind === 'building' || c.kind === 'wall' || c.kind === 'pier') >= 1;
      if (los) {
        const lead = clamp(d / Math.max(12, speed), 0, 1.6) * (0.4 + this.skill * 0.5);
        tx = T.x + (T.vx || 0) * lead; tz = T.z + (T.vz || 0) * lead;
        const tspeed = Math.hypot(T.vx || 0, T.vz || 0);
        if (d < 18) desired = Math.max(tspeed + 3 + this.aggr * 6, 8);
        this.path = [];
      } else {
        if (this.routeT <= 0 || !this.path.length) { this.routeT = 1.4; this.routeTo(T.x, T.z, false); }
        const w = this.follow();
        tx = w.x; tz = w.z; desired = w.v;
      }
    } else if (this.path.length) {
      const w = this.follow();
      tx = w.x; tz = w.z; desired = w.v;
      if (this.pi >= this.path.length - 1) {
        const last = this.path[this.path.length - 1];
        const dl = Math.hypot(last.x - v.x, last.z - v.z);
        desired = Math.min(desired, dl * 0.7);
        if (dl < 4) { this.arrived = true; desired = 0; }
        else if (speed < 3.5 && dl < 120) {
          // destination behind a wall or inside a lot: the road is as close as it gets
          this.endT = (this.endT || 0) + dt;
          if (this.endT > 2.5 && g.world.colliders.raycast(v.x, v.z, last.x, last.z, v.y + 0.4, v.y + 1.4, (cc) => cc.kind !== 'prop' || cc.solid) < 1) { this.arrived = true; desired = 0; }
        } else this.endT = 0;
      }
    } else { inp.throttle = 0; inp.brake = speed > 0.3 ? 0.6 : 0; inp.steer = 0; return; }

    // steering toward (tx,tz)
    const ang = wrapAngle(Math.atan2(tx - v.x, tz - v.z) - p.yaw);
    let steer = clamp(-ang * (1.6 + this.skill), -1, 1);
    // obstacle avoidance via short raycasts
    const f = v.fwd();
    const look = 6 + speed * 0.9;
    const side = (a) => {
      const s = Math.sin(p.yaw + a), c = Math.cos(p.yaw + a);
      return g.world.colliders.raycast(v.x, v.z, v.x + s * look, v.z + c * look, v.y + 0.4, v.y + 1.4, (cc) => cc.kind !== 'prop' || cc.solid);
    };
    const l = side(0.35), r = side(-0.35), cN = side(0);
    if (cN < 0.6 || l < 0.5 || r < 0.5) { steer += (l < r ? 1 : -1) * (1 - Math.min(l, r)) * 0.9; if (cN < 0.35) desired = Math.min(desired, 8); }
    // traffic in front
    for (const c of g.traffic.cars) {
      if (c.state === 'parked') continue;
      const dx = c.x - v.x, dz = c.z - v.z, ahead = dx * f.x + dz * f.z;
      if (ahead < 2 || ahead > look + 6) continue;
      const lat = dx * -f.z + dz * f.x;
      if (Math.abs(lat) < 2.4) { steer += (lat > 0 ? -1 : 1) * 0.6 * (1 - ahead / (look + 6)); if (this.mode !== 'chase') desired = Math.min(desired, c.speed); }
    }
    // PIT manoeuvre
    if (this.mode === 'chase' && this.target && this.aggr > 0.7) {
      const T = this.target;
      const ty = T.yaw ?? 0, tfx = Math.sin(ty), tfz = Math.cos(ty);
      const rx = v.x - T.x, rz = v.z - T.z;
      const along = rx * tfx + rz * tfz, lat = rx * -tfz + rz * tfx;
      if (along < 0 && along > -3.5 && Math.abs(lat) > 1.2 && Math.abs(lat) < 3.2 && speed > 9) { this.pit = 0.5; this.pitDir = lat > 0 ? -1 : 1; }
    }
    if (this.pit > 0) { this.pit -= dt; steer = this.pitDir; desired = this.maxSpeed; }
    // curvature-limited speed along path
    if (this.path.length && this.mode !== 'chase') {
      desired = Math.min(desired, this.cornerSpeed());
      if (this.xt > 1.8) desired = Math.min(desired, Math.max(7, desired * (1 - 0.18 * (this.xt - 1.8))));
    }
    if (Math.abs(ang) > 1.2 && speed > 12) desired = Math.min(desired, 12);
    if (this.recover && this.path.length > 3 && this.mode !== 'chase') {
      const lost = this.xt > 22 || (speed < 1.2 && desired > 3);
      this.lostT = lost ? this.lostT + dt : Math.max(0, this.lostT - dt * 2);
      if (this.lostT > (this.xt > 22 ? 2 : 7)) this.warp();
      // no progress along the route for a long time (dithering in a junction, wedged on a prop)
      if (this.pi !== this.lastPi) { this.lastPi = this.pi; this.progT = 0; } else if ((this.progT += dt) > 12) { this.progT = 0; this.warp(2); }
    }
    // stuck & reverse
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      inp.throttle = 0; inp.brake = 1; inp.steer = -steer; inp.hand = false;
      return;
    }
    if (speed < 1.2 && desired > 3) { this.stuckT += dt; if (this.stuckT > 1.6) { this.stuckT = 0; this.reverseT = 1.1 + Math.random() * 0.6; } }
    else this.stuckT = Math.max(0, this.stuckT - dt);
    const err = desired - p.fwdSpeed;
    inp.steer = clamp(steer, -1, 1);
    if (err > 0.5) { inp.throttle = clamp(err * 0.35, 0.2, 1); inp.brake = 0; }
    else if (err < -2) { inp.throttle = 0; inp.brake = clamp(-err * 0.25, 0.2, 1) * (1 - 0.35 * Math.abs(inp.steer)); }
    else { inp.throttle = 0.15; inp.brake = 0; }
    inp.hand = Math.abs(ang) > 1.4 && speed > 10 && this.skill > 0.6;
  }

  // put a lost or wedged car back on its route, facing along it
  warp(skip = 1) {
    const v = this.v, P = this.path, W = this.game.world;
    let bi = this.pi, bd = Infinity;
    for (let i = Math.max(0, this.pi - 6); i < Math.min(P.length, this.pi + 40); i++) { const d = Math.hypot(P[i].x - v.x, P[i].z - v.z); if (d < bd) { bd = d; bi = i; } }
    bi = Math.min(P.length - 2, bi + skip);
    const a = P[bi], b = P[Math.min(P.length - 1, bi + 3)];
    if (v.disabled || v.damage.total > 0.9) v.repair?.();
    v.place(a.x, a.y ?? W.groundY(a.x, a.z, v.y + 30), a.z, Math.atan2(b.x - a.x, b.z - a.z));
    v.phys.vx = v.phys.vz = 0;
    this.pi = bi; this.lostT = 0; this.stuckT = 0; this.reverseT = 0;
  }

  follow() {
    const v = this.v, speed = v.phys.speed;
    const la = 7 + speed * 0.55;
    // advance index to closest point
    while (this.pi < this.path.length - 1) {
      const a = this.path[this.pi], b = this.path[this.pi + 1];
      const dA = Math.hypot(a.x - v.x, a.z - v.z), dB = Math.hypot(b.x - v.x, b.z - v.z);
      if (dB < dA || dA < 3) this.pi++; else break;
    }
    let xt = 1e9;
    for (let k = Math.max(0, this.pi - 1); k <= Math.min(this.path.length - 2, this.pi + 1); k++) {
      const a = this.path[k], b = this.path[k + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      const u = clamp(((v.x - a.x) * dx + (v.z - a.z) * dz) / L2, 0, 1);
      xt = Math.min(xt, Math.hypot(a.x + dx * u - v.x, a.z + dz * u - v.z));
    }
    this.xt = xt;
    let acc = 0, i = this.pi;
    let px = v.x, pz = v.z;
    while (i < this.path.length) {
      const q = this.path[i];
      const d = Math.hypot(q.x - px, q.z - pz);
      if (acc + d >= la) { const t = (la - acc) / d; return { x: px + (q.x - px) * t, z: pz + (q.z - pz) * t, v: this.maxSpeed }; }
      acc += d; px = q.x; pz = q.z; i++;
    }
    const last = this.path[this.path.length - 1];
    return { x: last.x, z: last.z, v: this.maxSpeed };
  }

  cornerSpeed() {
    const v = this.v, P = this.path, pi = this.pi;
    let dist = 0, vmax = this.maxSpeed;
    const safe = 0.72 + 0.2 * this.skill;
    const reach = 60 + v.phys.speed * v.phys.speed / 10;
    for (let i = Math.max(1, pi - 1); i < P.length - 1 && dist < reach; i++) {
      const b = P[i];
      if (i >= pi) dist += Math.hypot(b.x - (i === pi ? v.x : P[i - 1].x), b.z - (i === pi ? v.z : P[i - 1].z));
      let j = i - 1, k = i + 1;
      while (j > 0 && Math.hypot(b.x - P[j].x, b.z - P[j].z) < 6) j--;
      while (k < P.length - 1 && Math.hypot(P[k].x - b.x, P[k].z - b.z) < 6) k++;
      const a = P[j], c = P[k];
      const turn = Math.abs(wrapAngle(Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z)));
      if (turn > 0.1) {
        const len = (Math.hypot(b.x - a.x, b.z - a.z) + Math.hypot(c.x - b.x, c.z - b.z)) / 2;
        const radius = Math.max(4, Math.min(len, 24) / turn);
        // grip falls with speed (about 8.4 - 0.11 v m/s^2 measured on the Arc), solved for v
        const bq = 0.11 * radius * safe, vt = (-bq + Math.sqrt(bq * bq + 33.6 * radius * safe)) / 2;
        vmax = Math.min(vmax, Math.sqrt(vt * vt + 2 * 5 * dist));
      }
    }
    return vmax;
  }
}

function simplify(pts) {
  const out = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p.x - l.x, p.z - l.z) > 2) out.push(p);
  }
  return out;
}
