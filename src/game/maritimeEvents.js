import * as THREE from 'three';
import { Markers } from './markers.js';
import { buildHuman as buildHumanRaw, poseFor, applyPose, blendPose, REST, DEFAULT_LOOK } from '../actors/human.js';
import { WATER_LEVEL } from '../data/world.js';
import { RNG } from '../core/rng.js';
import { clamp } from '../core/math.js';

const LOOKS = [
  { height: 1.78, build: 0.5, skin: '#c69272', hair: { style: 'short', color: '#2b1e16' }, top: { type: 'tshirt', color: '#e8641c' }, pants: { type: 'jeans', color: '#1d4f91' } },
  { height: 1.7, build: 0.4, skin: '#8d5a3b', hair: { style: 'buzz', color: '#111111' }, top: { type: 'tshirt', color: '#f2c12e' }, pants: { type: 'jeans', color: '#2f2f32' } },
  { height: 1.66, build: 0.35, skin: '#f1d0b5', hair: { style: 'short', color: '#7a4a21' }, top: { type: 'tshirt', color: '#e5383b' }, pants: { type: 'jeans', color: '#e8e6e0' } },
];
const buildHuman = (look) => buildHumanRaw({ ...DEFAULT_LOOK, facial: 'none', jacket: { type: 'none', color: '#222222' }, ...look });
const NAMES = ['Skipper', 'Mate', 'Boater', 'Fisherman', 'Sailor'];
const WEIGHT = { distress: 2, overboard: 1, debris: 2, dolphins: 2, cgOp: 1, squall: 0.7 };

// Things that happen out on the water, scattered around the player on the nav grid and remembered by 400 m cell so they do not return to the same spots:
// boats in trouble, people overboard, floating cargo, pods of dolphins, a coast guard stop and squalls drifting across the bay.
export class MaritimeEvents {
  constructor(game) {
    this.g = game; this.rng = new RNG('maritime-' + Date.now()); this.events = []; this.used = []; this.cool = 45; this.id = 1; this.enabled = true;
    this.markers = new Markers(game);
    game.events = { active: [] };
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    this.debrisGeo = [new THREE.BoxGeometry(0.7, 0.5, 0.5), new THREE.CylinderGeometry(0.28, 0.28, 0.85, 10).rotateZ(1.2), new THREE.BoxGeometry(1.4, 0.08, 0.35)];
    this.debrisMat = [mat('#8a6a3c'), mat('#c0392b'), mat('#b9a37a')];
    this.rain = null; this.left = [];
  }

  blips() { return this.events.filter((e) => e.state !== 'done' && e.type !== 'squall').map((e) => ({ x: e.x, z: e.z, color: e.type === 'dolphins' ? '#36d6ff' : '#ffb347', r: 5 })).concat(this.g.sky.squall ? [{ x: this.g.sky.squall.x, z: this.g.sky.squall.z, color: '#9aa7b5', r: 10 }] : []); }

  say(who, text) { this.g.emit('marine:radio', { who, text }); }

  pickType() {
    const sea = this.g.world.sea.waves, w = { ...WEIGHT };
    if (sea.hs > 2.8) { w.distress *= 2; w.overboard *= 1.6; w.dolphins = 0; w.cgOp *= 0.4; w.squall = 0; } else if (sea.hs < 1.2) { w.debris *= 0.8; w.dolphins *= 1.4; }
    if (this.g.sky.squall || this.g.sky.w.rain > 0.5) w.squall = 0;
    return this.rng.weighted(Object.entries(w).filter(([, v]) => v > 0).map(([k, v]) => ({ k, w: v }))).k;
  }

  freeSpot(F) {
    const g = this.g, nav = g.seaNav; if (!nav) return null;
    const nn = nav.nearest(F.x, F.z, 80), comp = nn ? nav.comp[nn.k] : nav.big;
    for (let t = 0; t < 14; t++) {
      const p = nav.random(() => this.rng.f(), comp, F.x, F.z, 550, 2300); if (!p) continue;
      const key = Math.floor(p.x / 400) + ',' + Math.floor(p.z / 400);
      if (this.used.includes(key)) continue;
      if (Math.hypot(p.x - F.x, p.z - F.z) < 900 && g.view.sphere(p.x, -2, p.z, 30)) continue;
      this.used.push(key); if (this.used.length > 14) this.used.shift();
      return p;
    }
    return null;
  }

