import * as THREE from 'three';
import { STRIDE, P } from './engineDSP.js';

// Drives the engine bank and the rolling-noise layers from the real vehicle data (rpm, gear, throttle, load, shifts, surface, slip, weather,
// camera position, distance). Cars and bikes get different engine types and mixes; traffic and remote players share the same bank with
// distance based level of detail so only the nearest vehicles are simulated in full.
//
// Per-vehicle tuning lives in the vehicle catalog (src/data/vehicles.js) in the existing `sound` block. Everything is optional:
//   sound: { cyl, pitch, rough,                       // already there
//            engineType: 'i4'|'i3'|'i6'|'v6'|'v8'|'v10'|'v12'|'flat6'|'diesel'|'bike_i4'|'bike_triple'|'bike_vtwin'|'bike_single',
//            idleRPM, redlineRPM, maxRPM, gearCount,    // default to the physics values
//            engineVolume, exhaustVolume, intakeVolume, turboVolume, transmissionVolume, tireVolume, windVolume,
//            enginePitch, gearShiftIntensity, turbo: true }   // turbo: sound of a factory turbo (tuned turbo kits are read from the physics)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
export const VOICES = 10;
const FWD = new THREE.Vector3(), UP = new THREE.Vector3(), RIGHT = new THREE.Vector3();

// surface ids mirror SURF in world/terrain.js
const S = { GRASS: 0, ASPHALT: 1, CONCRETE: 2, GRAVEL: 3, DIRT: 4, SAND: 5, WATER: 6, ROCK: 7, PARKING: 8, FIELD: 9 };
const ROAD = { road: 0.3, roadLp: 260, roadSp: 14, grit: 0, gritLp: 1200, gritSp: 60, squeal: 1, spray: 1, hard: 1 };
// road rumble level / colour, grit (stones, dust) level / colour, how well it squeals, how much water it throws when wet
export const SURFACE_SOUND = {
  [S.GRASS]: { road: 0.1, roadLp: 200, roadSp: 6, grit: 0.14, gritLp: 650, gritSp: 25, squeal: 0, spray: 0.3, hard: 0 },
  [S.ASPHALT]: ROAD,
  [S.CONCRETE]: { road: 0.36, roadLp: 330, roadSp: 16, grit: 0, gritLp: 1300, gritSp: 60, squeal: 0.9, spray: 1, hard: 1 },
  [S.GRAVEL]: { road: 0.18, roadLp: 600, roadSp: 30, grit: 0.8, gritLp: 1900, gritSp: 45, squeal: 0.1, spray: 0.25, hard: 0 },
  [S.DIRT]: { road: 0.28, roadLp: 380, roadSp: 25, grit: 0.45, gritLp: 1300, gritSp: 40, squeal: 0.05, spray: 0.35, hard: 0 },
  [S.SAND]: { road: 0.1, roadLp: 420, roadSp: 20, grit: 0.35, gritLp: 900, gritSp: 35, squeal: 0, spray: 0.1, hard: 0 },
  [S.WATER]: { road: 0.06, roadLp: 500, roadSp: 20, grit: 0, gritLp: 1200, gritSp: 40, squeal: 0, spray: 2.2, hard: 0 },
  [S.ROCK]: { road: 0.34, roadLp: 450, roadSp: 22, grit: 0.5, gritLp: 2200, gritSp: 50, squeal: 0.5, spray: 0.4, hard: 1 },
  [S.PARKING]: { ...ROAD, road: 0.32, roadLp: 290 },
  [S.FIELD]: { road: 0.12, roadLp: 230, roadSp: 8, grit: 0.2, gritLp: 800, gritSp: 28, squeal: 0, spray: 0.3, hard: 0 },
};

