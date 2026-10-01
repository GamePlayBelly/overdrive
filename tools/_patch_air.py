def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:70])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

AIRFIELD = '''
  // ---------------- Riverton Airfield: runway, taxiway, apron, hangars, terminal and tower on the meadow east of Marlow Bay ----------------
  airfield() {
    const W = this.world, G = this.gen, T = W.terrain, P = W.props;
    T.flattenRect(600, 1990, 1540, 2178, 0.05, 12);
    const y = 0.06, white = C('#f2f2f0'), yellow = C('#f2c230');
    const rwy = { x0: 640, x1: 1500, z0: 2118, z1: 2152 };
    this.pave('asphalt', rwy, y, C('#d0d0d0'), 8);
    this.pave('asphalt', { x0: 700, x1: 1440, z0: 2082, z1: 2094 }, y, C('#c4c4c4'), 8);
    for (const x of [704, 1030, 1430]) this.pave('asphalt', { x0: x, x1: x + 12, z0: 2094, z1: 2118 }, y, C('#c4c4c4'), 8);
    this.pave('asphalt', { x0: 820, x1: 1090, z0: 2020, z1: 2082 }, y, C('#bdbdbd'), 8);
    const mark = (cx, cz, sx, sz, col = white) => G.g('paint', cx, cz).box(cx, y + 0.01, cz, sx, 0.012, sz, col, 0, 1, false);
    for (let x = 700; x < 1440; x += 36) mark(x + 9, 2135, 18, 0.7);
    for (const s of [1, -1]) { const ex = s > 0 ? 652 : 1488; for (let k = -6; k <= 6; k++) if (k) mark(ex, 2135 + k * 2.4, 22, 0.9); mark(s > 0 ? 646 : 1494, 2135, 0.8, 34, white); }
    mark(1000, 2093, 740, 0.35, yellow); mark(1000, 2083, 740, 0.35, yellow);
    for (let x = 650; x < 1495; x += 42) for (const z of [2119, 2151]) G.g('glow', x, z).box(x, y + 0.05, z, 0.5, 0.1, 0.5, C('#9fe3ff'), 0, 1, false);
    // helipad
    const pad = { x0: 940, x1: 968, z0: 2030, z1: 2058 };
    this.pave('concrete', pad, y + 0.01, C('#dcdcdc'), 6);
    mark(954, 2044, 1.2, 10, yellow); mark(949, 2044, 1.2, 10, yellow); mark(951.5, 2044, 6, 1.2, yellow);
    // hangars
    for (let i = 0; i < 3; i++) {
      const r = { x0: 852 + i * 52, x1: 896 + i * 52, z0: 1998, z1: 2022 };
      this.commercialBox(r, 0.05, 10, C(['#8d98a4', '#9aa3ad', '#7f8a96'][i]), null, 's');
      G.g('paint', r.x0 + 22, r.z1).box(r.x0 + 22, 4, r.z1 + 0.15, 30, 7.5, 0.3, C('#3a4350'), 0, 1, false);
    }
    // terminal and tower
    const term = { x0: 1010, x1: 1090, z0: 2000, z1: 2030 };
    this.commercialBox(term, 0.05, 9, C('#d8dce0'), null, 's');
    G.g('paint', 1050, 2031).box(1050, 6.2, 2031.5, 82, 0.6, 4, C('#2b6cb0'), 0, 1, false);
    G.g('paint', 1110, 2010).box(1110, 8, 2010, 5, 16, 5, C('#c9ced4'), 0, 1, false);
    G.g('paint', 1110, 2010).box(1110, 17.5, 2010, 9, 3.2, 9, C('#2a3340'), 0, 1, false);
    G.g('paint', 1110, 2010).box(1110, 19.4, 2010, 10, 0.5, 10, C('#c9ced4'), 0, 1, false);
    W.colliders.box(1110, 2010, 2.5, 2.5, 0, 0, 19, { kind: 'building' });
    // windsock
    G.g('paint', 1000, 2160).box(1000, 4, 2160, 0.2, 8, 0.2, C('#cfd3d8'), 0, 1, false);
    G.g('paint', 1000, 2160).box(1001.8, 7.6, 2160, 3.6, 0.9, 0.9, C('#ff7a1a'), 0, 1, false);
    this.world.poi.airfield = { x: 1050, z: 2060, name: 'Riverton Airfield', icon: 'plane' };
    this.world.airfield = { runway: rwy, apron: { x0: 820, x1: 1090, z0: 2020, z1: 2082 }, pad, spots: { plane: [[690, 2135], [790, 2135], [890, 2072], [940, 2072]], jet: [[740, 2135]], heli: [[954, 2044], [1000, 2044]] } };
    void P;
  }
'''

