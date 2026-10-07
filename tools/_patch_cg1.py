def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/data/boats.js', [
 ("];\n", """  { id: 'cgfast', brand: 'RCPD', name: 'Coast Guard Interceptor', cls: 'Boat', npc: true, price: 0, level: 99, boat: 'sport', lightbar: true, body: base(7.6, 2.5, 1.85, { draft: 0.4 }), perf: P({ mass: 1700, kw: 330, nm: 520, redline: 6400, cd: 0.42, vmax: 31, vplane: 8, rmax: 1.5, alat: 12, klat: 2.4, heel: 0.35, trim: 0.11, thr: 34 }), sound: { cyl: 8, pitch: 1.0, rough: 0.5 }, head: 'slim', tail: 'slim', rims: 'steel', traffic: 0, colors: ['#eceae4'] },
  { id: 'cgcutter', brand: 'RCPD', name: 'Coast Guard Cutter', cls: 'Boat', npc: true, price: 0, level: 99, boat: 'yacht', lightbar: true, radar: true, body: base(13.8, 4.2, 4.0, { draft: 0.9 }), perf: P({ mass: 14000, kw: 800, nm: 2400, redline: 2900, cd: 0.6, vmax: 18, vplane: 12, rmax: 0.7, alat: 4.5, klat: 3.0, heel: -0.1, trim: 0.05, thr: 27 }), sound: { cyl: 8, pitch: 0.55, rough: 0.55 }, head: 'slim', tail: 'slim', rims: 'steel', traffic: 0, colors: ['#c9cfd6'] },
];
"""),
])
patch('src/vehicles/boatModel.js', [
 ("  const info = (BUILD[def.boat] || BUILD.sport)(ctx, def);\n  const b = def.body;", """  const info = (BUILD[def.boat] || BUILD.sport)(ctx, def);
  const b = def.body;
  // navigation lights (red to port, green to starboard, white at the stern) on every motor hull; a light bar on patrol craft that lack one
  if (!def.perf.sail) {
    const y = b.H * 0.52, z = b.L * 0.22, x = b.W * 0.4;
    lamp(ctx.lights, 0, x, y, z, 0.07, 0.07, 0.07, C('#ff2a2a')); lamp(ctx.lights, 0, -x, y, z, 0.07, 0.07, 0.07, C('#2aff5a'));
  }
  if (def.lightbar && def.boat !== 'rib') {
    const top = b.H * (def.boat === 'yacht' ? 0.98 : 0.95);
    bx(ctx.trim, 0, top, -b.L * 0.05, 0.9, 0.06, 0.2, K.dark);
    lamp(ctx.lights, 6, 0.26, top + 0.07, -b.L * 0.05, 0.3, 0.08, 0.14, C('#5a1010')); lamp(ctx.lights, 7, -0.26, top + 0.07, -b.L * 0.05, 0.3, 0.08, 0.14, C('#10105a'));
  }"""),
])
patch('src/vehicles/aiBoat.js', [
 ("    this.yield = opts.yield ?? true;", "    this.yield = opts.yield ?? true; this.ignore = null;"),
 ("      if (o === v || !o.isBoat || o.sunk) continue;", "      if (o === v || !o.isBoat || o.sunk || this.ignore?.has(o)) continue;"),
 ("    let want = Math.atan2(dx + (T.vx || 0) * 0.8, dz + (T.vz || 0) * 0.8);", "    let want = Math.atan2(dx + (T.noLead ? 0 : (T.vx || 0) * 0.8), dz + (T.noLead ? 0 : (T.vz || 0) * 0.8));"),
 ("    if (this.mode === 'chase') { const ts = Math.hypot(T.vx || 0, T.vz || 0); if (dist < 30) des = Math.max(ts + 2 + this.aggr * 4, 3); }", "    if (this.mode === 'chase') { const ts = T.spd ?? Math.hypot(T.vx || 0, T.vz || 0); if (dist < 30) des = Math.max(ts + 2 + this.aggr * 4, 3); else if (T.run) des = this.maxSpeed * this.seaK; }"),
])
