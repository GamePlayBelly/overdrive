import { launch, shot } from './harness.mjs';
// Same views with SSAO off and on, plus GPU cost of each.
const spots = JSON.parse(process.env.SPOTS || '[[-8.5,70,3.14,11],[575,-224,-1.57,16.5]]');
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.waitForFunction(() => window.__game.pipeline.ready.size >= 30, null, { timeout: 120000 }).catch(() => {});
let n = 0;
for (const [x, z, yaw, hour] of spots) {
  for (const ao of [false, true]) {
    const r = await page.evaluate(async ({ x, z, yaw, hour, ao }) => {
      window.__pauseLoop = true;
      const g = window.__game, v = g.player.vehicle, R = g.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      g.gov.enabled = false; g.pipeline.setQuality({ scale: 1, samples: 0, bloom: true, fxaa: true, dpr: 1, ao });
      g.sky.time = hour; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.timeScale = 0;
      g.traffic.update = () => {};
      v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.mode = 'chase'; g.rig.snapBehind();
      for (let i = 0; i < 90; i++) g.update(1 / 60);
      g.render(1 / 60); g.render(1 / 60);
      const res = [];
      for (let i = 0; i < 9; i++) {
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.render(1 / 60); gl.endQuery(ext.TIME_ELAPSED_EXT);
        let k = 0; while (k++ < 200) { await new Promise((r) => setTimeout(r, 4)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; } }
        gl.deleteQuery(q);
      }
      res.sort((a, b) => a - b);
      return +res[Math.floor(res.length / 2)].toFixed(1);
    }, { x, z, yaw, hour, ao });
    console.log(`spot ${n} ao=${ao} gpu ms ${r}`);
    await shot(page, `ao_${n}_${ao ? 'on' : 'off'}`);
  }
  n++;
}
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
