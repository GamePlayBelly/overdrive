import { launch, shot } from './harness.mjs';
// Spawns sailboats on a fixed course in a fixed wind, lets them settle and takes a picture from a chosen angle.
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const cfg = {
  ids: (process.env.BOATS || 'sloop').split(','), az: Number(process.env.AZ || 40), dist: Number(process.env.DIST || 0), elev: Number(process.env.ELEV || 0.2),
  hour: Number(process.env.HOUR || 11), tws: Number(process.env.TWS || 7), awa: Number(process.env.AWA || 80), name: process.env.NAME || 'sail', amp: Number(process.env.AMP || 0.1),
  secs: Number(process.env.SECS || 25), look: Number(process.env.LOOKY || 0.5), weather: process.env.WEATHER || 'sunny', fov: Number(process.env.FOV || 45),
};
const { page, close } = await launch({ width: W, height: H });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const res = await page.evaluate(async (c) => {
  const g = window.__game, THREE = window.__THREE;
  window.__pauseLoop = true;
  g.pipeline.setQuality({ scale: 1, samples: 2, bloom: true });
  g.sky.time = c.hour; g.sky.timeScale = 0; g.sky.lockWeather = c.weather; g.sky.setWeather(c.weather, true);
  g.traffic.update = () => {}; g.peds.update = () => {};
  Object.defineProperty(g.world.sea, 'amp', { get: () => c.amp, set() {} });
  const sea = g.world.sea, wdir = 0.9, dt = 1 / 60;
  const w = { speed: c.tws, dir: wdir, x: Math.cos(wdir) * c.tws, z: Math.sin(wdir) * c.tws, t: 0 };
  g.sky.wind = new Proxy(w, { set: () => true });
  const env = { ground: (x, z, y) => g.world.ground(x, z, y), wet: 0, rain: 0, night: 0, fog: 0 };
  const windFrom = Math.atan2(-Math.cos(wdir), -Math.sin(wdir)), hd = windFrom + (c.awa * Math.PI) / 180;
  const boats = []; let off = 0;
  for (const id of c.ids) {
    const v = g.spawnVehicle(id, 0 + Math.cos(hd) * off, 2700 - Math.sin(hd) * off, hd, {}, { kind: 'civilian' });
    boats.push(v); off += v.def.body.L * 1.3;
  }
  const pl = g.player.vehicle; pl.place(0, g.world.groundY(0, 2200, 80), 2200, 0);
  for (let i = 0; i < c.secs * 60; i++) {
    for (const v of boats) { const p = v.phys; let e = hd - p.yaw; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI; Object.assign(v.input, { throttle: 0, brake: 0, steer: Math.max(-1, Math.min(1, -e * 2.5 + p.w * 0.6)), hand: false }); sea.t += dt; v.update(dt, env); }
  }
  const v0 = boats[0], p0 = v0.phys, L = v0.def.body.L, dist = c.dist || L * 2.1 + 4, a = (c.az * Math.PI) / 180 + p0.yaw;
  const cx = p0.x, cz = p0.z, wl = p0.y;
  const cam = [cx + Math.sin(a) * dist, wl + 1.2 + dist * c.elev, cz + Math.cos(a) * dist], look = [cx, wl + c.look * L * 0.5, cz];
  window.__cam = () => { g.rig.cine = { t: 0, from: () => new THREE.Vector3(...cam), target: () => new THREE.Vector3(...look), fov: c.fov, snap: 500, dur: 0 }; g.rig.pos.set(...cam); g.rig.look.set(...look); };
  window.__boat = v0;
  return { cam, look, kn: +(p0.speed * 1.944).toFixed(1), heel: +(p0.roll * 57.3).toFixed(1), sailT: +(p0.sailT * 57.3).toFixed(0), luff: +p0.sailLuff.toFixed(2) };
}, cfg);
console.log(JSON.stringify(res));
for (let i = 0; i < 4; i++) await page.evaluate(() => { const g = window.__game; for (let k = 0; k < 6; k++) { g.update(1 / 60); window.__cam(); } g.render(1 / 60); });
const CAM = process.env.CAMBER;
await page.evaluate((CAM) => { window.__cam(); const U = window.__boat.rig.sailMat?.userData.sail; if (U && CAM !== undefined) U.uCamber.value = Number(CAM); window.__game.render(1 / 60); }, CAM);
console.log(await shot(page, cfg.name));
await close(); process.exit(0);
