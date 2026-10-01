import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { Terrain, SURF, GRIP } from './terrain.js';
import { RoadGraph } from './roadGraph.js';
import { buildRoads } from './roadMesh.js';
import { computeBlocks, RaisedIndex, buildBlockSurfaces } from './blocks.js';
import { Colliders } from './collision.js';
import { PropSystem, buildSignals, updateSignalLenses } from './props.js';
import { Vegetation } from './vegetation.js';
import { BuildingGen } from './buildings.js';
import { Specials } from './specials.js';
import { buildCoastAreas } from './coast.js';
import { Sea } from './sea.js';
import { RNG, noise2 } from '../core/rng.js';
import { ChunkStore, makeProxyMaterial } from './chunks.js';
import { segClosest, smoothstep } from '../core/math.js';
import { BAY_X, WATER_LEVEL, DISTRICTS, POI } from '../data/world.js';

const _mc = new MessageChannel();
const _q = [];
_mc.port1.onmessage = () => _q.shift()?.();
const _fwd = new THREE.Vector3(0, 0, -1);
const tick = () => new Promise((r) => { _q.push(r); _mc.port2.postMessage(0); });

export class World {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'world';
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);
    this.beacons = [];
    this.trucks = [];
    this.parked = [];
    this.busStops = [];
    this.animated = [];
    this.poi = { ...POI };
    this.platforms = [];
    this.time = 0;
  }

  async build(progressCb = () => {}) {
    const t0 = performance.now();
    this.timings = {};
    let lastT = t0, lastMsg = 'start';
    const progress = (p, msg) => { const n = performance.now(); this.timings[lastMsg] = Math.round(n - lastT); lastT = n; lastMsg = msg; progressCb(p, msg); };
    progress(0.02, 'Materials');
    this.M = await createMaterials(this.renderer);
    this.store = new ChunkStore(128);
    this.uNight = this.M._uberU.uNight;
    this.proxyMat = makeProxyMaterial(this.uNight);
    await tick();
    progress(0.1, 'Terrain');
    this.terrain = new Terrain();
    this.colliders = new Colliders(16);
    await tick();
    progress(0.2, 'Road network');
    this.roads = new RoadGraph(this.terrain);
    const R = buildRoads(this);
    this.roadOut = R;
    this.decks = new DeckIndex(R.decks);
    await tick();
    progress(0.3, 'City blocks');
    this.blocks = computeBlocks(this.roads);
    this.raised = new RaisedIndex(this.blocks);
    buildBlockSurfaces(this.blocks, this.store, this.terrain);
    this.props = new PropSystem(this);
    this.veg = new Vegetation(this);
    await tick();
    progress(0.42, 'Buildings');
    this.buildings = new BuildingGen(this);
    this.specials = new Specials(this, this.buildings);
    this.buildings.build(this.blocks);
    this.specials.buildOpenAreas();
    buildCoastAreas(this, this.buildings);
    await tick();
    progress(0.6, 'Street furniture');
    this.furnish();
    this.parkedAlongRoads();
    await tick();
    progress(0.68, 'Vegetation');
    this.plantCountry();
    await tick();
    progress(0.76, 'Meshes');
    this.store.finalize(this.M, this.proxyMat, this.group);
    this.parked.push(...this.buildings.parked);
    this.terrainMesh = this.terrain.buildMeshes(this.M.terrain);
    this.group.add(this.terrainMesh);
    this.group.add(this.terrain.buildFar(this.M.farTerrain));
    this.addWater();
    await tick();
    progress(0.86, 'Signals');
    for (const l of R.lamps) this.props.place(l.type, l.x, l.y, l.z, l.rot, 1, { noCollide: l.y > 2 });
    for (const s of R.stopSigns) this.props.place('stopSign', s.x, this.groundY(s.x, s.z, s.y + 1), s.z, s.rot);
    this.signals = buildSignals(this, R.signals);
    this.group.add(this.signals.mesh, this.signals.lensMesh);
    this.props.finalize();
    this.veg.finalize();
    this.group.add(this.props.group, this.veg.group);
    this.addBeacons();
    progress(1, 'Ready');
    this.buildMs = performance.now() - t0;
  }

  // ---------- ground queries ----------
  ground(x, z, yRef = Infinity) {
    let y = this.terrain.height(x, z);
    let surf = this.terrain.surfAt(x, z);
    const r = this.raised.raiseAt(x, z);
    if (r > 0) { const e = this.raised.lastElev; if (y < e + 1 && y > e - 0.5) y = Math.max(y, r); }
    let deck = false;
    if (this.decks) {
      const d = this.decks.at(x, z, yRef);
      if (d !== null && d > y) { y = d; surf = SURF.ASPHALT; deck = true; }
    }
    for (const q of this.platforms) {
      if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue;
      const py = q.y0 + (q.y1 - q.y0) * ((z - q.z0) / (q.z1 - q.z0 || 1));
      if (py > y && py < yRef + 1.6) { y = py; surf = SURF.CONCRETE; deck = true; }
    }
    if (surf === SURF.WATER && y < WATER_LEVEL) y = WATER_LEVEL - 0.01;
    return { y, surf, grip: GRIP[surf], deck };
  }
  // walkable structures over water (docks, piers): heights ramp along z from y0 to y1
  addPlatform(x0, z0, x1, z1, y0, y1 = y0) { this.platforms.push({ x0, z0, x1, z1, y0, y1 }); }
  groundY(x, z, yRef = Infinity) { return this.ground(x, z, yRef).y; }
  isWater(x, z, y) { return this.terrain.height(x, z) < WATER_LEVEL - 0.3 && y < WATER_LEVEL + 0.5; }

  districtAt(x, z) {
    for (const d of DISTRICTS) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d;
    if (z < -440) return DISTRICTS.find((d) => d.id === 'hills');
    if (x > 1000) return DISTRICTS.find((d) => d.id === 'country');
    return { id: 'outskirts', name: 'Riverton Outskirts', short: 'Outskirts' };
  }

  // ---------- street furniture ----------
  furnish() {
    const rng = new RNG('furnish');
    const P = this.props;
    let line = 0;
    for (const B of this.blocks) {
      if (B.special === 'open') continue;
      const c = B.curb, st = B.style, y = B.raise;
      const sides = [
        { k: 'n', a: [c.x0, c.z0], b: [c.x1, c.z0], rot: Math.PI, inward: [0, 1] },
        { k: 's', a: [c.x1, c.z1], b: [c.x0, c.z1], rot: 0, inward: [0, -1] },
        { k: 'e', a: [c.x1, c.z0], b: [c.x1, c.z1], rot: Math.PI / 2, inward: [-1, 0] },
        { k: 'w', a: [c.x0, c.z1], b: [c.x0, c.z0], rot: -Math.PI / 2, inward: [1, 0] },
      ];
      for (const sd of sides) {
        const info = B.sides[sd.k];
        if (!info.edge) continue;
        const [ax, az] = sd.a, [bx, bz] = sd.b;
        const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
        const [ix, iz] = sd.inward;
        const at = (u, off) => [ax + tx * u + ix * off, az + tz * u + iz * off];
        const cls = info.edge.clsName;
        const sub = st === 'suburb' || st === 'alpine' || st === 'desert';
        const lampType = st === 'oldtown' || st === 'alpine' ? 'lampHeritage' : sub ? 'lampPost' : 'lampCobra';
        const lampStep = st === 'oldtown' ? 22 : sub ? 42 : 30;
        const lampOffset = sub ? B.verge * 0.5 : 0.65;
        const start = B.cornerR + 4;
        const occupied = [];
        const free = (u, w = 1.5) => occupied.every((o) => Math.abs(o - u) > w);
        // lamps (suburb: one side per street)
        const lampSide = !sub || sd.k === 'n' || sd.k === 'e';
        if (lampSide) for (let u = start + (sd.k === 's' || sd.k === 'w' ? lampStep / 2 : 0); u < L - start; u += lampStep) {
          const [x, z] = at(u, lampOffset);
          P.place(lampType, x, y, z, sd.rot);
          occupied.push(u);
        }
        // street trees
        if (st !== 'industrial' && st !== 'desert' && rng.chance(st === 'cbd' ? 0.9 : 0.8)) {
          const step = sub ? 13 : st === 'oldtown' ? 16 : 12;
          const off = sub ? B.verge * 0.5 : 1.3;
          for (let u = start + 5; u < L - start - 2; u += step + rng.range(-1, 1)) {
            if (!free(u, 3)) continue;
            if (st === 'oldtown' && rng.chance(0.4)) continue;
            const [x, z] = at(u, off);
            this.veg.tree(x, y, z, st === 'coast' || st === 'isle' ? 'palm' : st === 'alpine' ? 'conifer' : st === 'suburb' ? (rng.chance(0.5) ? 'street' : 'birch') : 'street', rng, st === 'coast' || st === 'isle' ? rng.range(1.0, 1.35) : rng.range(0.8, 1.05));
            occupied.push(u);
          }
        }
        // utility poles for suburbs (opposite side of lamps)
        if (sub && !lampSide) {
          line++;
          for (let u = start; u < L - start + 1; u += 38) {
            const [x, z] = at(u, B.verge * 0.5 + 0.4);
            const inst = P.place('utilityPole', x, y, z, sd.rot + Math.PI / 2);
            inst.line = line;
            if (rng.chance(0.2)) P.place('transformer', x, y + 7.6, z + 0.35, 0, 1, { noCollide: true });
            occupied.push(u);
          }
        }
        // hydrants
        for (let u = start + rng.range(5, 30); u < L - start; u += rng.range(60, 90)) {
          if (!free(u)) continue;
          const [x, z] = at(u, 0.6);
          P.place('hydrant', x, y, z, sd.rot);
          occupied.push(u);
        }
        // parking meters
        if (info.edge.cls.parking > 0 && (st === 'cbd' || st === 'oldtown')) {
          for (let u = start + 6; u < L - start - 4; u += 6.2) {
            if (!free(u, 0.8) || rng.chance(0.3)) continue;
            const [x, z] = at(u, 0.45);
            P.place('parkingMeter', x, y, z, sd.rot + Math.PI);
          }
        }
        if (st === 'cbd' || st === 'oldtown' || B.zone === 'commercial') {
          // corners: trash, news, mailbox
          for (const u of [start - 1, L - start + 1]) {
            const [x, z] = at(u, 1.1);
            P.place('trashCity', x + ix * 0.8, y, z + iz * 0.8, 0);
            if (rng.chance(0.35)) { const [x2, z2] = at(u + (u < L / 2 ? 1.2 : -1.2), 2.2); P.place('newsBox', x2, y, z2, sd.rot + Math.PI, 1, { rnd: rng.f() }); }
            if (rng.chance(0.15)) { const [x2, z2] = at(u + (u < L / 2 ? 2.4 : -2.4), 2.4); P.place('mailboxBlue', x2, y, z2, sd.rot + Math.PI); }
          }
          // benches / bike racks / utility
          if (rng.chance(0.5)) { const u = L * rng.range(0.3, 0.7); if (free(u, 3)) { const [x, z] = at(u, B.sw - 0.8); P.place('bench', x, y, z, sd.rot + Math.PI); occupied.push(u); } }
          if (rng.chance(0.25)) { const u = L * rng.range(0.2, 0.8); if (free(u, 3)) { const [x, z] = at(u, 1.4); P.place('bikeRack', x, y, z, sd.rot); occupied.push(u); } }
          if (rng.chance(0.3)) { const u = L * rng.range(0.2, 0.8); if (free(u, 2)) { const [x, z] = at(u, B.sw - 0.4); P.place('utilityBox', x, y, z, sd.rot + Math.PI, 1, { rnd: rng.f() }); occupied.push(u); } }
        }
        // bus stops on arterials / avenues
        if ((cls === 'arterial' || cls === 'avenue') && rng.chance(0.28) && L > 60) {
          const u = L * 0.5;
          const [x, z] = at(u, Math.min(B.sw * 0.55, 2.4));
          if (B.sw >= 2.2) P.place('busShelter', x, y, z, sd.rot);
          const [sx, sz] = at(u + 3.5, 0.5);
          P.place('signBus', sx, y, sz, sd.rot + Math.PI);
          this.busStops.push({ x, z, edge: info.edge.id, rot: sd.rot });
          occupied.push(u, u + 3.5);
        }
        // speed limit signs occasionally
        if (rng.chance(0.12) && L > 50) {
          const u = rng.range(start + 8, L - start - 8);
          if (free(u)) {
            const sp = info.edge.cls.speed;
            const key = sp >= 60 ? 'signSpeed50' : sp >= 50 ? 'signSpeed50' : sp >= 40 ? 'signSpeed40' : 'signSpeed30';
            const [x, z] = at(u, 0.5);
            P.place(key, x, y, z, sd.rot + Math.PI);
          }
        }
      }
    }
  }

  parkedAlongRoads() {
    const rng = new RNG('parked');
    for (const e of this.roads.edges) {
      const c = e.cls;
      if (!c.parking) continue;
      const md = c.median / 2;
      const s0 = e.sbA + (e.hasCrosswalkA ? 5.2 : 0.5) + 8, s1 = e.pl.len - e.sbB - (e.hasCrosswalkB ? 5.2 : 0.5) - 8;
      for (const sg of [1, -1]) {
        const off = sg * (md + c.lanes * c.laneW + 0.1 + c.parking * 0.5);
        for (let s = s0; s < s1 - 3; s += 6.2) {
          if (!rng.chance(e.clsName === 'arterial' ? 0.5 : 0.42)) continue;
          const p = e.pl.at(s + 3.1);
          const x = p.x - p.dz * off, z = p.z + p.dx * off;
          if (this.busStops.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < 150)) continue;
          const rot = Math.atan2(p.dx * sg, p.dz * sg) + rng.range(-0.03, 0.03);
          this.parked.push({ x: x + rng.range(-0.15, 0.15) * p.dx, y: p.y + 0.02, z: z + rng.range(-0.15, 0.15) * p.dz, rot, street: true });
        }
      }
    }
  }

  plantCountry() {
    const rng = new RNG('forest');
    const V = this.veg, R = this.roads, T = this.terrain;
    const clear = (x, z, pad = 6) => {
      for (const [dx, dz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) { const s = T.surfAt(x + dx, z + dz); if (s === SURF.ASPHALT || s === SURF.CONCRETE || s === SURF.WATER) return false; }
      if (T.height(x, z) < WATER_LEVEL + 0.6) return false;
      let hit = false;
      this.colliders.query(x, z, 4, -100, 1000, (c) => { if (c.kind === 'building' || c.kind === 'tree') { hit = true; return false; } });
      return !hit;
    };
    // hills forest (denser further north)
    V.scatter(rng, -1400, -1500, 1400, -470, 9000, ['conifer', 'conifer', 'yard', 'birch'], (x, z) => rng.f() < smoothstep(-470, -700, z) * 0.95 + 0.05 && clear(x, z));
    // countryside hedgerows / woods
    V.scatter(rng, 1010, -1200, 1900, 1400, 2500, ['yard', 'park', 'birch', 'conifer'], (x, z) => (Math.sin(x * 0.012) + Math.cos(z * 0.01) > 0.9 || rng.f() < 0.15) && clear(x, z));
    // south belt (between the city and the forest)
    V.scatter(rng, -1000, 490, 1100, 900, 2400, ['yard', 'park', 'conifer', 'birch'], (x, z) => rng.f() < smoothstep(495, 650, z) && clear(x, z));
    // Pinewood forest along Route 9: dense conifers with oaks and birch, thinning out toward the coast and around clearings
    const forestOK = (x, z) => { const n = noise2(x / 140, z / 140); return n > -0.42 && clear(x, z, 7) && T.height(x, z) > 0.8; };
    V.scatter(rng, -900, 900, 900, 1980, 15000, ['pine', 'pine', 'pine', 'conifer', 'conifer', 'oak', 'birch', 'yard'], (x, z) => rng.f() < (1 - smoothstep(1780, 1975, z)) * (0.35 + 0.65 * smoothstep(900, 1050, z)) && forestOK(x, z));
    // rocks and boulders in the forest
    for (let k = 0; k < 260; k++) { const x = rng.range(-800, 800), z = rng.range(920, 1900); if (!clear(x, z, 4)) continue; this.props.place('rock', x, T.height(x, z) - 0.3, z, rng.f() * 6, rng.range(0.7, 2.6), { noCollide: false }); }
    this.specials.region.scatter(V, this.props, T, rng, clear);
    // freeway greenbelt between North Avenue and freeway
    V.scatter(rng, -950, -400, 1000, -290, 700, ['yard', 'street', 'birch', 'conifer'], (x, z) => clear(x, z, 9));
    // far west / north-west coast
    V.scatter(rng, -1060, -1400, -960, -300, 500, ['conifer', 'yard'], (x, z) => clear(x, z));
    for (let k = 0; k < 400; k++) {
      const x = rng.range(-1300, 1500), z = rng.range(-1500, -520);
      if (!clear(x, z, 4)) continue;
      this.props.place('rock', x, T.height(x, z) - 0.3, z, rng.f() * 6, rng.range(0.6, 2.2), { noCollide: false });
    }
  }

  addWater() {
    this.sea = new Sea(this, this.scene);
    this.water = this.sea.group;
  }

  addBeacons() {
    const g = new THREE.SphereGeometry(0.45, 8, 6);
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }), Math.max(1, this.beacons.length));
    const m = new THREE.Matrix4();
    this.beacons.forEach((b, i) => { m.makeTranslation(b.x, b.y, b.z); mesh.setMatrixAt(i, m); });
    mesh.count = this.beacons.length;
    this.beaconMesh = mesh;
    this.group.add(mesh);
  }

  update(dt, camPos, sky, view) {
    this.time += dt;
    this.props.update(view);
    this.veg.update(view);
    for (const f of this.animated) f(dt, sky);
    this.store.update(camPos, view.dir, {}, view);
    this.terrain.updateLOD(view, 2.5, this.lodScale || 1);
    if (!this._sigT || this.time - this._sigT > 0.25) { this._sigT = this.time; updateSignalLenses(this.signals, this.roads, this.time); }
    if (this.beaconMesh && sky) this.beaconMesh.material.color.copy(sky.beaconMat.color);
    if (this.sea) this.sea.update(dt, { position: camPos }, sky);
  }
}

class DeckIndex {
  constructor(segs) {
    this.cell = 24;
    this.grid = new Map();
    for (const s of segs) {
      const r = s.hw + 1;
      for (let i = Math.floor((Math.min(s.ax, s.bx) - r) / this.cell); i <= Math.floor((Math.max(s.ax, s.bx) + r) / this.cell); i++)
        for (let j = Math.floor((Math.min(s.az, s.bz) - r) / this.cell); j <= Math.floor((Math.max(s.az, s.bz) + r) / this.cell); j++) {
          const k = i * 7919 + j;
          let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(s);
        }
    }
  }
  at(x, z, yRef = Infinity) {
    const a = this.grid.get(Math.floor(x / this.cell) * 7919 + Math.floor(z / this.cell));
    if (!a) return null;
    let best = null;
    for (const s of a) {
      const c = segClosest(x, z, s.ax, s.az, s.bx, s.bz);
      if (c.d > s.hw) continue;
      const y = s.ay + (s.by - s.ay) * c.t;
      if (y > yRef + 1.6) continue;
      if (best === null || y > best) best = y;
    }
    return best;
  }
}
