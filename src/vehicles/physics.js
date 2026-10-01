import { carLayout } from './carModel.js';
import { clamp, lerp, smoothstep, wrapAngle } from '../core/math.js';
import { SURF } from '../world/terrain.js';

const G = 9.81;
const AREA = { hatch: 2.1, sedan: 2.2, coupe: 2.0, sports: 1.95, supercar: 1.9, muscle: 2.2, suv: 2.7, pickup: 3.0, van: 3.4, offroad: 2.9, bus: 7.5, truck: 7, bike: 0.7, utility: 3.1 };
const CGH = { hatch: 0.52, sedan: 0.52, coupe: 0.48, sports: 0.44, supercar: 0.4, muscle: 0.5, suv: 0.68, pickup: 0.72, van: 0.8, offroad: 0.75, bus: 1.2, truck: 1.2, bike: 0.6, utility: 0.75 };
// [ride frequency Hz, damping ratio, wheel travel m]
const SUSP = { hatch: [1.45, 0.5, 0.2], sedan: [1.35, 0.5, 0.22], coupe: [1.6, 0.5, 0.18], sports: [2.0, 0.48, 0.15], supercar: [2.3, 0.48, 0.13], muscle: [1.5, 0.42, 0.2], suv: [1.3, 0.5, 0.26], pickup: [1.3, 0.48, 0.28], van: [1.25, 0.5, 0.26], offroad: [1.2, 0.45, 0.36], bus: [1.1, 0.55, 0.28], truck: [1.1, 0.55, 0.28], bike: [1.7, 0.4, 0.2], utility: [1.3, 0.48, 0.28] };

// Vehicle dynamics: rigid body in the world frame with a bicycle tire model (Pacejka-style curves, friction circle),
// load transfer, four-corner spring/damper suspension (heave, pitch, roll, jumps, landings), gearbox, handbrake drifting.
export class CarPhysics {
  constructor(def, tune = {}) {
    this.def = def;
    this.retune(tune);
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
    this.vx = 0; this.vz = 0; this.vy = 0; this.w = 0;
    this.pitch = 0; this.roll = 0; this.pitchV = 0; this.rollV = 0;
    this.dp = 0; this.dr = 0; this.dpV = 0; this.drV = 0;
    this.visPitch = 0; this.visRoll = 0;
    this.air = 0; this.onGround = true; this.wheelsDown = 4;
    this.gear = 1; this.rpm = 900; this.shiftT = 0; this.manual = false;
    this.steer = 0; this.steerIn = 0; this.driftMode = false; this.throttle = 0; this.brake = 0; this.hand = 0; this.handK = 0;
    this.thrIn = 0; this.brkIn = 0;
    this.axF = 0; this.alat = 0;
    this.slipF = 0; this.slipR = 0; this.spin = 0; this.skid = 0; this.skidF = 0; this.skidR = 0;
    this.wheelRot = 0; this.wheelRotR = 0;
    this.comp = [this.compS, this.compS, this.compS, this.compS];
    this.wheelDy = [0, 0, 0, 0];
    this.wheelG = [0, 0, 0, 0]; this.wheelN = [0, 0, 0, 0]; this.wheelHit = [true, true, true, true];
    this.surfF = SURF.ASPHALT; this.surfR = SURF.ASPHALT;
    this.gripF = 1; this.gripR = 1;
    this.health = { engine: 1, steer: 0, brakes: 1 };
    this.assist = 0.6;
    this.tc = true; this.abs = true;
    this.engineOn = true;
    this.cruise = 0;
    this.limiter = 0;
    this.landing = null; this.bump = 0;
    this.wet = 0;
    this.wr = def.body.wr;
    this.drift = { active: false, angle: 0, chain: 0, chainT: 0, score: 0, best: 0, mult: 1, banked: 0, lastBank: 0, dir: 0 };
    this.boost = 0; this.nitro = 1; this.nitroOn = false;
    this.stat = { distance: 0, air: 0, topSpeed: 0, bestAir: 0, bestJump: 0 };
    this.vyPrev = 0;
    this.ay = 0;
    this.slope = 0; this.camber = 0;
  }

