import { launch } from './harness.mjs';
const { page, close } = await launch({ width: Number(process.env.W || 1280), height: Number(process.env.H || 720) });
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
      while (k++ < 200) { await new Promise((r) => setTimeout(r, 4)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && i >= 2) res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; } }
      gl.deleteQuery(q);
    }
    res.sort((a, b) => a - b);
    return res.length ? +res[Math.floor(res.length / 2)].toFixed(1) : -1;
  };
});
const spots = JSON.parse(process.env.SPOTS || '[[-271.5,230,3.14],[0,-60,0],[420,60,1.57],[-800,-100,1.57]]');
for (const [x, z, yaw] of spots) {
  const out = await page.evaluate(async ({ x, z, yaw }) => {
    const g = window.__game, v = g.player.vehicle;
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    const med = (a) => { a = a.slice().sort((p, q) => p - q); return +a[Math.floor(a.length / 2)].toFixed(2); };
    const t = { upd: [], sub: [] };
    for (let i = 0; i < 20; i++) { const a = performance.now(); g.update(1 / 60); const b = performance.now(); g.render(); const c = performance.now(); t.upd.push(b - a); t.sub.push(c - b); await new Promise((r) => setTimeout(r, 30)); }
    const gpu = await __gpuMs(8);
    const info = g.renderer.info;
    return { at: [x, z], cpuUpdate: med(t.upd), cpuSubmit: med(t.sub), gpu, tris: info.render.triangles, calls: info.render.calls };
  }, { x, z, yaw });
  console.log(JSON.stringify(out));
}
await close(); process.exit(0);
