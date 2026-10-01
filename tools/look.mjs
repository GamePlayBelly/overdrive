import { launch, shot } from './harness.mjs';
import fs from 'node:fs';
const spots = JSON.parse(process.env.SPOTS || '[[-271.5,230,3.14,11]]');
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.waitForFunction(() => window.__game.pipeline.ready.size >= 20, null, { timeout: 120000 }).catch(() => {});
let n = 0;
for (const [x, z, yaw, hour, mode] of spots) {
  await page.evaluate(({ x, z, yaw, hour, mode }) => {
    window.__pauseLoop = true;
    const g = window.__game, v = g.player.vehicle;
    g.gov.enabled = false; g.pipeline.setQuality({ scale: 1, samples: 2, bloom: true, fxaa: false, dpr: 1 });
    g.sky.time = hour; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.timeScale = 0;
    g.traffic.update = () => {}; 
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.mode = mode || 'chase'; g.rig.snapBehind();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    g.render(1 / 60);
  }, { x, z, yaw, hour, mode });
  console.log(await shot(page, 'look_' + n++));
}
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
