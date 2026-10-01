def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:100])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/world/props.js', [
    ("  signSpeed50() { return speedSign('speed50'); },", "  signCurve() { return warnSign('curve'); },\n  signSpeed50() { return speedSign('speed50'); },"),
    ("function speedSign(key) {", """function warnSign(key) {
  const m = new GeoBuilder(), s = new GeoBuilder();
  cyl(m, 0, 0, 0, 0.035, 0.035, 2.6, 6, GALV);
  signFace(s, key, 0, 2.2, 0.05, 0.95, 0.95, 0, 'diamond');
  return { parts: { metal: m, sign: s }, col: { r: 0.08 }, h: 2.6, brk: { speed: 4, mass: 15 } };
}
function speedSign(key) {"""),
])
patch('src/world/regions.js', [
    ("    this.guardrails();\n    this.pois();", "    this.guardrails();\n    this.curveSigns();\n    this.pois();"),
    ("  // guardrails where the road runs along a drop", """  // yellow curve warnings 25 m before each tight bend, for both directions of travel
  curveSigns() {
    const W = this.world, R = W.roads, T = W.terrain, P = W.props;
    for (const e of R.edges) {
      if (!['Route 12', 'Route 40', 'Marin Coast Road'].includes(e.name)) continue;
      const pl = e.pl, len = pl.len;
      for (const dir of [1, -1]) {
        let last = -1e9;
        for (let s = 10; s < len - 55; s += 5) {
          const a = dir > 0 ? s : len - s, b = dir > 0 ? s + 45 : len - s - 45, pa = pl.at(a), pb = pl.at(b);
          const ha = Math.atan2(pa.dx * dir, pa.dz * dir), hb = Math.atan2(pb.dx * dir, pb.dz * dir);
          let dh = hb - ha; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
          if (Math.abs(dh) < 1.1 || s - last < 110) continue;
          last = s;
          const ps = pl.at(dir > 0 ? Math.max(2, s - 25) : Math.min(len - 2, len - s + 25)), hd = Math.atan2(ps.dx * dir, ps.dz * dir);
          const off = e.halfW + 1.5, x = ps.x + Math.cos(hd) * -off, z = ps.z + Math.sin(hd) * off;
          P.place('signCurve', x, T.height(x, z), z, hd + Math.PI);
        }
      }
    }
  }

  // guardrails where the road runs along a drop"""),
])
print('ok')
