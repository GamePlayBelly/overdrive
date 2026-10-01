def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/vehicles/aiDriver.js', [
    ("    if (v.disabled) { inp.throttle = 0; inp.brake = 1; inp.steer = 0; return; }",
     "    if (v.disabled) {\n      inp.throttle = 0; inp.brake = 1; inp.steer = 0;\n      if (this.recover && this.path.length > 3 && (this.lostT += dt) > 3) this.warp();\n      return;\n    }"),
])
print('ok')
