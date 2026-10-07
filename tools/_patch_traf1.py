def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/actors/boatTraffic.js', [
 ("    const comp = this.nav.compAt(F.x, F.z) || this.nav.nearest(F.x, F.z, 60) ? this.nav.comp[this.nav.nearest(F.x, F.z, 60)?.k ?? 0] : this.nav.big;", "    const nn = this.nav.nearest(F.x, F.z, 80), comp = nn ? this.nav.comp[nn.k] : this.nav.big;"),
 ("\nexport { clamp };\n", "\n"),
 ("import { clamp, wrapAngle, dampAngle, smoothstep }", "import { wrapAngle, dampAngle, smoothstep }"),
])
patch('src/actors/seaTraffic.js', [
 ("import { WATER_LEVEL } from '../data/world.js';", "import { WATER_LEVEL } from '../data/world.js';\nimport { BoatTraffic } from './boatTraffic.js';"),
 ("// Ambient boats on the bay and the harbor patrol that answers a wanted player who takes to the water.\nconst KINDS = ['rib', 'sport', 'jetski', 'fisher', 'yacht', 'rib', 'jetski', 'sloop', 'sloop', 'dinghy', 'cruiser'];\n", "// Harbor patrol that answers a wanted player who takes to the water; ambient traffic lives in BoatTraffic (this.pop).\n"),
 ("constructor(game) { this.g = game; this.boats = []; this.t = 1; this.enabled = true; this.max = 5; this.pt = 0; }", "constructor(game) { this.g = game; this.boats = []; this.t = 1; this.enabled = true; this.pt = 0; this.pop = new BoatTraffic(game); }"),
 ("    for (const b of this.boats) b.ai.update(dt);\n", "    this.pop.update(dt);\n    for (const b of this.boats) b.ai.update(dt);\n"),
])
s = open('src/actors/seaTraffic.js', encoding='utf8').read()
a = s.index("    // ambient boats while the player is near the coast")
b = s.index("    // harbor patrol")
s = s[:a] + s[b:]
s = s.replace("      else if (!b.patrol && (b.ai.arrived || !b.ai.goal)) { const q = this.pickWater(b.v.x, b.v.z, 260, 800, 4); if (q) b.ai.goto(q.x, q.z); }\n", "")
open('src/actors/seaTraffic.js', 'w', encoding='utf8').write(s)
