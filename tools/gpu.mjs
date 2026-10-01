import { launch, shot } from './harness.mjs';
const { page, close } = await launch({ width: Number(process.env.W || 1280), height: Number(process.env.H || 720) });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.evaluate(() => {
  window.__pauseLoop = true;
  window.__gpuMs = async (n = 5) => {
    const g = window.__game, gl = g.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
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
});
if (process.env.PRE) await page.evaluate((c) => new Function('g', 'THREE', c)(window.__game, window.__THREE), process.env.PRE);
const spots = JSON.parse(process.env.SPOTS || '[[-271.5,230,3.14],[0,-60,0],[420,60,1.57],[-800,-100,1.57]]');
for (const [x, z, yaw] of spots) {
  await page.evaluate(({ x, z, yaw }) => { const g = window.__game, v = g.player.vehicle; v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 60; i++) g.update(1 / 60); }, { x, z, yaw });
  const out = { at: [x, z] };
  out.full = await page.evaluate(() => __gpuMs(6));
  const tog = async (name, expr) => { out[name] = await page.evaluate(async (e) => { const g = window.__game, w = g.world; const o = eval(e); const arr = Array.isArray(o) ? o : [o]; const old = arr.map((x) => x.visible); arr.forEach((x) => (x.visible = false)); const r = await __gpuMs(5); arr.forEach((x, i) => (x.visible = old[i])); return r; }, expr); };
  await tog('noTerrain', 'w.terrain.group'); await tog('noVeg', 'w.veg.group'); await tog('noProps', 'w.props.group'); await tog('noCars', 'g.traffic.batch.group');
  await tog('noStore', 'w.group.children.filter((c) => c.isMesh)');
  await tog('noPeds', 'Object.values(g.peds.renderer.meshes)');
  out.noShadow = await page.evaluate(async () => { const g = window.__game; g.sky.sun.castShadow = false; const r = await __gpuMs(5); g.sky.sun.castShadow = true; return r; });
  out.skyOnly = await page.evaluate(async () => { const g = window.__game; const sc = g.scene; const kids = sc.children.map((c) => c.visible); sc.children.forEach((c) => { if (c !== g.sky.dome) c.visible = false; }); const r = await __gpuMs(5); sc.children.forEach((c, i) => (c.visible = kids[i])); return r; });
  out.half = await page.evaluate(async () => { const g = window.__game, R = g.renderer; R.setPixelRatio(0.5); R.setSize(innerWidth, innerHeight, false); const r = await __gpuMs(5); R.setPixelRatio(1); R.setSize(innerWidth, innerHeight, false); return r; });
  out.noMSAAsim = 0;
  out.info = await page.evaluate(() => { const i = window.__game.renderer.info; return [i.render.triangles, i.render.calls]; });
  console.log(JSON.stringify(out));
}
await close(); process.exit(0);
