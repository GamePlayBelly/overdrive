def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/game/game.js', [
 ("import { WakeMap } from '../render/wake.js';", "import { WakeMap } from '../render/wake.js';\nimport { SeaFx } from '../render/seaFx.js';"),
 ("    this.fx = new VehicleFx(this);", "    this.fx = new VehicleFx(this);\n    this.seaFx = new SeaFx(this);"),
 ("    this.fx.update(dt);\n", "    this.fx.update(dt);\n    this.seaFx.update(dt);\n"),
])
