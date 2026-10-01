def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:100])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('README.md', [
    ("| Boats | same keys, F to board and leave, Space drifts the hull |",
     "| Boats | same keys, F to board and leave, Space drifts the hull |\n| Sailboats | A D rudder, Space eases the sheets (spill wind, slow down), W starts the auxiliary engine; sails trim themselves, the dial shows the wind, the no-go zone and the boom |"),
    ("- City, suburbs, industrial harbor, forest hills, farms, the bay, open sea and Riverton Airfield;",
     "- City, suburbs, industrial harbor, forest hills, farms, the bay, open sea and Riverton Airfield, plus three outer regions reached by designed roads with graded profiles and hairpins: Alder Peak (snow village, Route 12, 230 m up), Dry Springs (desert town, Route 40, 170 m up, mesa, windmills) and Marin Island (village, coast road, lighthouse, boats on moorings) joined to the mainland by the Bayline Bridge, a cable-stayed span;"),
    ("- Cars, bikes, trucks, five boats with wave physics,", "- Cars, bikes, trucks, five motor boats and three sailing boats (skiff, 31 ft sloop, 44 ft cruiser) with wave and wind physics (apparent wind, lift and drag from the sails, heel, no-go zone, leeway), "),
    ("- Adaptive quality governor aiming at 60 fps (Settings, Graphics).",
     "- Adaptive quality governor aiming at 60 fps (Settings, Graphics).\n- Photo-scanned CC0 PBR textures (Poly Haven, `assets/tex`, see `assets/tex/index.json`) with normal and roughness on roads, pavements, walls, roofs and terrain; screen-space ambient occlusion, real lamp lights at night, procedural cars built from lofted shells. `?nophoto=1` falls back to the procedural textures."),
    ("tools         Playwright + Edge test and measurement scripts (node tools/<name>.mjs)",
     "assets/tex    CC0 texture pack (albedo with baked AO, normal xy + roughness) built by tools/tex_fetch.py and tex_pack.py\ntools         Playwright + Edge test and measurement scripts (node tools/<name>.mjs)"),
    ("`avatarfaces.mjs`, `gpu*.mjs` (GPU timer queries).",
     "`avatarfaces.mjs`, `gpu*.mjs` (GPU timer queries), `gpuspots.mjs` (GPU ms at fixed places, `QUERY='?dev=1&nophoto=1'` for A/B), `aileg3.mjs` (an AI rival drives a whole league race), `racenew.mjs`, `routedrive.mjs`, `sailpolar.mjs` (sailing speed polar), `sailplay.mjs`, `sailshot.mjs`, `sailbuy.mjs`, `poicheck.mjs` (collectibles on dry land near roads)."),
])
patch('assets/README.md', [("", "")]) if False else None
print('ok')
