import { launch, shot } from './harness.mjs';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const { page, close } = await launch({ width: W, height: H });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const cfg = {
  ids: (process.env.BOATS || 'rib').split(','), az: Number(process.env.AZ || 35), dist: Number(process.env.DIST || 0), elev: Number(process.env.ELEV || 0.25),
  hour: Number(process.env.HOUR || 11), x: Number(process.env.X || 0), z: Number(process.env.Z || 2520), name: process.env.NAME || 'boat', amp: Number(process.env.AMP || 0.06), look: Number(process.env.LOOKY || 0.6),
};
const res = await page.evaluate(async (c) => {
  const g = window.__game, THREE = window.__THREE;
  window.__pauseLoop = true;
  g.pipeline.setQuality({ scale: 1, samples: 2, bloom: true });
  g.sky.time = c.hour; g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  g.traffic.update = () => {}; g.peds.update = () => {};
  Object.defineProperty(g.world.sea, 'amp', { get: () => c.amp, set() {} });
  const { createBoatMesh } = await import('/src/vehicles/boatModel.js');
  const { VEHICLE_BY_ID } = await import('/src/data/vehicles.js');
  const out = [];
  let ox = 0;
  const meshes = [];
  for (const id of c.ids) {
    const def = VEHICLE_BY_ID[id];
    const m = createBoatMesh(def, {});
    m.group.position.set(c.x + ox, g.world.sea.waveAt(c.x + ox, c.z) , c.z);
    g.scene.add(m.group);
    meshes.push({ m, def, x: c.x + ox });
    ox += def.body.W + 4;
  }
  const v = g.player.vehicle; v.place(c.x, g.world.groundY(c.x, c.z - 400, 80), c.z - 400, 0);
  const last = meshes[meshes.length - 1];
  const cx = (meshes[0].x + last.x) / 2, size = Math.max(...meshes.map((q) => q.def.body.L));
  const dist = c.dist || size * 1.9 + 3;
  const a = (c.az * Math.PI) / 180;
  const wl = -2.2, cam = [cx + Math.sin(a) * dist, wl + 0.6 + dist * c.elev, c.z + Math.cos(a) * dist], look = [cx, wl + c.look * size * 0.22, c.z];
  window.__cam = () => { g.rig.cine = { t: 0, from: () => new THREE.Vector3(...cam), target: () => new THREE.Vector3(...look), fov: 45, snap: 500, dur: 0 }; g.rig.pos.set(...cam); g.rig.look.set(...look); };
  window.__cam();
  window.__boats = meshes;
  return { cam, look, tris: meshes.map((q) => Object.values(q.m.meshes).reduce((s, mm) => s + mm.geometry.index.count / 3, 0)) };
}, cfg);
console.log(JSON.stringify(res));
for (let i = 0; i < 4; i++) await page.evaluate(() => { const g = window.__game; for (let k = 0; k < 10; k++) { g.update(1 / 60); window.__cam(); } g.render(1 / 60); });
await page.evaluate(() => window.__game.render(1 / 60));
console.log(await shot(page, cfg.name));
await close(); process.exit(0);