  spawnEvent(F, forceType, at) {
    const type = forceType || this.pickType(), p = at || this.freeSpot(F);
    if (!p) return;
    const e = { id: this.id++, type, x: p.x, z: p.z, state: 'dormant', t: 0, ttl: type === 'squall' ? 20 : 520, ents: {}, hit: 0, name: '' };
    const names = { distress: 'Vessel in distress', overboard: 'Person overboard', debris: 'Floating cargo', dolphins: 'Dolphin pod', cgOp: 'Coast Guard operation', squall: 'Squall line' };
    e.name = names[type];
    if (type === 'squall') this.startSquall(e, F);
    else e.marker = this.markers.add({ x: p.x, z: p.z, r: type === 'dolphins' ? 18 : 12, color: type === 'dolphins' ? '#36d6ff' : '#ffb347', beam: true, gem: false, water: true });
    if (type === 'distress') this.say('Coast Guard', 'Mayday relay: vessel taking on water, position marked on your chart.');
    else if (type === 'overboard') this.say('Coast Guard', 'Man overboard reported. Any vessel in the area, please assist.');
    else if (type === 'debris') this.say('Coast Guard', 'Cargo lost overboard, floating hazard to navigation.');
    this.events.push(e);
    this.sync();
  }

  sync() { this.g.events.active = this.events.filter((e) => e.state !== 'done' && e.type !== 'squall').map((e) => ({ id: 'mar' + e.id, name: e.name, x: e.x, z: e.z })); }

