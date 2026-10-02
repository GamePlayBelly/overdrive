def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/world/waves.js', [
 ("  // amplitude multiplier of the local squall", """  // jump straight to the equilibrium sea of a wind (tests, teleports, weather snaps)
  settle(U, dir) {
    const c = this.cfg;
    this.U = U; this.hsW = Math.min(c.hs.max, c.hs.base + c.hs.perU2 * U * U); this.hsSlow = this.hsW; this.hsS = c.swell.base + c.swell.frac * this.hsSlow;
    this.lam = clamp(c.lambda.perU2 * U * U, c.lambda.min, c.lambda.max); this.dirW = dir; this.dirS = dir + c.swell.offset;
    this.rebuild();
  }

  // amplitude multiplier of the local squall"""),
])
patch('tools/seashot2.mjs', [
 ("for (let i = 0; i < 60 * 150; i++) { g.update(1 / 30); }", "g.update(1 / 60); g.world.sea.waves.settle(1.6 + g.sky.w.wind * 11.5, g.sky.wind.dir); for (let i = 0; i < 60 * 8; i++) { g.update(1 / 30); }"),
])
