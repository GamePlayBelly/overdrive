import * as THREE from 'three';
import { buildHuman, poseFor, applyPose, blendPose, bakeRig, REST, DEFAULT_LOOK } from './human.js';
import { clamp, damp, dampAngle, wrapAngle, lerp, smooth } from '../core/math.js';
import { obbVsCircle } from '../world/collision.js';
import { WATER_LEVEL } from '../data/world.js';
import { SURF } from '../world/terrain.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ease = (t) => t * t * (3 - 2 * t);
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

// On-foot controller plus the scripted get-in / get-out sequences (walk to the door, door swings, sit, door closes).
export class Player {
  constructor(game, look = DEFAULT_LOOK) {
    this.game = game;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.speed = 0;
    this.vehicle = null;
    this.state = 'foot';
    this.anim = 'idle'; this.animT = 0; this.phase = 0;
    this.pose = { ...REST };
    this.emote = null;
    this.stamina = 1;
    this.seq = null;
    this.onGround = true;
    this.closeDoor = null;
    this.bust = null; this.bustPose = null;
    this.wade = 0; this.swimPh = 0; this.vyS = 0; this.dive = 0; this.o2 = 1; this.choke = false; this.pitchS = 0; this.cur = { x: 0, z: 0 };
    this.setLook(look);
  }

  get busy() { return !!this.seq; }
  get pos() { return new THREE.Vector3(this.x, this.y, this.z); }

  setLook(look) {
    if (this.rig) this.game.scene.remove(this.rig.root);
    if (this.bust) { this.bust.parent?.remove(this.bust); this.bust = null; }
    this.look = { ...DEFAULT_LOOK, ...look };
    this.rig = buildHuman(this.look);
    this.rig.root.rotation.order = 'YXZ';
    this.game.scene.add(this.rig.root);
    this.rig.root.visible = !this.vehicle;
    this.bustSrc = null;
    if (this.vehicle) this.attachBust(this.vehicle);
  }

