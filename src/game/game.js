import * as THREE from 'three';
import { World } from '../world/world.js';
import { Sky } from '../world/sky.js';
import { Player } from '../actors/player.js';
import { Vehicle, collideVehicles } from '../vehicles/vehicle.js';
import { Boat } from '../vehicles/boat.js';
import { Aircraft } from '../vehicles/aircraft.js';
import { Airfield } from './airfield.js';
import { VEHICLE_BY_ID } from '../data/vehicles.js';
import { CameraRig } from './camera.js';
import { Input } from '../core/input.js';
import { Traffic } from '../actors/traffic.js';
import { Peds } from '../actors/peds.js';
import { View } from '../render/view.js';
import { Perf } from '../render/perf.js';
import { ContactShadows } from '../render/contactShadows.js';
import { Pipeline } from '../render/pipeline.js';
import { Governor } from '../render/governor.js';
import { AudioSystem } from '../audio/audio.js';
import { bindAudio } from './audioHooks.js';
import { VehicleFx } from '../render/vehicleFx.js';
import { WakeMap } from '../render/wake.js';
import { BoatYard } from './boatYard.js';
import { Grass } from '../world/grass.js';
import { Police } from '../actors/police.js';
import { Heat, CrimeWatch } from './crimes.js';
import { Radio } from './radio.js';
import { SeaTraffic } from '../actors/seaTraffic.js';
import { clamp } from '../core/math.js';
import { Combat } from './combat.js';
import { NightLights } from '../render/nightLights.js';

