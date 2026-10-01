def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/vehicles/aiDriver.js', [
    ("        const off = e.oneway ? 0 : laneSide ? this.laneOffset : 0;",
     "        const wide = e.cls.centerline === 'barrier' ? e.cls.median / 2 + e.cls.laneW * 0.5 : 0;\n        const off = e.oneway ? 0 : Math.max(wide, laneSide ? this.laneOffset : 0);"),
])
print('ok')