  retune(t = {}) {
    const def = this.def, p = def.perf, b = def.body;
    const lay = carLayout(b);
    this.tune = t;
    const lv = (k) => t[k] || 0;
    this.mass = p.mass * (1 - lv('weight') * 0.035);
    const L = b.wb;
    const frontBias = b.style === 'bike' ? 0.48 : p.drive === 'FWD' ? 0.61 : b.style === 'supercar' ? 0.42 : b.style === 'bus' ? 0.35 : 0.53;
    this.L = L;
    this.a = L * (1 - frontBias);
    this.b = L * frontBias;
    this.zCG = lay.zF - this.a;
    this.h = CGH[b.style] ?? 0.55;
    this.I = this.mass * (this.a * this.a + this.b * this.b) * 0.62;
    this.nm = p.nm * (1 + lv('engine') * 0.07 + lv('turbo') * 0.1);
    this.kw = p.kw * (1 + lv('engine') * 0.07 + lv('turbo') * 0.08);
    this.redline = p.redline;
    this.idle = b.style === 'bike' ? 1400 : 850;
    this.gears = p.gears;
    this.final = p.final * (1 - lv('trans') * 0.02);
    this.shiftTime = 0.14 * (1 - lv('trans') * 0.15);
    this.drive = p.drive;
    this.mu = p.grip * (1 + lv('tires') * 0.045);
    this.corner = 1 + lv('susp') * 0.05;
    this.brakeK = p.brake * (1 + lv('brakes') * 0.07);
    this.CdA = p.cd * (AREA[b.style] ?? 2.2);
    this.down = (p.downforce || 0) * (1 + lv('susp') * 0.05);
    this.offroad = !!p.offroad || b.style === 'offroad';
    this.maxSteer = b.style === 'bus' ? 0.6 : b.style === 'bike' ? 0.5 : 0.62;
    this.isBike = b.style === 'bike';
    const S = SUSP[b.style] || SUSP.sedan;
    this.suspF = S[0] * (1 + lv('susp') * 0.04); this.suspZ = S[1]; this.travel = S[2];
    const hw = b.trk / 2;
    this.corners = this.isBike
      ? [{ lx: 0.05, lz: lay.zF - this.zCG, front: true }, { lx: -0.05, lz: lay.zF - this.zCG, front: true }, { lx: 0.05, lz: lay.zR - this.zCG, front: false }, { lx: -0.05, lz: lay.zR - this.zCG, front: false }]
      : [{ lx: hw, lz: lay.zF - this.zCG, front: true }, { lx: -hw, lz: lay.zF - this.zCG, front: true }, { lx: hw, lz: lay.zR - this.zCG, front: false }, { lx: -hw, lz: lay.zR - this.zCG, front: false }];
    this.Ipitch = this.mass * (this.L * this.L) * 0.14;
    this.Iroll = this.mass * (b.trk * b.trk + 0.6) * 0.16;
    const wm = this.mass / 4;
    this.kS = wm * Math.pow(2 * Math.PI * this.suspF, 2);
    this.cS = 2 * this.suspZ * Math.sqrt(this.kS * wm);
    this.compS = (wm * G) / this.kS;
    this.ride = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwdSpeed() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }
  get kmh() { return this.speed * 3.6; }
  get lateralSpeed() { return this.vx * -Math.cos(this.yaw) + this.vz * Math.sin(this.yaw); }
  get slipAngle() { const f = this.fwdSpeed; return Math.atan2(Math.abs(this.lateralSpeed), Math.max(1, Math.abs(f))); }

