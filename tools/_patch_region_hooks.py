def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


# ---- buildings: mix in the region methods
patch('src/world/buildings.js', [
    ("Object.assign(BuildingGen.prototype, coastMethods);", "Object.assign(BuildingGen.prototype, coastMethods, regionMethods);"),
])
s = open('src/world/buildings.js', encoding='utf8').read()
i = s.index("import { coastMethods }")
j = s.index("\n", i)
s = s[:j + 1] + "import { regionMethods } from './regions.js';\n" + s[j + 1:]
open('src/world/buildings.js', 'w', encoding='utf8').write(s)

# ---- specials: region builder, zone dispatch, outer landmarks
patch('src/world/specials.js', [
    ("import { Polyline, catmull } from '../core/math.js';", "import { Polyline, catmull } from '../core/math.js';\nimport { Regions } from './regions.js';"),
    ("    this.rng = new RNG('specials');\n  }", "    this.rng = new RNG('specials');\n    this.region = new Regions(world, gen);\n  }"),
    ("      case 'cityhall': return this.cityHall(B), true;", "      case 'cityhall': return this.cityHall(B), true;\n      case 'lodge': case 'chapel': case 'alpstore': case 'drygas': case 'diner': case 'drystore': case 'motel': return this.region.zone(B);"),
    ("    this.airfield();\n  }", "    this.airfield();\n    this.region.buildOuter();\n  }"),
])

# ---- world: scatter vegetation in the outer regions
patch('src/world/world.js', [
    ("    // freeway greenbelt between North Avenue and freeway", "    this.specials.region.scatter(V, this.props, T, rng, clear);\n    // freeway greenbelt between North Avenue and freeway"),
])

# ---- zones for the towns
patch('src/data/world.js', [
    ("  [90, 180, 2080, 2170, 'plaza'],\n];", """  [90, 180, 2080, 2170, 'plaza'],
  // Alder Peak
  [-40, 40, -1790, -1700, 'lodge'],
  [-120, -40, -1700, -1610, 'chapel'],
  [40, 120, -1700, -1610, 'alpstore'],
  // Dry Springs (north row along Main Street)
  [2740, 2820, 50, 150, 'drygas'],
  [2820, 2900, 50, 150, 'diner'],
  [2900, 2980, 50, 150, 'drystore'],
  [2980, 3060, 50, 150, 'motel'],
  // Marin Village
  [-1970, -1870, -510, -420, 'plaza'],
];"""),
])

# ---- street furniture by style
patch('src/world/world.js', [
    ("        const lampType = st === 'oldtown' ? 'lampHeritage' : st === 'suburb' ? 'lampPost' : 'lampCobra';", "        const lampType = st === 'oldtown' || st === 'alpine' ? 'lampHeritage' : st === 'suburb' || st === 'desert' ? 'lampPost' : 'lampCobra';"),
    ("        if (st !== 'industrial' && rng.chance(st === 'cbd' ? 0.9 : 0.8)) {", "        if (st !== 'industrial' && st !== 'desert' && rng.chance(st === 'cbd' ? 0.9 : 0.8)) {"),
    ("this.veg.tree(x, y, z, st === 'coast' ? 'palm' : st === 'suburb' ? (rng.chance(0.5) ? 'street' : 'birch') : 'street', rng, st === 'coast' ? rng.range(1.0, 1.35) : rng.range(0.8, 1.05));", "this.veg.tree(x, y, z, st === 'coast' || st === 'isle' ? 'palm' : st === 'alpine' ? 'conifer' : st === 'suburb' ? (rng.chance(0.5) ? 'street' : 'birch') : 'street', rng, st === 'coast' || st === 'isle' ? rng.range(1.0, 1.35) : rng.range(0.8, 1.05));"),
])

