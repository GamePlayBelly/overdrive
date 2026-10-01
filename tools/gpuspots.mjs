import { launch } from './harness.mjs';
// GPU time (ms) per frame at several places, current quality tier settings forced to the same values.
const SPOTS = JSON.parse(process.env.SPOTS || '[["city",-8.5,70,3.14],["suburb",575,-224,-1.57],["alder",-40,-1655,3.14],["dry",2760,150,1.57],["marin",-1900,-420,3.14],["bridge",-1300,-428,-1.57],["pass",300,-800,2.4],["marlow",0,2110,3.14]]');
const { page, close, logs } = await launch({ width: 1280, height: 720, query: process.env.QUERY || '?dev=1' });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.waitForFunction(() => window.__game.pipeline.ready.size >= 30, null, { timeout: 120000 }).catch(() => {});
console.log('world build ms', await page.evaluate(() => Math.round(window.__game.world.buildMs)), JSON.stringify(await page.evaluate(() => window.__game.world.timings)));
const out = await page.evaluate(async (SPOTS) => {
  window.__pauseLoop = true;
  const g = window.__game, v = g.player.vehicle, R = g.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  g.gov.enabled = false; g.pipeline.setQuality({ scale: 1, samples: 0, bloom: true, fxaa: true, dpr: 1, ao: true });
  g.sky.time = 12; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.timeScale = 0;
  const res = {};
  for (const [name, x, z, yaw] of SPOTS) {
    v.place(x, g.world.groundY(x, z, 400), z, yaw); g.rig.snapBehind();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    g.render(1 / 60); g.render(1 / 60);
    const a = [];
    for (let i = 0; i < 9; i++) {
      const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.render(1 / 60); gl.endQuery(ext.TIME_ELAPSED_EXT);
      let k = 0; while (k++ < 200) { await new Promise((r) => setTimeout(r, 4)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) a.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; } }
      gl.deleteQuery(q);
    }
    a.sort((p, q) => p - q);
    const t0 = performance.now(); for (let i = 0; i < 20; i++) g.update(1 / 60); const cpu = (performance.now() - t0) / 20;
    res[name] = { gpu: +a[a.length >> 1].toFixed(1), cpuUpdate: +cpu.toFixed(1), calls: R.info.render.calls, tris: Math.round(R.info.render.triangles / 1000) + 'k' };
  }
  return res;
}, SPOTS);
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(8), JSON.stringify(v));
console.log('logs:', logs.filter((l) => !/getImageData|X3595/.test(l)).slice(0, 4).join('\n') || 'none');
await close(); process.exit(0);
