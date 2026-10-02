import * as THREE from 'three';
import { VEHICLE_BY_ID } from '../data/vehicles.js';
import { MOORINGS } from '../data/routes.js';
import { RNG } from '../core/rng.js';
import { SeaNav } from '../world/seaNav.js';
import { AIBoat } from '../vehicles/aiBoat.js';
import { TRAFFIC } from '../data/sea.js';
import { wrapAngle, dampAngle, smoothstep } from '../core/math.js';

const KIND_LIST = Object.keys(TRAFFIC.kinds).filter((k) => TRAFFIC.kinds[k].w > 0).map((k) => ({ k, w: TRAFFIC.kinds[k].w }));
const _o = new THREE.Object3D(), _n = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();

// Far boats are drawn as two instanced meshes (hull with a cabin, and a rig for the sailboats) so a whole bay of traffic costs two draw calls.
class ProxyBoats {
  constructor(scene, cap = 96) {
    const hull = new THREE.Shape();
    hull.moveTo(0, -0.5); hull.lineTo(0.5, -0.12); hull.lineTo(0.5, 0.5); hull.lineTo(-0.5, 0.5); hull.lineTo(-0.5, -0.12); hull.closePath();
    let hg = new THREE.ExtrudeGeometry(hull, { depth: 1, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const cabin = new THREE.BoxGeometry(0.62, 0.55, 0.38).translate(0, 1.27, 0.12);
    hg = mergeSimple([hg, cabin.toNonIndexed()]);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.05, -0.25, 0, 0.05, 0.18, 0, 1, -0.2, 0, 0.05, 0.24, 0, 0.05, 0.5, 0, 0.82, 0.24], 3));
    rg.computeVertexNormals();
    this.hull = new THREE.InstancedMesh(hg, new THREE.MeshLambertMaterial({ color: 0xffffff }), cap);
    this.rig = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: 0xf4f2ea, emissive: 0x8c8a82, side: THREE.DoubleSide }), cap);
    for (const m of [this.hull, this.rig]) { m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = false; scene.add(m); }
    this.hull.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.cap = cap; this.nh = 0; this.nr = 0;
  }

  begin() { this.nh = 0; this.nr = 0; }

  add(def, x, y, z, yaw, pitch, roll, k, color) {
    if (this.nh >= this.cap) return;
    const b = def.body, sail = !!def.perf.sail;
    _e.set(pitch, yaw, roll, 'YXZ'); _o.position.set(x, y - b.draft * 0.5, z); _o.rotation.copy(_e);
    _o.scale.set(b.W * k, Math.max(0.35, b.H * 0.45) * k, b.L * k); _o.updateMatrix();
    this.hull.setMatrixAt(this.nh, _o.matrix); _c.set(color); this.hull.setColorAt(this.nh, _c); this.nh++;
    if (sail && this.nr < this.cap) {
      _o.position.set(x, y + b.H * 0.35, z); _o.scale.set(1, def.perf.sail.mast * k, b.L * 0.9 * k); _o.updateMatrix();
      this.rig.setMatrixAt(this.nr++, _o.matrix);
    }
  }

  end() {
    this.hull.count = this.nh; this.rig.count = this.nr;
    this.hull.instanceMatrix.needsUpdate = true; this.rig.instanceMatrix.needsUpdate = true; if (this.hull.instanceColor) this.hull.instanceColor.needsUpdate = true;
  }

  set visible(v) { this.hull.visible = v; this.rig.visible = v; }
}

function mergeSimple(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return m;
}

// Persistent population of boats on the nav grid. Every boat exists all the time: far ones move along their route as points, mid-range ones are instanced
// proxies, near ones are real physics boats driven by AIBoat (pooled). Nobody spawns in view: new boats appear beyond the proxy range and fade in.
export class BoatTraffic {
  constructor(game) {
    this.g = game; this.rng = new RNG('boat-traffic'); this.agents = []; this.nextId = 1; this.density = 1; this.ready = false; this.pool = new Map();
    this.nav = new SeaNav(game.world); game.seaNav = this.nav;
    this.proxy = new ProxyBoats(game.scene);
    this.ports = []; this.tick = 0; this.slow = 0;
  }

  get real() { return this.agents.filter((a) => a.v); }

