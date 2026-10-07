def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/render/vehicleFx.js', [
 ("    if (d2 > 140 * 140) return;\n    const toWorld", """    if (W && d2 < 75 * 75 && wet && sp > 1.2) {
      const k = clamp(sp / 16, 0, 1), sc = clamp(L / 6, 0.6, 2.2) * Math.min(1, sp / 5);
      wv(0, L * 0.4); W.wave(_a.x, _a.z, Wd * 0.8 + 0.6, (0.05 + 0.1 * k) * sc);
      wv(0, -L * 0.36); W.wave(_a.x, _a.z, Wd * 0.8 + 0.6, -(0.035 + 0.07 * k) * sc);
    }
    if (d2 > 140 * 140) return;
    const toWorld"""),
 ("    W.stamp(P.x, P.z, 0.9, 0.12 + Math.min(0.25, P.speed * 0.1));", "    W.stamp(P.x, P.z, 0.9, 0.12 + Math.min(0.25, P.speed * 0.1));\n    if (P.speed > 0.5) W.wave(P.x, P.z, 0.9, 0.012 * Math.min(1, P.speed));"),
])