patch('src/world/specials.js', [
    ("    this.farms();\n", "    this.farms();\n    this.airfield();\n"),
    ("  farms() {", AIRFIELD + "\n  farms() {"),
])
patch('src/data/world.js', [
    ("  { id: 'forest', label: 'Route 9 — Pinewood Forest', x: 40, z: 1000, heading: Math.PI },", "  { id: 'forest', label: 'Route 9 — Pinewood Forest', x: 40, z: 1000, heading: Math.PI },\n  { id: 'airfield', label: 'Riverton Airfield', x: 1050, z: 2100, heading: Math.PI / 2 },"),
])
patch('src/data/vehicles.js', [
    ("import { BOATS } from './boats.js';", "import { BOATS } from './boats.js';\nimport { AIRCRAFT } from './aircraft.js';"),
    ("'Utility', 'Boat'];", "'Utility', 'Boat', 'Aircraft'];"),
    ("VEHICLES.push(...BOATS);", "VEHICLES.push(...BOATS, ...AIRCRAFT);"),
])
patch('src/vehicles/carMesh.js', [
    ("import { createBoatMesh } from './boatModel.js';", "import { createBoatMesh } from './boatModel.js';\nimport { createAircraftMesh } from './aircraftModel.js';"),
    ("  if (def.boat) return createBoatMesh(def, custom);", "  if (def.boat) return createBoatMesh(def, custom);\n  if (def.air) return createAircraftMesh(def, custom);"),
])
patch('src/game/game.js', [
    ("import { Boat } from '../vehicles/boat.js';", "import { Boat } from '../vehicles/boat.js';\nimport { Aircraft } from '../vehicles/aircraft.js';\nimport { Airfield } from './airfield.js';"),
    ("    const v = def.boat ? new Boat(this, def, custom, opts) : new Vehicle(this, def, custom, opts);\n    v.place(x, def.boat ? 0 : this.world.groundY(x, z, opts.yRef ?? 50), z, yaw);",
     "    const v = def.boat ? new Boat(this, def, custom, opts) : def.air ? new Aircraft(this, def, custom, opts) : new Vehicle(this, def, custom, opts);\n    v.place(x, def.boat ? 0 : this.world.groundY(x, z, opts.yRef ?? 50), z, yaw);"),
    ("    this.combat = new Combat(this);", "    this.combat = new Combat(this);\n    this.airfield = new Airfield(this);\n    this.airfield.init();"),
    ("  controlVehicle(v, dt) {\n    const I = this.input, p = v.phys;", "  controlAir(v) {\n    const I = this.input, p = v.phys, d = (c) => (I.down.has(c) ? 1 : 0);\n    const inp = v.input;\n    inp.pitch = d('KeyS') - d('KeyW') + (I.down.has('ArrowDown') ? 0 : 0);\n    inp.roll = d('KeyD') - d('KeyA');\n    inp.yawIn = d('KeyE') - d('KeyQ');\n    inp.thrDelta = (I.held('nitro') ? 1 : 0) - d('ControlLeft');\n    inp.hand = I.held('handbrake'); inp.brake = inp.hand ? 1 : 0; inp.throttle = 0; inp.steer = 0; inp.boost = false;\n    if (I.hit('lights')) { v.lights.auto = false; v.lights.head = !v.lights.head; }\n    if (I.hit('radio') && this.radio) this.radio.toggle();\n    if (I.hit('radioNext') && this.radio) this.radio.next();\n    if (I.hit('reset') && v.agl > 3 && p.speed < 3) this.resetVehicle(v);\n    if (this.lock) { inp.thrDelta = 0; inp.hand = true; }\n  }\n\n  controlVehicle(v, dt) {\n    if (v.isAir) return this.controlAir(v);\n    const I = this.input, p = v.phys;"),
    ("  resetVehicle(v) {\n    if (v.isBoat) return this.resetBoat(v);", "  resetVehicle(v) {\n    if (v.isBoat) return this.resetBoat(v);\n    if (v.isAir) { const s = this.airfield.freeSpot(v.def); if (s) { v.place(s[0], this.world.groundY(s[0], s[1], 60), s[1], Math.PI / 2); v.phys.vx = v.phys.vy = v.phys.vz = 0; } return; }"),
])
patch('src/actors/player.js', [
    ("  seatPose(v) { return v.isBoat ? v.car.geo.seat.pose || 'drive' : 'drive'; }", "  seatPose(v) { return v.isBoat || v.isAir ? v.car.geo.seat.pose || 'drive' : 'drive'; }"),
    ("    if (v.isBoat) { const s = v.car.geo.seat; return { x: s.x, y: s.y, z: s.z }; }", "    if (v.isBoat || v.isAir) { const s = v.car.geo.seat; return { x: s.x, y: s.y, z: s.z }; }"),
    ("    if (v.isBoat) return this.tryBoard(v);\n    if (v.speed > 2.5) return false;", "    if (v.isBoat) return this.tryBoard(v);\n    if (v.isAir) { if (v.speed > 4 || v.distTo(this.x, this.z) > 6.5) return false; v.driver = this; this.enter(v); this.game.rig.snapBehind(); return true; }\n    if (v.speed > 2.5) return false;"),
    ("    if (v.isBoat) return this.tryUnboard(v);\n    if (v.speed > 9) return false;", "    if (v.isBoat) return this.tryUnboard(v);\n    if (v.isAir) { if (v.phys.agl > 1.5 || v.speed > 8) { this.game.emit('hud:toast', { text: 'Land first' }); return false; } this.exit(); return true; }\n    if (v.speed > 9) return false;"),
])
patch('src/game/camera.js', [
    ("const eye = boat ? v.car.geo.eye : null;", "const eye = boat || v.isAir ? v.car.geo.eye : null;"),
])
patch('src/render/vehicleFx.js', [
    ("    if (v.isBoat) return this.boat(v, dt);", "    if (v.isBoat) return this.boat(v, dt);\n    if (v.isAir) return;"),
])
patch('src/game/crimes.js', [
    ("v.isBoat || !g.police.enabled", "v.isBoat || v.isAir || !g.police.enabled"),
])
patch('src/audio/audio.js', [
    ("function engineKind(def) {\n", "function engineKind(def) {\n  if (def.air) return def.air === 'jet' ? 3 : def.air === 'heli' ? 1 : 2;\n"),
])
patch('src/app/hud.js', [
    ("v.isBoat ? 'F' : p.manual", "v.isAir ? 'A' : v.isBoat ? 'F' : p.manual"),
    ("`${cand.isBoat ? 'Board' : 'Enter'} ${cand.def.brand} ${cand.def.name}`", "`${cand.isBoat ? 'Board' : cand.isAir ? 'Fly' : 'Enter'} ${cand.def.brand} ${cand.def.name}`"),
])
