import { launch } from './harness.mjs';
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.waitForFunction(() => window.__game.pipeline.ready.size >= 30, null, { timeout: 120000 }).catch(() => {});
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, R = g.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), sea = g.world.sea, res = {};
  g.traffic.update = () => {}; g.peds.update = () => {};
  g.gov.enabled = false; g.pipeline.setQuality({ scale: 1, samples: 0, bloom: true, fxaa: true, dpr: 1, ao: true });
  g.sky.time = 12; g.sky.timeScale = 0;
  const boat = g.yard.slots.find((s) => s.id === 'sport').v;
  const measure = async (name) => {
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    g.render(1 / 60); g.render(1 / 60);
    const a = [];
    for (let i = 0; i < 9; i++) {
      const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.render(1 / 60); gl.endQuery(ext.TIME_ELAPSED_EXT);
      let k = 0; while (k++ < 200) { await new Promise((r) => setTimeout(r, 4)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) a.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; } }
      gl.deleteQuery(q);
    }
    a.sort((p, q) => p - q);
    const t0 = performance.now(); for (let i = 0; i < 30; i++) g.update(1 / 60); const cpu = (performance.now() - t0) / 30;
    res[name] = { gpu: +a[a.length >> 1].toFixed(1), cpu: +cpu.toFixed(1), calls: R.info.render.calls, tris: Math.round(R.info.render.triangles / 1000) + 'k' };
  };
  P.exit?.(); P.hidden = false; P.vehicle = null; P.state = 'foot'; P.seq = null;
  boat.place(-1500, 0, 100, -1.5); boat.moor = null; P.enter(boat);
  for (const wx of ['sunny', 'storm']) {
    g.sky.lockWeather = wx; g.sky.setWeather(wx, true); sea.waves.settle(1.6 + g.sky.w.wind * 11.5, g.sky.wind.dir);
    boat.place(-1500, 0, 100, -1.5);
    await measure('boat_' + wx);
  }
  g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); sea.waves.settle(5, 0.9);
  P.exit?.(); P.vehicle = null; P.seq = null; P.state = 'swim'; P.x = -1140; P.z = 340; P.y = sea.waveAt(P.x, P.z) - 1.08;
  for (let i = 0; i < 30; i++) g.update(1 / 30);
  g.input.down.add('ControlLeft'); for (let i = 0; i < 90; i++) g.update(1 / 30); g.input.down.delete('ControlLeft');
  await measure('underwater');
  res.dbg = { on: g.marine.on, dens: g.marine.density, sch: g.marine.schools.length, cells: g.marine.cells.size, under: sea.under, cam: g.camera.position.toArray().map((v) => Math.round(v)), tier: g.gov.tier, q: g.seabed.quality, seabedOn: g.seabed.on };
  res.fish = g.marine.count; res.decor = Object.values(g.seabed.m).reduce((a, m) => a + m.count, 0);
  return res;
});
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(14), JSON.stringify(v));
console.log('logs:', logs.filter((l) => !/getImageData|X3595/.test(l)).slice(0, 4).join('\n') || 'none');
await close(); process.exit(0);
