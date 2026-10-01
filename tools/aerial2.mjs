import { launch, shot } from './harness.mjs';
const [x, z, h] = JSON.parse(process.env.AT || '[1050,2150,500]');
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.evaluate(({ x, z, h }) => {
  window.__pauseLoop = true;
  const g = window.__game, c = g.camera;
  g.gov.enabled = false; g.pipeline.setQuality({ scale: 1, samples: 2, bloom: false, dpr: 1 });
  g.sky.time = 12; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  const v = g.player.vehicle; v.place(x, g.world.groundY(x, z, 60), z, 0);
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  g.rig.cine = { t: 0, from: () => new window.__THREE.Vector3(x, h, z - h * 0.9), target: () => new window.__THREE.Vector3(x, 0, z), fov: 55, snap: 1000, dur: 0 };
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  g.render(1 / 60);
}, { x, z, h });
console.log(await shot(page, 'aerial_site'));
await close(); process.exit(0);