  initPorts() {
    const W = this.g.world, nav = this.nav, add = (x, z, station) => { const c = nav.nearest(x, z, 24, nav.big); if (c) this.ports.push({ x: c.x, z: c.z, comp: nav.big, station, ax: x, az: z }); };
    if (W.marina?.berths?.length) { const b = W.marina.berths[0]; add(b.fx, b.z, true); }
    if (W.harborDocks?.berths?.length) { const b = W.harborDocks.berths[0]; add(b.x, b.z, true); }
    for (const m of MOORINGS) add(m[0], m[1], false);
    if (!this.ports.length) this.ports.push({ ...nav.nearest(-1500, 200), comp: nav.big });
  }

  init() {
    this.ready = true; this.initPorts();
    const F = this.g.player.vehicle || this.g.player, rnd = () => this.rng.f();
    const nn = this.nav.nearest(F.x, F.z, 80), comp = nn ? this.nav.comp[nn.k] : this.nav.big;
    const want = Math.round(TRAFFIC.count * this.density);
    for (let i = 0; i < want; i++) {
      const near = i < want * 0.6, p = this.nav.random(rnd, near ? comp : 0, F.x, F.z, near ? 450 : 1500, near ? 2400 : 5000) || this.nav.random(rnd, 0, F.x, F.z, 300, 6000);
      if (p) this.spawn(this.rng.weighted(KIND_LIST).k, p.x, p.z, rnd() * 6.283, true);
    }
    for (let i = 0; i < 2; i++) { const pt = this.ports[i % this.ports.length], p = this.nav.random(rnd, pt.comp, pt.x, pt.z, 200, 900); if (p) this.spawn('patrol', p.x, p.z, rnd() * 6.283, true); }
  }

  spawn(kind, x, z, yaw, instant = false) {
    const def = VEHICLE_BY_ID[kind], K = TRAFFIC.kinds[kind];
    const a = { id: this.nextId++, kind, def, K, color: this.rng.pick(def.colors), x, z, yaw, spd: 0, path: null, pi: 0, state: 'idle', timer: this.rng.range(1, 20), comp: this.nav.compAt(x, z) || this.nav.big, v: null, ai: null, vis: instant ? 1 : 0, sim: 0, pace: this.rng.range(0.8, 1.15), shelterT: 0, deadT: 0, base: 0 };
    this.agents.push(a);
    return a;
  }

  cruise(a) {
    const d = a.def, sail = !!d.perf.sail;
    return (sail ? d.perf.vmax : d.perf.vmax * a.K.cruise) * a.pace;
  }

  plan(a) {
    const nav = this.nav, rnd = () => this.rng.f(), role = a.K.role;
    const [rmin, rmax] = role === 'play' ? [150, 700] : role === 'fish' ? [400, 1500] : role === 'cruise' ? [800, 2500] : role === 'sail' ? [500, 2000] : [500, 2200];
    for (let t = 0; t < 5; t++) {
      const p = nav.random(rnd, a.comp, a.x, a.z, rmin, rmax);
      if (!p) continue;
      const path = nav.path(a.x, a.z, p.x, p.z);
      if (path && path.length) { this.setPath(a, path); return true; }
    }
    a.state = 'idle'; a.timer = 10; return false;
  }

  setPath(a, path) {
    a.path = path; a.pi = 0; a.base = 0; a.state = a.state === 'return' ? 'return' : 'cruise';
    if (a.v) { a.v.moor = null; a.ai.follow(path); a.ai.maxSpeed = this.cruise(a); }
  }

  arrive(a) {
    const role = a.K.role;
    if (a.state === 'return') { a.state = 'sheltered'; a.shelterT = 0; if (a.v) this.demote(a); return; }
    a.state = 'idle'; a.path = null;
    a.timer = role === 'fish' ? this.rng.range(40, 140) : role === 'cruise' ? this.rng.range(60, 200) : role === 'play' ? this.rng.range(3, 25) : this.rng.range(8, 60);
    a.spd = 0;
    if (a.v) { a.ai.stop(); a.v.moor = { x: a.v.x, z: a.v.z, yaw: a.v.yaw }; }
  }

