def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('src/actors/police.js', [
 ("import { VEHICLE_BY_ID } from '../data/vehicles.js';", "import { VEHICLE_BY_ID } from '../data/vehicles.js';\nimport { WANTED } from '../data/wanted.js';\nimport { CoastGuard } from './coastGuard.js';"),
 ("const UNITS_BY_LEVEL = [0, 1, 2, 4, 5, 6, 8];\nconst SPEED_BY_LEVEL = [0, 26, 36, 42, 46, 52, 58];", "const UNITS_BY_LEVEL = WANTED.road.units;\nconst SPEED_BY_LEVEL = WANTED.road.speed;"),
 ("    this.stats = { maxLevel: 0, escapes: 0, arrests: 0, pursuitTime: 0, unitsDisabled: 0 };\n  }", "    this.stats = { maxLevel: 0, escapes: 0, arrests: 0, pursuitTime: 0, unitsDisabled: 0 };\n    this.peak = 0;\n    this.cg = new CoastGuard(game);\n  }"),
 ("    const map = { speeding: 1, redlight: 1, hitCar: 1, hitPed: 2, carjack: 1, assault: 1, hitPolice: 2, ramPolice: 3, sidewalk: 1, prop: 0, evade: 2, trespass: 1 };\n    let lvl = map[type] ?? 1;\n    this.points += sev;",
  "    const map = WANTED.crimes;\n    let lvl = map[type] ?? 1;\n    this.points += WANTED.severity[type] ?? sev;"),
 ("    for (const c of this.game.traffic.cars) if (c.role === 'police' && Math.hypot(c.x - x, c.z - z) < 55 && this.los(c.x, c.z, c.y, x, z)) return c;\n    return null;", "    for (const c of this.game.traffic.cars) if (c.role === 'police' && Math.hypot(c.x - x, c.z - z) < 55 && this.los(c.x, c.z, c.y, x, z)) return c;\n    return this.cg.witness(x, z);"),
 ("    this.level = lvl;\n    this.escape = 0;\n    this.stats.maxLevel", "    this.level = lvl; this.peak = lvl;\n    this.escape = 0;\n    this.stats.maxLevel"),
 ("    for (const h of this.helis) h.leaving = true;\n    this.clearRoadblocks();\n    this.game.emit('police:clear'", "    for (const h of this.helis) h.leaving = true;\n    this.clearRoadblocks(); this.cg.dismiss();\n    this.game.emit('police:clear'"),
 ("    this.patrols(dt);\n", "    this.patrols(dt);\n    const T0 = this.target, wt = this.cg.onWater(T0);\n    this.cg.update(dt, T0, wt);\n"),
 ("      if (seen) this.markSeen(); else this.seen = false;", "      if (!seen && wt && this.cg.sees(T)) seen = true;\n      if (seen) { this.markSeen(); this.peak = Math.max(this.peak, this.level); } else this.seen = false;"),
 ("    const escapeTime = (10 + this.level * 7) * (this.game.heat", "    const escapeTime = (wt ? WANTED.sea.escape.base + this.level * WANTED.sea.escape.perLevel : 10 + this.level * 7) * (this.game.heat"),
 ("      if (this.escape >= 1) { this.stats.escapes++; this.clear('escape'); return; }", """      if (this.escape >= 1) { this.stats.escapes++; this.clear('escape'); return; }
      if (WANTED.stepDown && this.level > 1) {
        const tl = Math.max(1, Math.ceil(this.peak * (1 - this.escape)));
        if (tl < this.level) { const prev = this.level; this.level = tl; g.emit('police:level', { level: tl, prev, reason: 'cooling' }); this.radio('Suspect has not been seen. Reducing response.'); }
      }"""),
 ("      const u = this.units.find((q) => Math.hypot(q.v.x - T.x, q.v.z - T.z) < 30);", "      const u = this.units.find((q) => Math.hypot(q.v.x - T.x, q.v.z - T.z) < 30) || this.cg.units.find((q) => Math.hypot(q.v.x - T.x, q.v.z - T.z) < 40);"),
 ("    const want = UNITS_BY_LEVEL[this.level];\n    this.spawnCd", "    const want = wt ? (this.level >= 3 ? 1 : 0) : UNITS_BY_LEVEL[this.level];\n    this.spawnCd"),
 ("    const heliWant = this.level >= 6 ? 2 : this.level >= 5 ? 1 : 0;", "    const heliWant = wt ? WANTED.sea.heli[this.level] : this.level >= 6 ? 2 : this.level >= 5 ? 1 : 0;"),
 ("|| (g.seaTraffic && g.seaTraffic.boats.some((b) => b.patrol && !b.v.disabled && Math.hypot(b.v.x - T.x, b.v.z - T.z) < 12));", "|| this.cg.units.some((u) => !u.v.disabled && Math.hypot(u.v.x - T.x, u.v.z - T.z) < 14 && Math.abs(u.v.y - T.y) < 4);"),
 ("    this.level = 0;\n    this.bust = 0;\n    g.emit('police:arrest'", "    this.level = 0; this.cg.dismiss();\n    this.bust = 0;\n    g.emit('police:arrest'"),
])
# the road units stop short of the shore: only the first search stays on land
s = open('src/actors/seaTraffic.js', encoding='utf8').read()
a = s.index("    // harbor patrol")
b = s.index("    const T = g.police.target;")
e = s.index("  }\n}", b)
s = s[:a] + s[e:]
open('src/actors/seaTraffic.js', 'w', encoding='utf8').write(s)
print('ok')