export class Game {
  constructor(renderer, canvas) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 7000);
    this.input = new Input(canvas);
    this.vehicles = [];
    this.view = new View();
    this.perf = new Perf(renderer);
    this.pipeline = new Pipeline(renderer, this.scene, this.camera);
    this.gov = new Governor(this);
    this.audio = new AudioSystem();
    this.paused = false;
    this.time = 0;
    this.damageScale = 1;
    this.listeners = {};
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  off(ev, fn) { const l = this.listeners[ev]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  get wanted() { const P = this.police; return P ? { level: P.level, evading: P.level > 0 && !P.seen, searching: P.level > 0 && !P.seen && P.unseenT > 5 } : { level: 0 }; }
  emit(ev, data) { for (const f of this.listeners[ev] || []) f(data); }

  async init(progress) {
    this.world = new World(this.renderer, this.scene);
    await this.world.build(progress);
    this.sea = this.world.sea;
    this.nightLights = new NightLights(this.scene, this.world.props);
    this.grass = new Grass(this);
    this.wake = new WakeMap(this.renderer, this.sea.uni);
    this.sky = new Sky(this.renderer, this.scene, this.world);
    this.player = new Player(this, this.save?.avatar);
    this.rig = new CameraRig(this.camera, this);
    this.contact = new ContactShadows(this.scene);
    this.fx = new VehicleFx(this);
    this.traffic = new Traffic(this);
    this.peds = new Peds(this);
    this.yard = new BoatYard(this);
    this.yard.init();
    this.heat = new Heat(this);
    this.police = new Police(this);
    this.crimes = new CrimeWatch(this);
    this.radio = new Radio(this);
    this.seaTraffic = new SeaTraffic(this);
    this.combat = new Combat(this);
    this.airfield = new Airfield(this);
    this.airfield.init();
    this.gov.setSettings(this.gfx || { preset: 'auto' });
    this.pipeline.warmup();
    bindAudio(this);
  }

  spawnVehicle(id, x, z, yaw, custom = {}, opts = {}) {
    const def = VEHICLE_BY_ID[id];
    const v = def.boat ? new Boat(this, def, custom, opts) : def.air ? new Aircraft(this, def, custom, opts) : new Vehicle(this, def, custom, opts);
    v.place(x, def.boat ? 0 : this.world.groundY(x, z, opts.yRef ?? 50), z, yaw);
    this.vehicles.push(v);
    return v;
  }

  removeVehicle(v) {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
    v.dispose();
  }

  nearestVehicle(x, z, maxD = 4.5) {
    let best = null, bd = maxD;
    for (const v of this.vehicles) {
      if (v.driver && v.driver !== this.player) continue;
      const d = v.distTo(x, z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  controlAir(v) {
    const I = this.input, p = v.phys, d = (c) => (I.down.has(c) ? 1 : 0);
    const inp = v.input;
    inp.pitch = d('KeyS') - d('KeyW') + (I.down.has('ArrowDown') ? 0 : 0);
    inp.roll = d('KeyD') - d('KeyA');
    inp.yawIn = d('KeyE') - d('KeyQ');
    inp.thrDelta = (I.held('nitro') ? 1 : 0) - d('ControlLeft');
    inp.hand = I.held('handbrake'); inp.brake = inp.hand ? 1 : 0; inp.throttle = 0; inp.steer = 0; inp.boost = false;
    if (I.hit('lights')) { v.lights.auto = false; v.lights.head = !v.lights.head; }
    if (I.hit('radio') && this.radio) this.radio.toggle();
    if (I.hit('radioNext') && this.radio) this.radio.next();
    if (I.hit('reset') && v.agl > 3 && p.speed < 3) this.resetVehicle(v);
    if (this.lock) { inp.thrDelta = 0; inp.hand = true; }
  }

  controlVehicle(v, dt) {
    if (v.isAir) return this.controlAir(v);
    const I = this.input, p = v.phys;
    let steer = I.axis('left', 'right');
    const sp = p.speed;
    if (!I.gp()) steer *= 1 - Math.min(0.35, sp / 120);
    v.input.throttle = I.trigger('throttle');
    v.input.brake = I.trigger('brake');
    v.input.steer = clamp(steer * I.steerSens, -1, 1);
    v.input.hand = I.held('handbrake');
    v.input.boost = I.held('nitro');
    if (I.hit('lights')) { v.lights.auto = false; v.lights.head = !v.lights.head; if (!v.lights.head) v.lights.high = false; }
    if (I.hit('highbeam')) { v.lights.auto = false; v.lights.head = true; v.lights.high = !v.lights.high; }
    if (I.hit('indicatorL')) { v.lights.indL = !v.lights.indL; v.lights.indR = false; v.lights.hazard = false; }
    if (I.hit('indicatorR')) { v.lights.indR = !v.lights.indR; v.lights.indL = false; v.lights.hazard = false; }
    if (I.hit('hazard')) { v.lights.hazard = !v.lights.hazard; v.lights.indL = v.lights.indR = false; }
    if (I.hit('siren') && (v.def.lightbar)) { v.lights.bar = !v.lights.bar; v.lights.siren = v.lights.bar; }
    if (I.hit('engine')) { p.engineOn = !p.engineOn; if (p.sail) p.motorT = p.engineOn ? 25 : 0; if (p.engineOn) this.audio.engineStart(v); }
    if (I.hit('cruise')) p.cruise = p.cruise ? 0 : Math.max(8, p.fwdSpeed);
    if (I.hit('gearbox') && !v.isBoat) { p.manual = !p.manual; this.emit('hud:toast', { text: p.manual ? 'Manual transmission' : 'Automatic transmission' }); }
    if (p.manual) { if (I.hit('gearUp')) p.shift(1); if (I.hit('gearDown')) p.shift(-1); }
    if (I.hit('doors') && v.car.panels) {
      const S = v.doorTarget;
      if (!S.hood && !S.trunk && !S.L) S.hood = 1; else if (S.hood) { S.hood = 0; S.trunk = 1; } else if (S.trunk) { S.trunk = 0; S.L = 1; S.R = 1; } else { S.L = 0; S.R = 0; }
    }
    if (I.hit('radio') && this.radio) this.radio.toggle();
    if (I.hit('radioNext') && this.radio) this.radio.next();
    if (p.cruise && (I.trigger('brake') > 0.1 || p.speed < 4)) p.cruise = 0;
    v.horn = I.held('horn');
    if (I.hit('reset') && v.phys.speed < 3) this.resetVehicle(v);
    if (this.lock) { v.input.throttle = 0; v.input.hand = true; v.input.boost = false; }
  }

  // the previous driver is thrown out of the door and runs
  ejectDriver(x, z, yaw) {
    const side = Math.random() < 0.5 ? 1 : -1, ox = x + Math.cos(yaw) * side * 1.5, oz = z - Math.sin(yaw) * side * 1.5;
    const p = this.peds.spawnStatic(ox, oz, yaw, ['office', 'student', 'shop', 'tourist'][Math.floor(Math.random() * 4)], 'idle');
    p.state = 'dive'; p.panic = 8; p.dive = { x: Math.cos(yaw) * side, z: -Math.sin(yaw) * side, t: 0.9 };
    this.audio.play?.(p.look.female ? 'scream_f' : 'scream_m', { vol: 0.9, pos: { x: ox, y: 1.6, z: oz }, bus: 'voice', refDist: 6 });
    this.rig.addShake(0.5);
    this.emit('hud:gain', { text: 'CARJACKED', color: '#ff8a8c' });
  }

  resetBoat(v) {
    const sea = this.world.sea, need = Math.max(1.4, v.phys.draft * 2.4);
    let at = null;
    for (let r = 0; r <= 240 && !at; r += 20) for (let a = 0; a < 16; a++) { const x = v.x + Math.cos(a * 0.3927) * r, z = v.z + Math.sin(a * 0.3927) * r; if (sea.depthAt(x, z) > need && !this.world.ground(x, z, v.y + 3).deck) { at = { x, z }; break; } }
    if (!at) return;
    v.place(at.x, 0, at.z, v.yaw);
    v.moor = null;
  }

  resetVehicle(v) {
    if (v.isBoat) return this.resetBoat(v);
    if (v.isAir) { const s = this.airfield.freeSpot(v.def); if (s) { v.place(s[0], this.world.groundY(s[0], s[1], 60), s[1], Math.PI / 2); v.phys.vx = v.phys.vy = v.phys.vz = 0; } return; }
    const R = this.world.roads;
    const n = R.nearestLane(v.x, v.z, Math.sin(v.yaw), Math.cos(v.yaw), null, 60);
    if (n) {
      const p = n.lane.pl.at(n.s);
      v.place(p.x, p.y + 0.05, p.z, Math.atan2(p.dx, p.dz));
    } else v.place(v.x, this.world.groundY(v.x, v.z, v.y + 5) + 0.1, v.z, v.yaw);
    v.phys.pitch = v.phys.roll = 0;
  }

  update(dt) {
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.32; }
    const I = this.input;
    this.time += dt;
    const P = this.player;
    const env = { ground: (x, z, y) => this.world.ground(x, z, y), wet: this.sky.wetness, rain: this.sky.w.rain, night: this.sky.night, fog: this.sky.w.fog };
    if (I.hit('camera')) this.rig.cycle();
    this.rig.lookBack = I.held('lookBack');
    if (I.hit('enter') && !P.busy) {
      if (P.vehicle) { if (P.state === 'driving') P.tryExit(); }
      else {
        let v = this.nearestVehicle(P.x, P.z, 5.2);
        const tc = this.traffic.nearestCar(P.x, P.z, v ? Math.hypot(v.x - P.x, v.z - P.z) - v.hz : 4.4);
        if (tc && tc.speed < 3) { const cx = tc.x, cz = tc.z, cyaw = tc.yaw; v = this.traffic.takeOver(tc); this.ejectDriver(cx, cz, cyaw); this.emit('player:carjack', { car: tc, v }); }
        if (v) P.tryEnter(v);
      }
    }
    if (P.vehicle && P.state === 'driving') this.controlVehicle(P.vehicle, dt);
    for (const v of this.vehicles) {
      if ((v !== P.vehicle || P.state !== 'driving') && !v.ai && !v.driver) { v.input.throttle = 0; v.input.brake = v.isBoat ? 0 : v.phys.speed > 0.2 ? 0.4 : 0; v.input.steer = 0; }
      v.update(dt, env);
    }
    for (let i = 0; i < this.vehicles.length; i++) for (let j = i + 1; j < this.vehicles.length; j++) collideVehicles(this.vehicles[i], this.vehicles[j]);
    const focus = P.vehicle ? P.vehicle.pos.clone() : P.pos;
    this.contact.begin();
    this.traffic.update(dt, focus, this.camera, this.view);
    this.police.update(dt); this.crimes.update(dt); this.heat.update(dt);
    this.radio.update(dt);
    this.seaTraffic.update(dt);
    this.peds.update(dt, focus);
    this.contact.end();
    P.update(dt, I, this.rig.footYaw);
    this.rig.update(dt, I);
    this.view.update(this.camera);
    this.sky.update(dt, P.vehicle ? P.vehicle.pos : P.pos, this.camera);
    this.contact.setSun(this.sky.uniforms.sunDir.value, Math.min(1, this.sky.sun.intensity / 2.6) * (1 - this.sky.night * 0.6));
    this.world.update(dt, this.camera.position, this.sky, this.view);
    this.nightLights?.update(dt, this.camera.position, this.sky.night);
    this.fx.update(dt);
    this.yard.update(dt);
    {
      const pu = [];
      if (P.vehicle) pu.push({ x: P.vehicle.x, z: P.vehicle.z, r: Math.max(P.vehicle.hx, P.vehicle.hz) * 1.05 + 0.6, k: 1 });
      else if (P.state !== 'swim') pu.push({ x: P.x, z: P.z, r: 0.95, k: 1 });
      for (const v of this.vehicles) { if (pu.length >= 6) break; if (v === P.vehicle || v.isBoat) continue; const dx = v.x - this.camera.position.x, dz = v.z - this.camera.position.z; if (dx * dx + dz * dz < 1600) pu.push({ x: v.x, z: v.z, r: Math.max(v.hx, v.hz) * 1.05 + 0.4, k: v.speed > 0.5 ? 1 : 0.6 }); }
      this.grass.update(dt, this.camera, this.sky, pu);
    }
    this.wake.update(dt, this.camera.position.x, this.camera.position.z);
    this.audio.update(this, dt);
    for (const v of this.vehicles) { for (const e of v.events) { if (e.type === 'crash' && v === P.vehicle) { this.rig.addShake(Math.min(1, e.impact / 20)); if (e.impact > 17 && this.hitStop <= 0) this.hitStop = 0.1; } this.emit('vehicle:' + e.type, { v, ...e }); } v.events.length = 0; }
    I.endFrame();
  }

  render(dt = 1 / 60) {
    this.perf.begin();
    if (this.pipeline.enabled) this.pipeline.render(dt); else this.renderer.render(this.scene, this.camera);
    this.perf.end();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline.resize(w, h);
  }
}
