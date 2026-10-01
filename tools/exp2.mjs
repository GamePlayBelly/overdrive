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
      while (k++ < 300) { await new Promise((r) => setTimeout(r, 4)); if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); break; } }
      gl.deleteQuery(q);
    }
    res.sort((a, b) => a - b);
    return res.length ? +res[Math.floor(res.length / 2)].toFixed(1) : -1;
  };
});
const [x, z, yaw] = JSON.parse(process.env.SPOT || '[0,-60,0]');
const out = await page.evaluate(async ({ x, z, yaw }) => {
  const g = window.__game, w = g.world, T = window.__THREE, v = g.player.vehicle, R = g.renderer;
  v.place(x, w.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 100; i++) g.update(1 / 60);
  const res = {}; res.base = await __gpuMs();
  const hide = async (name, objs) => { const arr = Array.isArray(objs) ? objs : [objs]; const old = arr.map((o) => o.visible); arr.forEach((o) => (o.visible = false)); res[name] = await __gpuMs(); arr.forEach((o, i) => (o.visible = old[i])); };
  const B = w.store.batches;
  await hide('noCastBatch', B.cast); await hide('noGroundBatch', B.ground); await hide('noDecalBatch', B.decal); await hide('noProxy', w.store.proxyBM);
  await hide('noTerrain', w.terrain.group); await hide('noVeg', w.veg.group); await hide('noProps', w.props.group); await hide('noCars', g.traffic.batch.group);
  g.sky.sun.castShadow = false; res.noShadowCast = await __gpuMs(); g.sky.sun.castShadow = true;
  const objs = []; g.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) objs.push(o); });
  const oldR = objs.map((o) => o.receiveShadow); objs.forEach((o) => (o.receiveShadow = false)); res.noRecv = await __gpuMs(); objs.forEach((o, i) => (o.receiveShadow = oldR[i]));
  R.setPixelRatio(0.5); R.setSize(innerWidth, innerHeight, false); res.halfRes = await __gpuMs(); R.setPixelRatio(1); R.setSize(innerWidth, innerHeight, false);
  res.sky = 0; const kids = g.scene.children.map((c) => c.visible); g.scene.children.forEach((c) => { if (c !== g.sky.dome) c.visible = false; }); res.skyOnly = await __gpuMs(); g.scene.children.forEach((c, i) => (c.visible = kids[i]));
  return res;
}, { x, z, yaw });
console.log(JSON.stringify(out));
await close(); process.exit(0);
