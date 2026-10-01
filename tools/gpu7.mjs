import { launch } from './harness.mjs';
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const t0 = Date.now();
await page.waitForFunction(() => window.__game.pipeline.ready.size >= 64, null, { timeout: 120000 }).catch(() => {});
console.log('variants ready', await page.evaluate(() => window.__game.pipeline.ready.size), 'after', Date.now() - t0, 'ms');
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, R = g.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), P = g.pipeline;
  const gpu = async (n = 9) => {
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
  const res = {};
  for (const [x, z, yaw, name] of [[-271.5, 230, 3.14, 'city'], [-800, -100, 1.57, 'park'], [-200, 2470, 0, 'sea']]) {
    const v = g.player.vehicle;
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 60; i++) g.update(1 / 60);
    for (const [label, q] of [['s0fxaa', { scale: 1, samples: 0, bloom: false, fxaa: true }], ['s2', { scale: 1, samples: 2, bloom: false, fxaa: false }], ['s2-0.75', { scale: 0.75, samples: 2, bloom: false, fxaa: false }], ['s4bloom', { scale: 1, samples: 4, bloom: true, fxaa: false }]]) {
      P.setQuality(q);
      res[name + ' ' + label] = await gpu();
    }
  }
  return res;
});
for (const [k, v] of Object.entries(out)) console.log(k, v);
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