  // ---- real boats
  acquire(a) {
    const g = this.g, key = a.kind + a.color, list = this.pool.get(key);
    let v = list?.pop();
    if (v) { v.repair?.(); v.group.visible = true; g.vehicles.push(v); v.place(a.x, 0, a.z, a.yaw); v.input = { throttle: 0, brake: 0, steer: 0, hand: false, boost: false }; }
    else v = g.spawnVehicle(a.kind, a.x, a.z, a.yaw, { color: a.color }, { kind: 'civilian' });
    v.moor = null; v.npcBoat = true; v.phys.engineOn = true; if (a.kind === 'patrol') v.lights.bar = true;
    v.phys.vx = Math.sin(a.yaw) * a.spd; v.phys.vz = Math.cos(a.yaw) * a.spd;
    a.v = v; a.ai = new AIBoat(g, v, { maxSpeed: this.cruise(a), aggr: 0.3 });
    if (a.state === 'idle' || !a.path) v.moor = { x: a.x, z: a.z, yaw: a.yaw };
    else a.ai.follow(a.path.slice(a.pi));
    a.base = a.pi;
  }

  release(v, key) {
    const g = this.g, i = g.vehicles.indexOf(v);
    if (i >= 0) g.vehicles.splice(i, 1);
    v.ai = null; v.moor = null;
    const list = this.pool.get(key) || []; this.pool.set(key, list);
    if (list.length < TRAFFIC.poolCap && !v.sunk) { v.group.visible = false; list.push(v); } else v.dispose();
  }

  demote(a) {
    const v = a.v; if (!v) return;
    a.x = v.x; a.z = v.z; a.yaw = v.yaw; a.spd = v.phys.speed;
    if (a.ai?.path) a.pi = Math.min(a.path.length - 1, a.base + a.ai.pi);
    this.release(v, a.kind + a.color);
    a.v = null; a.ai = null;
  }

  drop(a) {
    const i = this.agents.indexOf(a); if (i >= 0) this.agents.splice(i, 1);
    if (a.v) { a.v.ai = null; if (!a.v.driver) this.g.removeVehicle(a.v); }
  }

  // ---- kinematic motion
  kin(a, dt, seaK) {
    if (a.state === 'idle') { a.timer -= dt; if (a.timer <= 0 && !this.plan(a)) a.timer = 15; return; }
    if (!a.path || a.pi >= a.path.length) { this.arrive(a); return; }
    const w = a.path[a.pi], dx = w.x - a.x, dz = w.z - a.z, d = Math.hypot(dx, dz);
    a.yaw = dampAngle(a.yaw, Math.atan2(dx, dz), 1.4, dt);
    let sp = this.cruise(a) * seaK;
    if (a.def.perf.sail) {
      const wd = this.g.sky.wind, rel = Math.abs(wrapAngle(a.yaw - Math.atan2(-wd.x, -wd.z)));
      sp *= 0.25 + 0.75 * smoothstep(0.3, 1.2, rel);
    }
    a.spd += (sp - a.spd) * Math.min(1, dt * 0.6);
    const s = Math.min(d, a.spd * dt);
    a.x += (dx / (d || 1)) * s; a.z += (dz / (d || 1)) * s;
    if (d < Math.max(30, a.spd * 3)) { a.pi++; if (a.pi >= a.path.length) this.arrive(a); }
  }

  nearestPort(a) {
    let best = null, bd = 1e18;
    for (const p of this.ports) { if (p.comp !== a.comp) continue; const d = (p.x - a.x) ** 2 + (p.z - a.z) ** 2; if (d < bd) { bd = d; best = p; } }
    return best || this.ports[0];
  }

  update(dt) {
    const g = this.g;
    if (!g.world.sea) return;
    if (!this.ready) this.init();
    const P = g.player, F = P.vehicle || P, W = g.world.sea.waves, wd = g.sky.wind;
    const seaK = 1 / (1 + 0.12 * Math.pow(W.hs, 1.2));
    for (const a of this.agents) {
      if (a.state === 'sheltered') continue;
      if (a.v) {
        const v = a.v;
        a.x = v.x; a.z = v.z; a.yaw = v.yaw; a.spd = v.phys.speed;
        a.ai.seaK = seaK; a.ai.update(dt);
        if (a.ai.arrived && a.state !== 'idle') this.arrive(a);
        else if (a.state === 'idle') { a.timer -= dt; if (a.timer <= 0 && this.plan(a)) { a.ai.follow(a.path); a.base = 0; } }
      } else {
        a.sim += dt;
        const d2 = (a.x - F.x) ** 2 + (a.z - F.z) ** 2, step = d2 < 800 * 800 ? 0.1 : 0.5;
        if (a.sim >= step) { this.kin(a, a.sim, seaK); a.sim = 0; }
      }
    }
    this.tick -= dt;
    if (this.tick <= 0) { this.tick = 0.5; this.manage(F, W, wd); }
    this.draw(F, W, dt);
  }

