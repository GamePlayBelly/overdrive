def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/app/app.js', [
 ("        this.net.tick(dt, g);\n        g.update(dt);", "        this.net.tick(dt, g);\n        const act = g.input.hit('interact');\n        g.update(dt);"),
 ("        this.interiors.update(dt);\n        this.remote.update(dt);", "        this.interiors.update(dt, act);\n        this.remote.update(dt);"),
])
patch('src/app/interiors.js', [
 ("  update(dt) {\n    const app = this.app, g = this.g, P = g.player;", "  update(dt, act = false) {\n    const app = this.app, g = this.g, P = g.player;"),
 ("    if (this.inside) { this.updateInside(dt); return; }", "    if (this.inside) { this.updateInside(dt, act); return; }"),
 ("    if (g.input.hit('interact')) this.enter(d);", "    if (act || g.input.hit('interact')) this.enter(d);"),
 ("      if ((fx * vx + fz * vz) / l < 0.1) return;", "      if ((fx * vx + fz * vz) / l < -0.25) return;"),
 ("    else type = pick(STYLE_TYPES[W.districtAt(c.x, c.z).style] || ['market', 'cafe', 'house'], seed >>> 3);", "    else if (c.ref === 'house') type = 'house';\n    else type = pick(STYLE_TYPES[W.districtAt(c.x, c.z).style] || ['market', 'cafe', 'house'], seed >>> 3);"),
 ("    if (!I.hit('interact')) return;\n    if (near.type === 'door')", "    if (!(act || I.hit('interact'))) return;\n    if (near.type === 'door')"),
])
patch('src/world/buildings.js', [
 ("0, -1, y0 + H + 3, { kind: 'building', mat: 'wood' });", "0, -1, y0 + H + 3, { kind: 'building', mat: 'wood', ref: 'house' });"),
])
