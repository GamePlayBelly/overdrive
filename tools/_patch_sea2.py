def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/world/sea.js', [
 ("vCrest * (4.6 + 3.0 * uSea) + fn * 0.22 - 0.12 - uFoamK * 0.18)", "vCrest * (3.2 + 1.6 * uSea) + fn * 0.22 - 0.12 - uFoamK * 0.08)"),
 ("streak = smoothstep(0.6, 0.85, st)", "streak = smoothstep(0.68, 0.9, st)"),
 ("patches = uFoamK * smoothstep(0.62 - 0.12 * uFoamK, 0.86, pn)", "patches = uFoamK * smoothstep(0.7 - 0.08 * uFoamK, 0.9, pn)"),
 ("streak * 0.5 + patches * 0.6", "streak * 0.3 + patches * 0.4"),
 ("* ring * 0.6);", "* ring * 0.6 * (1.0 - 0.7 * uSea));"),
])
