import { launch } from './harness.mjs';
const { page, close } = await launch({ width: Number(process.env.W || 1280), height: Number(process.env.H || 720) });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const [x, z, yaw] = JSON.parse(process.env.SPOT || '[0,-60,0]');
const out = await page.evaluate(async ({ x, z, yaw }) => {
  window.__pauseLoop = true;
  const g = window.__game, w = g.world, R = g.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), v = g.player.vehicle;
  v.place(x, w.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 100; i++) g.update(1 / 60);
  g.sky.envAge = -1e9;
  g.pipeline.setQuality({ scale: 0.5, samples: 0, bloom: false, fxaa: true });
  const B = w.store.batches;
  const variants = {
    full: [],
    noTerrain: [() => (w.terrain.group.visible = false), () => (w.terrain.group.visible = true)],
    noVeg: [() => (w.veg.group.visible = false), () => (w.veg.group.visible = true)],
    noProps: [() => (w.props.group.visible = false), () => (w.props.group.visible = true)],
    noCars: [() => (g.traffic.batch.group.visible = false), () => (g.traffic.batch.group.visible = true)],
    noCast: [() => (B.cast.visible = false), () => (B.cast.visible = true)],
    noGround: [() => (B.ground.visible = false), () => (B.ground.visible = true)],
    noDecal: [() => (B.decal.visible = false), () => (B.decal.visible = true)],
    noProxy: [() => (w.store.proxyBM.visible = false), () => (w.store.proxyBM.visible = true)],
    noSky: [() => (g.sky.dome.visible = false), () => (g.sky.dome.visible = true)],
    noPeds: [() => Object.values(g.peds.renderer.meshes).forEach((m) => (m.visible = false)), () => Object.values(g.peds.renderer.meshes).forEach((m) => (m.visible = true))],
    noHero: [() => g.vehicles.forEach((v) => (v.group.visible = false)), () => g.vehicles.forEach((v) => (v.group.visible = true))],
  };
  const names = Object.keys(variants);
  const res = Object.fromEntries(names.map((n) => [n, []]));
  const pend = [];
  const K = 45;
  for (let it = 0; it < K + 3; it++) {
    for (const n of names) {
      const [on, off] = variants[n];
      on?.();
      const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.pipeline.render(1 / 60); gl.endQuery(ext.TIME_ELAPSED_EXT);
      off?.();
      pend.push([n, q, it]);
      // drain finished
      while (pend.length && gl.getQueryParameter(pend[0][1], gl.QUERY_RESULT_AVAILABLE)) { const [nn, qq, ii] = pend.shift(); if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && ii >= 3) res[nn].push(gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(qq); }
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  for (let k = 0; k < 400 && pend.length; k++) { await new Promise((r) => setTimeout(r, 5)); while (pend.length && gl.getQueryParameter(pend[0][1], gl.QUERY_RESULT_AVAILABLE)) { const [nn, qq, ii] = pend.shift(); if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && ii >= 3) res[nn].push(gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(qq); } }
  const med = (a) => { a = a.slice().sort((p, q) => p - q); return a.length ? +a[Math.floor(a.length / 2)].toFixed(1) : -1; };
  return Object.fromEntries(names.map((n) => [n, med(res[n])]));
}, { x, z, yaw });
console.log(JSON.stringify(out));
await close(); process.exit(0);
