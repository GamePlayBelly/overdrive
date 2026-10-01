def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/world/blocks.js', [
    ("        id: blocks.length, district: D.id, style, zone, cell: { x0, x1, z0, z1 }, curb, lot, sides, sw, verge,\n        raise: RAISE[zone] ?? RAISE[style] ?? 0.12, cornerR: style === 'suburb' ? 4.5 : 3.2,",
     "        id: blocks.length, district: D.id, style, zone, cell: { x0, x1, z0, z1 }, curb, lot, sides, sw, verge, elev: D.elev || 0,\n        raise: (RAISE[zone] ?? RAISE[style] ?? 0.12) + (D.elev || 0), cornerR: style === 'suburb' || style === 'alpine' || style === 'desert' ? 4.5 : 3.2,"),
    ("  raiseAt(x, z) {\n    const b = this.blockAt(x, z);\n    if (b) {\n      if (b.style === 'suburb') {",
     "  raiseAt(x, z) {\n    const b = this.blockAt(x, z);\n    this.lastElev = b ? b.elev : 0;\n    if (b) {\n      if (b.style === 'suburb' || b.style === 'alpine' || b.style === 'desert') {"),
    ("        return dEdge < b.verge ? 0.05 : b.raise;", "        return dEdge < b.verge ? 0.05 + b.elev : b.raise;"),
    ("    for (const r of this.extra) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r.raise;\n    return 0;", "    for (const r of this.extra) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) { this.lastElev = 0; return r.raise; }\n    return 0;"),
    ("    curbFace(curbs, outer, -0.05, y, cCurb);", "    const e = B.elev || 0;\n    curbFace(curbs, outer, e - 0.05, y, cCurb);"),
    ("      fill.v(sx, 0.018, sz, 0, 1, 0, sx / 7, sz / 7);", "      fill.v(sx, e + 0.018, sz, 0, 1, 0, sx / 7, sz / 7);"),
    ("        fill.v(px, 0.018, pz, 0, 1, 0, px / 7, pz / 7);", "        fill.v(px, e + 0.018, pz, 0, 1, 0, px / 7, pz / 7);"),
    ("    if (B.style === 'suburb') {\n      const vInner", "    const rural = B.style === 'suburb' || B.style === 'alpine' || B.style === 'desert';\n    if (rural) {\n      const vInner"),
    ("      ringMesh(grass, outer, vInner, 0.05, cGrass, 5);", "      ringMesh(grass, outer, vInner, e + 0.05, cGrass, 5);"),
    ("      curbFace(curbs, vOuter, 0.05, y, cCurb);", "      curbFace(curbs, vOuter, e + 0.05, y, cCurb);"),
    ("    const tp = B.style === 'suburb' ? SURF.GRASS : SURF.CONCRETE;", "    const tp = rural ? SURF.GRASS : SURF.CONCRETE;"),
    ("    if (B.style === 'suburb') terrain.paintRect(B.lot.x0", "    if (rural) terrain.paintRect(B.lot.x0"),
])
patch('src/world/world.js', [
    ("    if (r > 0 && y < 1 && y > -0.5) y = Math.max(y, r);\n    let deck = false;", "    if (r > 0) { const e = this.raised.lastElev; if (y < e + 1 && y > e - 0.5) y = Math.max(y, r); }\n    let deck = false;"),
])
patch('src/world/grass.js', [
    ("      if (r > 0 && y < 1 && y > -0.5) y = Math.max(y, r);", "      if (r > 0) { const e = W.raised.lastElev; if (y < e + 1 && y > e - 0.5) y = Math.max(y, r); }"),
])
patch('src/world/buildings.js', [
    ("  house(lot, front, rng, B, idx, count) {\n    const y0 = 0.05;", "  house(lot, front, rng, B, idx, count) {\n    const y0 = 0.05 + (B.elev || 0);"),
    ("      const fy = 0.04;", "      const fy = 0.04 + (B.elev || 0);"),
])
patch('src/data/routes.js', [
    ("dist(ALDER, 6, 'alpine', 'alder', 'Alder Peak', 'Alder Peak', '#9fb6c9', { sidewalk: 1.8, verge: 2.4 }),", "dist(ALDER, 6, 'alpine', 'alder', 'Alder Peak', 'Alder Peak', '#9fb6c9', { sidewalk: 1.8, verge: 2.4, elev: TOWN_Y.alder }),"),
    ("dist(DRY, 6, 'desert', 'dry', 'Dry Springs', 'Dry Springs', '#c9a46a', { sidewalk: 1.8, verge: 2.4 }),", "dist(DRY, 6, 'desert', 'dry', 'Dry Springs', 'Dry Springs', '#c9a46a', { sidewalk: 1.8, verge: 2.4, elev: TOWN_Y.dry }),"),
    ("dist(MARIN, 6, 'isle', 'marin', 'Marin Village', 'Marin Village', '#58c0c4', { sidewalk: 3.2 }),", "dist(MARIN, 6, 'isle', 'marin', 'Marin Village', 'Marin Village', '#58c0c4', { sidewalk: 3.2, elev: TOWN_Y.marin }),"),
])
print('ok')
