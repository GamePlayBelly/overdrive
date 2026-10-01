def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/vehicles/aiDriver.js', [
    ("""  routeTo(x, z, laneSide = true) {
    const R = this.game.world.roads;
    const v = this.v;
    const a = this.nodeAhead();
    const b = R.nearestNode(x, z);
    if (!a || !b) return false;
    const path = R.route(a.id, b.id);
    const pts = [{ x: v.x, z: v.z }];
    if (path) {
      for (const step of path) {
        const e = R.edges[step.edge];
        let pp = e.pl.pts;
        const wide = e.cls.centerline === 'barrier' ? e.cls.median / 2 + e.cls.laneW * 0.5 : 0;
        const off = e.oneway ? 0 : Math.max(wide, laneSide ? this.laneOffset : 0);
        pp = step.dir > 0 ? e.pl.offset(off) : e.pl.offset(-off).slice().reverse();
        for (const q of pp) pts.push({ x: q.x, z: q.z });
      }
    }
    pts.push({ x, z });
    this.path = simplify(pts);""",
     """  routeTo(x, z, laneSide = true, next = null) {
    const R = this.game.world.roads;
    const v = this.v;
    const a = this.nodeAhead();
    const b = R.nearestNode(x, z);
    if (!a || !b) return false;
    const pts = [{ x: v.x, z: v.z }];
    const add = (path) => {
      if (!path) return;
      for (const step of path) {
        const e = R.edges[step.edge];
        const wide = e.cls.centerline === 'barrier' ? e.cls.median / 2 + e.cls.laneW * 0.5 : 0;
        const off = e.oneway ? 0 : Math.max(wide, laneSide ? this.laneOffset : 0);
        const pp = step.dir > 0 ? e.pl.offset(off) : e.pl.offset(-off).slice().reverse();
        for (const q of pp) pts.push({ x: q.x, z: q.z });
      }
    };
    add(R.route(a.id, b.id));
    // a checkpoint sitting on a node lets the path run on through it, so the next bend is seen before the corner is reached
    const c = next && Math.hypot(b.x - x, b.z - z) < 14 ? R.nearestNode(next.x, next.z) : null;
    const tail = c && c.id !== b.id ? R.route(b.id, c.id) : null;
    if (tail) { add(tail); pts.push({ x: next.x, z: next.z }); } else pts.push({ x, z });
    this.path = simplify(pts);"""),
    ("    for (let i = Math.max(1, pi - 1); i < P.length - 1 && dist < 80; i++) {",
     "    const reach = 60 + v.phys.speed * v.phys.speed / 13;\n    for (let i = Math.max(1, pi - 1); i < P.length - 1 && dist < reach; i++) {"),
])
patch('src/game/missions.js', [
    ("r.ai.routeTo(this.pts[0].x, this.pts[0].z, false); }", "r.ai.routeTo(this.pts[0].x, this.pts[0].z, false, this.pts[1] || null); }"),
    ("        const np = this.pts[r.idx]; r.ai.routeTo(np.x, np.z, false);",
     "        const np = this.pts[r.idx], nn = r.idx + 1 < this.pts.length ? this.pts[r.idx + 1] : r.lap < this.laps - 1 ? this.pts[0] : null;\n        r.ai.routeTo(np.x, np.z, false, nn);"),
])
print('ok')
