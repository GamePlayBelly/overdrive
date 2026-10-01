import { launch, shot } from './harness.mjs';
// Close view of the nearest tree of a kind (KIND=conifer|pine|oak|park|street|birch|palm) from DIST metres.
const KIND = process.env.KIND || 'conifer', DIST = Number(process.env.DIST || 12), AZ = Number(process.env.AZ || 0.6), NAME = process.env.NAME || 'veg_' + KIND;
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const info = await page.evaluate(({ KIND, DIST, AZ }) => {
  window.__pauseLoop = true;
  const g = window.__game, V = g.world.veg, THREE = window.__THREE;
  g.gov.enabled = false; g.pipeline.setQuality({ scale: 1, samples: 2, bloom: false, dpr: 1 });
  g.sky.time = 14; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.timeScale = 0;
  g.traffic.update = () => {};
  V.lodScale = 3;
  const ki = Object.keys(V.kinds).indexOf(KIND), T = V.trees, v = g.player.vehicle;
  let best = -1, bd = 1e12;
  for (let i = 0; i < V.n; i++) { if (T.k[i] !== ki) continue; const d = (T.x[i] - 0) ** 2 + (T.z[i] + 60) ** 2; if (d < bd) { bd = d; best = i; } }
  if (best < 0) return null;
  const x = T.x[best], y = T.y[best], z = T.z[best];
  v.place(x + 40, g.world.groundY(x + 40, z, 80), z, 0);
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  const cx = x + Math.sin(AZ) * DIST, cz = z + Math.cos(AZ) * DIST;
  g.rig.cine = { t: 0, from: () => new THREE.Vector3(cx, y + 2.2, cz), target: () => new THREE.Vector3(x, y + (V.kinds[KIND].def.h || 10) * 0.45, z), fov: 55, snap: 1000, dur: 0 };
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  V.update({ pos: new THREE.Vector3(cx, y, cz), moved: 99, stamp: 1e6, sphere: () => true, bias: () => 1 }, true);
  g.render(1 / 60);
  return { x, z, kind: KIND, cnt: JSON.stringify(V.meshes[KIND].cnt) };
}, { KIND, DIST, AZ });
console.log(JSON.stringify(info));
console.log(await shot(page, NAME));
await close(); process.exit(0);
