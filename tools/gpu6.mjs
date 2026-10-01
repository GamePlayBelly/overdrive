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
  P.setQuality({ scale: 1, samples: 2, bloom: false, fxaa: false });
  P.rt.resolveDepthBuffer = false;
  g.render(); g.render();
  const res = {};
  const base = P.matComp.fragmentShader;
  const cut = (s, a, b, rep = '') => { const i = s.indexOf(a); if (i < 0) throw new Error('missing ' + a); const j = s.indexOf(b, i); if (j < 0) throw new Error('missing end ' + b); return s.slice(0, i) + rep + s.slice(j); };
  const variant = (name, src) => {
    const m = new THREE.ShaderMaterial({ vertexShader: P.matComp.vertexShader, fragmentShader: src, uniforms: P.matComp.uniforms, depthTest: false, depthWrite: false });
    return [name, m];
  };
  let s = base;
  const list = [variant('asis', s)];
  s = cut(s, '  if (uRain > 0.01)', '  vec2 dv'); list.push(variant('-rain', s));
  s = cut(s, '  if (uSpeed > 0.001 || uCA', '  if (uSharp', '  col = texture2D(tScene, uv).rgb;\n'); list.push(variant('-speed/ca/fxaa', s));
  s = cut(s, '  if (uDof > 0.001)', '  vec3 bl'); list.push(variant('-dof', s));
  s = cut(s, '  if (uSharp > 0.001)', '  vec3 bl'); list.push(variant('-sharp', s));
  s = cut(s, '  vec3 bl =', '  col *= uExposure;'); list.push(variant('-bloom', s));
  s = s.replace(/  col \+= \(hash\(gl_FragCoord[^\n]*\n/, ''); list.push(variant('-grain', s));
  for (const [name, m] of list) res[name] = await time(() => { P.pass(m, null); });
  return res;
});
for (const [k, v] of Object.entries(out)) console.log(k, v);
await close(); process.exit(0);
