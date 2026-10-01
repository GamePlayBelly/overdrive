import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const THREE = window.__THREE;
  const g = window.__game, R = g.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), P = g.pipeline;
  const time = async (fn, n = 9) => {
    const res = [];
    for (let i = 0; i < n; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q); fn(); gl.endQuery(ext.TIME_ELAPSED_EXT);
      let k = 0;
      while (k++ < 200) { await new Promise((r) => setTimeout(r, 4)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; } }
      gl.deleteQuery(q);
    }
    res.sort((a, b) => a - b);
    return res.length ? +res[Math.floor(res.length / 2)].toFixed(2) : -1;
  };
  g.gov.enabled = false;
  const v = g.player.vehicle, x = -271.5, z = 230;
  v.place(x, g.world.groundY(x, z, 60), z, 3.14); g.rig.snapBehind(); for (let i = 0; i < 60; i++) g.update(1 / 60);
  const res = {};
  for (const samples of [0, 2]) {
    P.setQuality({ scale: 1, samples, bloom: false, fxaa: false });
    P.rt.resolveDepthBuffer = false;
    g.render(); g.render();
    res['s' + samples + ' composite as is'] = await time(() => { P.pass(P.matComp, null); });
    const u = P.matComp.uniforms, sharp = u.uSharp.value;
    u.uSharp.value = 0;
    res['s' + samples + ' no sharpen'] = await time(() => { P.pass(P.matComp, null); });
    u.uSharp.value = sharp;
    const copy = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D tScene; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tScene, vUv).rgb, 1.0); }', uniforms: { tScene: { value: P.rt.texture } }, depthTest: false, depthWrite: false });
    res['s' + samples + ' plain copy'] = await time(() => { P.pass(copy, null); });
    const tm = new THREE.ShaderMaterial({ vertexShader: copy.vertexShader, fragmentShader: 'uniform sampler2D tScene; varying vec2 vUv; vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); } void main(){ vec3 c = aces(texture2D(tScene, vUv).rgb * 0.9); gl_FragColor = vec4(pow(c, vec3(1.0/2.2)), 1.0); }', uniforms: { tScene: { value: P.rt.texture } }, depthTest: false, depthWrite: false });
    res['s' + samples + ' tonemap only'] = await time(() => { P.pass(tm, null); });
  }
  return res;
});
for (const [k, v] of Object.entries(out)) console.log(k, v);
await close(); process.exit(0);
