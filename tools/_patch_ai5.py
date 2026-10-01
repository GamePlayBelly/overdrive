def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/vehicles/aiDriver.js', [
    ("    this.pit = 0;\n    this.avoid = 0;\n", "    this.pit = 0;\n    this.avoid = 0;\n    this.recover = !!opts.recover;\n    this.lostT = 0;\n"),
    ("        for (const q of pp) pts.push({ x: q.x, z: q.z });\n      }\n    };", "        for (const q of pp) pts.push({ x: q.x, z: q.z, y: q.y });\n      }\n    };"),
    ("        vmax = Math.min(vmax, Math.sqrt(vt * vt + 2 * 6.5 * dist));", "        vmax = Math.min(vmax, Math.sqrt(vt * vt + 2 * 5 * dist));"),
    ("    const reach = 60 + v.phys.speed * v.phys.speed / 13;", "    const reach = 60 + v.phys.speed * v.phys.speed / 10;"),
    ("    else if (err < -2) { inp.throttle = 0; inp.brake = clamp(-err * 0.15, 0.2, 1); }", "    else if (err < -2) { inp.throttle = 0; inp.brake = clamp(-err * 0.25, 0.2, 1) * (1 - 0.35 * Math.abs(inp.steer)); }"),
    ("    // stuck & reverse\n    if (this.reverseT > 0) {",
     "    if (this.recover && this.path.length > 3 && this.mode !== 'chase') {\n      const lost = this.xt > 22 || (speed < 1.2 && desired > 3);\n      this.lostT = lost ? this.lostT + dt : Math.max(0, this.lostT - dt * 2);\n      if (this.lostT > (this.xt > 22 ? 2 : 7)) this.warp();\n    }\n    // stuck & reverse\n    if (this.reverseT > 0) {"),
    ("  follow() {", """  // put a lost or wedged car back on its route, facing along it
  warp() {
    const v = this.v, P = this.path, W = this.game.world;
    let bi = this.pi, bd = Infinity;
    for (let i = Math.max(0, this.pi - 6); i < Math.min(P.length, this.pi + 40); i++) { const d = Math.hypot(P[i].x - v.x, P[i].z - v.z); if (d < bd) { bd = d; bi = i; } }
    bi = Math.min(P.length - 2, bi + 1);
    const a = P[bi], b = P[Math.min(P.length - 1, bi + 3)];
    if (v.disabled || v.damage.total > 0.9) v.repair?.();
    v.place(a.x, a.y ?? W.groundY(a.x, a.z, v.y + 30), a.z, Math.atan2(b.x - a.x, b.z - a.z));
    v.phys.vx = v.phys.vz = 0;
    this.pi = bi; this.lostT = 0; this.stuckT = 0; this.reverseT = 0;
  }

  follow() {"""),
])
patch('src/game/missions.js', [
    ("      const ai = new AIDriver(g, v, { maxSpeed: 22 + skill * 28, aggr: meta.aggr ?? 0.5, skill });", "      const ai = new AIDriver(g, v, { maxSpeed: 22 + skill * 28, aggr: meta.aggr ?? 0.5, skill, recover: true });"),
])
print('ok')