  place(x, y, z, yaw) {
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    this.vx = this.vz = this.vy = this.w = 0; this.pitch = this.roll = 0; this.pitchV = this.rollV = 0;
    this.dp = this.dr = this.dpV = this.drV = 0; this.visPitch = this.visRoll = 0;
    this.gear = 1; this.rpm = this.idle;
    this.onGround = true; this.air = 0; this.thrIn = this.brkIn = 0; this.steer = 0; this.steerIn = 0; this.driftMode = false; this.axF = this.alat = 0;
    this.comp = [this.compS, this.compS, this.compS, this.compS];
    for (let i = 0; i < 4; i++) { this.wheelG[i] = y; this.wheelN[i] = (this.mass * G) / 4; this.wheelDy[i] = 0; }
    this.landing = null; this.bump = 0; this.vyPrev = 0;
  }

  torqueAt(rpm) {
    const r = clamp(rpm, this.idle, this.redline);
    const peakAt = this.redline * 0.45;
    let T = r < peakAt ? lerp(0.62, 1, (r - this.idle) / (peakAt - this.idle)) * this.nm : this.nm * (1 - 0.18 * ((r - peakAt) / (this.redline - peakAt)) ** 2);
    const omega = (r * Math.PI * 2) / 60;
    T = Math.min(T, (this.kw * 1000) / Math.max(1, omega));
    return T;
  }

  wheelRpm(v, gear) {
    const ratio = gear < 0 ? this.gears[0] * 1.1 : this.gears[gear - 1];
    return (Math.abs(v) / this.wr) * ratio * this.final * (60 / (Math.PI * 2));
  }

  shift(dir) {
    if (!this.manual || this.shiftT > 0) return;
    const n = this.gear + dir;
    if (n < -1 || n > this.gears.length) return;
    if (n === 0) { this.gear = dir > 0 ? 1 : -1; if (this.gear < 0 && this.fwdSpeed > 2) this.gear = 1; } else this.gear = n;
    this.shiftT = this.shiftTime;
  }

