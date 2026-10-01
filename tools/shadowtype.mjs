import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.waitForFunction(() => window.__game.pipeline.ready.size >= 20, null, { timeout: 120000 }).catch(() => {});
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const THREE = window.__THREE;
  const g = window.__game, R = g.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const gpu = async (n = 11) => { const res = []; for (let i = 0; i < n; i++) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.render(); gl.endQuery(ext.TIME_ELAPSED_EXT); let k = 0; while (k++ < 200) { await new Promise((r) => setTimeout(r, 4)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; } } gl.deleteQuery(q); } res.sort((a, b) => a - b); return +res[Math.floor(res.length / 2)].toFixed(1); };
  g.gov.enabled = false;
  g.pipeline.setQuality({ scale: 1, samples: 2, bloom: false, fxaa: false, dpr: 1 });
  const recompile = () => { g.scene.traverse((o) => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; }); }); };
  const res = [];
  for (const [x, z, yaw, name] of [[-271.5, 230, 3.14, 'city'], [-800, -100, 1.57, 'park'], [420, 60, 1.57, 'suburb']]) {
    const v = g.player.vehicle;
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 60; i++) g.update(1 / 60);
    const row = { name };
    for (const [label, type] of [['soft', THREE.PCFSoftShadowMap], ['pcf', THREE.PCFShadowMap], ['basic', THREE.BasicShadowMap], ['soft2', THREE.PCFSoftShadowMap]]) {
      R.shadowMap.type = type; recompile(); g.render(); g.render();
      row[label] = await gpu();
    }
    g.sky.sun.castShadow = false; recompile(); g.render(); row.off = await gpu(); g.sky.sun.castShadow = true;
    R.shadowMap.type = THREE.PCFSoftShadowMap; recompile();
    res.push(row);
  }
  return res;
});
for (const r of out) console.log(JSON.stringify(r));
await close(); process.exit(0);
