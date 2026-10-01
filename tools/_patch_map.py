def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/ui/mapRender.js', [
    ("export const MAP = { x0: -1300, z0: -1100, x1: 1500, z1: 2650, scale: 0.9 };", "export const MAP = { x0: -3150, z0: -2550, x1: 3550, z1: 2750, scale: 0.7 };"),
    ("    else if (z > 2270 && h < 0.8) { d[k] = 96; d[k + 1] = 88; d[k + 2] = 68; }",
     "    else if ((z > 2270 && h < 0.8) || (x < -1500 && h < 1.4)) { d[k] = 96; d[k + 1] = 88; d[k + 2] = 68; }"),
    ("      const base = z < -470 || x > 1010 || z > 495 ? [44, 58, 42] : [40, 44, 48];\n      d[k] = base[0] + e * 40 + shade; d[k + 1] = base[1] + e * 34 + shade; d[k + 2] = base[2] + e * 30 + shade;",
     "      let base = z < -470 || x > 1010 || z > 495 ? [44, 58, 42] : [40, 44, 48];\n      if (x > 1950) { const q2 = Math.min(1, (x - 1950) / 400); base = [44 + 66 * q2, 58 + 34 * q2, 42 + 6 * q2]; }\n      let r0 = base[0] + e * 40 + shade, g0 = base[1] + e * 34 + shade, b0 = base[2] + e * 30 + shade;\n      const sn = Math.max(0, Math.min(1, (h - 190) / 70)) * (x > 2100 ? 0 : 1);\n      d[k] = r0 + (176 - r0) * sn; d[k + 1] = g0 + (184 - g0) * sn; d[k + 2] = b0 + (196 - b0) * sn;"),
])
patch('src/data/world.js', [
    ("  { id: 'airfield', label: 'Riverton Airfield', x: 1050, z: 2100, heading: Math.PI / 2 },\n];", """  { id: 'airfield', label: 'Riverton Airfield', x: 1050, z: 2100, heading: Math.PI / 2 },
  { id: 'alder', label: 'Alder Peak — Summit Road', x: -40, z: -1662, heading: Math.PI },
  { id: 'dry', label: 'Dry Springs — Main Street', x: 2790, z: 144, heading: Math.PI / 2 },
  { id: 'marin', label: 'Marin Village — Bayline Drive', x: -1874, z: -462, heading: -Math.PI / 2 },
  { id: 'bridge', label: 'Bayline Bridge', x: -1300, z: -428, heading: -Math.PI / 2 },
];"""),
])
print('ok')
