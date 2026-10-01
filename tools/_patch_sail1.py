def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/world/sky.js', [
    ("    this.w = { ...WEATHERS.sunny };\n    this.wetness = 0;", "    this.w = { ...WEATHERS.sunny };\n    this.wind = { x: 0, z: 0, speed: 4.5, dir: 0.9, t: 0 };\n    this.wetness = 0;"),
    ("    this.wetness = clamp(this.wetness + (this.w.rain > 0.05",
     """    // true wind (m/s, blowing toward x,z): strength from the weather, a slow veer and gusts
    const WD = this.wind;
    WD.t += dt;
    WD.dir = 0.9 + 0.5 * Math.sin(WD.t * 0.011);
    WD.speed = (1.6 + this.w.wind * 11.5) * (1 + 0.2 * Math.sin(WD.t * 0.41) * Math.sin(WD.t * 0.23 + 1.3) + 0.1 * Math.sin(WD.t * 1.7));
    WD.x = Math.cos(WD.dir) * WD.speed; WD.z = Math.sin(WD.dir) * WD.speed;
    this.wetness = clamp(this.wetness + (this.w.rain > 0.05"""),
])
patch('src/world/grass.js', [
    ("    const a = Math.sin(U.uTime.value * 0.03) * 0.6 + 0.9;\n", "    const a = sky?.wind?.dir ?? Math.sin(U.uTime.value * 0.03) * 0.6 + 0.9;\n"),
])
print('ok')