// engine character per type: DSP kind, default cylinders, relative level of exhaust / block / intake / gearbox, shift intensity
export const ENGINE_TYPES = {
  i3: { kind: 6, cyl: 3, exhaust: 0.95, block: 1.0, intake: 0.9, trans: 0.8, shift: 0.8 },
  i4: { kind: 0, cyl: 4, exhaust: 0.9, block: 1.0, intake: 0.9, trans: 0.9, shift: 0.8 },
  i6: { kind: 8, cyl: 6, exhaust: 1.0, block: 0.95, intake: 0.85, trans: 0.9, shift: 1.0 },
  v6: { kind: 8, cyl: 6, exhaust: 1.0, block: 1.0, intake: 0.85, trans: 0.9, shift: 1.0, pitch: 1.04 },
  v8: { kind: 3, cyl: 8, exhaust: 1.15, block: 1.0, intake: 0.8, trans: 0.9, shift: 1.2 },
  v10: { kind: 7, cyl: 10, exhaust: 1.1, block: 1.0, intake: 1.1, trans: 1.0, shift: 1.3 },
  v12: { kind: 7, cyl: 12, exhaust: 1.1, block: 1.0, intake: 1.1, trans: 1.0, shift: 1.3 },
  flat6: { kind: 7, cyl: 6, exhaust: 1.1, block: 1.05, intake: 1.0, trans: 1.0, shift: 1.2, pitch: 0.95 },
  diesel: { kind: 1, cyl: 4, exhaust: 0.85, block: 1.15, intake: 0.6, trans: 1.0, shift: 0.5, noTurbo: false },
  bike_i4: { kind: 4, cyl: 4, exhaust: 1.05, block: 0.95, intake: 1.35, trans: 1.2, shift: 1.0, chain: 1 },
  bike_triple: { kind: 6, cyl: 3, exhaust: 1.05, block: 1.0, intake: 1.2, trans: 1.1, shift: 1.0, chain: 1 },
  bike_vtwin: { kind: 5, cyl: 2, exhaust: 1.2, block: 1.0, intake: 0.9, trans: 1.0, shift: 1.1, chain: 0.9 },
  bike_single: { kind: 2, cyl: 1, exhaust: 1.1, block: 1.0, intake: 1.0, trans: 1.0, shift: 1.0, chain: 0.9 },
};

const cache = new WeakMap();
// everything the audio side needs to know about a vehicle model, from the catalog data
export function soundProfile(def) {
  let p = cache.get(def);
  if (p) return p;
  // the short names (type, diesel, engine, exhaust, intake, trans, tire, wind, shift, idle) are accepted as aliases of the long ones
  const raw = def.sound || {}, s = { ...raw };
  const alias = { engine: 'engineVolume', exhaust: 'exhaustVolume', intake: 'intakeVolume', trans: 'transmissionVolume', tire: 'tireVolume', wind: 'windVolume', shift: 'gearShiftIntensity', idle: 'idleRPM' };
  for (const [k, v] of Object.entries(alias)) if (raw[k] !== undefined && raw[v] === undefined) s[v] = raw[k];
  if (!s.engineType && raw.type && ENGINE_TYPES[raw.type]) s.engineType = raw.type;
  if (!s.engineType && raw.diesel) s.engineType = 'diesel';
  if (typeof raw.turbo === 'number') s.turbo = raw.turbo > 0;
  const perf = def.perf || {}, st = def.body?.style;
  const bike = st === 'bike';
  let type = s.engineType || null, T = null, kind;
  if (def.air) { kind = def.air === 'jet' ? 3 : def.air === 'heli' ? 1 : 2; type = 'air'; }
  else if (def.boat) { kind = def.boat === 'jetski' || def.boat === 'rib' ? 2 : def.boat === 'sport' ? 3 : 1; type = 'boat'; }
  else {
    const cyl = s.cyl || 4;
    if (!type) type = bike ? (cyl >= 4 ? 'bike_i4' : cyl === 3 ? 'bike_triple' : cyl === 1 ? 'bike_single' : 'bike_vtwin')
      : st === 'bus' || st === 'truck' || st === 'van' ? 'diesel' : cyl >= 12 ? 'v12' : cyl >= 10 ? 'v10' : cyl >= 8 ? 'v8' : cyl >= 6 ? 'i6' : cyl === 3 ? 'i3' : 'i4';
    T = ENGINE_TYPES[type] || ENGINE_TYPES.i4; kind = T.kind;
  }
  T = T || { exhaust: 1, block: 1, intake: 1, trans: 1, shift: 0.8 };
  const pw = perf.kw && perf.mass ? perf.kw / perf.mass : 0.1;
  const perfK = clamp((pw - 0.09) / 0.22, 0, 1);              // 0 economy car .. 1 supercar / sports bike
  const redline = s.redlineRPM || perf.redline || 6500;
  p = {
    type, kind, bike, perfK, heavy: st === 'bus' || st === 'truck' || st === 'van' || st === 'utility',
    cyl: s.cyl || T.cyl || 4, pitch: (s.pitch || 1) * (s.enginePitch || 1) * (T.pitch || 1), rough: clamp((s.rough ?? 0.3) + perfK * 0.12, 0, 1),
    idle: s.idleRPM || 0, redline, maxRpm: s.maxRPM || redline * 1.06, gears: s.gearCount || perf.gears?.length || 1,
    exhaust: T.exhaust * (s.exhaustVolume ?? 1) * (0.85 + perfK * 0.45),
    block: T.block * (s.engineVolume ?? 1),
    intake: T.intake * (s.intakeVolume ?? 1) * (0.8 + perfK * 0.5),
    trans: T.trans * (s.transmissionVolume ?? 1),
    turboVol: s.turboVolume ?? 1, tire: (s.tireVolume ?? 1) * (bike ? 0.75 : 1), wind: (s.windVolume ?? 1) * (bike ? 1.35 : 1),
    shift: s.gearShiftIntensity ?? T.shift, chain: bike ? (T.chain || 1) : 0,
    turbo: !!s.turbo, loud: bike ? 0.85 : st === 'bus' || st === 'truck' ? 1.15 : 1,
  };
  cache.set(def, p);
  return p;
}

