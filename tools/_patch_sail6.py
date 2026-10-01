def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/vehicles/boatModel.js', [
    ("import { makeLightsMaterial, makePaintMaterial, makeGlassMaterial } from './carModel.js';\n",
     "import { makeLightsMaterial, makePaintMaterial, makeGlassMaterial } from './carModel.js';\nimport { makeSails } from './sailModel.js';\nimport { sailBuilders } from './sailBoats.js';\n"),
    ("// ---------------------------------------------------------------- public\nconst cache = new Map();",
     "Object.assign(BUILD, sailBuilders({ hullBuild, deckBand, sideDeck, cabin, rail, bx, tube, lamp, quadN, hexa, K, C }));\n\n// ---------------------------------------------------------------- public\nconst cache = new Map();"),
    ("    else if (r.type === 'nozzle') { g = rigNozzle(mats); rig.nozzle = g; }",
     """    else if (r.type === 'nozzle') { g = rigNozzle(mats); rig.nozzle = g; }
    else if (r.type === 'tiller') {
      g = new THREE.Group();
      const geo = rigGeo('tiller' + r.len, () => { const gb = new GeoBuilder(); tube(gb, [0, 0, 0], [0, 0.08, r.len], 0.016, K.wood, 6); tube(gb, [0, 0, 0], [0, -0.38, 0.02], 0.02, K.dark, 5); return gb.build(); });
      g.add(mesh(geo, mats.trim, false)); rig.tiller = g;
    } else if (r.type === 'sails') { g = makeSails(r); rig.sails = g.userData; rig.sailMat = g.userData.cloth; group.add(g); continue; }"""),
])
patch('src/vehicles/boat.js', [
    ("    this.prop = 0;\n    this.leak = 0;\n    this.moor = null;", "    this.prop = 0;\n    this.leak = 0;\n    this.moor = null;\n    this.sailA = 0; this.sailL = 1;"),
    ("    if (R.radar) R.radar.rotation.y += dt * 2.4;\n",
     """    if (R.radar) R.radar.rotation.y += dt * 2.4;
    if (R.tiller) R.tiller.rotation.y = -p.steerIn * 0.5;
    if (R.sails) {
      const S = R.sails, k = dt > 0 ? 1 - Math.exp(-Math.min(dt, 0.1) * 3.2) : 1, kl = dt > 0 ? 1 - Math.exp(-Math.min(dt, 0.1) * 6) : 1;
      this.sailA += (p.sailT - this.sailA) * k; this.sailL += (p.sailLuff - this.sailL) * kl;
      const a = this.sailA, U = R.sailMat.userData.sail;
      S.main.rotation.y = a; S.hinge.quaternion.setFromAxisAngle(S.axis, a * 0.84);
      U.uCamber.value = -(a < 0 ? -1 : 1) * 0.5 * (1 - this.sailL) * (this.def.body.L / 9.4) ** 0.5;
      U.uFlutter.value = this.sailL; U.uTime.value = this.world.sea.t;
    }
"""),
])
print('ok')
