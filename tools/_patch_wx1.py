def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/world/sky.js', [
 ("  storm: { label: 'Storm', cloud: 1, dark: 0.9, rain: 0.9, fog: 0.0028, wind: 1.3, sun: 0.1, lightning: 1 },\n};",
  """  storm: { label: 'Storm', cloud: 1, dark: 0.9, rain: 0.9, fog: 0.0028, wind: 1.3, sun: 0.1, lightning: 1 },
  calm: { label: 'Calm', cloud: 0.08, dark: 0, rain: 0, fog: 0.0005, wind: 0.06, sun: 1, lightning: 0 },
  breezy: { label: 'Breezy', cloud: 0.3, dark: 0.05, rain: 0, fog: 0.0006, wind: 0.55, sun: 0.95, lightning: 0 },
  windy: { label: 'Windy', cloud: 0.55, dark: 0.2, rain: 0, fog: 0.0007, wind: 0.85, sun: 0.7, lightning: 0 },
  roughSea: { label: 'Rough sea', cloud: 0.7, dark: 0.35, rain: 0, fog: 0.0011, wind: 1.05, sun: 0.5, lightning: 0 },
  thunderstorm: { label: 'Thunderstorm', cloud: 1, dark: 0.8, rain: 0.8, fog: 0.0024, wind: 1.0, sun: 0.14, lightning: 1 },
  gale: { label: 'Gale', cloud: 1, dark: 0.92, rain: 1, fog: 0.0036, wind: 1.6, sun: 0.08, lightning: 0.6 },
};"""),
 ("  sunny: [['sunny', 3], ['cloudy', 3]], cloudy: [['sunny', 2], ['overcast', 2], ['cloudy', 1]],\n  overcast: [['cloudy', 2], ['lightRain', 2], ['fog', 1]], lightRain: [['overcast', 2], ['heavyRain', 1.5], ['lightRain', 1]],\n  heavyRain: [['lightRain', 2], ['storm', 1]], storm: [['heavyRain', 2], ['overcast', 1]], fog: [['cloudy', 2], ['overcast', 1]],",
  "  sunny: [['sunny', 3], ['cloudy', 3], ['calm', 1], ['breezy', 2]], cloudy: [['sunny', 2], ['overcast', 2], ['cloudy', 1], ['breezy', 1]],\n  overcast: [['cloudy', 2], ['lightRain', 2], ['fog', 1], ['windy', 1]], lightRain: [['overcast', 2], ['heavyRain', 1.5], ['lightRain', 1]],\n  heavyRain: [['lightRain', 2], ['storm', 1], ['thunderstorm', 1]], storm: [['heavyRain', 2], ['overcast', 1], ['gale', 0.5]], fog: [['cloudy', 2], ['overcast', 1], ['calm', 1]],\n  calm: [['sunny', 2], ['breezy', 1], ['cloudy', 1], ['fog', 0.5]], breezy: [['sunny', 2], ['windy', 2], ['cloudy', 2]], windy: [['breezy', 2], ['roughSea', 1.5], ['cloudy', 1], ['overcast', 1]],\n  roughSea: [['windy', 2], ['heavyRain', 1], ['overcast', 1], ['thunderstorm', 0.5]], thunderstorm: [['heavyRain', 2], ['lightRain', 1], ['overcast', 1]], gale: [['storm', 2], ['heavyRain', 1]],"),
 ("    this.w = { ...WEATHERS.sunny };\n", "    this.w = { ...WEATHERS.sunny }; this.wb = { ...WEATHERS.sunny };\n    this.squall = null; this.windTarget = 0.9;\n"),
 ("    if (instant) Object.assign(this.w, WEATHERS[k]);\n    this.nextWeatherIn = 20 + Math.random() * 40;", "    if (instant) { Object.assign(this.wb, WEATHERS[k]); Object.assign(this.w, WEATHERS[k]); }\n    this.windTarget = 0.9 + (Math.random() - 0.5) * 2.4;\n    this.nextWeatherIn = 140 + Math.random() * 280;"),
 ("    const k = 1 - Math.exp(-dt * 0.08 * Math.max(0.5, this.timeScale));\n    for (const key of ['cloud', 'dark', 'rain', 'fog', 'wind', 'sun', 'lightning']) this.w[key] += (target[key] - this.w[key]) * k;",
  """    const k = 1 - Math.exp(-dt * 0.03 * Math.max(0.5, this.timeScale));
    // a local squall pulls the weather around the camera toward a thunderstorm
    let sq = 0;
    if (this.squall) { const S = this.squall, c = camera ? camera.position : focus; if (c) sq = 1 - smoothstep(0.35 * S.r, S.r, Math.hypot(c.x - S.x, c.z - S.z)); }
    for (const key of ['cloud', 'dark', 'rain', 'fog', 'wind', 'sun', 'lightning']) {
      this.wb[key] += (target[key] - this.wb[key]) * k;
      this.w[key] = sq > 0.001 ? this.wb[key] + (Math.max(WEATHERS.thunderstorm[key], key === 'sun' ? 0 : this.wb[key]) - this.wb[key]) * sq * (this.squall.k || 1) : this.wb[key];
      if (key === 'sun' && sq > 0.001) this.w.sun = this.wb.sun + (Math.min(WEATHERS.thunderstorm.sun, this.wb.sun) - this.wb.sun) * sq;
    }"""),
 ("    WD.dir = 0.9 + 0.5 * Math.sin(WD.t * 0.011);", "    const wdiff = ((this.windTarget - WD.base + Math.PI * 3) % (Math.PI * 2)) - Math.PI;\n    WD.base += wdiff * (1 - Math.exp(-dt / 90));\n    WD.dir = WD.base + 0.12 * Math.sin(WD.t * 0.011);"),
 ("    this.wind = { x: 0, z: 0, speed: 4.5, dir: 0.9, t: 0 };", "    this.wind = { x: 0, z: 0, speed: 4.5, mean: 4.5, dir: 0.9, base: 0.9, t: 0 };"),
])
patch('src/world/sea.js', [
 ("    W.update(dt, this.t, wd.mean ?? wd.speed, wd.dir);", "    const sq = sky.squall; if (sq) { const s = W.storm; s.x = sq.x; s.z = sq.z; s.r = sq.r * 1.3; s.k = sq.k * 0.7; } else W.storm.k = 0;\n    W.update(dt, this.t, wd.mean ?? wd.speed, wd.dir);"),
])
