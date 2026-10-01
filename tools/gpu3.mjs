import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, R = g.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), P = g.pipeline;
  const time = async (fn, n = 7) => {
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
  const res = {};
  for (const samples of [0, 2, 4]) {
    P.setQuality({ scale: 1, samples, bloom: false, fxaa: false });
    const kids = g.scene.children.map((c) => c.visible);
    g.scene.children.forEach((c) => { c.visible = false; });
    const sun = g.sky.sun, cs = sun.castShadow;
    sun.castShadow = false;
    const r = {};
    r.clear = await time(() => { R.setRenderTarget(P.rt); R.clear(true, true, true); });
    r.renderEmptyNoShadow = await time(() => { R.setRenderTarget(P.rt); R.render(g.scene, g.camera); });
    sun.castShadow = cs;
    r.renderEmptyShadow = await time(() => { R.setRenderTarget(P.rt); R.render(g.scene, g.camera); });
    r.composite = await time(() => { P.pass(P.matComp, null); });
    r.fullPipelineEmpty = await time(() => { g.render(); });
    g.scene.children.forEach((c, i) => { c.visible = kids[i]; });
    res['s' + samples] = r;
  }
  return res;
});
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
await close(); process.exit(0);