  // input: { throttle, brake, steer (-1..1, right+), hand(bool), boost(bool) }; ground(x,z,yRef) -> {y, surf, grip}
  step(dt, input, ground) {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let vLong = this.vx * sy + this.vz * cy;
    let vLat = this.vx * -cy + this.vz * sy;
    const speed = Math.hypot(vLong, vLat);
    const m = this.mass, L = this.L;

    // --- input filtering ---
    const thrTarget = this.engineOn ? clamp(input.throttle, 0, 1) : 0, brkTarget = clamp(input.brake, 0, 1);
    this.thrIn += clamp(thrTarget - this.thrIn, -dt * 8, dt * (this.isBike ? 5 : 4.2));
    this.brkIn += clamp(brkTarget - this.brkIn, -dt * 10, dt * 7);
    const handTarget = input.hand ? 1 : 0;
    this.handK += clamp(handTarget - this.handK, -dt * 3.2, dt * 10);

    // --- nitro ---
    const wantNitro = !!input.boost && this.nitro > 0.02 && this.engineOn && thrTarget > 0.3;
    this.nitroOn = wantNitro;
    this.boost += ((wantNitro ? 1 : 0) - this.boost) * Math.min(1, dt * (wantNitro ? 6 : 3));
    if (wantNitro) this.nitro = Math.max(0, this.nitro - dt * 0.16); else this.nitro = Math.min(1, this.nitro + dt * 0.012);

    // --- drift state: handbrake or throttle-fed slide with the nose rotated away from the velocity ---
    const beta = vLong > 0.5 ? Math.atan2(vLat, vLong) : 0;
    const sl = Math.abs(beta);
    const steerIn = clamp(input.steer, -1, 1);
    const thrNow = this.thrIn;
    const dm = vLong > 4 && speed > 7 && (this.handK > 0.25 || (sl > 0.22 && thrNow > 0.3) || (this.driftMode && sl > 0.08 && (thrNow > 0.15 || this.handK > 0.05)));
    this.driftMode = dm;

    // --- steering: speed-sensitive lock limited to what the tires can use, rate limited, self-centering ---
    const muG = this.mu * this.corner * 0.95 * G;
    const gripAngle = Math.atan((muG * L) / Math.max(25, speed * speed)) + 0.13;
    const sliding = this.slipAngle > 0.16;
    const steerCap = Math.min(this.maxSteer, gripAngle * (sliding ? 1.6 : 1) * (this.isBike ? 0.85 : 1));
    const target = -steerIn * steerCap + this.health.steer * 0.04;
    const rate = (input.steer === 0 ? 4 : 3.2) * (1 + speed / 40) * (sliding ? 1.8 : 1);
    this.steerIn += clamp(target - this.steerIn, -rate * dt, rate * dt);
    let delta = this.steerIn;
    if (dm) delta = clamp(-beta * 0.95 + delta * 0.3, -0.62, 0.62);
    this.steer += clamp(delta - this.steer, -14 * dt, 14 * dt);
    delta = this.steer;

    // --- pedals, gearbox ---
    let thr = this.thrIn, brk = this.brkIn;
    if (this.cruise > 0 && input.throttle < 0.05 && brkTarget < 0.05 && this.gear > 0) { const err = this.cruise - vLong; thr = clamp(err * 0.35, 0, 0.75); if (err < -1.2) brk = clamp(-err * 0.05, 0, 0.35); }
    if (!this.manual) {
      if (this.gear > 0 && vLong < 0.6 && brkTarget > 0.1 && thrTarget < 0.05) { this._revT = (this._revT || 0) + dt; if (this._revT > 0.22 && vLong < 0.3) { this.gear = -1; this._revT = 0; } } else this._revT = 0;
      if (this.gear < 0) { if (thrTarget > 0.1 && vLong > -0.6) this.gear = 1; else { const t = this.thrIn; thr = this.brkIn; brk = t; } }
      if (this.gear > 0 && this.shiftT <= 0) {
        const rpmW = this.wheelRpm(vLong, this.gear);
        if (rpmW > this.redline * 0.93 && this.gear < this.gears.length && thr > 0.1) { this.gear++; this.shiftT = this.shiftTime; }
        else if (this.gear > 1 && rpmW < this.redline * (thr > 0.6 ? 0.5 : 0.3)) { this.gear--; this.shiftT = this.shiftTime * 0.7; }
      }
    } else if (this.gear < 0) { const t = this.thrIn; thr = this.brkIn; brk = t; }
    this.shiftT -= dt;
    const shifting = this.shiftT > 0;
    const rpmWheel = this.wheelRpm(vLong, this.gear);
    const launchRpm = this.idle + thr * (this.redline * 0.55 - this.idle);
    let rpm = Math.max(rpmWheel, this.gear === 1 || this.gear === -1 ? lerp(launchRpm, rpmWheel, smoothstep(2, 7, Math.abs(vLong))) : rpmWheel, this.idle);
    if (input.hand && thr > 0.1) rpm = Math.max(rpm, launchRpm);
    if (!this.engineOn) rpm = 0;
    else if (shifting) rpm = Math.max(this.idle, this.rpm * 0.985);
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * (shifting ? 6 : 14));
    const limiter = this.rpm > this.redline * 1.0;
    this.limiter = limiter ? 1 : 0;

    // --- tire loads: suspension + geometric weight transfer + downforce ---
    const dF = this.down * speed * speed;
    let Nf, Nr;
    const loaded = (this.wheelN[0] + this.wheelN[1] + this.wheelN[2] + this.wheelN[3]) / (m * G);
    const gnd = this.onGround && loaded > 0.2;
    if (gnd) { Nf = Math.max(m * G * 0.08, this.wheelN[0] + this.wheelN[1]) + dF * 0.45; Nr = Math.max(m * G * 0.08, this.wheelN[2] + this.wheelN[3]) + dF * 0.55; }
    else { Nf = 0.04 * m * G; Nr = 0.04 * m * G; }
    const dW = gnd ? (m * this.axF * this.h) / L : 0;
    Nf = Math.max(m * G * 0.05, Nf - dW * 0.6); Nr = Math.max(m * G * 0.05, Nr + dW * 0.6);
    const contact = gnd ? 1 : 0;