// approximate rpm for kinematic (AI) vehicles from speed
function fakeRpm(def, speed, prof) {
  const p = def.perf, wr = def.body.wr, idle = prof.idle || (prof.bike ? 1300 : 820);
  if (!p || !p.gears || speed < 0.4) return { rpm: idle, gear: 1 };
  let best = 1, bestRpm = 0;
  for (let g = 1; g <= p.gears.length; g++) {
    const rpm = ((speed / wr) * p.gears[g - 1] * p.final * 60) / (Math.PI * 2);
    best = g; bestRpm = rpm;
    if (rpm < p.redline * 0.62) break;
  }
  return { rpm: Math.max(idle, bestRpm), gear: best };
}

const newState = () => ({ prevSpeed: 0, acc: 0, prevGear: 1, shiftT: 0, shiftDir: 0, shiftI: 0, px: NaN, pz: NaN, vx: 0, vz: 0, spool: 0, loadSm: 0, cache: null, seen: 0, speedSm: 0 });

export class VehicleAudio {
  constructor(A) {
    this.A = A;
    this.params = new Float32Array(STRIDE * VOICES);
    this.tEng = 0; this.tickN = 0; this.scanT = 0; this.cands = [];
    this.states = new Map();
    // exposure of the listener to each part of the engine, smoothed so camera changes cross-fade instead of jumping
    this.view = { exhaust: 1, block: 1, intake: 0.8, lp: 1, gain: 0.9, cabin: 0, chain: 1, wind: 1, tire: 1, rain: 0 };
    this.p = { on: false, first: true, stopT: 0, stopRpm: 0, lastRpm: 0, gear: 1, shiftWas: false, spool: 0, lastV: null, thrAtShift: 0 };
    this.ghost = null;
    this.info = {};
  }

  // listener exposure per camera mode and vehicle type: [exhaust, block, intake, lp, gain, cabin boom]
  exposure(mode, prof, pv) {
    const bike = prof.bike, open = pv && (pv.isBoat || pv.isAir);
    if (bike || open) return mode === 'cockpit' ? [0.95, 0.95, 1.1, 0.82, 0.95, 0] : mode === 'hood' || mode === 'bumper' ? [1, 1, 1, 0.9, 0.92, 0] : [1, 1, 0.85, 1, 0.9, 0];
    if (mode === 'cockpit') return [0.3, 0.6, 0.55, 0.34, 0.62, 1];
    if (mode === 'hood') return [0.55, 1, 1.2, 0.55, 0.75, 0.25];
    if (mode === 'bumper') return [0.9, 0.85, 0.7, 0.62, 0.8, 0];
    return [1, 1, 0.8, 1, 0.9, 0];
  }

