def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/app/stage.js', [
    ("    this.center.set(0, b.roofY * 0.5 || 0.7, 0);\n    this.tDist = Math.max(8.2, b.L * 2.05); this.tPitch = 0.13;",
     "    const sl = def.perf?.sail;\n    this.center.set(0, sl ? sl.mast * 0.4 : b.roofY * 0.5 || 0.7, 0);\n    this.tDist = sl ? Math.max(b.L * 1.9, sl.mast * 2.1) : Math.max(8.2, b.L * 2.05); this.tPitch = sl ? 0.08 : 0.13;\n    this.maxDist = sl ? this.tDist * 1.4 : 16;"),
    ("  zoom(d) { this.tDist = clamp(this.tDist * (1 + d * 0.001), 2, 16); this.idleT = 3; }", "  zoom(d) { this.tDist = clamp(this.tDist * (1 + d * 0.001), 2, this.maxDist || 16); this.idleT = 3; }"),
])
patch('src/app/pages/common.js', [
    ("  const sl = def.perf?.sail, HH = sl ? sl.mast + 0.2 : H;\n  const s = Math.min((w - 30) / L, (h2 - 34) / (HH + (sl ? sl.keel : d) * 0.8)),",
     "  const sl = def.perf?.sail;\n  const s = Math.min((w - 30) / L, (h2 - 34) / (H + d * 0.8)),"),
    ("    const m = sl.mast, mz = L * 0.08, base = fbS + 0.06;", "    const mz = L * 0.08, base = fbS + 0.06, m = Math.min(sl.mast, (wl - 8) / s);"),
])
print('ok')
