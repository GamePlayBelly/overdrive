def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:70])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('src/app/interiors.js', [
    ("    if (P.vehicle || P.state !== 'foot' || P.seq || app.missions?.run?.step?.constructor?.name === 'Onfoot' && false) return;", "    if (P.vehicle || P.state !== 'foot' || P.seq) return;"),
    ("    hud.setPrompt('E', this.prompt.text);\n    if (g.input.hit('interact')) this.enter(d);", "    if (g.input.hit('interact')) this.enter(d);"),
    ("    hud.setPrompt('E', text); this.prompt = { key: 'E', text };", "    this.prompt = { key: 'E', text };"),
    ("for (const [x, z, sx, sz] of [[0, dp, w, 0.3], [-w / 2, dp / 2, 0.3, dp], [w / 2, dp / 2, 0.3, dp], [-(w / 2 + 1.2) / 2 - 1.1, 0, w / 2 - 1.1, 0.3], [(w / 2 + 1.2) / 2 + 1.1, 0, w / 2 - 1.1, 0.3]])", "for (const [x, z, sx, sz] of [[0, dp, w, 0.3], [-w / 2, dp / 2, 0.3, dp], [w / 2, dp / 2, 0.3, dp], [-(w / 2 + 1.1) / 2, 0, w / 2 - 1.1, 0.3], [(w / 2 + 1.1) / 2, 0, w / 2 - 1.1, 0.3]])"),
    ("door: { x: 0, z: 1.2 }", "door: { x: 0, z: 2.0 }"),
    ("    const app = this.app, g = this.g, P = g.player, hud = app.hud;\n    this.prompt = null;", "    const app = this.app, g = this.g, P = g.player;\n    this.prompt = null;"),
    ("    this.hideWorld();\n    const R = this.build(d);", "    this.hideWorld();\n    this.grassQ = g.grass?.quality; g.grass?.setQuality(0);\n    const R = this.build(d);"),
    ("    g.sky.sun.castShadow = true;\n    const r = this.ret;", "    g.sky.sun.castShadow = true; if (this.grassQ !== undefined) g.grass?.setQuality(this.grassQ);\n    const r = this.ret;"),
])
patch('src/app/hud.js', [
    ("  updatePrompt(g, P, v) {\n    if (P.busy || this.app.mode !== 'play') { this.setPrompt(null); return; }", "  updatePrompt(g, P, v) {\n    if (P.busy || this.app.mode !== 'play') { this.setPrompt(null); return; }\n    const ip = this.app.interiors?.prompt;\n    if (ip) { this.setPrompt(ip.key, ip.text); return; }"),
])
patch('src/app/app.js', [
    ("import { CarMeet } from '../game/carMeet.js';", "import { CarMeet } from '../game/carMeet.js';\nimport { Interiors } from './interiors.js';"),
    ("    this.meet = new CarMeet(this);\n", "    this.meet = new CarMeet(this);\n    this.interiors = new Interiors(this);\n"),
    ("        this.meet.update(dt);", "        this.meet.update(dt);\n        this.interiors.update(dt);"),
])
