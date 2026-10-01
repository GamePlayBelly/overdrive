def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/vehicles/sailModel.js', [
    ("  g.userData = { main, jibPivot, hinge, axis, cloth };", "  g.userData = { main, jibPivot, hinge, axis, cloth, meshes: [sail, jibSail] };"),
])
patch('src/vehicles/boat.js', [
    ("    this.sailA = 0; this.sailL = 1;", "    this.sailA = 0; this.sailL = 1; this.hoist = 0;"),
    ("      S.main.rotation.y = a; S.hinge.quaternion.setFromAxisAngle(S.axis, a * 0.84);",
     "      // sails come up when someone sails the boat and are furled while it sits at its berth\n      const want = this.driver || this.ai || p.speed > 1.5 ? 1 : 0;\n      this.hoist = dt > 0 ? this.hoist + Math.max(-dt * 0.8, Math.min(dt * 0.45, want - this.hoist)) : want;\n      for (const m of S.meshes) { m.visible = this.hoist > 0.03; m.scale.y = Math.max(0.02, this.hoist); }\n      S.main.rotation.y = a; S.hinge.quaternion.setFromAxisAngle(S.axis, a * 0.84);"),
])
patch('src/game/boatYard.js', [
    ("const HARBOR = ['rib', 'jetski', 'fisher', 'dinghy', 'jetski', null];",
     "const HARBOR = ['rib', 'jetski', 'fisher', 'dinghy', 'jetski', null];\n// Marin Village: boats on moorings in the channel off the quay, riding head to wind\nconst MOORINGS = [[-1636, -330, 'sloop'], [-1618, -296, 'dinghy'], [-1640, -262, 'cruiser'], [-1604, -352, 'rib'], [-1596, -250, 'sloop']];"),
    ("    if (W.harborDocks) W.harborDocks.berths.forEach((b, i) => { if (HARBOR[i]) add('harbor', b, HARBOR[i], b.yaw); });",
     "    if (W.harborDocks) W.harborDocks.berths.forEach((b, i) => { if (HARBOR[i]) add('harbor', b, HARBOR[i], b.yaw); });\n    for (const [x, z, id] of MOORINGS) {\n      const def = VEHICLE_BY_ID[id], yaw = Math.PI * 0.6;\n      const v = this.g.spawnVehicle(id, x, z, yaw, { color: def.colors[Math.floor(rng.f() * def.colors.length)] }, { kind: 'civilian' });\n      v.moor = { x, z, yaw }; v.berth = { site: 'mooring', x, z, yaw };\n      this.slots.push({ v, id, pos: { x, z }, yaw, mooring: true });\n    }"),
    ("    this.t += dt;\n    const g = this.g, P = g.player, cam = g.camera.position;",
     "    this.t += dt;\n    const g = this.g, P = g.player, cam = g.camera.position;\n    const W = g.sky?.wind, into = W ? Math.atan2(-W.x, -W.z) : 0;\n    for (const s of this.slots) if (s.mooring && s.v.moor) s.v.moor.yaw = into;"),
    ("          v.repair(); v.place(s.pos.x, 0, s.pos.z, s.yaw); v.moor = { x: s.pos.x, z: s.pos.z, yaw: s.yaw };",
     "          v.repair(); v.place(s.pos.x, 0, s.pos.z, s.yaw); v.moor = { x: s.pos.x, z: s.pos.z, yaw: s.yaw };"),
])
print('ok')