  // ---- squall: a moving patch of storm that drags rain, wind and sea around with it
  startSquall(e, F) {
    const g = this.g, wd = g.sky.wind, dx = e.x - F.x, dz = e.z - F.z, d = Math.hypot(dx, dz) || 1;
    g.sky.squall = { x: e.x, z: e.z, r: 520, k: 1, vx: -dx / d * 7 + Math.cos(wd.dir) * 3, vz: -dz / d * 7 + Math.sin(wd.dir) * 3, t: 0, life: 300 };
    e.state = 'live';
    this.say('Coast Guard', 'Marine warning: squall line forming offshore, expect rain and gusts.');
    if (!this.rain) {
      const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
      this.rainU = { uTime: { value: 0 }, uA: { value: 0 } };
      this.rain = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: this.rainU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: 'varying vec3 vP; varying float vH; void main(){ vP = position; vH = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uTime; uniform float uA; varying vec3 vP; varying float vH; float h(float x){ return fract(sin(x * 91.7) * 43758.5); } void main(){ float a = atan(vP.z, vP.x) * 38.0; float s = h(floor(a)); float st = smoothstep(0.45, 1.0, fract(vH * 6.0 + uTime * (1.2 + s) + s * 9.0)); float col = 0.35 + 0.65 * s; gl_FragColor = vec4(vec3(0.55, 0.6, 0.66), uA * (0.18 + 0.5 * st * col) * smoothstep(0.0, 0.12, vH) * (1.0 - 0.6 * vH)); }',
      }));
      this.rain.frustumCulled = false; this.rain.renderOrder = 6; this.g.scene.add(this.rain);
    }
  }

  stepSquall(dt) {
    const sq = this.g.sky.squall; if (!sq) { if (this.rain) this.rain.visible = false; return; }
    sq.t += dt; sq.x += sq.vx * dt; sq.z += sq.vz * dt;
    sq.k = clamp(Math.min(sq.t / 40, (sq.life - sq.t) / 40), 0, 1);
    if (sq.t > sq.life) { this.g.sky.squall = null; for (const e of this.events) if (e.type === 'squall') e.state = 'done'; this.rain.visible = false; return; }
    for (const e of this.events) if (e.type === 'squall') { e.x = sq.x; e.z = sq.z; }
    const cam = this.g.camera.position, d = Math.hypot(cam.x - sq.x, cam.z - sq.z);
    this.rain.visible = d > sq.r * 0.5;
    this.rain.position.set(sq.x, WATER_LEVEL - 20, sq.z); this.rain.scale.set(sq.r * 0.75, 900, sq.r * 0.75);
    this.rainU.uTime.value += dt; this.rainU.uA.value = sq.k * (0.6 + 0.4 * Math.sin(sq.t * 0.2));
  }

  // ---- entities
  activate(e) {
    const g = this.g, sea = g.world.sea; e.state = 'live';
    const surf = (x, z) => sea.waveAt(x, z);
    if (e.type === 'distress') {
      const kind = this.rng.pick(['sloop', 'sport', 'fisher', 'rib', 'cruiser', 'yacht']);
      const v = g.spawnVehicle(kind, e.x, e.z, this.rng.f() * 6.283, {}, { kind: 'civilian' }); v.npcBoat = true; v.moor = null; v.leak = 0.45; v.distress = true;
      v.phys.engineOn = false; e.ents.boat = v; e.prog = 0;
    } else if (e.type === 'overboard') {
      const n = this.rng.int(1, 3); e.ents.people = [];
      for (let i = 0; i < n; i++) { const rig = buildHuman(LOOKS[i % LOOKS.length]); rig.root.rotation.order = 'YXZ'; g.scene.add(rig.root); e.ents.people.push({ rig, x: e.x + this.rng.range(-8, 8), z: e.z + this.rng.range(-8, 8), pose: { ...REST }, ph: this.rng.f() * 6, saved: false, name: NAMES[i % NAMES.length] }); }
    } else if (e.type === 'debris') {
      e.ents.items = [];
      const n = this.rng.int(7, 12), dm = this.debrisGeo.map((geo, i) => ({ geo, mat: this.debrisMat[i] }));
      for (let i = 0; i < n; i++) { const t = this.rng.int(0, 2), m = new THREE.Mesh(dm[t].geo, dm[t].mat); m.castShadow = true; g.scene.add(m); e.ents.items.push({ m, x: e.x + this.rng.range(-26, 26), z: e.z + this.rng.range(-26, 26), ph: this.rng.f() * 6, value: Math.round(this.rng.range(60, 190)) }); }
    } else if (e.type === 'dolphins') {
      const sc = g.marine.spawnSchool('dolphin', e.x, e.z, e.id, 77); sc.manual = true; sc.cell = null;
      sc.fish = sc.fish.slice(0, 4); sc.fish.forEach((f, i) => { f.ph = i * 1.7; f.sc = (2.0 + this.rng.f() * 0.5); f.r = 0.42; f.g = 0.47; f.b = 0.52; f.jt = this.rng.f() * 4; f.ang = i * 1.57; });
      e.ents.pod = sc; e.seen = false;
    } else if (e.type === 'cgOp') {
      const pop = g.seaTraffic.pop, a = pop.spawn('fisher', e.x, e.z, this.rng.f() * 6.283, true); a.state = 'idle'; a.timer = 9999; pop.acquire(a); a.v.moor = { x: a.v.x, z: a.v.z, yaw: a.v.yaw };
      const c = g.spawnVehicle('patrol', e.x + 14, e.z + 6, a.v.yaw, {}, { kind: 'police' }); c.cg = true; c.moor = { x: c.x, z: c.z, yaw: a.v.yaw + 0.4 }; c.lights.bar = true; c.lights.siren = false;
      e.ents.fisher = a; e.ents.cg = c; e.warn = 0;
    }
  }

  deactivate(e) {
    const g = this.g;
    const E = e.ents;
    if (E.boat && !E.boat.driver && g.player.vehicle !== E.boat) g.removeVehicle(E.boat);
    if (E.wreck && g.player.vehicle !== E.wreck) this.left.push(E.wreck);
    for (const p of E.people || []) g.scene.remove(p.rig.root);
    for (const it of E.items || []) g.scene.remove(it.m);
    if (E.pod) { const i = g.marine.schools.indexOf(E.pod); if (i >= 0) g.marine.schools.splice(i, 1); }
    if (E.fisher) g.seaTraffic.pop.drop(E.fisher);
    if (E.cg && g.player.vehicle !== E.cg) g.removeVehicle(E.cg);
    e.ents = {};
  }

  reward(e, money, xp, text) {
    const g = this.g, st = g.app?.store;
    if (st?.profile) st.act({ type: 'reward', money, xp, rep: Math.round(xp * 0.08), reason: e.name });
    g.emit('hud:gain', { text: text || `${e.name.toUpperCase()} +$${money}`, color: '#7cf29c' });
  }

  finish(e) { e.state = 'done'; if (e.marker) { this.markers.remove(e.marker); e.marker = null; } this.deactivate(e); this.sync(); }

  stepEvent(e, dt, F) {
    const g = this.g, sea = g.world.sea, P = g.player, d = Math.hypot(F.x - e.x, F.z - e.z), E = e.ents;
    const speed = P.vehicle ? P.vehicle.phys.speed : P.speed;
    if (e.type === 'distress' && E.boat) {
      const v = E.boat; e.x = v.x; e.z = v.z; if (e.marker) { e.marker.x = v.x; e.marker.z = v.z; }
      const pt = g.fx.pt;
      if (Math.random() < dt * 14) pt.emit({ x: v.x + (Math.random() - 0.5) * 1.5, y: v.y + 1.8, z: v.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 0.6, life: 2 + Math.random() * 1.5, s0: 0.4, s1: 2.6, c0: [0.2, 0.2, 0.22, 0.35], c1: [0.3, 0.3, 0.32, 0], drag: 0.6, grav: -0.5, kind: 0 });
      e.flare = (e.flare || 0) - dt;
      if (e.flare <= 0) { e.flare = 4 + Math.random() * 3; for (let i = 0; i < 26; i++) pt.emit({ x: v.x, y: v.y + 2, z: v.z, vx: (Math.random() - 0.5) * 0.8, vy: 14 + Math.random() * 6, vz: (Math.random() - 0.5) * 0.8, life: 2.2, s0: 0.5, s1: 0.2, c0: [3, 0.5, 0.3, 0.9], c1: [1.5, 0.1, 0.05, 0], drag: 0.3, grav: 4, add: 1, kind: 1, spin: 0 }); }
      if (v.sunk) { this.say('Coast Guard', 'Vessel has gone down. Survivors in the water.'); for (let i = 0; i < 2; i++) { const rig = buildHuman(LOOKS[i]); rig.root.rotation.order = 'YXZ'; g.scene.add(rig.root); (e.ents.people ||= []).push({ rig, x: v.x + i * 3, z: v.z - 2, pose: { ...REST }, ph: i, saved: false, name: NAMES[i] }); } e.type = 'overboard'; e.ents.wreck = v; e.ents.boat = null; return; }
      if (d < 24 && speed < 4.5) { e.prog = (e.prog || 0) + dt; if (e.prog > 6) { v.leak = 0; v.repair(); v.distress = false; this.reward(e, Math.round(900 + v.def.price * 0.004), 450, 'VESSEL SAVED'); this.say(NAMES[e.id % 5], 'Pumps are holding. Thank you!'); E.boat = null; this.left.push(v); this.finish(e); return; } } else e.prog = Math.max(0, (e.prog || 0) - dt);
    }
    if (e.type === 'overboard') {
      let left = 0;
      for (const p of E.people || []) {
        if (p.saved) continue; left++;
        const y = sea.waveAt(p.x, p.z) - 1.08; p.ph += dt; p.x += Math.cos(g.sky.wind.dir) * 0.15 * dt; p.z += Math.sin(g.sky.wind.dir) * 0.15 * dt;
        blendPose(p.pose, poseFor(Math.sin(p.ph * 0.9) > 0.9 ? 'wave' : 'tread', p.ph, p.ph, 1), 1 - Math.exp(-dt * 8), p.pose); applyPose(p.rig, p.pose);
        p.rig.root.position.set(p.x, y, p.z); p.rig.root.rotation.set(0, Math.sin(p.ph * 0.3) * 1.5, 0);
        const dd = Math.hypot(F.x - p.x, F.z - p.z);
        if (dd < 7 && speed < 4) { p.t = (p.t || 0) + dt; if (p.t > 2.5) { p.saved = true; p.rig.root.visible = false; g.emit('player:splash', { x: p.x, y: y + 1, z: p.z, speed: 2 }); this.reward(e, Math.round(500 + Math.random() * 500), 300, 'RESCUED ' + p.name.toUpperCase()); this.say(p.name, 'You saved my life!'); } } else p.t = 0;
      }
      if (!left) this.finish(e);
    }
    if (e.type === 'debris') {
      let left = 0; const wd = g.sky.wind;
      for (const it of E.items) {
        if (it.got) continue; left++;
        it.x += Math.cos(wd.dir) * 0.12 * dt; it.z += Math.sin(wd.dir) * 0.12 * dt; it.ph += dt;
        const y = sea.waveAt(it.x, it.z, null); it.m.position.set(it.x, y + 0.05, it.z); it.m.rotation.set(Math.sin(it.ph * 1.3) * 0.3, it.ph * 0.2, Math.cos(it.ph * 1.1) * 0.3);
        if (Math.hypot(F.x - it.x, F.z - it.z) < (P.vehicle ? 3.6 + P.vehicle.hx : 2.4)) { it.got = true; g.scene.remove(it.m); g.emit('player:splash', { x: it.x, y, z: it.z, speed: 2 }); this.reward(e, it.value, 60, `SALVAGE +$${it.value}`); }
      }
      if (!left) this.finish(e);
    }
    if (e.type === 'dolphins' && E.pod) {
      const sc = E.pod, surf = sea.waveAt(sc.cx, sc.cz), boat = P.vehicle?.isBoat ? P.vehicle : null;
      let tx = e.x + Math.cos(e.t * 0.05) * 90, tz = e.z + Math.sin(e.t * 0.05) * 90, sp = 5.5;
      if (boat && d < 320) { tx = boat.x + Math.sin(boat.yaw) * 14 + Math.cos(boat.yaw) * 5; tz = boat.z + Math.cos(boat.yaw) * 14 - Math.sin(boat.yaw) * 5; sp = Math.max(5, boat.phys.speed + 2.5); }
      sc.fish.forEach((f, i) => {
        f.jt = (f.jt || 0) + dt * (0.5 + 0.1 * i); const ph = f.jt % 3.2, arc = ph < 1.1 ? Math.sin((ph / 1.1) * Math.PI) : 0;
        const ox = Math.cos(f.ang + e.t * 0.2) * (6 + i * 2.5), oz = Math.sin(f.ang + e.t * 0.2) * (6 + i * 2.5);
        const wx = tx + ox - f.x, wz = tz + oz - f.z, wl = Math.hypot(wx, wz) || 1, spd = Math.min(sp * 1.2, 3 + wl * 0.4);
        f.vx += (wx / wl * spd - f.vx) * Math.min(1, dt * 1.5); f.vz += (wz / wl * spd - f.vz) * Math.min(1, dt * 1.5);
        f.x += f.vx * dt; f.z += f.vz * dt;
        const y = surf - 0.9 + arc * 2.4, vy = ph < 1.1 ? Math.cos((ph / 1.1) * Math.PI) * 2.4 * Math.PI / 1.1 * 0.5 : -0.2;
        f.vy = vy; f.y = y;
        if (arc > 0.2 && !f.up) { f.up = true; g.emit('player:splash', { x: f.x, y: surf, z: f.z, speed: 3 }); } else if (arc <= 0.05) f.up = false;
      });
      let cx = 0, cz = 0; for (const f of sc.fish) { cx += f.x; cz += f.z; } sc.cx = cx / sc.fish.length; sc.cz = cz / sc.fish.length; sc.cy = surf - 0.8; sc.active = true;
      e.x = sc.cx; e.z = sc.cz; if (e.marker) { e.marker.x = e.x; e.marker.z = e.z; }
      if (!e.seen && d < 70) { e.seen = true; this.reward(e, 0, 140, 'DOLPHINS SPOTTED'); g.app?.store?.act?.({ type: 'stat', key: 'dolphinsSeen', amount: 1 }); }
    }
    if (e.type === 'cgOp' && E.cg) {
      const c = E.cg;
      if (d < 90 && speed > 8 && e.warn <= 0) { e.warn = 12; this.say('Coast Guard', 'Vessel approaching the stop, reduce speed and keep clear.'); }
      e.warn = Math.max(0, e.warn - dt); c.lights.siren = false;
      if (e.t > 260 && d > 250) this.finish(e);
    }
  }

  update(dt) {
    const g = this.g;
    if (!this.enabled || !g.seaNav || !g.world.sea) return;
    this.markers.update(dt, g.camera.position);
    this.stepSquall(dt);
    const P = g.player, F = P.vehicle || P, sea = g.world.sea;
    for (let i = this.left.length - 1; i >= 0; i--) { const v = this.left[i]; if (!g.vehicles.includes(v)) this.left.splice(i, 1); else if (!v.driver && v !== P.vehicle && Math.hypot(v.x - F.x, v.z - F.z) > 700) { g.removeVehicle(v); this.left.splice(i, 1); } }
    const afloat = (P.vehicle && P.vehicle.isBoat) || P.state === 'swim' || sea.distanceToSea(F.x, F.z) < 500;
    this.cool -= dt;
    const mission = g.app?.missions?.run;
    if (this.cool <= 0 && afloat && !mission && g.police.level === 0 && this.events.filter((e) => e.state !== 'done').length < 3) { this.cool = 60 + this.rng.f() * 90; this.spawnEvent(F); }
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]; e.t += dt;
      if (e.state === 'done') { if (e.t > 5) this.events.splice(i, 1); continue; }
      if (e.type === 'squall') { if (!g.sky.squall) e.state = 'done'; continue; }
      const d = Math.hypot(F.x - e.x, F.z - e.z);
      if (e.state === 'dormant') { if (d < 650) this.activate(e); else if (e.t > e.ttl || d > 3500) this.finish(e); }
      if (e.state === 'live') { this.stepEvent(e, dt, F); if (e.state === 'live' && (d > 1300 || (e.t > 900))) this.finish(e); }
    }
  }
}