  manage(F, W, wd) {
    const g = this.g, near2 = TRAFFIC.near ** 2, far2 = TRAFFIC.far ** 2;
    let realN = 0;
    for (const a of [...this.agents]) {
      if (a.v) {
        const v = a.v;
        if (v.driver || g.player.vehicle === v) { a.v.ai = null; a.v.npcBoat = true; a.v = null; a.ai = null; this.agents.splice(this.agents.indexOf(a), 1); g.emit('boat:hijack', { v }); continue; }
        if (v.sunk || v.disabled) { a.deadT += 0.5; if (a.deadT > 40 && Math.hypot(v.x - F.x, v.z - F.z) > 100) this.drop(a); continue; }
        realN++;
      }
    }
    // storm: small craft run for port, everyone returns when it eases
    for (const a of this.agents) {
      const lim = a.K.storm;
      if (a.state === 'sheltered') {
        if (W.hs < lim * 0.7) { a.shelterT += 0.5; if (a.shelterT > 45) { const p = this.nearestPort(a); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 2; a.vis = 0; } } else a.shelterT = 0;
      } else if (a.state !== 'return' && W.hs > lim * 0.92) {
        const p = this.nearestPort(a), path = p && this.nav.path(a.x, a.z, p.x, p.z);
        if (path) { a.state = 'return'; this.setPath(a, path); } else { a.state = 'sheltered'; a.shelterT = 0; if (a.v) this.demote(a); }
      }
    }
    // promote / demote by distance to the player
    const cand = [];
    for (const a of this.agents) {
      if (a.state === 'sheltered') continue;
      const d2 = (a.x - F.x) ** 2 + (a.z - F.z) ** 2;
      if (a.v) { if (d2 > far2 && !a.v.driver) this.demote(a); }
      else if (d2 < near2) cand.push([d2, a]);
    }
    cand.sort((p, q) => p[0] - q[0]);
    for (const [, a] of cand) { if (realN >= TRAFFIC.maxReal) break; this.acquire(a); realN++; }
    // keep the population: replacements appear far out of sight and fade in
    const want = Math.round(TRAFFIC.count * this.density);
    if (this.agents.length < want) {
      const p = this.nav.random(() => this.rng.f(), 0, F.x, F.z, TRAFFIC.proxy + 300, TRAFFIC.proxy + 2500);
      if (p) { const a = this.spawn(this.rng.weighted(KIND_LIST).k, p.x, p.z, this.rng.f() * 6.283); a.timer = 1; }
    } else if (this.agents.length > want + 2) {
      const far = this.agents.filter((a) => !a.v && (a.x - F.x) ** 2 + (a.z - F.z) ** 2 > (TRAFFIC.proxy + 400) ** 2)[0];
      if (far) this.drop(far);
    }
    // anyone who ended up beyond reach of the player and the proxy range is relocated, so the bay around the player stays alive
    for (const a of this.agents) {
      if (a.v || a.state === 'sheltered') continue;
      if ((a.x - F.x) ** 2 + (a.z - F.z) ** 2 > 4200 ** 2) {
        const p = this.nav.random(() => this.rng.f(), 0, F.x, F.z, TRAFFIC.proxy + 300, 3200);
        if (p) { a.x = p.x; a.z = p.z; a.comp = this.nav.compAt(p.x, p.z) || a.comp; a.path = null; a.state = 'idle'; a.timer = 1; a.vis = 0; }
        break;
      }
    }
  }

  draw(F, W, dt) {
    const g = this.g, P = this.proxy, cam = g.camera.position, view = g.view, sea = g.world.sea, R2 = TRAFFIC.proxy ** 2;
    P.begin();
    for (const a of this.agents) {
      if (a.v || a.state === 'sheltered') continue;
      const dx = a.x - cam.x, dz = a.z - cam.z, d2 = dx * dx + dz * dz;
      if (d2 > R2) continue;
      a.vis = Math.min(1, a.vis + dt * 0.3);
      if (!view.sphere(a.x, -2, a.z, a.def.body.L * 3 + 12)) continue;
      const y = sea.waveAt(a.x, a.z, _n), sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
      const pitch = Math.atan((_n.x * sy + _n.z * cy) / _n.y), roll = Math.atan(-(_n.x * cy - _n.z * sy) / _n.y);
      P.add(a.def, a.x, y, a.z, a.yaw, pitch, roll, smoothstep(0, 1, a.vis), a.color);
    }
    P.end();
  }
}

