def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:100])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/world/uber.js', [
    ("function makeArray(list, size, srgb = true) {\n  const layers = Math.max(1, list.length);\n  const data = new Uint8Array(size * size * 4 * layers);\n  list.forEach((src, i) => { if (src) data.set(drawTo(src.cv, size, src.alpha), i * size * size * 4); else data.fill(255, i * size * size * 4, (i + 1) * size * size * 4); });",
     "function makeArray(list, size, srgb = true, fill = [255, 255, 255, 255]) {\n  const layers = Math.max(1, list.length);\n  const data = new Uint8Array(size * size * 4 * layers);\n  list.forEach((src, i) => {\n    if (src) { data.set(drawTo(src.cv, size, src.alpha), i * size * size * 4); return; }\n    for (let p = i * size * size * 4; p < (i + 1) * size * size * 4; p += 4) { data[p] = fill[0]; data[p + 1] = fill[1]; data[p + 2] = fill[2]; data[p + 3] = fill[3]; }\n  });"),
    ("export function buildUber(src, emis, noiseTex, aniso = 8) {", "// nr: { key: image } packed normal xy + roughness for the layers that have photo scans; ks: { key: uv multiplier } so a photo tiles at its real size\nexport function buildUber(src, emis, noiseTex, aniso = 8, nr = {}, ks = {}) {"),
    ("  const l512 = [], l1024 = [], e1024 = [];", "  const l512 = [], l512n = [], l1024 = [], e1024 = [];"),
    ("if (!idx512.has(key)) { idx512.set(key, l512.length); l512.push({ cv: src[key] }); } layer = idx512.get(key); }",
     "if (!idx512.has(key)) { idx512.set(key, l512.length); l512.push({ cv: src[key] }); l512n.push(nr[key] ? { cv: nr[key] } : null); } layer = idx512.get(key); }"),
    ("    MI.set([src[key] || arr === 0 ? arr : 0, layer, emisLayer, 0], i * 4);", "    MI.set([src[key] || arr === 0 ? arr : 0, layer, emisLayer, arr === 1 && src[key] && nr[key] ? 1 : 0], i * 4);"),
    ("    MC.set([col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1, 1], i * 4);", "    MC.set([col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1, ks[key] || 1], i * 4);"),
    ("  const A5 = makeArray(l512, 512), A10 = makeArray(l1024, 1024), E10 = makeArray(e1024, 1024);\n  for (const t of [A5, A10, E10]) t.anisotropy = aniso;",
     "  const A5 = makeArray(l512, 512), A10 = makeArray(l1024, 1024), E10 = makeArray(e1024, 1024), N5 = makeArray(l512n, 512, false, [128, 128, 255, 255]);\n  for (const t of [A5, A10, E10, N5]) t.anisotropy = aniso;"),
    ("    uA5: { value: A5 }, uA10: { value: A10 }, uE10: { value: E10 }, uMI: { value: MI },", "    uA5: { value: A5 }, uA10: { value: A10 }, uE10: { value: E10 }, uN5: { value: N5 }, uNK: { value: 1.0 }, uMI: { value: MI },"),
    ("      sh.fragmentShader = `uniform sampler2DArray uA5; uniform sampler2DArray uA10; uniform sampler2DArray uE10; uniform sampler2D uNoise;",
     "      sh.fragmentShader = `uniform sampler2DArray uA5; uniform sampler2DArray uA10; uniform sampler2DArray uE10; uniform sampler2DArray uN5; uniform float uNK; uniform sampler2D uNoise;"),
    ("varying vec4 vCol; varying vec2 vUvU; varying vec3 vWP; vec4 gMI; vec4 gMP; vec2 gDx; vec2 gDy; float gAlpha;\n` + sh.fragmentShader",
     "varying vec4 vCol; varying vec2 vUvU; varying vec3 vWP; vec4 gMI; vec4 gMP; vec2 gDx; vec2 gDy; float gAlpha; vec4 gNR;\n` + sh.fragmentShader"),
    ("""          gDx = dFdx(vUvU); gDy = dFdy(vUvU);
          vec4 uT = vec4(1.0);
          if (gMI.x > 1.5) uT = textureGrad(uA10, vec3(vUvU, gMI.y), gDx, gDy);
          else if (gMI.x > 0.5) uT = textureGrad(uA5, vec3(vUvU, gMI.y), gDx, gDy);
          gAlpha = gMI.x > 1.5 ? uT.a : 0.0;
          diffuseColor.rgb *= uT.rgb * uMC[uL].rgb * vCol.rgb;`)""",
     """          vec2 uvS = vUvU * uMC[uL].w;
          gDx = dFdx(uvS); gDy = dFdy(uvS);
          vec4 uT = vec4(1.0);
          if (gMI.x > 1.5) uT = textureGrad(uA10, vec3(uvS, gMI.y), gDx, gDy);
          else if (gMI.x > 0.5) uT = textureGrad(uA5, vec3(uvS, gMI.y), gDx, gDy);
          gAlpha = gMI.x > 1.5 ? uT.a : 0.0;
          gNR = vec4(0.5, 0.5, 1.0, 0.0);
          if (gMI.w > 0.5) { gNR = textureGrad(uN5, vec3(uvS, gMI.y), gDx, gDy); uT.rgb *= 0.84 + 0.32 * texture2D(uNoise, vWP.xz * 0.012).g; }
          diffuseColor.rgb *= uT.rgb * uMC[uL].rgb * vCol.rgb;`)"""),
    ("          float roughnessFactor = gMP.x < 0.0 ? 0.1 + 0.9 * gAlpha : gMP.x;\n",
     "          float roughnessFactor = gMP.x < 0.0 ? 0.1 + 0.9 * gAlpha : gMP.x;\n          if (gMI.w > 0.5) roughnessFactor = mix(roughnessFactor, gNR.z, 0.85);\n"),
    ("        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMP.y;')",
     """        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMP.y;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (gMI.w > 0.5) {
            vec2 nxy = (gNR.xy * 2.0 - 1.0) * uNK;
            vec3 nm = vec3(nxy, sqrt(max(0.05, 1.0 - dot(nxy, nxy))));
            vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
            vec3 q1p = cross(q1, normal), q0p = cross(normal, q0);
            vec3 Tn = q1p * gDx.x + q0p * gDy.x, Bn = q1p * gDx.y + q0p * gDy.y;
            float det = max(dot(Tn, Tn), dot(Bn, Bn));
            float sc = det == 0.0 ? 0.0 : faceDirection * inversesqrt(det);
            normal = normalize(Tn * (nm.x * sc) + Bn * (nm.y * sc) + normal * nm.z);
          }`)"""),
])
print('uber ok')
