import { launch, shot } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.evaluate(() => {
  window.__pauseLoop = true;
  const g = window.__game, v = g.player.vehicle, THREE = window.__THREE;
  g.pipeline.setQuality({ scale: 0.9, samples: 2, bloom: true });
  g.sky.time = 15; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  g.traffic.update = () => {}; g.peds.update = () => {}; v.collideStatic = () => {};
  const home = g.world.poi.garage;
  const n = g.world.roads.nearestLane(home.x, home.z, 1, 0, null, 200); const pt = n.lane.pl.at(n.s);
  const yaw = Math.atan2(pt.dx, pt.dz);
  v.place(pt.x, g.world.groundY(pt.x, pt.z, 50), pt.z, yaw); v.phys.gear = 3;
  const s = 85 / 3.6; v.phys.vx = Math.sin(yaw) * s; v.phys.vz = Math.cos(yaw) * s;
  g.controlVehicle = () => {};
  for (let i = 0; i < 110; i++) { const t = i / 60; Object.assign(v.input, t < 0.25 ? { throttle: 1, steer: 1, hand: false } : t < 0.6 ? { throttle: 1, steer: 1, hand: true } : { throttle: 1, steer: 1, hand: false }); g.update(1 / 60); }
  window.__cam = () => { const p = v.phys; g.rig.cine = { t: 0, from: () => new THREE.Vector3(v.x - 9 * Math.cos(v.yaw) + 5 * Math.sin(v.yaw), v.y + 3.2, v.z + 9 * Math.sin(v.yaw) + 5 * Math.cos(v.yaw)), target: () => new THREE.Vector3(v.x, v.y + 0.5, v.z), fov: 55, snap: 100, dur: 0 }; };
  window.__cam();
  for (let i = 0; i < 6; i++) { Object.assign(v.input, { throttle: 1, steer: 1 }); g.update(1 / 60); }
  g.render(1 / 60);
});
console.log(await shot(page, 'drift_fx'));
console.log(await page.evaluate(() => { const v = window.__game.player.vehicle; return JSON.stringify({ kmh: v.kmh | 0, beta: Math.round(Math.atan2(v.phys.lateralSpeed, v.phys.fwdSpeed) * 57.3), skidR: v.phys.skidR, particles: window.__game.fx.pt.n, marks: window.__game.fx.marks.head }); }));
await close(); process.exit(0);