  put(slot, o) {
    const A = this.params, b = slot * STRIDE, pr = o.prof;
    A.fill(0, b, b + STRIDE);
    A[b + P.active] = 1; A[b + P.rpm] = o.rpm; A[b + P.load] = o.load; A[b + P.gain] = o.gain; A[b + P.pan] = o.pan || 0;
    A[b + P.cyl] = pr.cyl; A[b + P.rough] = pr.rough; A[b + P.pitch] = pr.pitch; A[b + P.kind] = pr.kind; A[b + P.lp] = o.lp;
    A[b + P.turbo] = o.turbo || 0; A[b + P.cut] = o.cut || 0; A[b + P.whine] = o.whine || 0; A[b + P.whineHz] = o.whineHz || 0;
    A[b + P.exhaust] = o.exhaust ?? pr.exhaust; A[b + P.intake] = o.intake ?? pr.intake; A[b + P.block] = o.block ?? pr.block; A[b + P.trans] = pr.trans;
    A[b + P.shift] = o.shift || 0; A[b + P.tire] = o.tire || 0; A[b + P.tireHz] = o.tireHz || 500; A[b + P.cabin] = o.cabin || 0;
    A[b + P.lod] = o.lod || 0; A[b + P.crank] = o.crank || 0; A[b + P.chain] = o.chain || 0;
  }

  // ------------------------------------------------------------------ per frame
  update(game, dt, env) {
    const A = this.A, cam = game.camera, pv = game.player.vehicle;
    const mode = game.rig.mode;
    FWD.set(0, 0, -1).applyQuaternion(cam.quaternion); RIGHT.set(1, 0, 0).applyQuaternion(cam.quaternion); UP.set(0, 1, 0);
    this.env = env;
    this.engines(game, dt, pv, mode, env);
    this.rolling(game, dt, pv, mode, env);
  }

