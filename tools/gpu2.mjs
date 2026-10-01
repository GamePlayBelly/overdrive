import { launch } from './harness.mjs';
// GPU cost of the fixed parts of the frame: empty scene through the post pipeline, sky only, and the full city view, per pipeline setting.
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, gl = g.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const gpu = async (n = 7) => {
    const res = [];
    for (let i = 0; i < n; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.render(); gl.endQuery(ext.TIME_ELAPSED_EXT);
      let k = 0;
      while (k++ < 200) { await new Promise((r) => setTimeout(r, 4)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; } }
      gl.deleteQuery(q);
    }
    res.sort((a, b) => a - b);
    return res.length ? +res[Math.floor(res.length / 2)].toFixed(1) : -1;
  };
  g.gov.enabled = false;
  const v = g.player.vehicle, x = -271.5, z = 230;
  v.place(x, g.world.groundY(x, z, 60), z, 3.14); g.rig.snapBehind(); for (let i = 0; i < 60; i++) g.update(1 / 60);
  const res = {};
  const variants = { 's0': { samples: 0, bloom: false, fxaa: false }, 's0fxaa': { samples: 0, bloom: false, fxaa: true }, 's2': { samples: 2, bloom: false, fxaa: false }, 's4': { samples: 4, bloom: false, fxaa: false }, 's2bloom': { samples: 2, bloom: true, fxaa: false }, 's4bloom': { samples: 4, bloom: true, fxaa: false } };
  for (const [name, q] of Object.entries(variants)) {
    g.pipeline.setQuality({ scale: 1.0, ...q });
    const kids = g.scene.children.map((c) => c.visible);
    g.scene.children.forEach((c) => { c.visible = false; });
    const empty = await gpu();
    g.sky.dome.visible = true;
    const sky = await gpu();
    g.scene.children.forEach((c, i) => { c.visible = kids[i]; });
    const full = await gpu();
    res[name] = { empty, sky, full };
  }
  return res;
});
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
await close(); process.exit(0);
