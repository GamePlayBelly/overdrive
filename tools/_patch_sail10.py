def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/data/routes.js', [
    ("export const BRIDGE = {", "// boats on moorings in the deep channel east of Marin Island: [x, z, boat id]\nexport const MOORINGS = [[-1556, -330, 'sloop'], [-1538, -296, 'dinghy'], [-1558, -262, 'cruiser'], [-1520, -342, 'rib'], [-1522, -250, 'sloop']];\nexport const BRIDGE = {"),
])
patch('src/game/boatYard.js', [
    ("import { RNG } from '../core/rng.js';", "import { RNG } from '../core/rng.js';\nimport { MOORINGS } from '../data/routes.js';"),
    ("// Marin Village: boats on moorings in the channel off the quay, riding head to wind\nconst MOORINGS = [[-1636, -330, 'sloop'], [-1618, -296, 'dinghy'], [-1640, -262, 'cruiser'], [-1604, -352, 'rib'], [-1596, -250, 'sloop']];\n", "// boats on the Marin moorings ride head to wind\n"),
])
patch('src/world/regions.js', [
    ("import { BRIDGE, ISLE, ALDER, DRY, MARIN, TOWN_Y } from '../data/routes.js';", "import { BRIDGE, ISLE, ALDER, DRY, MARIN, TOWN_Y, MOORINGS } from '../data/routes.js';"),
    ("    this.bridge();\n    this.lighthouse();", "    this.bridge();\n    this.moorings();\n    this.lighthouse();"),
    ("  lighthouse() {", """  // mooring buoys; the boats themselves are placed by the boat yard
  moorings() {
    const G = this.gen, red = C('#d9432f'), white = C('#f1efe6'), y = WATER_LEVEL;
    for (const [x, z] of MOORINGS) {
      const g = G.g('paint', x, z);
      g.addGeo(new THREE.SphereGeometry(0.34, 10, 8), x, y + 0.06, z, 0, 1, 1, 1, red);
      g.addGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5), x, y + 0.55, z, 0, 1, 1, 1, white);
    }
  }

  lighthouse() {"""),
])
print('ok')
