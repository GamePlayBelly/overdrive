def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/game/game.js', [
 ("import { SeaFx } from '../render/seaFx.js';", "import { SeaFx } from '../render/seaFx.js';\nimport { Underwater } from '../render/underwater.js';"),
 ("    this.seaFx = new SeaFx(this);", "    this.seaFx = new SeaFx(this);\n    this.underwater = new Underwater(this);"),
 ("    this.seaFx.update(dt);\n", "    this.seaFx.update(dt);\n    this.underwater.update(dt);\n"),
])
patch('src/render/pipeline.js', [
 ("void main(){\n  vec2 uv = vUv;\n#ifdef USE_RAIN", "void main(){\n  vec2 uv = vUv;\n  if (uWater > 0.01) uv += uWater * 0.0035 * vec2(sin(uv.y * 38.0 + uTime * 1.6), cos(uv.x * 31.0 + uTime * 1.3));\n#ifdef USE_RAIN"),
 ("  col = mix(col, col * vec3(0.55, 0.85, 1.0) + vec3(0.0, 0.05, 0.08), uWater);", "  col = mix(col, col * vec3(0.62, 0.9, 1.0) + vec3(0.0, 0.03, 0.05), uWater);\n  col *= 1.0 - uWater * 0.3 * smoothstep(0.1, 0.9, r2 * 2.6);"),
])
patch('src/render/vehicleFx.js', [
 ("    if (P.state === 'swim' && g.wake) this.swimmer(P, dt);", "    if (P.state === 'swim' && g.wake && P.dive < 0.3) this.swimmer(P, dt);"),
])