  engines(game, dt, pv, mode, env) {
    const A = this.A;
    this.tEng -= dt;
    if (!A.bankNode || this.tEng > 0) return;
    const step = 1 / 40; this.tEng = step; this.tickN++;
    const cam = game.camera, cp = cam.position;
    this.params.fill(0);
    let n = 0;
    const encl = env.enclosure || 0;
    const prof = pv ? soundProfile(pv.def) : null;
    // ---- the player's vehicle: full simulation ----
    const V = this.view, st = this.p;
    if (pv) {
      const ph = pv.phys, def = pv.def, exp = this.exposure(mode, prof, pv), k = 1 - Math.exp(-step * 5);
      V.exhaust += (exp[0] - V.exhaust) * k; V.block += (exp[1] - V.block) * k; V.intake += (exp[2] - V.intake) * k; V.lp += (exp[3] - V.lp) * k; V.gain += (exp[4] - V.gain) * k; V.cabin += (exp[5] - V.cabin) * k;
      const idle = prof.idle || ph.idle || (prof.bike ? 1300 : 850), redline = prof.redline || ph.redline || 6500;
      const on = ph.engineOn !== false;
      const thr = clamp(ph.thrIn || 0, 0, 1), brk = clamp(ph.brkIn || 0, 0, 1), speed = ph.speed || 0, gear = ph.gear ?? 1;
      if (st.lastV !== pv) { st.lastV = pv; st.on = on; st.stopT = 0; st.gear = gear; st.first = true; st.spool = 0; }
      // starting and stopping
      if (on && !st.on && !st.first) A.startT = Math.max(A.startT, 1.15);
      if (!on && st.on) { st.stopT = 1.0; st.stopRpm = st.lastRpm; }
      st.on = on; st.first = false;
      let rpm = Math.max(ph.rpm || 0, on ? redline * 0.1 : 0);
      let gainK = on ? 1 : 0, crank = 0, load = clamp(thr * (ph.shiftT > 0 ? 0.25 : 1), 0, 1);
      if (A.startT > 0 && on) {
        const u = clamp(1 - A.startT / 1.15, 0, 1);
        if (u < 0.6) { crank = 1; rpm = 170 + 50 * Math.sin(u * 55) * 0.5 + u * 60; gainK = 0.5; load = 0.25; }
        else if (u < 0.8) { const w = (u - 0.6) / 0.2; crank = 1 - w; rpm = lerp(230, idle * 1.9, ease(w)); gainK = lerp(0.5, 1, w); load = 0.3; }
        else { rpm = lerp(idle * 1.9, rpm, ease((u - 0.8) / 0.2)); }
      } else if (!on && st.stopT > 0) {
        st.stopT -= step; const u = 1 - clamp(st.stopT / 1.0, 0, 1);
        rpm = Math.max(60, st.stopRpm * (1 - u) * (1 - u) + 90 * Math.sin(u * 28) * (1 - u)); gainK = (1 - u) ** 1.5; load = 0;
      } else if (!on) gainK = 0;
      st.lastRpm = on ? rpm : st.lastRpm;
      // gear change: dir from the gear numbers, strength from the throttle held when it started
      const shifting = (ph.shiftT || 0) > 0;
      let shift = 0;
      if (shifting) {
        if (!st.shiftWas) { st.shiftDir = gear >= st.gear ? 1 : -1; st.shiftI = (0.4 + 0.6 * thr) * prof.shift; }
        shift = st.shiftDir * Math.max(0.05, st.shiftI);
      }
      st.shiftWas = shifting; st.gear = gear;
      // turbo: only on cars that have one (tuned kit or catalog flag); builds with load and revs, falls away slower than it rises (spool lag)
      const lvl = ph.tune?.turbo || 0;
      let tb = 0;
      if (lvl > 0 || prof.turbo) {
        const want = clamp(thr * clamp((rpm - idle) / Math.max(1, redline * 0.65 - idle), 0, 1), 0, 1) * clamp(0.45 + lvl * 0.12, 0, 1);
        st.spool += (want - st.spool) * Math.min(1, step * (want > st.spool ? 1.6 : 2.4));
        tb = st.spool * prof.turboVol;
      } else st.spool = 0;
      tb = clamp(tb + (ph.boost || 0) * 0.7, 0, 1.2);
      const rev = gear < 0, decel = thr < 0.05 && speed > 3 && on;
      const whine = on ? clamp((0.16 + 0.5 * thr + (decel ? 0.3 : 0)) * (rev ? 2.2 : gear <= 2 ? 1 : 0.6) * prof.trans * (prof.bike ? 0.8 : 1) * (V.cabin > 0.5 ? 1.25 : 1) * Math.min(1, speed / 6 + 0.25), 0, 0.9) : 0;
      const whineHz = 0.5 * (speed * 24 + 120) + 0.5 * (rpm / 60) * 9;
      const chain = prof.bike ? clamp(speed / 25, 0, 1) * (0.35 + 0.65 * thr) * prof.chain : 0;
      this.put(n++, {
        prof, rpm, load, gain: V.gain * gainK * (1 + encl * 0.18), lp: V.lp, turbo: tb, cut: ph.limiter, whine, whineHz, shift, crank,
        exhaust: prof.exhaust * V.exhaust, block: prof.block * V.block, intake: prof.intake * V.intake, cabin: V.cabin * (0.3 + 0.55 * load) * (prof.bike ? 0 : 1), chain, lod: 0,
      });
      this.info = { rpm: Math.round(rpm), load: +load.toFixed(2), turbo: +tb.toFixed(2), shift, whine: +whine.toFixed(2), type: prof.type, mode };
    } else {
      // on foot: relax the exposure so the next vehicle starts from the exterior mix
      const k = 1 - Math.exp(-step * 3); V.exhaust += (1 - V.exhaust) * k; V.block += (1 - V.block) * k; V.lp += (1 - V.lp) * k; V.gain += (0.9 - V.gain) * k; V.cabin += (0 - V.cabin) * k; V.intake += (0.8 - V.intake) * k;
      if (st.lastV) { // the engine you just left dies away behind you
        const v = st.lastV; st.lastV = null;
        if (v.phys?.engineOn !== false && !v.isAir) this.ghost = { v, def: v.def, t: 0, rpm: Math.max(v.phys?.rpm || 900, 500), x: v.x, y: v.y, z: v.z };
        st.on = false;
      }
    }
    const interior = !!pv && mode === 'cockpit' && !prof?.bike;
    // ---- everybody else ----
    this.scanT -= step;
    if (this.scanT <= 0) { this.scanT = 0.15; this.scan(game, cp); }
    const cv = pv ? pv.phys : null, indoor = 1 - (env.inside || 0) * 0.85;
    const slots = VOICES - n;
    let used = 0, near0 = 0;
    const fx = FWD.x, fz = FWD.z, fl = Math.hypot(fx, fz) || 1;
    for (let i = 0; i < this.cands.length && used < slots; i++) {
      const c = this.cands[i], o = c.obj;
      const x = o.x, z = o.z, dx0 = x - cp.x, dz0 = z - cp.z, d = Math.hypot(dx0, dz0) + 0.1;
      let s = this.states.get(c.id); if (!s) { s = newState(); this.states.set(c.id, s); }
      s.seen = this.tickN;
      // velocity from movement (works for traffic, police and remote players alike)
      if (Number.isFinite(s.px)) { const k = Math.min(1, step * 10); s.vx += ((x - s.px) / step - s.vx) * k; s.vz += ((z - s.pz) / step - s.vz) * k; }
      s.px = x; s.pz = z;
      const ph = c.kind === 'veh' ? o.phys : c.kind === 'traffic' ? o.phys : null;
      const speed = c.kind === 'remote' ? Math.max(0, o.speedNet ?? Math.hypot(s.vx, s.vz)) : (o.speed ?? Math.hypot(s.vx, s.vz));
      const pr = soundProfile(c.def);
      const lod = d < 28 && near0 < 3 ? 0 : d < 75 ? 1 : 2;
      if (lod === 0) near0++;
      if (lod === 2 && s.cache && (this.tickN + i) % 3 !== 0) { this.params.set(s.cache, used * STRIDE + n * STRIDE); const b = (n + used) * STRIDE; this.params[b + P.pan] = clamp((dx0 * RIGHT.x + dz0 * RIGHT.z) / d, -1, 1); used++; continue; }
      const acc = clamp((speed - s.prevSpeed) / step, -8, 8); s.prevSpeed = speed; s.acc += (acc - s.acc) * 0.25;
      let fr;
      if (o.isBoat) fr = { rpm: ph?.rpm || 900, gear: 1 };
      else if (ph && ph.rpm !== undefined && c.kind === 'veh') fr = { rpm: ph.rpm, gear: ph.gear ?? 1 };
      else fr = fakeRpm(c.def, speed, pr);
      // gear changes of other cars: a short fuel cut and clunk, only worth it nearby
      let shift = 0;
      if (lod < 2 && fr.gear !== s.prevGear && speed > 1.5) { s.shiftT = 0.2; s.shiftDir = fr.gear > s.prevGear ? 1 : -1; }
      s.prevGear = fr.gear;
      if (s.shiftT > 0) { s.shiftT -= step; shift = s.shiftDir * 0.6 * pr.shift; }
      const dxn = dx0 / d, dzn = dz0 / d;
      const radial = (s.vx - (cv ? cv.vx : 0)) * dxn + (s.vz - (cv ? cv.vz : 0)) * dzn;
      const dop = 343 / (343 + clamp(radial, -60, 60));
      const load = s.acc < -1.2 ? 0.03 : clamp(0.18 + Math.max(0, s.acc) * 0.16 + (speed > 1 ? 0.1 : 0), 0.1, 1);
      s.loadSm += (load - s.loadSm) * 0.3;
      const g = Math.min(0.55, 9 / (d + 6)) / (1 + (d / 110) ** 2) * pr.loud * (interior ? 0.8 : 1) * indoor;
      if (g < 0.015) continue;
      const front = (dx0 * FWD.x + dz0 * FWD.z) / (d * fl);       // behind the listener is duller
      const lp = clamp(1 - d / 160, 0.12, 0.85) * (interior ? 0.55 : 1) * (0.72 + 0.28 * (front * 0.5 + 0.5));
      const wet = game.sky.wetness || 0;
      const tire = lod < 2 && !o.isBoat && c.kind !== 'air' ? clamp(speed / 28, 0, 1) ** 1.3 * 0.05 * pr.tire * (1 + wet * 0.9) : 0;
      const slot = n + used;
      this.put(slot, {
        prof: pr, rpm: fr.rpm * dop, load: s.loadSm, gain: g, pan: clamp(dxn * RIGHT.x + dzn * RIGHT.z, -1, 1), lp, shift,
        whine: lod === 0 ? 0.1 * s.loadSm : 0, whineHz: speed * 24 + 120, tire, tireHz: 350 + speed * 24 + wet * 500, chain: pr.bike && lod === 0 ? clamp(speed / 25, 0, 1) * pr.chain * 0.8 : 0,
        turbo: pr.turbo ? clamp(s.loadSm * fr.rpm / pr.redline, 0, 1) * pr.turboVol * 0.6 : 0, lod,
      });
      if (lod === 2) { if (!s.cache) s.cache = new Float32Array(STRIDE); s.cache.set(this.params.subarray(slot * STRIDE, slot * STRIDE + STRIDE)); }
      used++;
    }
    // a vehicle the player just left: engine winds down for a second
    const gh = this.ghost;
    if (gh && n + used < VOICES) {
      gh.t += step;
      const u = clamp(gh.t / 0.9, 0, 1), pr = soundProfile(gh.def), dx0 = gh.x - cp.x, dz0 = gh.z - cp.z, d = Math.hypot(dx0, dz0) + 0.1;
      if (u >= 1) this.ghost = null;
      else this.put(n + used, { prof: pr, rpm: Math.max(60, gh.rpm * (1 - u) ** 2), load: 0, gain: Math.min(0.55, 9 / (d + 6)) * (1 - u) ** 1.4 * 0.9, pan: clamp((dx0 * RIGHT.x + dz0 * RIGHT.z) / d, -1, 1), lp: 0.8, lod: 0 });
    }
    if (this.states.size > 160) for (const [id, s] of this.states) if (this.tickN - s.seen > 400) this.states.delete(id);
    A.bankNode.port.postMessage({ p: this.params });
  }