    // --- surfaces under the axles ---
    const fx = this.x + sy * this.a, fz = this.z + cy * this.a, rx = this.x - sy * this.b, rz = this.z - cy * this.b;
    const gF = ground(fx, fz, this.y), gR = ground(rx, rz, this.y);
    const wetK = 1 - this.wet * 0.26;
    const surfMu = (g) => {
      let k = g.grip;
      if (g.surf === SURF.ASPHALT || g.surf === SURF.CONCRETE || g.surf === SURF.PARKING) k *= wetK;
      else if (this.offroad) k = Math.min(1, k * 1.35 + 0.08);
      return k;
    };
    this.surfF = gF.surf; this.surfR = gR.surf;
    this.gripF = surfMu(gF); this.gripR = surfMu(gR);
    const muF = this.mu * this.gripF * this.corner * contact, muR = this.mu * this.gripR * this.corner * contact;

    // --- drivetrain force ---
    let Fdrive = 0;
    if (this.gear !== 0 && !shifting && !limiter && thr > 0 && this.engineOn) {
      const ratio = this.gear < 0 ? -this.gears[0] * 1.1 : this.gears[this.gear - 1];
      Fdrive = (this.torqueAt(this.rpm) * thr * ratio * this.final * 0.94 * this.health.engine * (1 + this.boost * 0.55)) / this.wr;
    }
    if (this.handK > 0.5) Fdrive *= this.drive === 'FWD' ? 1 : 0.45;
    const split = this.drive === 'FWD' ? [1, 0] : this.drive === 'AWD' ? [0.4, 0.6] : [0, 1];
    let FdF = Fdrive * split[0], FdR = Fdrive * split[1];
    if (thr < 0.05 && this.gear !== 0 && speed > 1 && this.engineOn) {
      const eb = -Math.sign(vLong) * m * 0.5 * smoothstep(0, 10, speed);
      FdF += eb * split[0]; FdR += eb * split[1];
    }
    let spinF = 0, spinR = 0;
    const capF = muF * Nf, capR = muR * Nr;
    if (Math.abs(FdF) > capF) { spinF = capF > 1 ? Math.abs(FdF) / capF - 1 : 0; FdF = Math.sign(FdF) * capF * (this.tc ? 0.98 : 0.9); }
    if (Math.abs(FdR) > capR) { spinR = capR > 1 ? Math.abs(FdR) / capR - 1 : 0; if (this.tc && !(this.handK > 0.5)) { FdR = Math.sign(FdR) * capR * 0.98; spinR *= 0.3; } else FdR = Math.sign(FdR) * capR * 0.88; }
    this.spin = Math.max(spinF, spinR);

    // --- brakes ---
    const maxBrake = m * G * 1.05 * this.brakeK * this.health.brakes;
    const bdir = speed > 0.3 ? -Math.sign(vLong) : 0;
    let FbF = brk * maxBrake * 0.64 * bdir, FbR = brk * maxBrake * 0.36 * bdir;
    FbF = clamp(FbF, -capF, capF); FbR = clamp(FbR, -capR, capR);
    let handLat = 1;
    if (this.handK > 0.02) {
      handLat = lerp(1, 0.55, this.handK);
      const hb = speed > 0.3 ? -Math.sign(vLong) * capR * 0.7 * this.handK : 0;
      FbR = Math.abs(hb) > Math.abs(FbR) ? hb : FbR;
      FdR *= 1 - this.handK;
    }

    // --- tire lateral forces ---
    const vF = vLat - this.w * this.a, vR = vLat + this.w * this.b;
    const cd = Math.cos(delta), sd = Math.sin(delta);
    const vwfLong = vLong * cd - vF * sd, vwfLat = vLong * sd + vF * cd;
    const denom = (v) => Math.max(Math.abs(v), 2.2);
    const alphaF = Math.atan2(vwfLat, denom(vwfLong)), alphaR = Math.atan2(vR, denom(vLong));
    const pac = (al, B, Cc) => Math.sin(Cc * Math.atan(B * al));
    const longF = FdF + FbF, longR = FdR + FbR;
    const latCapF = Math.sqrt(Math.max(0, capF * capF - longF * longF)) * (1 - Math.min(0.6, spinF * 0.6));
    const latCapR = Math.sqrt(Math.max(0, capR * capR - longR * longR)) * (1 - Math.min(0.5, spinR * 0.5)) * handLat;
    const FlatF = -pac(alphaF, 11, 1.45) * latCapF;
    const FlatR = -pac(alphaR, 12, 1.5) * latCapR;
    this.slipF = alphaF; this.slipR = alphaR;

