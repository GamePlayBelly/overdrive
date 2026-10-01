import { launch } from './harness.mjs';
// GPU cost of MSAA / depth texture / SSAO combinations at 720p.
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.waitForFunction(() => window.__game.pipeline.ready.size >= 30, null, { timeout: 120000 }).catch(() => {});
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, v = g.player.vehicle, R = g.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), P = g.pipeline;
  const gpu = async (n = 11) => {
    const res = [];
    for (let i = 0; i < n; i++) {
      const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.render(1 / 60); gl.endQuery(ext.TIME_ELAPSED_EXT);
      let k = 0; while (k++ < 200) { await new Promise((r) => setTimeout(r, 4)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; } }
      gl.deleteQuery(q);
    }
    res.sort((a, b) => a - b); return +res[Math.floor(res.length / 2)].toFixed(1);
  };
  g.gov.enabled = false;
  g.sky.time = 11; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.timeScale = 0; g.traffic.update = () => {};
  const res = {};
  for (const [x, z, yaw, name] of [[-8.5, 70, 3.14, 'city'], [575, -224, -1.57, 'suburb']]) {
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 90; i++) g.update(1 / 60);
    const cfgs = [['s2', { samples: 2 }, false], ['s0fxaa', { samples: 0, fxaa: true }, false], ['s0+depth', { samples: 0, fxaa: true }, true], ['s0+ao', { samples: 0, fxaa: true, ao: true }, false], ['s2+ao', { samples: 2, ao: true }, false], ['s4', { samples: 4 }, false]];
    for (const [label, q, depth] of cfgs) {
      P.setDepth(depth); P.setQuality({ scale: 1, bloom: true, dpr: 1, ao: false, ...q });
      g.render(1 / 60); g.render(1 / 60);
      res[name + ' ' + label] = await gpu();
    }
  }
  return res;
});
for (const [k, v] of Object.entries(out)) console.log(k, v);
console.log('logs:', logs.filter((l) => !/getImageData|X3595/.test(l)).slice(0, 4).join('\n') || 'none');
await close(); process.exit(0);
