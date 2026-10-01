import { launch, shot } from './harness.mjs';
// Several aerial views in one run: AT='[[x,z,h,name,dz],...]' (camera sits h*0.9 south of the target by default)
const list = JSON.parse(process.env.AT || '[[-1500,-420,300,"bridge"]]');
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
for (const [x, z, h, name, dz] of list) {
  await page.evaluate(({ x, z, h, dz }) => {
    window.__pauseLoop = true;
    const g = window.__game, c = g.camera, THREE = window.__THREE;
    g.gov.enabled = false; g.pipeline.setQuality({ scale: 1, samples: 2, bloom: false, dpr: 1 });
    g.sky.time = 12; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.timeScale = 0;
    g.traffic.update = () => {};
    const v = g.player.vehicle; v.place(x, g.world.groundY(x, z, 60), z, 0);
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    const gy = g.world.groundY(x, z, 400);
    g.rig.cine = { t: 0, from: () => new THREE.Vector3(x, gy + h, z - (dz ?? h * 0.9)), target: () => new THREE.Vector3(x, gy, z), fov: 55, snap: 1000, dur: 0 };
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    g.render(1 / 60);
  }, { x, z, h, dz });
  console.log(await shot(page, 'aer_' + name));
}
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 4).join('\n') || 'none');
await close(); process.exit(0);
