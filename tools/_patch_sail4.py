def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/data/vehicles.js', [
    ("'Motorcycle', 'Utility', 'Boat', 'Aircraft']", "'Motorcycle', 'Utility', 'Boat', 'Sailboat', 'Aircraft']"),
    ("export function vehicleStats(def, perf = {}) {\n  const p = def.perf;\n",
     "export function vehicleStats(def, perf = {}) {\n  const p = def.perf;\n  if (p.sail) {\n    const r = p.sail.area / Math.pow(p.mass, 2 / 3), top = Math.min(10, r * 28 + 0.8), accel = Math.min(9, r * 22), handling = Math.max(2, Math.min(9, 10 - p.mass / 1200));\n    return { speed: top, accel, handling, braking: 4, rating: Math.round((top + accel + handling + 4) * 25) };\n  }\n"),
])
patch('src/app/pages/vehicles.js', [
    ("`${sel.cls}  -  ${sel.perf.drive}  -  ${sel.perf.kw} kW  -  ${sel.perf.nm} Nm  -  ${sel.perf.mass} kg`",
     "sel.perf.sail ? `${sel.cls}  -  ${sel.perf.sail.area} m\\u00b2 sail  -  ${sel.perf.kw ? sel.perf.kw + ' kW auxiliary' : 'no engine'}  -  ${sel.perf.mass} kg` : `${sel.cls}  -  ${sel.perf.drive}  -  ${sel.perf.kw} kW  -  ${sel.perf.nm} Nm  -  ${sel.perf.mass} kg`"),
])
patch('src/app/pages/garage.js', [
    ("`${def().cls}  -  ${def().perf.drive}  -  ${def().perf.kw} kW`", "def().perf.sail ? `${def().cls}  -  ${def().perf.sail.area} m\\u00b2 sail` : `${def().cls}  -  ${def().perf.drive}  -  ${def().perf.kw} kW`"),
])
print('ok')
