def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:100])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/world/uber.js', [
    ("export function buildUber(src, emis, noiseTex, aniso = 8, nr = {}, ks = {}) {",
     "// fd: { facadeKey: [detailKey, uv scale x, uv scale y] } wall detail (photo albedo luma + normal) laid over the non-glass part of the facade textures\nexport function buildUber(src, emis, noiseTex, aniso = 8, nr = {}, ks = {}, fd = {}) {"),
    ("  const A5 = makeArray(l512, 512),",
     "  const FD = new Float32Array(n * 3);\n  UBER_DEFS.forEach((d, i) => { const f = fd[d[2]]; if (f && nr[f[0]] && idx512.has(f[0])) FD.set([f[1], f[2], idx512.get(f[0])], i * 3); });\n  const A5 = makeArray(l512, 512),"),
    ("uN5: { value: N5 }, uNK: { value: 1.0 }, uMI: { value: MI },", "uN5: { value: N5 }, uNK: { value: 1.0 }, uFD: { value: FD }, uMI: { value: MI },"),
    ("uniform sampler2DArray uN5; uniform float uNK; uniform sampler2D uNoise;\nuniform vec4 uMI[${n}];", "uniform sampler2DArray uN5; uniform float uNK; uniform sampler2D uNoise; uniform vec3 uFD[${n}];\nuniform vec4 uMI[${n}];"),
    ("float gAlpha; vec4 gNR; float gNF;", "float gAlpha; vec4 gNR; float gNF; vec2 gNx; vec2 gNy;"),
    ("""          if (gMI.w > 0.5) {
            uT.rgb *= 0.84 + 0.32 * texture2D(uNoise, vWP.xz * 0.012).g;
            gNF = 1.0 - smoothstep(40.0, 95.0, length(vViewPosition));
            if (gNF > 0.01) gNR = textureGrad(uN5, vec3(uvS, gMI.y), gDx, gDy);
          }""",
     """          gNx = gDx; gNy = gDy;
          if (gMI.w > 0.5) {
            uT.rgb *= 0.84 + 0.32 * texture2D(uNoise, vWP.xz * 0.012).g;
            gNF = 1.0 - smoothstep(40.0, 95.0, length(vViewPosition));
            if (gNF > 0.01) gNR = textureGrad(uN5, vec3(uvS, gMI.y), gDx, gDy);
          }
          vec3 fdv = uFD[uL];
          if (fdv.x > 0.0 && gAlpha > 0.5) {
            vec2 duv = vUvU * fdv.xy;
            vec2 ddx = dFdx(duv), ddy = dFdy(duv);
            float wall = smoothstep(0.55, 0.95, gAlpha);
            vec4 da = textureGrad(uA5, vec3(duv, fdv.z), ddx, ddy);
            uT.rgb *= mix(1.0, 0.3 + 0.95 * dot(da.rgb, vec3(0.333)), wall * 0.85);
            float dN = (1.0 - smoothstep(40.0, 95.0, length(vViewPosition))) * wall;
            if (dN > 0.01) { gNR = textureGrad(uN5, vec3(duv, fdv.z), ddx, ddy); gNx = ddx; gNy = ddy; gNF = dN; }
          }"""),
    ("            vec3 Tn = q1p * gDx.x + q0p * gDy.x, Bn = q1p * gDx.y + q0p * gDy.y;", "            vec3 Tn = q1p * gNx.x + q0p * gNy.x, Bn = q1p * gNx.y + q0p * gNy.y;"),
])
patch('src/world/materials.js', [
    ("  }, noiseTex, Math.min(8, renderer.capabilities.getMaxAnisotropy()), nrSrc, ks);",
     "  }, noiseTex, Math.min(8, renderer.capabilities.getMaxAnisotropy()), nrSrc, ks, fdSrc);"),
    ("  const uber = buildUber({",
     """  const fdSrc = {};
  for (const [k, det] of [['f_glass', 'concrete'], ['f_glass2', 'concrete'], ['f_glassBand', 'concrete'], ['f_concrete', 'concrete'], ['f_apartment', 'concrete'], ['f_brickTower', 'brick']]) {
    const f = facades[k.slice(2)], P = PHOTO[det];
    if (P) fdSrc[k] = [det, f.tileW / P.size, f.tileH / P.size];
  }
  const uber = buildUber({"""),
])
print('ok')
