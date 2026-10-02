def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/actors/marineLife.js', [
 ("    const surfTmp = new THREE.Vector3();\n    void surfTmp;\n", ""),
])
patch('src/game/game.js', [
 ("import { Underwater } from '../render/underwater.js';", "import { Underwater } from '../render/underwater.js';\nimport { Seabed } from '../world/seabed.js';\nimport { MarineLife } from '../actors/marineLife.js';"),
 ("    this.seaTraffic = new SeaTraffic(this);", "    this.seaTraffic = new SeaTraffic(this);\n    this.seabed = new Seabed(this);\n    this.marine = new MarineLife(this);"),
 ("    this.underwater.update(dt);\n", "    this.underwater.update(dt);\n    this.seabed.update(dt);\n    this.marine.update(dt);\n"),
])
patch('src/render/governor.js', [
 ("    if (g.seaTraffic) g.seaTraffic.pop.density", "    if (g.seabed) { g.seabed.setQuality(T.water === 0 ? 0 : T.water === 1 ? 0.6 : 1); g.marine.on = T.water > 0; g.marine.density = T.marine; }\n    if (g.seaTraffic) g.seaTraffic.pop.density"),
])
