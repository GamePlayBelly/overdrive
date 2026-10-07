import { VEHICLE_BY_ID } from '../data/vehicles.js';
import { WATER_LEVEL } from '../data/world.js';
import { WANTED } from '../data/wanted.js';
import { AIBoat } from '../vehicles/aiBoat.js';
import { clamp, wrapAngle } from '../core/math.js';

const CFG = WANTED.sea;

// Coast guard: the maritime arm of Police. Police keeps the wanted level, the crimes and the escape meter; this keeps the boats. Units leave from a station (or
// a patrol that happens to be near), take the nav grid across the bay, then split into roles around a predicted intercept: one runs the target down, two flank,
// the rest cut ahead. When sight is lost they go to the last known position and sweep outward from it until the stars come off.
export class CoastGuard {
  constructor(game) { this.g = game; this.units = []; this.spawnT = 2; this.roleT = 0; this.pathT = 0; this.sweep = 0; this.lastSeenBy = null; this.msgT = 0; this.aim = { x: 0, z: 0, vx: 0, vz: 0, noLead: true, spd: 0, run: true }; }

  get police() { return this.g.police; }

  onWater(T) { return T.veh ? !!T.veh.isBoat : this.g.player.state === 'swim'; }

  // a straight line over water: no ground above the surface between the two points
  clearLine(ax, az, bx, bz) {
    const T = this.g.world.terrain, d = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(d / 14));
    for (let i = 1; i < n; i++) { const t = i / n; if (T.height(ax + (bx - ax) * t, az + (bz - az) * t) > WATER_LEVEL + 1.2) return false; }
    return true;
  }

  // who can see the target right now, by eye or radar, after night, rain, fog, the swell and how much of the target shows
  sees(T) {
    const g = this.g, sky = g.sky, c = CFG.detect, W = g.world.sea.waves, P = g.player;
    const k = (1 - sky.night * (1 - c.night)) * (1 - sky.w.rain * (1 - c.rain)) * (sky.w.fog > 0.004 ? c.fog : 1) * (1 - clamp((W.hs - 2) / 5, 0, 1) * c.swell);
    let stealth = 1;
    if (!T.veh) stealth = P.dive > 0.3 ? 0 : 0.35;
    else if (T.speed < 1.2 && !T.veh.lights?.head) stealth = 0.55;
    else if (sky.night > 0.5 && T.veh.lights?.head) stealth = 1.3;
    if (stealth <= 0) return null;
    for (const u of this.units) {
      if (u.v.disabled || u.v.sunk) continue;
      const d = Math.hypot(u.v.x - T.x, u.v.z - T.z);
      if (d < c.visual * k * stealth && this.clearLine(u.v.x, u.v.z, T.x, T.z)) return u;
      if (u.radar && T.veh && stealth > 0.3 && d < c.radar * (0.65 + 0.35 * (1 - sky.w.rain))) return u;
    }
    return null;
  }

  // a patrol or unit close enough to have seen a crime at x, z
  witness(x, z) {
    for (const u of this.units) if (Math.hypot(u.v.x - x, u.v.z - z) < 240 && this.clearLine(u.v.x, u.v.z, x, z)) return u;
    const pop = this.g.seaTraffic?.pop;
    if (pop) for (const a of pop.agents) if (a.kind === 'patrol' && a.state !== 'sheltered' && Math.hypot(a.x - x, a.z - z) < 260) return a;
    return null;
  }

  // ---- spawning
  makeUnit(kind, x, z, yaw, T) {
    const g = this.g, lvl = this.police.level;
    const v = g.spawnVehicle(kind, x, z, yaw, {}, { kind: 'police' });
    return this.arm(v, T, lvl);
  }

  arm(v, T, lvl) {
    const ai = new AIBoat(this.g, v, { maxSpeed: this.cap(v, lvl), aggr: 0.7 + lvl * 0.05 });
    ai.ignore = new Set(T.veh ? [T.veh] : []);
    v.lights.bar = true; v.lights.siren = lvl >= 2; v.cg = true;
    const u = { v, ai, role: 'chase', state: 'respond', lostT: 0, id: v.id, radar: !!v.def.radar, phase: 'lkp', born: this.g.time, planT: 0, sector: 0 };
    this.units.push(u);
    return u;
  }

  cap(v, lvl) {
    const hs = this.g.world.sea.waves.hs, sea = clamp(1 / (1 + 0.07 * Math.pow(hs, 1.2)), 0.55, 1);
    return Math.min(CFG.speed[Math.max(1, lvl)], v.phys.vmax * 0.97) * sea;
  }

  pickKind(lvl) { return lvl >= 5 ? (this.units.some((u) => u.v.def.id === 'cgcutter') ? 'cgfast' : 'cgcutter') : lvl >= 3 ? (this.units.length % 2 ? 'patrol' : 'cgfast') : (this.units.length ? 'patrol' : 'cgfast'); }

  spawnOne(T) {
    const g = this.g, nav = g.seaNav, pop = g.seaTraffic?.pop, lvl = this.police.level, F = T.veh || g.player;
    if (!nav || !pop) return null;
    // a patrol boat already out there answers first
    let best = null, bd = 3500 * 3500;
    for (const a of pop.agents) { if (a.kind !== 'patrol' || a.state === 'sheltered') continue; const d = (a.x - F.x) ** 2 + (a.z - F.z) ** 2; if (d < bd) { bd = d; best = a; } }
    if (best) {
      if (!best.v) pop.acquire(best);
      const v = best.v; pop.agents.splice(pop.agents.indexOf(best), 1);
      if (v) { v.moor = null; return this.arm(v, T, lvl); }
    }
    // else from the nearest station that is far enough to arrive from over the horizon, or out of sight in a ring around the target
    let st = null, sd = 1e18;
    for (const p of pop.ports) { if (!p.station) continue; const d = Math.hypot(p.x - F.x, p.z - F.z); if (d > CFG.station[0] && d < CFG.station[1] && d < sd) { sd = d; st = p; } }
    let x, z;
    if (st) { const q = nav.random(() => Math.random(), st.comp, st.x, st.z, 25, 80) || st; x = q.x; z = q.z; }
    else {
      for (let t = 0; t < 12; t++) { const p = nav.random(() => Math.random(), 0, F.x, F.z, 330, 620); if (p && !g.view.sphere(p.x, -2, p.z, 20)) { x = p.x; z = p.z; break; } }
      if (x === undefined) return null;
    }
    return this.makeUnit(this.pickKind(lvl), x, z, Math.atan2(F.x - x, F.z - z), T);
  }

  // ---- per frame
  update(dt, T, wt) {
    const g = this.g, P = this.police, lvl = P.level, nav = g.seaNav;
    this.units = this.units.filter((u) => g.vehicles.includes(u.v));
    if (!nav) return;
    if (lvl > 0 && wt) {
      this.spawnT -= dt;
      if (this.units.length < CFG.units[lvl] && this.spawnT <= 0) {
        this.spawnT = CFG.reinforce;
        const u = this.spawnOne(T);
        if (u) { if (this.units.length === 1) P.radio(`Coast Guard, vessel reported ${P.locText()}.`); else P.radio('Coast Guard reinforcements under way.'); }
      }
    }
    this.roleT -= dt; this.pathT -= dt;
    const seen = P.seen, unseenT = P.unseenT, ls = P.lastSeen;
    const aimRoles = this.roleT <= 0 && lvl > 0;
    if (aimRoles) { this.roleT = 0.6; this.assign(T, seen); }
    for (const u of [...this.units]) {
      const v = u.v, ai = u.ai, d = Math.hypot(v.x - T.x, v.z - T.z);
      if (v.sunk || v.disabled) { u.deadT = (u.deadT || 0) + dt; if (u.deadT > 30 && d > 120) this.remove(u); continue; }
      v.lights.bar = true; v.lights.siren = lvl >= 2 && u.state !== 'return';
      ai.maxSpeed = this.cap(v, Math.max(1, lvl)); ai.seaK = 1;
      if (lvl === 0 || !wt) { if (u.state !== 'return') this.release(u); this.goHome(u, dt); ai.update(dt); continue; }
      if (seen || (ls && unseenT < 3)) {
        if (u.state !== 'pursue') { u.state = 'pursue'; u.planT = 0; }
        this.pursue(u, T, d, dt);
      } else {
        if (u.state !== 'search') { u.state = 'search'; u.phase = 'lkp'; u.planT = 0; if (u === this.units[0]) P.radio('Lost visual on the vessel. Proceeding to last known position.'); }
        this.searchStep(u, T, ls, unseenT, dt);
      }
      ai.update(dt);
    }
  }

  // intercept point of a target moving at constant velocity for a pursuer of speed s: |D + V t| = s t
  intercept(cx, cz, s, T) {
    const dx = T.x - cx, dz = T.z - cz, vx = T.vx || 0, vz = T.vz || 0, a = vx * vx + vz * vz - s * s, b = 2 * (dx * vx + dz * vz), c = dx * dx + dz * dz;
    let t = -1;
    if (Math.abs(a) < 1e-4) t = b !== 0 ? -c / b : -1;
    else { const disc = b * b - 4 * a * c; if (disc >= 0) { const r = Math.sqrt(disc), t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a); t = Math.min(t1 > 0 ? t1 : 1e9, t2 > 0 ? t2 : 1e9); if (t > 1e8) t = -1; } }
    if (t < 0) t = Math.hypot(dx, dz) / Math.max(s, 1);
    t = clamp(t, 0, 14);
    return { x: T.x + vx * t, z: T.z + vz * t, t };
  }

  assign(T, seen) {
    const act = this.units.filter((u) => u.state === 'pursue' || u.state === 'respond');
    if (!act.length) return;
    const dirx = T.speed > 1.5 ? T.vx / T.speed : 0, dirz = T.speed > 1.5 ? T.vz / T.speed : 1;
    const sorted = act.map((u) => ({ u, t: this.intercept(u.v.x, u.v.z, u.ai.maxSpeed, T).t })).sort((a, b) => a.t - b.t);
    sorted.forEach((e, i) => { e.u.role = i === 0 ? 'chase' : i < 3 ? (i === 1 ? 'flankL' : 'flankR') : i === 3 ? 'block' : 'support'; e.u.slot = i; });
    this.dir = { x: dirx, z: dirz };
  }

  pursue(u, T, d, dt) {
    const g = this.g, ai = u.ai, v = u.v, P = this.police, A = this.aim, dir = this.dir || { x: 0, z: 1 };
    const seen = P.seen;
    const tgt = seen ? T : { x: P.lastSeen.x + P.lastSeen.vx * Math.min(4, P.unseenT), z: P.lastSeen.z + P.lastSeen.vz * Math.min(4, P.unseenT), vx: P.lastSeen.vx, vz: P.lastSeen.vz, speed: Math.hypot(P.lastSeen.vx, P.lastSeen.vz) };
    const ic = this.intercept(v.x, v.z, ai.maxSpeed, tgt), px = -dir.z, pz = dir.x;
    let ax = ic.x, az = ic.z;
    if (u.role === 'flankL' || u.role === 'flankR') { const s = u.role === 'flankL' ? 1 : -1; ax += px * s * CFG.flank + dir.x * 22; az += pz * s * CFG.flank + dir.z * 22; if (d < 60) { ax = tgt.x + px * s * 6; az = tgt.z + pz * s * 6; } }
    else if (u.role === 'block') { ax = tgt.x + dir.x * (CFG.block + (u.slot - 3) * 60); az = tgt.z + dir.z * (CFG.block + (u.slot - 3) * 60); if (Math.hypot(ax - tgt.x, az - tgt.z) < 60) { ax = tgt.x; az = tgt.z; } }
    else if (u.role === 'support') { ax = tgt.x - dir.x * 90; az = tgt.z - dir.z * 90; }
    if (d < 24 && u.role !== 'support') { ax = tgt.x; az = tgt.z; }
    // land in the way: route over the nav grid instead of cutting the corner
    if (!this.clearLine(v.x, v.z, ax, az)) {
      u.planT -= dt;
      if (u.planT <= 0 || !ai.path) { const path = g.seaNav.path(v.x, v.z, ax, az); if (path) ai.follow(path); u.planT = 2.5; }
      return;
    }
    if (ai.mode !== 'chase') { ai.path = null; }
    A.x = ax; A.z = az; A.vx = 0; A.vz = 0; A.spd = tgt.speed || 0;
    ai.chase({ ...A });
  }

  searchStep(u, T, ls, unseenT, dt) {
    const g = this.g, ai = u.ai, v = u.v, S = CFG.search, n = Math.max(1, this.units.length);
    const dr = Math.min(unseenT, 25) * 0.7, cx = (ls?.x ?? T.x) + (ls?.vx ?? 0) * dr, cz = (ls?.z ?? T.z) + (ls?.vz ?? 0) * dr;
    ai.maxSpeed *= u.phase === 'lkp' ? 0.95 : 0.8;
    u.planT -= dt;
    const arrived = ai.arrived || (ai.path && Math.hypot(v.x - ai.goal.x, v.z - ai.goal.z) < 45);
    if (u.phase === 'lkp') {
      if (u.planT <= 0) { const path = g.seaNav.path(v.x, v.z, ls?.x ?? T.x, ls?.z ?? T.z); if (path) ai.follow(path); u.planT = 4; }
      if (Math.hypot(v.x - (ls?.x ?? T.x), v.z - (ls?.z ?? T.z)) < 70 || arrived) { u.phase = 'sweep'; u.planT = 0; }
      return;
    }
    if (u.planT <= 0 || arrived) {
      const R = Math.min(S.max, S.startR + S.growth * unseenT), idx = this.units.indexOf(u), a = (idx / n) * 6.283 + unseenT * 0.04 + Math.random() * 0.8;
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, path = g.seaNav.path(v.x, v.z, x, z);
      if (path) ai.follow(path); u.planT = 6 + Math.random() * 6;
    }
  }

  goHome(u, dt) {
    const g = this.g, v = u.v, ai = u.ai, pop = g.seaTraffic?.pop, P = g.player, F = P.vehicle || P;
    u.state = 'return'; v.lights.siren = false; u.planT -= dt;
    ai.maxSpeed = v.phys.vmax * 0.5;
    if (u.planT <= 0 && pop) { let p = null, bd = 1e18; for (const q of pop.ports) { const d = (q.x - v.x) ** 2 + (q.z - v.z) ** 2; if (d < bd) { bd = d; p = q; } } if (p) { const path = g.seaNav.path(v.x, v.z, p.x, p.z); if (path) ai.follow(path); } u.planT = 8; }
    const d = Math.hypot(v.x - F.x, v.z - F.z);
    if ((ai.arrived || d > 800) && d > 160) this.remove(u);
  }

  release(u) { u.state = 'return'; u.planT = 0; u.ai.ignore = null; }

  dismiss() { for (const u of this.units) this.release(u); }

  remove(u) {
    const i = this.units.indexOf(u); if (i >= 0) this.units.splice(i, 1);
    if (this.g.player.vehicle !== u.v) this.g.removeVehicle(u.v);
  }
}
