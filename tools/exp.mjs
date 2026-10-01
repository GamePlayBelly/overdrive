import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.evaluate(() => {
  window.__pauseLoop = true;
  window.__gpuMs = async (n = 6) => {
    const g = window.__game, gl = g.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const res = [];
    for (let i = 0; i < n + 2; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.render(); gl.endQuery(ext.TIME_ELAPSED_EXT);
      let k = 0;
      while (k++ < 200) { await new Promise((r) => setTimeout(r, 4)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; } }
      gl.deleteQuery(q);
    }
    res.sort((a, b) => a - b);
    return res.length ? +res[Math.floor(res.length / 2)].toFixed(1) : -1;
  };
});
const [x, z, yaw] = JSON.parse(process.env.SPOT || '[-271.5,230,3.14]');
const out = await page.evaluate(async ({ x, z, yaw }) => {
  const g = window.__game, w = g.world, T = window.__THREE, v = g.player.vehicle, R = g.renderer;
  v.place(x, w.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 100; i++) g.update(1 / 60);
  const res = {}; res.base = await __gpuMs();
  const chunks = w.store.list;
  const setLayer = (names, vis) => { const old = []; for (const c of chunks) for (const n of names) if (c.layers[n]) for (const m of c.layers[n]) { old.push([m, m.visible]); m.visible = vis; } return old; };
  const restore = (old) => old.forEach(([m, v]) => (m.visible = v));
  const proxies = chunks.filter((c) => c.proxy && c.proxy.visible);
  res.visProxies = proxies.length;
  proxies.forEach((c) => (c.proxy.visible = false)); res.noProxies = await __gpuMs(); proxies.forEach((c) => (c.proxy.visible = true));
  // hide entire layers by forcing invisible each frame is not possible (store.update resets) -> pause store update
  const orig = w.store.update; w.store.update = () => {};
  const names = ['road', 'mark', 'side', 'curb', 'flat', 'deck', 'bldg'];
  for (const n of names) { const o = setLayer([n], false); res['no_' + n] = await __gpuMs(); restore(o); }
  // per-material in bldg
  const byMat = {}; for (const c of chunks) for (const m of c.layers.bldg || []) if (m.visible) { byMat[m.userData.mat] = (byMat[m.userData.mat] || 0) + m.geometry.index.count / 3; }
  res.bldgTrisByMat = Object.fromEntries(Object.entries(byMat).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, Math.round(v)]));
  w.store.update = orig;
  return res;
}, { x, z, yaw });
console.log(JSON.stringify(out, null, 1));
await close(); process.exit(0);
