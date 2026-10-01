def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/world/roadGraph.js', [
    ("  hdist(a, b) {", """  // lane points from a world position (heading hx,hz) to another position: along the start edge to its end node,
  // over the graph, then along the target edge to the exact spot
  pathBetween(sx, sz, sy, hx, hz, tx, tz, off = 0) {
    const S = this.nearest(sx, sz, sy, 40), G = this.nearest(tx, tz, null, 60);
    if (!S || !G) return null;
    const lane = (e) => (e.oneway ? 0 : Math.max(e.cls.centerline === 'barrier' ? e.cls.median / 2 + e.cls.laneW * 0.5 : 0, off));
    const part = (e, sa, sb) => {
      const dir = sb >= sa ? 1 : -1, pts = new Polyline(e.pl.slice(Math.min(sa, sb), Math.max(sa, sb))).offset(dir > 0 ? lane(e) : -lane(e));
      return dir > 0 ? pts : pts.reverse();
    };
    const secs = (r) => r.reduce((t, st) => t + this.edges[st.edge].pl.len / Math.max(8, this.edges[st.edge].speed), 0);
    const e0 = S.e, e1 = G.e, dir0 = e0.oneway || hx * S.dx + hz * S.dz >= 0 ? 1 : -1;
    if (e0 === e1 && (G.s - S.s) * dir0 > 0) return part(e0, S.s, G.s);
    const n0 = dir0 > 0 ? e0.b : e0.a;
    const out = part(e0, S.s, dir0 > 0 ? e0.pl.len : 0);
    const opts = [];
    const ra = this.route(n0, e1.a);
    if (ra) opts.push({ r: ra, from: 0, cost: secs(ra) + G.s / Math.max(8, e1.speed) });
    if (!e1.oneway) { const rb = this.route(n0, e1.b); if (rb) opts.push({ r: rb, from: e1.pl.len, cost: secs(rb) + (e1.pl.len - G.s) / Math.max(8, e1.speed) }); }
    if (!opts.length) return null;
    const best = opts.reduce((a, b) => (b.cost < a.cost ? b : a));
    for (const st of best.r) {
      const e = this.edges[st.edge], o = lane(e);
      for (const p of st.dir > 0 ? e.pl.offset(o) : e.pl.offset(-o).reverse()) out.push(p);
    }
    for (const p of part(e1, best.from, G.s)) out.push(p);
    return out;
  }
  hdist(a, b) {"""),
])

patch('src/vehicles/aiDriver.js', [
    ("""  routeTo(x, z, laneSide = true, next = null) {
    const R = this.game.world.roads;
    const v = this.v;
    const a = this.nodeAhead();""", """  routeTo(x, z, laneSide = true, next = null) {
    const R = this.game.world.roads, v = this.v, off = laneSide ? this.laneOffset : 0;
    const f = v.fwd();
    const seg = R.pathBetween(v.x, v.z, v.y, f.x, f.z, x, z, off);
    if (seg && seg.length > 1) {
      const pts = [{ x: v.x, z: v.z, y: v.y }, ...seg];
      const n = pts.length;
      if (next) {
        // keep going past the target so the next bend is seen early
        const hx = pts[n - 1].x - pts[n - 2].x, hz = pts[n - 1].z - pts[n - 2].z;
        const more = R.pathBetween(pts[n - 1].x, pts[n - 1].z, pts[n - 1].y, hx, hz, next.x, next.z, off);
        if (more) pts.push(...more.slice(1)); else pts.push({ x, z });
      } else pts.push({ x, z });
      this.path = simplify(pts);
      this.pi = 0;
      this.goal = { x, z };
      return true;
    }
    return this.routeNodes(x, z, laneSide, next);
  }

  routeNodes(x, z, laneSide, next) {
    const R = this.game.world.roads;
    const v = this.v;
    const a = this.nodeAhead();"""),
])
print('ok')
