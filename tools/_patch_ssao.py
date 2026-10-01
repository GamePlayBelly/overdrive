p = 'src/render/pipeline.js'
s = open(p, encoding='utf8').read()


def rep(a, b, cnt=1):
    global s
    assert a in s, a[:90]
    s = s.replace(a, b, cnt)


rep("uniform float uFlash; varying vec2 vUv;\n", """uniform float uFlash; varying vec2 vUv;
#ifdef USE_AO
uniform vec2 uProj; uniform float uAoR, uAoK; uniform vec2 uRes;
float linZ(vec2 uv){ float z = texture2D(tDepth, uv).x; return (2.0 * uCamPlanes.x * uCamPlanes.y) / (uCamPlanes.y + uCamPlanes.x - (z * 2.0 - 1.0) * (uCamPlanes.y - uCamPlanes.x)); }
vec3 vpos(vec2 uv, float d){ vec2 n = uv * 2.0 - 1.0; return vec3(n.x * d / uProj.x, n.y * d / uProj.y, -d); }
float ssao(vec2 uv){
  float d0 = linZ(uv);
  if (d0 > 150.0) return 1.0;
  vec3 P = vpos(uv, d0);
  vec2 tx = vec2(uTexel.x, 0.0), ty = vec2(0.0, uTexel.y);
  float dR = linZ(uv + tx), dL = linZ(uv - tx), dU = linZ(uv + ty), dD = linZ(uv - ty);
  vec3 ex = abs(dR - d0) < abs(dL - d0) ? vpos(uv + tx, dR) - P : P - vpos(uv - tx, dL);
  vec3 ey = abs(dU - d0) < abs(dD - d0) ? vpos(uv + ty, dU) - P : P - vpos(uv - ty, dD);
  vec3 N = normalize(cross(ex, ey));
  if (dot(N, P) > 0.0) N = -N;
  float rpx = clamp(uAoR * uProj.y * 0.5 * uRes.y / d0, 3.0, 56.0);
  float rot = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  float occ = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float a = rot + fi * 2.39996323;
    float r = sqrt((fi + 0.5) / 10.0);
    vec2 suv = uv + vec2(cos(a), sin(a)) * r * rpx * uTexel;
    float sd = linZ(suv);
    vec3 V = vpos(suv, sd) - P;
    float dist = length(V);
    float h = dot(V, N) / (dist + 1e-4);
    occ += max(0.0, h - 0.14) * (1.0 - smoothstep(uAoR * 0.9, uAoR * 2.4, dist));
  }
  float ao = clamp(1.0 - uAoK * occ * 0.19, 0.0, 1.0);
  return mix(ao, 1.0, smoothstep(60.0, 150.0, d0));
}
#endif
""")

rep("#ifdef USE_DOF\n  {\n    float z = texture2D(tDepth, uv).x;", "#ifdef USE_AO\n  col *= ssao(uv);\n#endif\n#ifdef USE_DOF\n  {\n    float z = texture2D(tDepth, uv).x;")

rep("this.enabled = true;\n    this.fx =", "this.enabled = true; this.ao = false; this.dofDepth = false;\n    this.fx =")
rep("uFlash: { value: 0 } });", "uFlash: { value: 0 }, uProj: { value: new THREE.Vector2(1, 1) }, uAoR: { value: 1.3 }, uAoK: { value: 1 }, uRes: { value: new THREE.Vector2(1280, 720) } });")
rep("if (key & 16) d.USE_RAIN = 1; if (key & 32) d.USE_BLOOM = 1;", "if (key & 16) d.USE_RAIN = 1; if (key & 32) d.USE_BLOOM = 1; if (key & 64) d.USE_AO = 1;")

# warmup variants with AO
rep("    for (const sharp of [8, 0]) for (const post of [0, 32, 2]) keys.push(sharp | post | 4);\n",
    "    for (const sharp of [8, 0]) for (const post of [0, 32, 2]) keys.push(sharp | post | 4);\n    for (const sharp of [8, 0]) for (const post of [0, 32, 2]) for (const dyn of [0, 16]) keys.push(64 | sharp | post | dyn);\n")

# quality / depth plumbing
rep("setQuality({ scale, samples, bloom, fxaa, dpr } = {}) {\n    let dirty = false;",
    "setQuality({ scale, samples, bloom, fxaa, dpr, ao } = {}) {\n    let dirty = false;\n    if (ao !== undefined && ao !== this.ao) { this.ao = ao; dirty = this._syncDepth() || dirty; }")
rep("  setDepth(on) { if (on !== !!this.wantDepth) { this.wantDepth = on; this.resize(this.cssW, this.cssH, true); } }",
    "  _syncDepth() { const want = this.dofDepth || this.ao; if (want === !!this.wantDepth) return false; this.wantDepth = want; return true; }\n  setDepth(on) { this.dofDepth = !!on; if (this._syncDepth()) this.resize(this.cssW, this.cssH, true); }")
rep("    const key = (fx.speed > 0.001 || fx.ca > 0.0001 ? 1 : 0) | (c.uFxaa.value > 0.5 ? 2 : 0) | (fx.dof > 0.001 && this.depthTex ? 4 : 0)",
    "    c.uProj.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]); c.uRes.value.set(this.w, this.h); c.uAoR.value = fx.aoR ?? 1.3; c.uAoK.value = fx.aoK ?? 1;\n    const key = (this.ao && this.depthTex ? 64 : 0) | (fx.speed > 0.001 || fx.ca > 0.0001 ? 1 : 0) | (c.uFxaa.value > 0.5 ? 2 : 0) | (fx.dof > 0.001 && this.depthTex ? 4 : 0)")
open(p, 'w', encoding='utf8').write(s)

# governor: ssao on high / ultra tiers
p = 'src/render/governor.js'
s = open(p, encoding='utf8').read()
rep("{ name: 'low', samples: 0,", "{ name: 'low', ao: false, samples: 0,")
rep("{ name: 'medium', samples: 2,", "{ name: 'medium', ao: false, samples: 2,")
rep("{ name: 'high', samples: 4,", "{ name: 'high', ao: true, samples: 4,")
rep("{ name: 'ultra', samples: 4,", "{ name: 'ultra', ao: true, samples: 4,")
rep("bloom: S.bloom !== undefined && this.mode === 'fixed' ? !!S.bloom : T.bloom, fxaa: T.samples === 0 };", "bloom: S.bloom !== undefined && this.mode === 'fixed' ? !!S.bloom : T.bloom, fxaa: T.samples === 0, ao: T.ao && S.ao !== false };")
rep("const key = JSON.stringify([q.scale.toFixed(2), q.samples, q.bloom,", "const key = JSON.stringify([q.scale.toFixed(2), q.samples, q.bloom, q.ao,")
open(p, 'w', encoding='utf8').write(s)
print('ok')