  // nearest engines around the camera (refreshed a few times a second; the per-voice work above runs at 40 Hz)
  scan(game, cp) {
    const cand = [];
    const pv = game.player.vehicle;
    for (const v of game.vehicles) {
      if (v === pv || (v.driver === null && v.speed < 0.3)) continue;
      const dx = v.x - cp.x, dz = v.z - cp.z, d2 = dx * dx + dz * dz;
      if (d2 < 140 * 140) cand.push({ def: v.def, obj: v, kind: 'veh', d2, id: v.id });
    }
    if (game.traffic) for (const c of game.traffic.cars) {
      if (c.state === 'parked') continue;
      const dx = c.x - cp.x, dz = c.z - cp.z, d2 = dx * dx + dz * dz;
      if (d2 < 110 * 110) cand.push({ def: c.def, obj: c, kind: 'traffic', d2, id: c.id });
    }
    const rem = game.remotes?.list;
    if (rem) for (const r of rem.values()) {
      if (r.foot || !r.def) continue;      // a player on foot or swimming has no engine
      const dx = r.x - cp.x, dz = r.z - cp.z, d2 = dx * dx + dz * dz;
      if (d2 < 140 * 140) cand.push({ def: r.def, obj: r, kind: 'remote', d2, id: 'r' + r.id });
    }
    cand.sort((a, b) => a.d2 - b.d2);
    this.cands = cand.slice(0, 16);
  }

