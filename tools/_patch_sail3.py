def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/data/boats.js', [
    ("  { id: 'patrol', brand: 'RCPD',", """  { id: 'dinghy', brand: 'Tidewater', name: 'Skiff 14', cls: 'Sailboat', price: 7400, level: 2, boat: 'dinghy', body: base(4.3, 1.55, 1.0, { draft: 0.16 }), perf: P({ mass: 280, kw: 0, nm: 0, redline: 4000, cd: 0.5, vmax: 6, vplane: 99, rmax: 1.5, alat: 5, klat: 3.6, heel: -0.1, trim: 0, thr: 0, sail: { area: 11.5, hCE: 1.9, gm: 0.35, keel: 0.7, k2: 24, hull: 4.6, wall: 500, mast: 6.2, spread: 0.2 } }), sound: { cyl: 1, pitch: 1, rough: 0.2 }, head: 'slim', tail: 'slim', rims: 'steel', traffic: 0, colors: ['#f2f2f0', '#1d4f91', '#e5383b', '#f2c12e'] },
  { id: 'sloop', brand: 'Seabreeze', name: 'Sloop 31', cls: 'Sailboat', price: 118000, level: 16, boat: 'sloop', body: base(9.4, 3.1, 2.2, { draft: 0.62 }), perf: P({ mass: 4400, kw: 18, nm: 70, redline: 3400, cd: 0.7, vmax: 5.5, vplane: 99, rmax: 0.55, alat: 2.6, klat: 3.2, heel: -0.1, trim: 0, thr: 38, sail: { area: 46, hCE: 4.5, gm: 0.45, keel: 1.65, k2: 106, hull: 3.9, wall: 1500, mast: 13.2, spread: 0.2 } }), sound: { cyl: 3, pitch: 0.62, rough: 0.5 }, head: 'slim', tail: 'slim', rims: 'steel', traffic: 0, colors: ['#f2f2f0', '#1d2f4a', '#8c1c1c', '#2f5d4a'] },
  { id: 'cruiser', brand: 'Seabreeze', name: 'Atlantis 44', cls: 'Sailboat', price: 340000, level: 24, boat: 'sloop', body: base(13.2, 4.0, 2.9, { draft: 0.8 }), perf: P({ mass: 11200, kw: 40, nm: 180, redline: 3200, cd: 0.7, vmax: 6, vplane: 99, rmax: 0.45, alat: 2.2, klat: 3.0, heel: -0.1, trim: 0, thr: 36, sail: { area: 98, hCE: 6.2, gm: 0.6, keel: 2.1, k2: 190, hull: 4.7, wall: 3000, mast: 18.6, spread: 0.24 } }), sound: { cyl: 4, pitch: 0.58, rough: 0.5 }, head: 'slim', tail: 'slim', rims: 'steel', traffic: 0, colors: ['#f2f2f0', '#14171b', '#1d2f4a', '#d9d3c0'] },
  { id: 'patrol', brand: 'RCPD',"""),
])
print('ok')
