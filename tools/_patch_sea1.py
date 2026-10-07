def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('src/world/sky.js', [
    ("    WD.speed = (1.6 + this.w.wind * 11.5) * (1 + 0.2", "    WD.mean = 1.6 + this.w.wind * 11.5;\n    WD.speed = WD.mean * (1 + 0.2"),
    ("    this.rain.frustumCulled = false;", "    this.rain.frustumCulled = false; this.rain.renderOrder = 6;"),
])
patch('src/world/materials.js', [
    ("import { PHOTO, loadPhotos } from './photos.js';", "import { PHOTO, loadPhotos } from './photos.js';\nimport { WATER_FX, WATER_FX_GLSL } from './waterFx.js';"),
    ("    sh.uniforms.uTS = { value: new THREE.Vector4(...TS) };", "    sh.uniforms.uTS = { value: new THREE.Vector4(...TS) };\n    Object.assign(sh.uniforms, WATER_FX);"),
    ("'uniform vec4 uTS; uniform sampler2D uNoise;", "WATER_FX_GLSL + 'uniform vec4 uTS; uniform sampler2D uNoise;"),
    ("        diffuseColor.rgb *= sp * (0.78 + 0.5 * macro);`)", "        diffuseColor.rgb *= sp * (0.78 + 0.5 * macro);\n        diffuseColor.rgb = wfxApply(diffuseColor.rgb, vTP, length(vViewPosition));`)"),
])
print('ok')