    let Ffwd = longF * cd + FlatF * sd + longR;
    let Fright = -longF * sd + FlatF * cd + FlatR;
    const offSurf = this.surfF === SURF.GRASS || this.surfF === SURF.SAND || this.surfF === SURF.DIRT || this.surfF === SURF.FIELD;
    const rollK = offSurf ? (this.offroad ? 0.03 : 0.065) : 0.013;
    Ffwd -= Math.sign(vLong) * (0.5 * 1.2 * this.CdA * vLong * vLong + rollK * m * G * smoothstep(0, 2, Math.abs(vLong)) * contact);
    Fright -= 0.5 * 1.2 * this.CdA * 1.8 * vLat * Math.abs(vLat);
    if (gnd) {
      const gs = this.slope, gc = this.camber;
      Ffwd -= (m * G * gs) / Math.sqrt(1 + gs * gs);
      Fright += (m * G * gc) / Math.sqrt(1 + gc * gc);
    }
    let torque = -this.a * (-longF * sd + FlatF * cd) + this.b * FlatR;

    // --- stability and drift assists (yaw torques only, no free forces) ---
    const wKin = speed > 0.5 ? (vLong * Math.tan(delta)) / L : 0;
    const wMax = (this.mu * this.corner * G * 1.1) / Math.max(speed, 4);
    if (!dm) {
      torque += (clamp(wKin, -wMax, wMax) - this.w) * this.I * 2.0 * this.assist * smoothstep(3, 12, speed);
      if (speed > 7 && vLong > 0 && sl > 0.09) {
        const counter = steerIn !== 0 && Math.sign(steerIn) === Math.sign(beta) ? 1.5 : 1;
        torque += -Math.sign(beta) * this.I * (2.2 * Math.min(1, sl / 0.5) + 6 * smoothstep(0.85, 1.25, sl)) * this.assist * counter;
      }
    } else {
      // the driver's steering picks the slide angle (nose rotated toward the steer direction), throttle widens it, releasing straightens it
      const bmax = (0.34 + 0.42 * thrNow + 0.22 * this.handK) * smoothstep(6, 16, speed);
      const bt = -steerIn * bmax;
      const ax = ((Ffwd * sy - Fright * cy) / m), az = ((Ffwd * cy + Fright * sy) / m);
      const thetaDot = speed > 1 ? (this.vz * ax - this.vx * az) / (speed * speed) : 0;
      const bdot = this.w - thetaDot;
      torque += this.I * clamp(15 * (bt - beta) - 6.5 * bdot, -11, 11) * (0.4 + 0.6 * this.assist);
      if (this.handK > 0.3 && steerIn !== 0) torque += -Math.sign(steerIn) * this.I * 1.2 * this.handK * smoothstep(4, 12, speed);
    }

    if (this.onGround) {
      const ax = Ffwd / m, ay = Fright / m;
      vLong += ax * dt;
      vLat += ay * dt;
      this.w += (torque / this.I) * dt;
      const k = smoothstep(0.6, 3.5, speed);
      this.w = lerp(wKin, this.w, k);
      vLat *= lerp(0.2, 1, k);
      this.axF += (ax - this.axF) * Math.min(1, dt * 8);
      this.alat += (ay - this.alat) * Math.min(1, dt * 8);
      this.ay = ay;
      if (Math.abs(vLong) < 0.6 && thr < 0.05 && this.thrIn < 0.05) {
        const stop = clamp(1 - dt * 5, 0, 1);
        if (brk > 0.05 || this.handK > 0.3 || !this.engineOn) { vLong *= stop; vLat *= stop; }
        else if (Math.abs(vLong) < 0.12) vLong = 0;
      }
    } else {
      this.w *= 1 - dt * 0.2;
      this.axF *= 1 - dt * 3; this.alat *= 1 - dt * 3;
    }
    this.skidF = this.onGround ? clamp(Math.abs(alphaF) * 2.4 - 0.4, 0, 1) : 0;
    this.skidR = this.onGround ? clamp(Math.max(Math.abs(alphaR) * 3 - 0.35, spinR, this.handK > 0.3 && speed > 4 ? 0.85 : 0), 0, 1) : 0;
    this.skid = this.onGround ? clamp(Math.max(this.skidF, this.skidR, spinF, brk > 0.9 && speed > 12 && !this.isBike ? (this.abs ? 0.12 : 0.3) : 0), 0, 1) : 0;

