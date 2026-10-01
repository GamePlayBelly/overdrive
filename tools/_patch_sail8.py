def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/app/hud.js', [
    ("// sailing dial: bow up, true wind as an arrow on the rim, the no-go sector, the boom, wind speed and heel",
     "// sailing dial: wind from the top with the no-go sector fixed there, the boat turning against it, the boom, wind speed and heel"),
    ("""<path class="w-nogo" d="${wedge(0.66)}"/>
    <path class="w-hull" d="M0,-26 C10,-14 11,10 7,24 L-7,24 C-11,10 -10,-14 0,-26Z"/><line class="w-boom" x1="0" y1="-6" x2="0" y2="26"/>
    <g class="w-arrow"><path d="M0,-40 L7,-56 L-7,-56 Z"/></g></svg>""",
     """<path class="w-nogo" d="${wedge(0.66)}"/>
    <g class="w-boat"><path class="w-hull" d="M0,-26 C10,-14 11,10 7,24 L-7,24 C-11,10 -10,-14 0,-26Z"/><line class="w-boom" x1="0" y1="-6" x2="0" y2="26"/></g>
    <g class="w-arrow"><path d="M0,-38 L7,-54 L-7,-54 Z"/></g></svg>"""),
    ("const q = (s) => el.querySelector(s), nogo = q('.w-nogo'), boom = q('.w-boom'), arrow = q('.w-arrow'), b = q('.w-txt b'), sub = q('.w-sub');",
     "const q = (s) => el.querySelector(s), boat = q('.w-boat'), boom = q('.w-boom'), b = q('.w-txt b'), sub = q('.w-sub');"),
    ("""      const deg = -wrapAngle(Math.atan2(-W.x, -W.z) - p.yaw) * 57.2958;
      nogo.setAttribute('transform', `rotate(${deg.toFixed(1)})`); arrow.setAttribute('transform', `rotate(${deg.toFixed(1)})`);
""", """      boat.setAttribute('transform', `rotate(${(-wrapAngle(p.yaw - Math.atan2(-W.x, -W.z)) * 57.2958).toFixed(1)})`);
"""),
    ("    this.nitro.firstChild.style.width = p.nitro * 100 + '%';", "    this.nitro.style.display = sailing ? 'none' : '';\n    this.nitro.firstChild.style.width = p.nitro * 100 + '%';"),
])
print('ok')