  place(x, z, yaw = 0) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.y = this.game.world.groundY(x, z, 50);
    this.vx = this.vz = this.vy = 0;
  }

  // --------------------------------------------------------------- vehicle geometry helpers
  seatPose(v) { return v.isBoat || v.isAir ? v.car.geo.seat.pose || 'drive' : 'drive'; }

  seatLocal(v) {
    if (v.isBoat || v.isAir) { const s = v.car.geo.seat; return { x: s.x, y: s.y, z: s.z }; }
    const g = v.car.geo, b = v.def.body;
    const bike = b.style === 'bike';
    const sill = g.P ? g.P.bottom(0.5) + 0.1 : 0.25;
    if (bike) return { x: 0, y: 0.32, z: g.seat.z - 0.05 };
    return { x: g.seat.x * (b.W / 1.84), y: sill - 0.06, z: g.seat.z - 0.05 };
  }

  doorInfo(v, side) {
    const b = v.def.body, sp = v.car.split?.spec, sgn = side === 'L' ? 1 : -1;
    const P = v.car.geo.P;
    const zm = sp ? (sp.z0 + sp.z1) / 2 - 0.05 : v.car.geo.seat.z + 0.2;
    const w = P ? P.halfW(P.tOf(zm)) : b.W / 2;
    return { sgn, zm, w, hasPanel: !!v.car.panels?.['door' + side] };
  }

  world(v, lx, ly, lz, out = new THREE.Vector3()) {
    v.group.updateMatrixWorld();
    return out.set(lx, ly, lz).applyMatrix4(v.group.matrixWorld);
  }

  attachBust(v) {
    const seat = this.seatLocal(v), pose = this.seatPose(v);
    if (this.bust && this.bustPose !== pose) { this.bust.parent?.remove(this.bust); this.bust = null; }
    if (!this.bust) {
      this.bust = bakeRig(this.rig, poseFor(pose, 0, 0));
      this.bustPose = pose;
      this.bust.traverse((o) => { o.castShadow = false; });
    }
    v.group.add(this.bust);
    this.bust.position.set(seat.x, seat.y, seat.z);
    this.bust.rotation.set(0, 0, 0);
    this.bust.visible = true;
  }
  detachBust() { if (this.bust) this.bust.parent?.remove(this.bust); }

  // --------------------------------------------------------------- instant swaps (spawn, teleport, tests)
  enter(v) {
    this.seq = null;
    this.vehicle = v;
    v.driver = this;
    this.rig.root.visible = false;
    this.state = 'driving';
    this.attachBust(v);
    v.setDoor?.('L', false); v.setDoor?.('R', false);
    this.game.audio?.engineStart?.(v);
  }

  exit() {
    const v = this.vehicle;
    if (!v) return;
    if (v.isBoat) {
      const to = this.findLanding(v);
      v.driver = null; v.input = { throttle: 0, brake: 0, steer: 0, hand: false, boost: false };
      v.moor = { x: v.x, z: v.z, yaw: v.yaw };
      this.detachBust(); this.vehicle = null;
      this.place(to.x, to.z, v.yaw); this.y = to.y;
      this.state = to.swim ? 'swim' : 'foot';
      return;
    }
    const side = 'L';
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    const off = v.hz + 0.55;
    let x = v.group.position.x + c * off, z = v.group.position.z - s * off;
    if (this.game.world.colliders && blocked(this.game, x, z, v.y)) { x = v.group.position.x - c * off; z = v.group.position.z + s * off; }
    v.driver = null;
    v.input = { throttle: 0, brake: 0.6, steer: 0, hand: true, boost: false };
    this.detachBust();
    this.vehicle = null;
    this.state = 'foot';
    this.place(x, z, v.yaw);
    this.y = Math.max(this.y, v.y);
    void side;
  }

  // --------------------------------------------------------------- scripted sequences
  tryEnter(v) {
    if (this.seq || this.vehicle || !v) return false;
    if (v.isBoat) return this.tryBoard(v);
    if (v.isAir) { if (v.speed > 4 || v.distTo(this.x, this.z) > 6.5) return false; v.driver = this; this.enter(v); this.game.rig.snapBehind(); return true; }
    if (v.speed > 2.5) return false;
    const b = v.def.body;
    const bike = b.style === 'bike';
    // pick the nearest door
    const dl = this.doorInfo(v, 'L'), dr = this.doorInfo(v, 'R');
    const sideDist = (d) => { const p = this.world(v, d.sgn * (d.w + 0.7), 0, d.zm); return Math.hypot(p.x - this.x, p.z - this.z); };
    const side = bike || sideDist(dl) <= sideDist(dr) + 1.2 ? 'L' : 'R';
    const d = side === 'L' ? dl : dr;
    const A = this.world(v, d.sgn * (d.w + 0.66), 0, d.zm);
    const dist = Math.hypot(A.x - this.x, A.z - this.z);
    if (dist > 7) return false;
    const walk = dist < 0.7 ? 0.05 : clamp(dist / 3.9, 0.15, 1.2);
    v.driver = this;
    v.input = { throttle: 0, brake: 0.6, steer: 0, hand: true, boost: false };
    this.seq = { kind: 'enter', t: 0, v, side, d, walk, from: { x: this.x, y: this.y, z: this.z, yaw: this.yaw }, opened: false, closed: false, camSet: false };
    this.state = 'entering';
    this.emote = null;
    return true;
  }

  tryExit() {
    const v = this.vehicle;
    if (this.seq || !v) return false;
    if (v.isBoat) return this.tryUnboard(v);
    if (v.isAir) { if (v.phys.agl > 1.5 || v.speed > 8) { this.game.emit('hud:toast', { text: 'Land first' }); return false; } this.exit(); return true; }
    if (v.speed > 9) return false;
    const side = 'L';
    const d = this.doorInfo(v, side);
    this.seq = { kind: 'exit', t: 0, v, side, d, walk: 0, opened: false, closed: false, camSet: false, released: false };
    this.state = 'exiting';
    v.input = { throttle: 0, brake: 0.7, steer: 0, hand: v.speed < 3, boost: false };
    if (this.bust) this.bust.visible = false;
    this.rig.root.visible = true;
    this.poseIn(v);
    return true;
  }

  poseIn(v) {
    const seat = this.seatLocal(v);
    const p = this.world(v, seat.x, seat.y, seat.z, _w);
    this.rig.root.position.copy(p);
    this.rig.root.rotation.set(v.group.rotation.x, v.group.rotation.y, v.group.rotation.z);
    applyPose(this.rig, poseFor(this.seatPose(v), 0, 0));
  }

  // sit-in progress u: 0 standing beside the door, 1 seated. Fills root position / yaw / pose.
  seatBlend(seq, u, dt) {
    const v = seq.v, d = seq.d, g = this.game;
    const seat = this.seatLocal(v);
    const A = this.world(v, d.sgn * (d.w + 0.66), 0, d.zm, _v);
    const Ay = g.world.groundY(A.x, A.z, v.y + 1.5);
    const T = this.world(v, d.sgn * (d.w * 0.62), 0.0, d.zm - 0.12, _w);
    const Tx = T.x, Ty = v.y + seat.y + 0.12, Tz = T.z;
    const S = this.world(v, seat.x, seat.y, seat.z, new THREE.Vector3());
    const u1 = ease(clamp(u * 1.6, 0, 1)), u2 = ease(clamp(u * 1.6 - 0.6, 0, 1));
    const ax = A.x, az = A.z;
    let x = lerp(ax, Tx, u1), z = lerp(az, Tz, u1), y = lerp(Ay, Ty, u1) + Math.sin(u1 * Math.PI) * 0.1;
    x = lerp(x, S.x, u2); z = lerp(z, S.z, u2); y = lerp(y, S.y, u2);
    const faceIn = v.yaw - d.sgn * Math.PI / 2;
    const yaw = faceIn + wrapAngle(v.yaw - faceIn) * ease(clamp((u - 0.25) / 0.6, 0, 1));
    this.rig.root.position.set(x, y, z);
    this.rig.root.rotation.set(v.group.rotation.x * u2, yaw, v.group.rotation.z * u2);
    const stand = poseFor('idle', this.animT, 0, 1), sit = poseFor('sit', this.animT, 0, 1);
    const p = blendPose(stand, sit, ease(clamp((u - 0.15) / 0.75, 0, 1)), this.pose);
    const duck = Math.sin(clamp(u * 1.25, 0, 1) * Math.PI);
    p.lean += duck * 0.38; p.headX -= duck * 0.28; p.knL += duck * 0.15;
    // outer leg swings in first
    p.hpLx -= duck * 0.25 * d.sgn;
    if (u > 0.85) { const k = ease((u - 0.85) / 0.15), dr = poseFor('drive', this.animT, 0, 1); blendPose(p, dr, k, p); }
    applyPose(this.rig, p);
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    void dt;
  }

  updateSeq(dt) {
    const q = this.seq, v = q.v, g = this.game, rig = g.rig;
    q.t += dt;
    const t = q.t;
    if (q.kind === 'board') return this.updateBoard(q, dt);
    if (q.kind === 'mantle') return this.updateMantle(q, dt);
    if (q.kind === 'unboard' || q.kind === 'climb') return this.updateHop(q, dt);
    if (q.kind === 'enter') {
      const walk = q.walk, tOpen = walk - 0.12, tSit0 = walk + 0.12, tSit1 = walk + 0.62, tClose = walk + 0.56, tEnd = walk + 0.86;
      const d = q.d;
      if (t < walk) {
        // walk to the approach point beside the door
        const A = this.world(v, d.sgn * (d.w + 0.66), 0, d.zm, _v);
        const u = ease(seg(t, 0, walk));
        const x = lerp(q.from.x, A.x, u), z = lerp(q.from.z, A.z, u);
        const dx = A.x - this.x, dz = A.z - this.z;
        if (Math.hypot(dx, dz) > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt);
        this.x = x; this.z = z; this.y = g.world.groundY(x, z, this.y + 1);
        this.speed = 4.2;
        this.phase += (this.speed / 2.2) * Math.PI * dt;
        const tp = poseFor('run', this.animT, this.phase, 1);
        blendPose(this.pose, tp, 1 - Math.exp(-dt * 14), this.pose); applyPose(this.rig, this.pose);
        this.rig.root.position.set(this.x, this.y, this.z); this.rig.root.rotation.set(0, this.yaw, 0);
      } else if (t < tSit0) {
        const A = this.world(v, d.sgn * (d.w + 0.66), 0, d.zm, _v);
        this.x = A.x; this.z = A.z; this.y = g.world.groundY(A.x, A.z, v.y + 1);
        const faceIn = v.yaw - d.sgn * Math.PI / 2;
        this.yaw = dampAngle(this.yaw, faceIn, 14, dt);
        blendPose(this.pose, poseFor('idle', this.animT, 0, 1), 1 - Math.exp(-dt * 16), this.pose);
        // reach for the handle
        this.pose.shLx = -0.7; this.pose.elL = -0.6;
        applyPose(this.rig, this.pose);
        this.rig.root.position.set(this.x, this.y, this.z); this.rig.root.rotation.set(0, this.yaw, 0);
      }
      if (t >= tOpen && !q.opened) { q.opened = true; v.setDoor(q.side, true); g.emit('vehicle:door', { v, open: true, side: q.side }); }
      if (t >= tSit0) this.seatBlend(q, ease(seg(t, tSit0, tSit1)), dt);
      if (t >= tClose && !q.closed) { q.closed = true; v.setDoor(q.side, false); q.slam = true; }
      if (q.slam && v.doorOpen(q.side) <= 0.02) { q.slam = false; g.emit('vehicle:door', { v, open: false, side: q.side, slam: true }); }
      // cinematic camera: pull to a three-quarter view of the door while getting in
      if (!q.camSet && t >= Math.max(0, walk - 0.3)) {
        q.camSet = true;
        const sgn = d.sgn;
        rig.cinematic({ from: (tt) => this.world(v, sgn * 3.4, 1.55, d.zm + 1.6 - Math.min(1.3, tt * 0.9), new THREE.Vector3()), target: () => this.world(v, sgn * 0.3, 0.9, d.zm - 0.1, new THREE.Vector3()), fov: 55, snap: 3.4, dur: 0 });
      }
      if (t >= tEnd) this.finishEnter(q);
    } else {
      // exit
      const tOpen = 0.32, tOut0 = 0.1, tOut1 = 0.62, tWalk = 0.62, tEnd = 0.98;
      const d = q.d;
      if (!q.opened) { q.opened = true; v.setDoor(q.side, true); g.emit('vehicle:door', { v, open: true, side: q.side }); }
      if (t < tOut0) { const dr = poseFor('drive', this.animT, 0, 1); blendPose(this.pose, poseFor('sit', this.animT, 0, 1), ease(seg(t, 0, tOut0)) * 0.6, this.pose); void dr; applyPose(this.rig, this.pose); this.poseIn(v); }
      else if (t < tOut1) this.seatBlend(q, 1 - ease(seg(t, tOut0, tOut1)), dt);
      if (t >= tOut1) {
        // step away from the door
        const A = this.world(v, d.sgn * (d.w + 0.66), 0, d.zm, _v);
        const u = ease(seg(t, tWalk, tEnd));
        const ox = A.x + Math.sin(v.yaw) * 0 + Math.cos(v.yaw) * d.sgn * 0.5 * u, oz = A.z - Math.sin(v.yaw) * d.sgn * 0.5 * u;
        this.x = ox; this.z = oz; this.y = g.world.groundY(ox, oz, v.y + 1.5);
        const away = v.yaw + d.sgn * Math.PI / 2 * 0;
        this.yaw = dampAngle(this.yaw, away, 6, dt);
        this.speed = 1.8 * (1 - u * 0.4);
        this.phase += (this.speed / 1.45) * Math.PI * dt;
        blendPose(this.pose, poseFor('walk', this.animT, this.phase, 0.7), 1 - Math.exp(-dt * 10), this.pose); applyPose(this.rig, this.pose);
        this.rig.root.position.set(this.x, this.y, this.z); this.rig.root.rotation.set(0, this.yaw, 0);
      }
      if (!q.camSet && t >= 0.05) {
        q.camSet = true;
        const sgn = d.sgn;
        rig.cinematic({ from: (tt) => this.world(v, sgn * (3.3 + tt * 0.5), 1.6 - tt * 0.2, d.zm + 1.5 - tt * 0.8, new THREE.Vector3()), target: () => this.world(v, sgn * 0.6, 0.95, d.zm, new THREE.Vector3()), fov: 54, snap: 3.6, dur: 0 });
      }
      if (t >= tOpen + 0.5 && !q.closed && t >= 0.95) { /* door stays open until the player walks away */ }
      if (t >= tEnd && !q.released) this.finishExit(q);
    }
  }

  finishEnter(q) {
    const v = q.v, g = this.game;
    this.seq = null;
    this.vehicle = v;
    v.driver = this;
    this.rig.root.visible = false;
    this.attachBust(v);
    this.state = 'driving';
    v.input = { throttle: 0, brake: 0, steer: 0, hand: false, boost: false };
    g.rig.cine = null;
    g.rig.snapBehind();
    g.rig.settle = 0.9;
    g.emit('player:entered', { v });
    g.audio?.engineStart?.(v);
  }

  finishExit(q) {
    const v = q.v, g = this.game;
    q.released = true;
    this.seq = null;
    v.driver = null;
    v.input = { throttle: 0, brake: 0.6, steer: 0, hand: true, boost: false };
    this.vehicle = null;
    this.state = 'foot';
    this.vx = this.vz = 0;
    this.closeDoor = { v, side: q.side, t: 0 };
    g.rig.cine = null;
    g.rig.footYaw = v.yaw + q.d.sgn * Math.PI / 2 * 0 + Math.PI * (q.d.sgn > 0 ? 0.5 : -0.5) + Math.PI;
    g.rig.footYaw = this.yaw;
    g.rig.settle = 1.1;
    g.emit('player:exited', { v });
  }

  // --------------------------------------------------------------- boats: boarding, leaving, swimming
  tryBoard(v) {
    if (v.speed > 4.5 || v.sunk) return false;
    if (v.distTo(this.x, this.z) > 7.5) return false;
    const seat = this.seatLocal(v), S = this.world(v, seat.x, seat.y, seat.z, new THREE.Vector3());
    const d = Math.hypot(S.x - this.x, S.z - this.z);
    v.driver = this; v.moor = null;
    v.input = { throttle: 0, brake: 0, steer: 0, hand: false, boost: false };
    this.seq = { kind: 'board', t: 0, v, from: { x: this.x, y: this.y, z: this.z, yaw: this.yaw }, dur: clamp(0.7 + d * 0.07, 0.8, 1.7), camSet: false };
    this.state = 'entering'; this.emote = null;
    return true;
  }

  tryUnboard(v) {
    if (v.speed > 7) return false;
    const to = this.findLanding(v);
    const seat = this.seatLocal(v), S = this.world(v, seat.x, seat.y, seat.z, new THREE.Vector3());
    const d = Math.hypot(S.x - to.x, S.z - to.z);
    this.seq = { kind: 'unboard', t: 0, v, to, dur: clamp(0.75 + d * 0.08, 0.85, 1.6), camSet: false };
    this.state = 'exiting';
    v.input = { throttle: 0, brake: 0, steer: 0, hand: false, boost: false };
    if (this.bust) this.bust.visible = false;
    this.rig.root.visible = true;
    this.poseIn(v);
    return true;
  }

  // nearest solid footing around the hull (dock, shore, shallows); open water means a dive off the side
  findLanding(v) {
    const g = this.game, W = g.world, seat = this.seatLocal(v);
    const S = this.world(v, seat.x, seat.y, seat.z, new THREE.Vector3());
    let best = null, bs = 1e9;
    for (const off of [1.1, 2.3, 3.8, 5.6]) for (let a = 0; a < 28; a++) {
      const ang = (a / 28) * Math.PI * 2;
      const p = this.world(v, Math.cos(ang) * (v.hz + off), 0, Math.sin(ang) * (v.hx + off * 0.7), new THREE.Vector3());
      const gr = W.ground(p.x, p.z, v.y + 3);
      const wy = W.sea ? W.sea.waveAt(p.x, p.z) : WATER_LEVEL;
      let y = gr.y, footing = gr.deck || gr.y > WATER_LEVEL + 0.45;
      if (!footing) { const bed = W.terrain.height(p.x, p.z); if (wy - bed < 0.9) { footing = true; y = bed; } }
      if (!footing || blocked(g, p.x, p.z, y)) continue;
      const dh = y - (v.y + seat.y);
      if (dh > 2.6) continue;
      const score = Math.hypot(p.x - S.x, p.z - S.z) + Math.max(0, dh) * 1.4;
      if (score < bs) { bs = score; best = { x: p.x, y, z: p.z, swim: false }; }
    }
    if (best) return best;
    const side = this.world(v, v.hz + 1.1, 0, seat.z, new THREE.Vector3());
    return { x: side.x, z: side.z, y: (W.sea ? W.sea.waveAt(side.x, side.z) : WATER_LEVEL) - 1.05, swim: true };
  }

  updateBoard(q, dt) {
    const v = q.v, g = this.game, rig = g.rig;
    const u = ease(clamp(q.t / q.dur, 0, 1));
    const seat = this.seatLocal(v), S = this.world(v, seat.x, seat.y, seat.z, _v);
    const face = Math.atan2(S.x - q.from.x, S.z - q.from.z);
    const dy = S.y - q.from.y;
    const x = lerp(q.from.x, S.x, u), z = lerp(q.from.z, S.z, u);
    const y = lerp(q.from.y, S.y, u) + Math.sin(u * Math.PI) * (0.6 + Math.abs(dy) * 0.12);
    this.yaw = dampAngle(this.yaw, u < 0.65 ? face : v.yaw, 12, dt);
    this.x = x; this.y = y; this.z = z;
    this.phase += 9 * dt;
    const run = poseFor('run', this.animT, this.phase, 1), sit = poseFor(this.seatPose(v), this.animT, 0, 1);
    blendPose(run, sit, ease(clamp((u - 0.55) / 0.4, 0, 1)), this.pose);
    this.pose.knL += Math.sin(u * Math.PI) * 0.5; this.pose.knR += Math.sin(u * Math.PI) * 0.5;
    applyPose(this.rig, this.pose);
    this.rig.root.position.set(x, y, z);
    this.rig.root.rotation.set(v.group.rotation.x * u, this.yaw, v.group.rotation.z * u);
    if (!q.camSet) {
      q.camSet = true;
      const lx = (this.x - v.x) * Math.cos(v.yaw) - (this.z - v.z) * Math.sin(v.yaw), sgn = lx >= 0 ? 1 : -1;
      rig.cinematic({ from: (tt) => this.world(v, sgn * (v.hz + 3.6), 2.0 + v.dims.H * 0.3, -v.hx * 0.4 - tt * 0.6, new THREE.Vector3()), target: () => this.world(v, 0, 0.9 + v.dims.H * 0.15, 0, new THREE.Vector3()), fov: 52, snap: 7, dur: 0 });
    }
    if (q.t >= q.dur) { q.t = q.dur; this.finishEnter(q); }
  }

  updateHop(q, dt) {
    const g = this.game, rig = g.rig, v = q.v;
    const u = ease(clamp(q.t / q.dur, 0, 1));
    let from = q.from;
    if (q.kind === 'unboard') {
      const seat = this.seatLocal(v), S = this.world(v, seat.x, seat.y, seat.z, _v);
      from = { x: S.x, y: S.y, z: S.z };
    }
    const T = q.to;
    const face = Math.atan2(T.x - from.x, T.z - from.z);
    const x = lerp(from.x, T.x, u), z = lerp(from.z, T.z, u);
    const y = lerp(from.y, T.y, u) + Math.sin(u * Math.PI) * (q.kind === 'climb' ? 0.7 : 0.75);
    this.yaw = dampAngle(this.yaw, face, 12, dt);
    this.x = x; this.y = y; this.z = z;
    this.phase += 9 * dt;
    if (q.kind === 'unboard') {
      blendPose(poseFor(this.seatPose(v), this.animT, 0, 1), poseFor('run', this.animT, this.phase, 1), ease(clamp(u * 2.2, 0, 1)), this.pose);
      if (T.swim && u > 0.7) blendPose(this.pose, poseFor('tread', this.animT, 0, 1), ease((u - 0.7) / 0.3), this.pose);
    } else blendPose(poseFor('run', this.animT, this.phase, 1), poseFor('idle', this.animT, 0, 1), ease(clamp((u - 0.5) / 0.5, 0, 1)), this.pose);
    this.pose.knL += Math.sin(u * Math.PI) * 0.4; this.pose.knR += Math.sin(u * Math.PI) * 0.4;
    applyPose(this.rig, this.pose);
    this.rig.root.position.set(x, y, z);
    this.rig.root.rotation.set(0, this.yaw, 0);
    if (q.kind === 'unboard' && !q.camSet) {
      q.camSet = true;
      const side = (T.x - v.x) * Math.cos(v.yaw) - (T.z - v.z) * Math.sin(v.yaw) > 0 ? 1 : -1;
      rig.cinematic({ from: (tt) => this.world(v, side * (v.hz + 4.2), 2.3 + v.dims.H * 0.3, -v.hx * 0.3 - tt * 0.5, new THREE.Vector3()), target: () => this.world(v, 0, 0.8 + v.dims.H * 0.2, 0, new THREE.Vector3()), fov: 52, snap: 7, dur: 0 });
    }
    if (q.t >= q.dur) {
      this.seq = null;
      this.x = T.x; this.z = T.z; this.y = T.y; this.vx = this.vz = 0; this.vyS = 0;
      if (q.kind === 'unboard') {
        v.driver = null; v.input = { throttle: 0, brake: 0, steer: 0, hand: false, boost: false };
        v.moor = { x: v.x, z: v.z, yaw: v.yaw };
        this.vehicle = null;
        rig.cine = null; rig.footYaw = Math.atan2(v.x - T.x, v.z - T.z); rig.settle = 1.0;
        g.emit('player:exited', { v });
      }
      this.state = T.swim ? 'swim' : 'foot';
      if (T.swim) g.emit('player:splash', { x: T.x, y: W_surface(g, T.x, T.z), z: T.z, speed: 5 });
    }
  }

  // ---- jumping, vaulting and climbing ----
  // highest solid top under a point, ignoring anything that does not reach down to roughly foot level
  topAt(x, z, rad, y, maxH) {
    let best = -Infinity;
    this.game.world.colliders.query(x, z, rad + 1, y - 0.2, y + maxH + 0.1, (c) => {
      if (!c.solid || c.removed || c.y0 > y + 0.5) return;
      if (c.type === 'circle') { if (c.r < 0.6 || Math.hypot(x - c.x, z - c.z) > c.r + rad) return; }
      else if (!obbVsCircle(c, { x, z, r: rad })) return;
      if (c.y1 > best) best = c.y1;
    });
    return best;
  }

  // a surface the feet can rest on: a solid top at or just under foot level
  supportAt(x, z, y) {
    let best = -Infinity;
    this.game.world.colliders.query(x, z, 1.2, y - 1.5, y + 0.3, (c) => {
      if (!c.solid || c.removed || c.y0 > y + 0.5 || c.y1 > y + 0.29) return;
      if (c.type === 'circle') { if (c.r < 0.6 || Math.hypot(x - c.x, z - c.z) > c.r + 0.18) return; }
      else if (!obbVsCircle(c, { x, z, r: 0.18 })) return;
      if (c.y1 > best) best = c.y1;
    });
    return best;
  }

  // wall, fence, crate or low roof in front of the player that can be vaulted or climbed; returns the landing point
  ledgeAhead(dx, dz, inAir) {
    const W = this.game.world, y = this.y, maxH = inAir ? 2.5 : 2.15;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const ft = this.topAt(this.x + dx * 0.55, this.z + dz * 0.55, 0.15, y, maxH);
    const h = ft - y;
    if (!(h >= 0.45 && h <= maxH)) return null;
    const clear = (px, pz, base) => {
      let hit = false;
      W.colliders.query(px, pz, 0.7, base + 0.3, base + 1.7, (c) => { if (!c.solid || c.removed) return; if (c.type === 'circle' ? Math.hypot(px - c.x, pz - c.z) < c.r + 0.3 : obbVsCircle(c, { x: px, z: pz, r: 0.3 })) { hit = true; return false; } });
      return !hit;
    };
    let top = null, land = null;
    for (const k of [0.6, 0.9, 1.2, 1.6, 2.0, 2.5, 3.0]) {
      const px = this.x + dx * k, pz = this.z + dz * k, t = this.topAt(px, pz, 0.25, y, maxH);
      if (t > y + 0.4 && t <= y + maxH && !top && clear(px, pz, t)) top = { x: px, y: t, z: pz };
      if (t < y + 0.3 && k > 0.8 && !land) {
        const gr = this.groundAt(px, pz, y + 1);
        if (!gr.deep && Math.abs(gr.y - y) < 1.2 && clear(px, pz, gr.y)) land = { x: px, y: gr.y, z: pz };
      }
    }
    const vault = h <= 1.2 && land;
    const to = vault ? land : top;
    if (!to) return null;
    return { h, vault: !!vault, to };
  }

  startMantle(L, face) {
    const dur = L.vault ? 0.62 : 0.8 + L.h * 0.28;
    this.seq = { kind: 'mantle', t: 0, v: null, from: { x: this.x, y: this.y, z: this.z }, to: L.to, h: L.h, vault: L.vault, dur, sound: false };
    this.state = 'entering'; this.vx = this.vz = this.vy = 0; this.onGround = false; this.yaw = face;
    this.game.emit('player:mantle', { x: this.x, y: this.y, z: this.z, vault: L.vault });
  }

  updateMantle(q, dt) {
    const u = clamp(q.t / q.dur, 0, 1), T = q.to, F = q.from;
    const face = Math.atan2(T.x - F.x, T.z - F.z);
    this.yaw = dampAngle(this.yaw, face, 14, dt);
    let x, y, z, pose, pu;
    if (q.vault) {
      const k = ease(u);
      x = lerp(F.x, T.x, k); z = lerp(F.z, T.z, k);
      y = lerp(F.y, T.y, k) + Math.sin(u * Math.PI) * (q.h * 0.55 + 0.35);
      pose = 'vault'; pu = u;
    } else {
      const rise = ease(seg(u, 0, 0.62)), over = ease(seg(u, 0.5, 1));
      const topY = T.y - 0.05;
      x = lerp(F.x, T.x, over) + (T.x - F.x) * 0.05 * rise; z = lerp(F.z, T.z, over) + (T.z - F.z) * 0.05 * rise;
      y = lerp(F.y, topY, rise) + (T.y - topY) * over;
      pose = 'climb'; pu = u;
    }
    this.x = x; this.y = y; this.z = z;
    this.phase += 11 * dt;
    const target = poseFor(pose, this.animT, this.phase, 1);
    if (!q.vault && u > 0.75) blendPose(target, poseFor('idle', this.animT, 0, 1), ease(seg(u, 0.75, 1)), target);
    blendPose(this.pose, target, 1 - Math.exp(-dt * 18), this.pose);
    applyPose(this.rig, this.pose);
    this.rig.root.position.set(x, y, z);
    this.rig.root.rotation.set(0, this.yaw, 0);
    void pu;
    if (q.t >= q.dur) {
      this.seq = null; this.state = 'foot';
      this.x = T.x; this.z = T.z; this.y = T.y; this.vx = Math.sin(this.yaw) * (q.vault ? 2.2 : 0); this.vz = Math.cos(this.yaw) * (q.vault ? 2.2 : 0); this.vy = 0; this.onGround = true;
      this.game.emit('player:landed', { x: T.x, y: T.y, z: T.z, speed: 2, soft: true });
    }
  }

  // ground under a point, seeing through the sea-surface placeholder to the bed
  groundAt(x, z, yRef) {
    const W = this.game.world, gr = W.ground(x, z, yRef);
    if (gr.deck) return { y: gr.y, deep: false, depth: 0, deck: true };
    if (gr.surf === SURF.WATER) {
      const bed = W.terrain.height(x, z), wy = W.sea ? W.sea.waveAt(x, z) : WATER_LEVEL, depth = wy - bed;
      return { y: bed, deep: depth > (this.state === 'swim' ? 0.85 : 1.15), depth, surface: wy, deck: false };
    }
    return { y: gr.y, deep: false, depth: 0, deck: false };
  }

  startSwim(x, z, surface, speed) {
    this.state = 'swim';
    this.vyS = Math.min(0, this.vy) * 0.6;
    this.vy = 0; this.dive = 0; this.pitchS = 0;
    this.game.emit('player:splash', { x, y: surface, z, speed: Math.max(speed, -this.vyS * 2) });
  }

  // Swimming in three dimensions: strokes build speed slowly and the water holds it, the surface lifts and tilts the body, lungs
  // carry roughly forty seconds, currents and the orbital motion of the waves push, and the seabed stops a dive.
  updateSwim(dt, input, camYaw) {
    const g = this.game, W = g.world, sea = W.sea, wv = sea?.waves;
    const f = input.trigger('throttle') - input.trigger('brake'), sd = input.axis('left', 'right');
    const cy = Math.cos(camYaw), sy = Math.sin(camYaw);
    let mx = sy * f - cy * sd, mz = cy * f + sy * sd;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    const want = Math.min(1, l);
    const fast = input.held('sprint') && this.stamina > 0.05;
    const up = input.held('jump'), down = input.held('dive');
    const surf = sea ? sea.waveAt(this.x, this.z, null) : WATER_LEVEL, surfY = surf - 1.08;
    const sub = this.dive > 0.3;
    // breath: the head under the surface spends it, air refills it
    const headUnder = this.y + 1.45 < surf - 0.06;
    this.o2 = headUnder ? Math.max(0, this.o2 - dt / (fast ? 26 : 45)) : Math.min(1, this.o2 + dt * 0.4);
    if (this.o2 <= 0.001 && !this.choke) { this.choke = true; g.emit('hud:toast', { text: 'Out of breath' }); }
    else if (this.o2 > 0.45) this.choke = false;
    // horizontal: progressive stroke thrust, long glide, current and wave orbit
    const maxV = want > 0 ? (fast ? (sub ? 2.5 : 3.4) : (sub ? 1.5 : 2.0)) : 0;
    const stroke = want > 0 ? 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(this.swimPh * 6.2)) : 1;
    const k = want > 0 ? 2.0 : 1.3, nrm = Math.max(l, 1e-6);
    this.vx = damp(this.vx, want > 0 ? (mx / nrm) * maxV * want * stroke : 0, k, dt);
    this.vz = damp(this.vz, want > 0 ? (mz / nrm) * maxV * want * stroke : 0, k, dt);
    this.stamina = clamp(this.stamina + (fast && want > 0 ? -dt * 0.1 : dt * 0.08), 0, 1);
    this.speed = Math.hypot(this.vx, this.vz);
    let cvx = 0, cvz = 0;
    if (wv) {
      const sh = clamp(1 - this.dive * 0.35, 0.3, 1);
      cvx = Math.cos(wv.dirW) * 0.02 * wv.U * sh; cvz = Math.sin(wv.dirW) * 0.02 * wv.U * sh;
      wv.velocity(this.x, this.z, sea.t - wv.tRef, _v);
      const dec = Math.exp(-this.dive * (6.2832 / Math.max(8, wv.lam)));
      cvx += _v.x * 0.5 * dec; cvz += _v.z * 0.5 * dec;
    }
    this.cur = { x: cvx, z: cvz };
    if (this.speed > 0.25) this.yaw = dampAngle(this.yaw, Math.atan2(this.vx, this.vz), 7, dt);
    let nx = this.x + (this.vx + cvx) * dt, nz = this.z + (this.vz + cvz) * dt;
    const r = 0.32;
    g.world.colliders.query(nx, nz, r + 1, this.y + 0.3, this.y + 1.7, (c) => {
      if (!c.solid && c.kind !== 'prop') return;
      if (c.type === 'circle') { const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-5) { nx = c.x + (dx / d) * m; nz = c.z + (dz / d) * m; } }
      else { const hit = obbVsCircle(c, { x: nx, z: nz, r }); if (hit) { nx -= hit.nx * hit.depth; nz -= hit.nz * hit.depth; } }
    });
    for (const v of g.vehicles) { if (Math.abs(v.y - this.y) > 3.5) continue; const hit = obbVsCircle(v.obb(), { x: nx, z: nz, r }); if (hit) { nx -= hit.nx * hit.depth; nz -= hit.nz * hit.depth; } }
    const gr = this.groundAt(nx, nz, this.y + 1.2);
    if (!gr.deep) {
      // wading out: stand on the bed again
      this.x = nx; this.z = nz; this.dive = 0; this.vyS = 0; this.pitchS = 0;
      this.y = Math.max(gr.y, this.y - 4 * dt);
      if (this.y <= gr.y + 0.05 || gr.deck) { this.y = gr.y; this.state = 'foot'; this.vy = 0; }
      else this.y = lerp(this.y, gr.y, Math.min(1, dt * 6));
      this.rig.root.rotation.set(0, this.yaw, 0); this.rig.root.position.set(this.x, this.y, this.z);
      return;
    }
    // dock / platform edge within reach: climb out
    if (want > 0.3 && this.dive < 0.4) {
      const ax = nx + Math.sin(this.yaw) * 0.9, az = nz + Math.cos(this.yaw) * 0.9, upg = W.ground(ax, az, this.y + 2.2);
      if (upg.deck && upg.y - gr.surface < 1.9 && !blocked(g, ax, az, upg.y)) {
        this.seq = { kind: 'climb', t: 0, v: null, from: { x: this.x, y: this.y, z: this.z }, to: { x: ax, y: upg.y, z: az, swim: false }, dur: 0.8 };
        this.state = 'entering'; this.dive = 0;
        return;
      }
    }
    this.x = nx; this.z = nz;
    // vertical: dive, rise, buoyant drift, or the surface spring
    let dv = null;
    if (this.choke) dv = 2.0;
    else if (down && this.o2 > 0.2) dv = fast ? -2.1 : -1.4;
    else if (up) dv = 1.8;
    else if (this.dive > 0.3) dv = 0.45 + 0.25 * (1 - this.o2);
    if (dv !== null) this.vyS += (dv - this.vyS) * Math.min(1, dt * 3.2);
    else this.vyS += ((surfY - this.y) * 30 - this.vyS * 7) * dt;
    this.y += this.vyS * dt;
    const bedY = gr.y + 0.15;
    if (this.y < bedY) { this.y = bedY; this.vyS = Math.max(0, this.vyS); }
    if (dv !== null && this.y > surfY) { this.y = surfY; this.vyS = Math.min(this.vyS, 0); }
    const dive0 = this.dive;
    this.dive = Math.max(0, surfY - this.y);
    if (dive0 < 0.25 && this.dive >= 0.25) g.emit('player:submerge', { x: this.x, y: this.y, z: this.z });
    if (dive0 >= 0.25 && this.dive < 0.25) g.emit('player:surface', { x: this.x, y: surf, z: this.z, speed: Math.max(0, this.vyS) });
    // body: prone while swimming, vertical while treading, tilted by the climb or dive, lifted and tilted by the swell at the surface
    this.swimPh += (this.speed * 2.2 + (this.dive > 0.3 ? 0.5 : 0)) * dt * (fast ? 1.25 : 1);
    const subm = this.dive > 0.3, mov = clamp(this.speed / 0.8, 0, 1);
    const theta = subm ? clamp(1.35 - this.vyS * 0.32, 0.55, 2.1) * (0.35 + 0.65 * Math.max(mov, Math.abs(this.vyS) > 0.5 ? 1 : 0)) : 1.3 * mov + 0.12 * (1 - mov);
    this.pitchS += (theta - this.pitchS) * Math.min(1, dt * 5);
    const anim = subm ? (this.speed > 0.3 || Math.abs(this.vyS) > 0.5 ? 'dive' : 'hover') : this.speed > 0.4 ? 'swim' : 'tread';
    blendPose(this.pose, poseFor(anim, this.animT, this.swimPh * 3.1, 1), 1 - Math.exp(-dt * 10), this.pose);
    applyPose(this.rig, this.pose);
    let tilt = 0, roll = 0;
    if (!subm && sea) {
      sea.waveAt(this.x, this.z, _w);
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      tilt = Math.atan((_w.x * s + _w.z * c) / _w.y) * 0.6; roll = Math.atan(-(_w.x * c - _w.z * s) / _w.y) * 0.6;
    }
    const th = this.pitchS + tilt, hy = this.y + 0.95, ps = Math.sin(this.yaw), pc = Math.cos(this.yaw), off = 0.95;
    this.rig.root.rotation.set(th, this.yaw, roll, 'YXZ');
    this.rig.root.position.set(this.x - ps * off * Math.sin(th), hy - off * Math.cos(th), this.z - pc * off * Math.sin(th));
  }

  // --------------------------------------------------------------- frame update
  update(dt, input, camYaw) {
    const g = this.game;
    this.animT += dt;
    if (this.hidden) { this.rig.root.visible = false; return; }
    if (this.closeDoor) {
      const c = this.closeDoor; c.t += dt;
      if (Math.hypot(c.v.x - this.x, c.v.z - this.z) > 3.4 || c.t > 4) { c.v.setDoor(c.side, false); this.closeDoor = null; c.v.doorSlam = true; g.emit('vehicle:door', { v: c.v, open: false, side: c.side, slam: true }); }
    }
    if (this.seq) { this.rig.root.visible = true; this.updateSeq(dt); return; }
    if (this.vehicle) {
      const v = this.vehicle;
      this.x = v.x; this.y = v.y; this.z = v.z; this.yaw = v.yaw;
      this.rig.root.visible = false;
      if (this.bust) this.bust.visible = g.rig.mode !== 'cockpit';
      return;
    }
    this.rig.root.visible = true;
    if (this.state === 'swim') { this.updateSwim(dt, input, camYaw); return; }
    let mx = 0, mz = 0;
    const locked = this.state !== 'foot' || this.emote;
    if (!locked) {
      const f = input.trigger('throttle') - input.trigger('brake');
      const s = input.axis('left', 'right');
      const cy = Math.cos(camYaw), sy = Math.sin(camYaw);
      mx = sy * f - cy * s; mz = cy * f + sy * s;
      const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; }
    }
    const want = Math.hypot(mx, mz);
    const sprint = input.held('sprint') && this.stamina > 0.05;
    const maxV = want > 0 ? (sprint ? 6.4 : input.gp() && want < 0.6 ? 1.6 : 3.4) : 0;
    const tvx = mx * maxV / Math.max(want, 1e-6) * Math.min(1, want), tvz = mz * maxV / Math.max(want, 1e-6) * Math.min(1, want);
    const acc = (want > 0 ? 10 : 14) * (this.onGround ? 1 : 0.28);
    this.vx = damp(this.vx, want > 0 ? tvx : 0, acc, dt);
    this.vz = damp(this.vz, want > 0 ? tvz : 0, acc, dt);
    this.stamina = clamp(this.stamina + (sprint && want > 0 ? -dt * 0.12 : dt * 0.2), 0, 1);
    this.speed = Math.hypot(this.vx, this.vz);
    if (this.speed > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(this.vx, this.vz), 10, dt);
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const r = 0.32;
    for (let it = 0; it < 2; it++) {
      g.world.colliders.query(nx, nz, r + 1, this.y + 0.3, this.y + 1.7, (c) => {
        if (!c.solid && c.kind !== 'prop') return;
        if (c.type === 'circle') {
          const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), m = c.r + r;
          if (d < m && d > 1e-5) { nx = c.x + (dx / d) * m; nz = c.z + (dz / d) * m; }
        } else {
          const hit = obbVsCircle(c, { x: nx, z: nz, r });
          if (hit) { nx -= hit.nx * hit.depth; nz -= hit.nz * hit.depth; }
        }
      });
      for (const v of g.vehicles) {
        if (Math.abs(v.y - this.y) > 2) continue;
        const hit = obbVsCircle(v.obb(), { x: nx, z: nz, r });
        if (hit) { nx -= hit.nx * hit.depth; nz -= hit.nz * hit.depth; }
      }
    }
    const gr = this.groundAt(nx, nz, this.y + 0.5);
    if (gr.deep && this.y <= gr.surface - 0.1) { this.x = nx; this.z = nz; this.startSwim(nx, nz, gr.surface, -this.vy); this.updateSwim(dt, input, camYaw); return; }
    let gy = gr.deep ? gr.surface - 1.08 : gr.y;
    if (!gr.deep) { const sup = this.supportAt(nx, nz, this.y); if (sup > gy) gy = sup; }
    this.wade = gr.deep || gr.depth > 0.12 ? clamp(gr.depth, 0, 1) : 0;
    if (this.wade > 0.05) {
      const dr = Math.min(0.9, this.wade * 0.5 * dt * 6); this.vx *= 1 - dr; this.vz *= 1 - dr;
      this.wadeT = (this.wadeT || 0) - dt;
      if (this.speed > 1 && this.wadeT <= 0) { this.wadeT = 0.28 - Math.min(0.12, this.speed * 0.02); g.emit('player:wade', { x: this.x, y: gr.surface ?? this.y, z: this.z, speed: this.speed, depth: this.wade }); }
    }
    if (gy - this.y < 0.55) { this.x = nx; this.z = nz; }
    const wasAir = !this.onGround, fallV = this.vy;
    const rising = this.vy > 0.1;
    if (gy > this.y - 0.05 && (!rising || gy > this.y + 0.02)) { this.y = gy; this.vy = 0; this.onGround = true; }
    else { this.vy -= 9.8 * dt; this.y = Math.max(gy, this.y + this.vy * dt); this.onGround = false; if (this.y <= gy && this.vy <= 0) { this.y = gy; this.vy = 0; this.onGround = true; } }
    if (this.onGround && wasAir && fallV < -2.2) g.emit('player:landed', { x: this.x, y: this.y, z: this.z, speed: -fallV, soft: false });
    this.coyote = this.onGround ? 0.12 : Math.max(0, (this.coyote || 0) - dt);
    if (!locked) {
      // Space: jump; next to a wall, fence or crate it vaults or climbs instead; keep holding it in the air to grab a ledge
      const mvx = want > 0.1 ? mx : Math.sin(this.yaw), mvz = want > 0.1 ? mz : Math.cos(this.yaw);
      const face = Math.atan2(mvx, mvz);
      if (input.hit('jump') && (this.onGround || this.coyote > 0)) {
        const L = this.ledgeAhead(mvx, mvz, false);
        if (L) { this.startMantle(L, face); this.rig.root.position.set(this.x, this.y, this.z); return; }
        this.vy = 5.2; this.onGround = false; this.coyote = 0; this.y += 0.01;
        g.emit('player:jump', { x: this.x, y: this.y, z: this.z, speed: this.speed });
      } else if (!this.onGround && input.held('jump') && want > 0.1 && this.vy > -3.5) {
        const L = this.ledgeAhead(mvx, mvz, true);
        if (L) { this.startMantle(L, face); this.rig.root.position.set(this.x, this.y, this.z); return; }
      }
    }
    this.punchT = Math.max(0, (this.punchT || 0) - dt);
    if (!locked && input.mouse.clicked && this.punchT <= 0 && this.onGround) { this.punchT = 0.34; this.punchHit = false; this.yaw = camYaw; this.punchN = ((this.punchN || 0) + 1) % 3; }
    if (this.punchT > 0 && !this.punchHit && this.punchT < 0.2) { this.punchHit = true; g.emit('player:punch', { x: this.x, y: this.y, z: this.z, yaw: this.yaw, n: this.punchN }); }
    let anim = this.speed < 0.25 ? 'idle' : this.speed < 2.4 ? 'walk' : this.speed < 5 ? 'run' : 'sprint';
    if (!this.onGround && this.y - gy > 0.18 && this.state === 'foot') anim = 'jump';
    if (this.state === 'hands') anim = 'hands';
    if (this.state === 'cuffed') anim = 'cuffed';
    if (this.emote) { anim = this.emote.name; this.emote.t -= dt; if (this.emote.t <= 0 || want > 0.1) this.emote = null; }
    if (this.punchT > 0) anim = 'punch';
    const stride = anim === 'walk' ? 1.45 : anim === 'run' ? 2.2 : 2.7;
    this.phase += (this.speed / stride) * Math.PI * dt * 1.0;
    const target = poseFor(anim, anim === 'punch' ? 0.34 - this.punchT : this.animT, this.phase, anim === 'walk' ? Math.min(1, this.speed / 1.5) : 1);
    blendPose(this.pose, target, 1 - Math.exp(-dt * 12), this.pose);
    applyPose(this.rig, this.pose);
    this.rig.root.position.set(this.x, this.y, this.z);
    this.rig.root.rotation.set(0, this.yaw, 0);
  }
}

function W_surface(g, x, z) { return g.world.sea ? g.world.sea.waveAt(x, z) : WATER_LEVEL; }

function blocked(game, x, z, y) {
  let hit = false;
  game.world.colliders.query(x, z, 0.6, y + 0.3, y + 1.7, (c) => {
    if (c.type === 'circle' ? Math.hypot(x - c.x, z - c.z) < c.r + 0.35 : obbVsCircle(c, { x, z, r: 0.35 })) { hit = true; return false; }
  });
  return hit;
}

void smooth;
