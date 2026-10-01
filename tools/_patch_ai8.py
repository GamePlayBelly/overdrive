def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/vehicles/aiDriver.js', [
    ("      if (this.lostT > (this.xt > 22 ? 2 : 7)) this.warp();\n    }",
     "      if (this.lostT > (this.xt > 22 ? 2 : 7)) this.warp();\n      // no progress along the route for a long time (dithering in a junction, wedged on a prop)\n      if (this.pi !== this.lastPi) { this.lastPi = this.pi; this.progT = 0; } else if ((this.progT += dt) > 12) { this.progT = 0; this.warp(2); }\n    }"),
    ("  warp() {", "  warp(skip = 1) {"),
    ("    bi = Math.min(P.length - 2, bi + 1);", "    bi = Math.min(P.length - 2, bi + skip);"),
    ("    this.recover = !!opts.recover;\n    this.lostT = 0;\n", "    this.recover = !!opts.recover;\n    this.lostT = 0; this.progT = 0; this.lastPi = -1;\n"),
])
print('ok')
