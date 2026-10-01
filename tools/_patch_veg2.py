def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:100])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/world/vegetation.js', [
    # leaf texture repeats so a leaf is a few centimetres, not a metre
    ("  g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));\n  return g;\n}\n\nfunction shade(",
     "  g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));\n  const uv = g.attributes.uv, rep = Math.max(3, Math.round(Math.max(rx, rz) * 2.0));\n  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep, uv.getY(i) * rep * 0.5);\n  return g;\n}\n\nfunction shade("),
    ("      g.computeVertexNormals();\n      const shadeK = 0.72 + 0.4 * f;",
     "      g.computeVertexNormals();\n      { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 2.2, uv.getY(i) * h * 0.9); }\n      const shadeK = 0.72 + 0.4 * f;"),
    # more, smaller cards
    ("      const s = rng.range(1.7, 2.8) * (d.crown[0][3] > 5 ? 1.25 : 1);", "      const s = rng.range(1.05, 1.9) * (d.crown[0][3] > 5 ? 1.25 : 1);"),
    ("    for (let n = 0; n < d.cards; n++) {\n      const cr = d.crown[Math.floor(rng.f() * d.crown.length)];", "    for (let n = 0; n < d.cards * 2.3; n++) {\n      const cr = d.crown[Math.floor(rng.f() * d.crown.length)];"),
    # lit from within a little so shaded crowns do not go black
    ("      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP",
     "      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\n totalEmissiveRadiance += diffuseColor.rgb * 0.1;').replace('#include <map_fragment>', `#ifdef USE_MAP"),
    # per-tree hue from the tint
    ("          const ic = M.solid.instanceColor.array; ic[n * 3] = tint; ic[n * 3 + 1] = tint; ic[n * 3 + 2] = tint * 0.96;",
     "          const hu = (tint - 0.86) / 0.3, ic = M.solid.instanceColor.array; ic[n * 3] = tint * (0.93 + 0.14 * hu); ic[n * 3 + 1] = tint; ic[n * 3 + 2] = tint * (0.98 - 0.14 * hu);"),
    ("          const ic = M.mid.instanceColor.array; ic[n * 3] = tint; ic[n * 3 + 1] = tint; ic[n * 3 + 2] = tint * 0.96;",
     "          const hu = (tint - 0.86) / 0.3, ic = M.mid.instanceColor.array; ic[n * 3] = tint * (0.93 + 0.14 * hu); ic[n * 3 + 1] = tint; ic[n * 3 + 2] = tint * (0.98 - 0.14 * hu);"),
    ("          const ic = M.far.instanceColor.array; ic[n * 3] = tint * 0.92; ic[n * 3 + 1] = tint * 0.92; ic[n * 3 + 2] = tint * 0.9;",
     "          const hu = (tint - 0.86) / 0.3, ic = M.far.instanceColor.array; ic[n * 3] = tint * 0.92 * (0.93 + 0.14 * hu); ic[n * 3 + 1] = tint * 0.92; ic[n * 3 + 2] = tint * 0.9 * (0.98 - 0.14 * hu);"),
])
print('ok')
