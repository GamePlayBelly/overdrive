import re
p = 'src/render/pipeline.js'
s = open(p, encoding='utf8').read()


def rep(a, b, cnt=1):
    global s
    assert a in s, a[:90]
    s = s.replace(a, b, cnt)


# remove the in-composite SSAO function
i0 = s.index('#ifdef USE_AO\nuniform vec2 uProj;')
i1 = s.index('#endif\n', s.index('return mix(ao, 1.0, smoothstep(60.0, 150.0, d0));')) + len('#endif\n')
s = s[:i0] + """#ifdef USE_AO
uniform sampler2D tAO; uniform vec2 uAoTexel;
float aoApply(vec2 uv, vec3 c){
  vec2 t = uAoTexel * 0.75;
  float a = (texture2D(tAO, uv + vec2(t.x, t.y)).r + texture2D(tAO, uv + vec2(-t.x, t.y)).r + texture2D(tAO, uv + vec2(t.x, -t.y)).r + texture2D(tAO, uv + vec2(-t.x, -t.y)).r) * 0.25;
  return mix(a, 1.0, smoothstep(0.9, 3.5, max(c.r, max(c.g, c.b))));
}
#endif
""" + s[i1:]
rep("#ifdef USE_AO\n  col *= ssao(uv);\n#endif", "#ifdef USE_AO\n  col *= aoApply(uv, col);\n#endif")

# half-resolution AO pass
rep("const COMPOSITE_FS = `", """const AO_FS = `
uniform sampler2D tDepth; uniform vec2 uCamPlanes, uProj, uTexel; uniform float uAoR, uAoK; uniform float uResY; varying vec2 vUv;
float linZ(vec2 uv){ float z = textureLod(tDepth, uv, 0.0).x; return (2.0 * uCamPlanes.x * uCamPlanes.y) / (uCamPlanes.y + uCamPlanes.x - (z * 2.0 - 1.0) * (uCamPlanes.y - uCamPlanes.x)); }
vec3 vpos(vec2 uv, float d){ vec2 n = uv * 2.0 - 1.0; return vec3(n.x * d / uProj.x, n.y * d / uProj.y, -d); }
void main(){
  vec2 uv = vUv;
  float d0 = linZ(uv);
  vec3 P = vpos(uv, d0);
  vec2 tx = vec2(uTexel.x, 0.0), ty = vec2(0.0, uTexel.y);
  float dR = linZ(uv + tx), dL = linZ(uv - tx), dU = linZ(uv + ty), dD = linZ(uv - ty);
  vec3 ex = abs(dR - d0) < abs(dL - d0) ? vpos(uv + tx, dR) - P : P - vpos(uv - tx, dL);
  vec3 ey = abs(dU - d0) < abs(dD - d0) ? vpos(uv + ty, dU) - P : P - vpos(uv - ty, dD);
  vec3 N = normalize(cross(ex, ey));
  if (dot(N, P) > 0.0) N = -N;
  float rpx = clamp(uAoR * uProj.y * 0.5 * uResY / d0, 3.0, 60.0);
  float rot = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  float occ = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float a = rot + fi * 2.39996323;
    float r = sqrt((fi + 0.5) / 9.0);
    vec2 suv = uv + vec2(cos(a), sin(a)) * r * rpx * uTexel;
    vec3 V = vpos(suv, linZ(suv)) - P;
    float dist = length(V);
    occ += max(0.0, dot(V, N) / (dist + 1e-4) - 0.14) * (1.0 - smoothstep(uAoR * 0.9, uAoR * 2.4, dist));
  }
  float ao = clamp(1.0 - uAoK * occ * 0.21, 0.0, 1.0);
  ao = mix(ao, 1.0, smoothstep(50.0, 140.0, d0));
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

const COMPOSITE_FS = `""")

rep("uProj: { value: new THREE.Vector2(1, 1) }, uAoR: { value: 1.3 }, uAoK: { value: 1 }, uRes: { value: new THREE.Vector2(1280, 720) } });",
    "tAO: { value: null }, uAoTexel: { value: new THREE.Vector2(1, 1) } });")
rep("    this.matBlur = sm(BLUR_FS, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });",
    "    this.matBlur = sm(BLUR_FS, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });\n    this.matAO = sm(AO_FS, { tDepth: { value: null }, uCamPlanes: { value: new THREE.Vector2(0.25, 7000) }, uProj: { value: new THREE.Vector2(1, 1) }, uTexel: { value: new THREE.Vector2() }, uAoR: { value: 1.3 }, uAoK: { value: 1 }, uResY: { value: 720 } });")
rep("const cu = {}; for (const k of ['tScene', 'tBloom', 'tBloom2', 'tDepth']) cu[k] = { value: null };", "const cu = {}; for (const k of ['tScene', 'tBloom', 'tBloom2', 'tDepth']) cu[k] = { value: null };")
rep("    this.rt = null; this.b1 = null;", "    this.aoRT = null; this.rt = null; this.b1 = null;")
rep("    for (const t of [this.rt, this.b1, this.b1b, this.b2, this.b2b]) t?.dispose();",
    "    for (const t of [this.rt, this.b1, this.b1b, this.b2, this.b2b, this.aoRT]) t?.dispose();\n    this.aoRT = new THREE.WebGLRenderTarget(Math.max(2, (w + 1) >> 1), Math.max(2, (h + 1) >> 1), { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });")
# render: AO pass before the composite
rep("    const c = this.cu;\n    c.tScene.value = this.rt.texture;",
    "    const aoOn = this.ao && this.depthTex;\n    if (aoOn) {\n      const au = this.matAO.uniforms;\n      au.tDepth.value = this.depthTex; au.uCamPlanes.value.set(camera.near, camera.far); au.uProj.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);\n      au.uTexel.value.set(1 / this.w, 1 / this.h); au.uAoR.value = fx.aoR ?? 1.3; au.uAoK.value = fx.aoK ?? 1; au.uResY.value = this.h;\n      this.pass(this.matAO, this.aoRT);\n    }\n    const c = this.cu;\n    c.tScene.value = this.rt.texture;")
rep("    c.uProj.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]); c.uRes.value.set(this.w, this.h); c.uAoR.value = fx.aoR ?? 1.3; c.uAoK.value = fx.aoK ?? 1;\n",
    "    c.tAO.value = this.aoRT.texture; c.uAoTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);\n")
rep("(this.ao && this.depthTex ? 64 : 0)", "(aoOn ? 64 : 0)")
open(p, 'w', encoding='utf8').write(s)

# governor tiers: medium gets AO on the non-MSAA path
p = 'src/render/governor.js'
s = open(p, encoding='utf8').read()
rep("{ name: 'medium', ao: false, samples: 2,", "{ name: 'medium', ao: true, samples: 0,")
rep("fxaa: T.samples === 0, ao: T.ao && S.ao !== false };", "fxaa: T.samples === 0, ao: T.ao && S.ao !== false };")
open(p, 'w', encoding='utf8').write(s)
print('ok')