# ---- new props
patch('src/world/props.js', [
    ("  shrub() {\n    const l = new GeoBuilder();", """  guardrail() {
    const m = new GeoBuilder();
    box(m, 0, 0.52, 0, 4.0, 0.3, 0.07, GALV);
    box(m, 0, 0.0, 0, 0.1, 0.62, 0.1, DARK);
    box(m, 1.95, 0.0, 0, 0.1, 0.62, 0.1, DARK);
    box(m, -1.95, 0.0, 0, 0.1, 0.62, 0.1, DARK);
    return { parts: { metal: m }, col: { box: [2.0, 0.15] }, h: 0.85 };
  },
  waterTower() {
    const w = new GeoBuilder(), m = new GeoBuilder();
    for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) box(m, x, 0, z, 0.3, 11, 0.3, C('#5b4636'));
    for (const y of [3.6, 7.2]) for (const s of [-2.2, 2.2]) { box(m, 0, y, s, 4.7, 0.14, 0.14, C('#5b4636')); box(m, s, y, 0, 0.14, 0.14, 4.7, C('#5b4636')); }
    cyl(w, 0, 11, 0, 3.2, 3.2, 4.6, 18, C('#8a6a4a'));
    for (const y of [11.6, 13.4, 15.0]) cyl(m, 0, y, 0, 3.3, 3.3, 0.14, 18, C('#3a3c3f'));
    w.addGeo(new THREE.ConeGeometry(3.5, 1.9, 18), 0, 16.55, 0, 0, 1, 1, 1, C('#6a5a4a'));
    return { parts: { wood: w, metal: m }, col: { r: 3.3 }, h: 17.6 };
  },
  windmill() {
    const m = new GeoBuilder();
    const leg = (x0, z0, x1, z1, h) => {
      const v = new THREE.Vector3(x1 - x0, h, z1 - z0), len = v.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
      m.add(new THREE.CylinderGeometry(0.06, 0.08, len, 4), new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, h / 2, (z0 + z1) / 2), q, new THREE.Vector3(1, 1, 1)), C('#8f979c'));
    };
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) leg(sx * 1.3, sz * 1.3, sx * 0.35, sz * 0.35, 10);
    for (const y of [3, 6, 8.5]) { const k = 1.3 - (y / 10) * 0.95; box(m, 0, y, k, k * 2, 0.06, 0.06, C('#8f979c')); box(m, 0, y, -k, k * 2, 0.06, 0.06, C('#8f979c')); box(m, k, y, 0, 0.06, 0.06, k * 2, C('#8f979c')); box(m, -k, y, 0, 0.06, 0.06, k * 2, C('#8f979c')); }
    cyl(m, 0, 10, 0, 0.3, 0.3, 0.6, 8, C('#6a6f73'));
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; m.addGeo(new THREE.BoxGeometry(0.22, 1.9, 0.04), Math.sin(a) * 1.1, 10.6 + Math.cos(a) * 1.1, 0.7, 0, 1, 1, 1, C('#c9ccd0'), 0, -a); }
    box(m, 0, 10.35, -1.5, 0.05, 1.1, 1.9, C('#a8321f'));
    return { parts: { metal: m }, col: { r: 1.6 }, h: 12.6 };
  },
  skiPole() {
    const m = new GeoBuilder();
    cyl(m, 0, 0, 0, 0.14, 0.1, 9.6, 6, GALV);
    box(m, 0, 9.3, 0, 2.6, 0.14, 0.18, GALV);
    for (const s of [-1.2, 1.2]) box(m, s, 9.0, 0, 0.12, 0.3, 0.25, DARK);
    return { parts: { metal: m }, col: { r: 0.2 }, h: 9.8 };
  },
  shrub() {
    const l = new GeoBuilder();"""),
])

# ---- vegetation: cacti and desert scrub
patch('src/world/vegetation.js', [
    ("  palm: { type: 'palm',", "  cactus: { type: 'cactus', H: 3.4, leaf: '#5f8a4a', bark: '#5f8a4a', far: 1.2, h: 4 },\n  scrub: { type: 'low', crown: [[0, 0.65, 0, 1.2, 0.75, 1.15], [0.8, 0.45, 0.4, 0.8, 0.5, 0.8]], leaf: '#8a8650', bark: '#6b5a46', far: 1.3, h: 1.6 },\n  palm: { type: 'palm',"),
    ("  } else if (d.type === 'palm') {\n    const H = d.H, pts = [];", """  } else if (d.type === 'low') {
    let seed = rng.f() * 100;
    for (const [x, y, z, rx, ry, rz] of d.crown) {
      solid.add(shade(blob(rx, ry, rz, 1, seed++, 0.3), leaf, 0, ry, 0.5, 1.2).translate(x, y, z), null, null);
      const lo = shade(blob(rx, ry, rz, 0, seed++, 0.25), leaf, 0, ry).translate(x, y, z);
      mid.add(lo, null, null); far.add(lo.clone(), null, null);
    }
  } else if (d.type === 'cactus') {
    const H = d.H, col = leaf.clone();
    cyl(solid, 0, 0, 0, 0.3, 0.26, H, 9, col);
    solid.addGeo(new THREE.SphereGeometry(0.27, 8, 6), 0, H, 0, 0, 1, 1, 1, col);
    for (const [s, hy, up] of [[1, 1.3, 1.1], [-1, 1.9, 0.8]]) {
      cyl(solid, s * 0.28, hy, 0, 0.17, 0.15, 0.7, 7, col, 0, -s * Math.PI / 2);
      cyl(solid, s * 0.95, hy - 0.1, 0, 0.16, 0.14, up, 7, col);
    }
    cyl(mid, 0, 0, 0, 0.3, 0.26, H, 5, col);
    cyl(mid, 0.75, 1.3, 0, 0.17, 0.14, 1.2, 4, col);
    cyl(mid, -0.75, 1.9, 0, 0.17, 0.14, 1.0, 4, col);
    cyl(far, 0, 0, 0, 0.5, 0.4, H, 4, col);
  } else if (d.type === 'palm') {
    const H = d.H, pts = [];"""),
])
print('ok')
