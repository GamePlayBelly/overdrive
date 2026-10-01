import { launch } from './harness.mjs';
const { page, close } = await launch({ width: Number(process.env.W || 1280), height: Number(process.env.H || 720) });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const [x, z, yaw] = JSON.parse(process.env.SPOT || '[0,-60,0]');
const out = await page.evaluate(async ({ x, z, yaw, scale, samples }) => {
  window.__pauseLoop = true;
  const g = window.__game, w = g.world, gl = g.renderer.getContext(), v = g.player.vehicle, px = new Uint8Array(4), B = w.store.batches;
  v.place(x, w.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 100; i++) g.update(1 / 60);
  g.sky.envAge = -1e9; g.pipeline.setQuality({ scale, samples, bloom: false, fxaa: samples === 0 });
  const vis = (objs, val) => (Array.isArray(objs) ? objs : [objs]).forEach((o) => (o.visible = val));
  const V = {
    full: [],
    noTerrain: [() => vis(w.terrain.group, false), () => vis(w.terrain.group, true)],
    noVeg: [() => vis(w.veg.group, false), () => vis(w.veg.group, true)],
    noProps: [() => vis(w.props.group, false), () => vis(w.props.group, true)],
    noCars: [() => vis(g.traffic.batch.group, false), () => vis(g.traffic.batch.group, true)],
    noCast: [() => vis(B.cast, false), () => vis(B.cast, true)],
    noGround: [() => vis(B.ground, false), () => vis(B.ground, true)],
    noDecal: [() => vis(B.decal, false), () => vis(B.decal, true)],
    noProxy: [() => vis(w.store.proxyBM, false), () => vis(w.store.proxyBM, true)],
    noPeds: [() => vis(Object.values(g.peds.renderer.meshes), false), () => vis(Object.values(g.peds.renderer.meshes), true)],
    noHero: [() => g.vehicles.forEach((q) => (q.group.visible = false)), () => g.vehicles.forEach((q) => (q.group.visible = true))],
    noSky: [() => vis(g.sky.dome, false), () => vis(g.sky.dome, true)],
    everythingHidden: [() => { window.__s = []; g.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible) { window.__s.push(o); o.visible = false; } }); }, () => window.__s.forEach((o) => (o.visible = true))],
  };
  const names = Object.keys(V), res = Object.fromEntries(names.map((n) => [n, []]));
  for (let it = 0; it < 14; it++) for (const n of names) {
    const [on, off] = V[n]; on?.();
    const t0 = performance.now(); g.render(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const dt = performance.now() - t0;
    off?.(); if (it >= 3) res[n].push(dt);
  }
  const med = (a) => { a = a.slice().sort((p, q) => p - q); return +a[a.length >> 1].toFixed(1); };
  return Object.fromEntries(names.map((n) => [n, med(res[n])]));
}, { x, z, yaw, scale: Number(process.env.SCALE || 0.5), samples: Number(process.env.SAMPLES || 0) });
console.log(JSON.stringify(out));
await close(); process.exit(0);