  // ------------------------------------------------------------------ tyres, road, wind, brakes, spray
  rolling(game, dt, pv, mode, env) {
    const A = this.A, L = A.L, t = A.ctx.currentTime, V = this.view;
    const set = (g, v, tc = 0.06) => g.gain.setTargetAtTime(v, t, tc);
    const freq = (n, f, tc = 0.1) => n.frequency.setTargetAtTime(f, t, tc);
    const wetSky = game.sky.wetness || 0, rain = A.zone.rain || 0;
    if (!pv) { for (const k of ['wind', 'road', 'squeal', 'grit', 'spray', 'brake', 'wake']) set(L[k].out, 0, 0.1); A.state.skid = 0; return; }
    const ph = pv.phys, prof = soundProfile(pv.def), sp = ph.speed || 0;
    const bike = prof.bike, boat = !!pv.isBoat, interior = mode === 'cockpit' && !bike && !boat && !pv.isAir;
    const cabinK = interior ? 0.55 : 1;
    // wind: louder on a bike, rises with speed, shaped by the apparent wind on sailboats
    const spW = ph.sail ? ph.aws * 3.4 : sp;
    const wind = clamp((spW - 8) / 55, 0, 1) ** 1.6;
    set(L.wind.out, wind * 0.65 * cabinK * prof.wind * (rain > 0.5 ? 1.1 : 1) * (bike && mode === 'cockpit' ? 1.15 : 1));
    freq(L.wind.lp, 500 + spW * 26 * (interior ? 0.8 : 1));
    if (boat) {
      set(L.road.out, clamp(sp / 22, 0, 1) * (0.25 + 0.3 * ph.planing) * cabinK * (ph.wetN > 0 ? 1 : 0.15)); freq(L.road.lp, 700 + sp * 70 + ph.planing * 500);
      // hull wash: only while the hull is in the water
      set(L.wake.out, clamp(sp / 24, 0, 1) * (0.1 + 0.5 * ph.planing) * cabinK * (ph.wetN > 0 ? 1 : 0), 0.15); freq(L.wake.hp, 1200 + sp * 60, 0.2);
      for (const k of ['squeal', 'grit', 'spray', 'brake']) set(L[k].out, 0, 0.1);
      A.state.skid = 0;
      return;
    }
    set(L.wake.out, 0, 0.1);
    if (pv.isAir) { for (const k of ['road', 'squeal', 'grit', 'spray', 'brake', 'wake']) set(L[k].out, 0, 0.1); A.state.skid = 0; return; }
    // surface under the front and rear tyres, blended
    const sf = SURFACE_SOUND[ph.surfF] || ROAD, sr = SURFACE_SOUND[ph.surfR] || ROAD;
    const mix = (key) => (sf[key] + sr[key]) * 0.5;
    const hard = mix('hard');
    const wet = clamp(Math.max(wetSky * 0.85, rain * 0.9) * (0.35 + 0.65 * hard), 0, 1);       // wet tarmac swishes, wet grass hardly does
    const ground = ph.onGround ? 1 : 0;
    const roadK = clamp(sp / 35, 0, 1) ** 1.15;
    const alat = clamp(Math.abs(ph.alat || 0) / 9, 0, 1);
    const tireV = prof.tire * (1 + alat * 0.35);
    set(L.road.out, roadK * mix('road') * (1 + wet * 0.45) * (1 + alat * 0.5) * cabinK * tireV * (0.15 + 0.85 * ground) * (interior ? 1.15 : 1));
    freq(L.road.lp, (mix('roadLp') + sp * mix('roadSp')) * (1 + wet * 0.6) * (interior ? 0.75 : 1));
    // grip loss: squeal on hard surfaces (higher and thinner when wet, lower and rougher in a full slide), stones and dust thrown on loose ones
    const slip = clamp(Math.max(ph.skidF * 0.6, ph.skidR), 0, 1) * ground;
    const sq = slip * mix('squeal') * (1 - 0.3 * wet);
    set(L.squeal.out, sq * sq * 0.5 * (interior ? 0.6 : 1) * tireV, 0.04);
    const fs = (900 + clamp(sp / 40, 0, 1) * 800 + (ph.slipAngle || 0) * 900 + Math.sin(t * 37) * 40 * sq) * (1 + wet * 0.12) * (1 - 0.25 * clamp(slip - 0.7, 0, 0.3) * 3);
    freq(L.squeal.bp, fs, 0.03); freq(L.squeal.bp2, fs * 1.9 + Math.sin(t * 21) * 60, 0.03);
    const loose = 1 - hard;
    const gr = mix('grit') * clamp(sp / 25, 0, 1) * ground * (0.4 + slip * 0.9) + loose * slip * 0.35 + hard * slip * 0.12;
    set(L.grit.out, gr * 0.6 * cabinK * tireV, 0.08); freq(L.grit.lp, mix('gritLp') + sp * mix('gritSp'));
    // water thrown up by the tyres: wet roads, puddles, shallows
    const spray = clamp(sp / 30, 0, 1) ** 1.2 * (wet * mix('spray') * 0.3 + (sf.spray > 1.5 || sr.spray > 1.5 ? 0.35 : 0)) * ground;
    set(L.spray.out, spray * cabinK * tireV * (interior ? 0.7 : 1), 0.12); freq(L.spray.hp, 1700 + sp * 22, 0.2);
    // brakes: pad hiss, plus a thin squeal when stopping hard at low speed
    const brk = clamp(ph.brkIn || 0, 0, 1);
    const lowSq = brk > 0.6 && sp > 1.5 && sp < 9 ? (brk - 0.6) * 0.9 : 0;
    set(L.brake.out, (brk * clamp(sp / 22, 0, 1) ** 0.7 * (sp > 2 ? 1 : 0) * 0.1 + lowSq * 0.12) * (interior ? 0.4 : 1) * ground, 0.07);
    freq(L.brake.bp, lowSq > 0 ? 1700 + sp * 90 : 3600 + sp * 40, 0.08);
    A.state.skid = sq;
    this.info.surf = ph.surfF; this.info.wet = +wet.toFixed(2);
  }
}