    // velocity back into world coordinates with the yaw at the start of the step: the frame rotation is already accounted for
    this.vx = vLong * sy - vLat * cy;
    this.vz = vLong * cy + vLat * sy;
    this.yaw = wrapAngle(this.yaw + this.w * dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.wheelRot += (vLong / this.wr) * dt;
    this.wheelRotR += ((this.handK > 0.55 && speed > 0.5 ? 0 : vLong / this.wr) + (spinR > 0.12 ? Math.min(60, spinR * 24) * Math.sign(Fdrive || 1) : 0)) * dt;

    this.suspension(dt, ground, Math.sin(this.yaw), Math.cos(this.yaw));
    this.updateDrift(dt, speed, beta);
    this.throttle = thr; this.brake = brk; this.hand = this.handK;
    this.stat.distance += speed * dt; this.stat.topSpeed = Math.max(this.stat.topSpeed, speed);
    this.visual(dt);
  }

  suspension(dt, ground, s2, c2) {
    const m = this.mass, C = this.corners;
    const sp = Math.sin(this.pitch), sr = Math.sin(this.roll);
    let Fsum = 0, Tp = 0, Tr = 0, touching = 0;
    const travel = this.travel, compS = this.compS;
    for (let i = 0; i < 4; i++) {
      const c = C[i];
      const wx = this.x + s2 * c.lz + c2 * c.lx, wz = this.z + c2 * c.lz - s2 * c.lx;
      const g = ground(wx, wz, this.y);
      this.wheelG[i] = g.y;
      const bodyY = this.y - c.lz * sp + c.lx * sr;
      const comp = g.y + compS - bodyY;
      const vAt = this.vy + this.pitchV * (-c.lz) + this.rollV * c.lx;
      let F = 0;
      if (comp > 0) {
        F = this.kS * comp + (vAt < 0 ? this.cS * -vAt : this.cS * 0.6 * -vAt);
        if (comp > travel) F += this.kS * 7 * (comp - travel) + (vAt < 0 ? this.cS * 3 * -vAt : 0);
        F = Math.max(0, F);
        touching++;
      }
      this.comp[i] = clamp(comp, 0, travel * 1.5);
      this.wheelHit[i] = comp > 0;
      this.wheelN[i] = F;
      Fsum += F;
      Tp += -F * c.lz; Tr += F * c.lx;
    }
    const gFm = (this.wheelG[0] + this.wheelG[1]) / 2, gRm = (this.wheelG[2] + this.wheelG[3]) / 2;
    const gLm = (this.wheelG[0] + this.wheelG[2]) / 2, gRm2 = (this.wheelG[1] + this.wheelG[3]) / 2;
    const Lw = Math.max(0.5, C[0].lz - C[2].lz), Wt = Math.max(0.3, C[0].lx - C[1].lx);
    this.slope = (gFm - gRm) / Lw; this.camber = this.isBike ? 0 : (gLm - gRm2) / Wt;
    if (touching >= 2) {
      const tgtP = -Math.atan(this.slope), tgtR = this.isBike ? 0 : Math.atan(this.camber);
      Tp += (tgtP - this.pitch) * this.Ipitch * 26 * (touching / 4) - this.pitchV * this.Ipitch * 2.4;
      Tr += (tgtR - this.roll) * this.Iroll * 30 * (touching / 4) - this.rollV * this.Iroll * 2.6;
    } else {
      this.pitchV *= 1 - dt * 0.06; this.rollV *= 1 - dt * 0.1;
    }
    const wasAir = !this.onGround;
    this.onGround = touching > 0;
    this.wheelsDown = touching;
    const ay = Fsum / m - G;
    const vyBefore = this.vy;
    this.vy += ay * dt;
    if (this.onGround) this.vy = clamp(this.vy, -26, 26);
    this.y += this.vy * dt;
    this.pitchV += (Tp / this.Ipitch) * dt;
    this.rollV += (Tr / this.Iroll) * dt;
    this.pitchV = clamp(this.pitchV, -6, 6); this.rollV = clamp(this.rollV, -6, 6);
    this.pitch += this.pitchV * dt; this.roll += this.rollV * dt;
    this.pitch = clamp(this.pitch, -0.75, 0.75); this.roll = clamp(this.roll, -0.95, 0.95);
    if (!this.onGround) { this.air += dt; this.stat.air += dt; }
    else {
      if (wasAir && this.air > 0.12) {
        const impact = Math.max(0, -vyBefore);
        this.landing = { speed: impact, air: this.air, x: this.x, y: this.y, z: this.z, hard: impact > 5 };
        this.stat.bestAir = Math.max(this.stat.bestAir, this.air);
        this.bump = Math.max(this.bump, impact);
      }
      this.air = 0;
    }
    const dv = this.vy - this.vyPrev;
    if (this.onGround && Math.abs(dv) > 1.2) this.bump = Math.max(this.bump, Math.abs(dv) * 0.7);
    this.vyPrev = this.vy;
    let minY = -Infinity;
    for (let i = 0; i < 4; i++) { const off = -C[i].lz * sp + C[i].lx * sr; const floor = this.wheelG[i] - (travel * 1.2 - compS) - off; if (floor > minY) minY = floor; }
    if (this.y < minY) { this.y = minY; if (this.vy < 0) this.vy *= -0.05; }
    for (let i = 0; i < 4; i++) this.wheelDy[i] = this.comp[i] - compS;
  }

