p = 'src/world/buildings.js'
s = open(p, encoding='utf8').read()


def rep(a, b, cnt=1):
    global s
    assert a in s, a[:90]
    s = s.replace(a, b, cnt)


# theme-aware houses (suburb / alpine / desert)
rep("""    const matR = rng.f();
    const mat = matR < 0.6 ? 'siding' : matR < 0.82 ? 'brick' : 'stucco';
    const col = mat === 'siding' ? pick(rng, PALETTE.siding) : mat === 'brick' ? pick(rng, PALETTE.brick) : pick(rng, PALETTE.stucco);""",
    """    const matR = rng.f();
    const th = B.style;
    const mat = th === 'alpine' ? (matR < 0.65 ? 'siding' : 'brick') : th === 'desert' ? 'stucco' : matR < 0.6 ? 'siding' : matR < 0.82 ? 'brick' : 'stucco';
    const col = th === 'alpine' ? (mat === 'siding' ? pick(rng, ['#7b5a3c', '#8c6a46', '#6a4c33', '#a07850']) : pick(rng, ['#8a8a86', '#7c7c78', '#9a9890']))
      : th === 'desert' ? pick(rng, ['#d9b98c', '#cfa97a', '#e6d2a8', '#c99a6b', '#dcc3a0'])
      : mat === 'siding' ? pick(rng, PALETTE.siding) : mat === 'brick' ? pick(rng, PALETTE.brick) : pick(rng, PALETTE.stucco);""")
rep("""    const roofCol = pick(rng, PALETTE.roof);
    const ridgeAlongX = !frontX;
    this.gableRoof(main, y0 + H, rng.range(2.2, 3.4), ridgeAlongX, roofCol, col, rng.chance(0.3));""",
    """    const roofCol = th === 'alpine' ? (rng.chance(0.55) ? C(pick(rng, ['#e8eaee', '#dfe3e8'])) : pick(rng, ['#4a3a30', '#3d3d40', '#5a463a']))
      : th === 'desert' ? pick(rng, ['#a8553a', '#b5683f', '#8f4a32', '#c9b79a']) : pick(rng, PALETTE.roof);
    const ridgeAlongX = !frontX;
    this.gableRoof(main, y0 + H, th === 'alpine' ? rng.range(3.8, 5.4) : th === 'desert' ? rng.range(1.0, 1.7) : rng.range(2.2, 3.4), ridgeAlongX, roofCol, col, th === 'desert' ? true : rng.chance(0.3));""")
rep("""    if (rng.chance(0.4)) {
      const [cx, cz] = toWorld(uHouse + hw * 0.8, setback + hd * 0.5);""", """    if (rng.chance(th === 'alpine' ? 0.85 : 0.4)) {
      const [cx, cz] = toWorld(uHouse + hw * 0.8, setback + hd * 0.5);""")
rep("""    const veg = this.world.veg;
    if (rng.chance(0.75)) { const [tx, tz] = toWorld(rng.range(1.5, LW - 1.5), rng.range(1.5, setback - 1.5)); if (Math.abs(tx - (dr.x0 + dr.x1) / 2) > 3 || true) veg.tree(tx, y0, tz, rng.chance(0.2) ? 'conifer' : 'yard', rng); }
    if (rng.chance(0.7)) { const [tx, tz] = toWorld(rng.range(1.5, LW - 1.5), LD - rng.range(1.5, 4)); veg.tree(tx, y0, tz, rng.chance(0.3) ? 'conifer' : 'yard', rng); }""",
    """    const veg = this.world.veg;
    const kindA = th === 'alpine' ? 'pine' : th === 'desert' ? (rng.chance(0.5) ? 'cactus' : 'scrub') : rng.chance(0.2) ? 'conifer' : 'yard';
    const kindB = th === 'alpine' ? 'conifer' : th === 'desert' ? 'scrub' : rng.chance(0.3) ? 'conifer' : 'yard';
    if (rng.chance(0.75)) { const [tx, tz] = toWorld(rng.range(1.5, LW - 1.5), rng.range(1.5, setback - 1.5)); veg.tree(tx, y0, tz, kindA, rng); }
    if (rng.chance(0.7)) { const [tx, tz] = toWorld(rng.range(1.5, LW - 1.5), LD - rng.range(1.5, 4)); veg.tree(tx, y0, tz, kindB, rng); }""")
rep("""      if (B.style === 'cbd') this.cbdBlock(B);""", """      if (B.style === 'alpine' || B.style === 'desert') this.suburbBlock(B);
      else if (B.style === 'isle') this.isleBlock(B);
      else if (B.style === 'cbd') this.cbdBlock(B);""")
open(p, 'w', encoding='utf8').write(s)
print('ok')