  // exaggerated attitude for rendering: squat, dive, roll, lean, with a little overshoot
  visual(dt) {
    const acc = this.isBike ? 0.012 : 0.0085;
    const tp = -clamp(this.axF * acc, -0.075, 0.075);
    const tr = this.isBike ? -Math.atan((this.fwdSpeed * this.w) / G) * 0.9 : -clamp(this.alat * 0.0085, -0.1, 0.1);
    const wn = 10, z = 0.5;
    this.dpV += ((tp - this.dp) * wn * wn - 2 * z * wn * this.dpV) * dt; this.dp += this.dpV * dt;
    this.drV += ((tr - this.dr) * wn * wn - 2 * z * wn * this.drV) * dt; this.dr += this.drV * dt;
    const air = this.onGround ? 1 : 0.35;
    this.visPitch = this.pitch + this.dp * air; this.visRoll = this.roll + this.dr * air;
  }

  updateDrift(dt, speed, beta) {
    const d = this.drift, sl = Math.abs(beta);
    const sliding = this.onGround && speed > 7 && sl > 0.2 && (this.handK > 0.2 || Math.abs(this.slipR) > 0.16 || this.spin > 0.25 || sl > 0.32);
    if (sliding) {
      d.active = true; d.angle = sl; d.dir = Math.sign(beta); d.chainT = 1.4;
      const gain = speed * sl * 9 * dt * d.mult;
      d.chain += gain; d.score += gain;
      d.mult = Math.min(5, 1 + Math.floor(d.chain / 1500) * 0.5);
    } else {
      d.active = false;
      d.chainT -= dt;
      if (d.chainT <= 0 && d.chain > 0) { d.banked = Math.round(d.chain); d.lastBank = d.banked; d.best = Math.max(d.best, d.chain); d.chain = 0; d.mult = 1; d.chainT = 0; }
    }
  }
}
