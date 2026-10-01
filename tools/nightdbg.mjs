import { launch, shot } from './harness.mjs';
// Night view with individual light sources toggled, to find out which one draws the orange patch.
const { page, close, logs } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.waitForFunction(() => window.__game.pipeline.ready.size >= 20, null, { timeout: 120000 }).catch(() => {});
const variants = JSON.parse(process.env.VARIANTS || '[["all",{}],["nopool",{"pool":false}]]');
const LOC = JSON.parse(process.env.LOC || '[0,2110,3.14]'), TIME = Number(process.env.TIME || 18.8);
for (const [name, o] of variants) {
  await page.evaluate(({ o, LOC, TIME }) => {
    window.__pauseLoop = true;
    const g = window.__game, v = g.player.vehicle;
    g.gov.enabled = false; g.pipeline.setQuality({ scale: 1, samples: 2, bloom: true, fxaa: false, dpr: 1 });
    g.sky.time = TIME; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.timeScale = 0;
    g.traffic.update = () => {};
    const [x, z, yaw] = LOC;
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.mode = 'chase'; g.rig.snapBehind();
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    const pm = g.world.props.poolMesh; if (pm) pm.visible = o.pool !== false;
    if (v.spot) v.spot.visible = o.spot !== false;
    g.sky.sun.visible = o.sun !== false; g.sky.hemi.visible = o.hemi !== false; if (o.red && pm) { pm.material = pm.material.clone(); pm.material.map = null; pm.material.color.set(0xff0000); pm.material.opacity = 0.5; pm.material.blending = 1; pm.material.needsUpdate = true; } if (o.hemiI) g.sky.hemi.intensity = o.hemiI; if (o.env !== undefined) g.scene.environmentIntensity = o.env;
    const sp = v.spot; const wp = sp && sp.getWorldPosition(new g.camera.position.constructor()); const tp = sp && sp.target.getWorldPosition(new g.camera.position.constructor()); window.__info = { spotPos: wp && [wp.x, wp.y, wp.z].map((q) => +q.toFixed(1)), tgt: tp && [tp.x, tp.y, tp.z].map((q) => +q.toFixed(1)), vis: sp?.visible, ang: sp?.angle, dist: sp?.distance, decay: sp?.decay, cars: [v.x, v.y, v.z, v.yaw], lightsHead: v.lights,  pools: pm?.count, spot: v.spot?.intensity, sun: g.sky.sun.intensity, hemi: g.sky.hemi.intensity, night: g.sky.night, exp: g.renderer.toneMappingExposure };
    g.render(1 / 60);
  }, { o, LOC, TIME });
  console.log(name, JSON.stringify(await page.evaluate(() => window.__info)));
  await shot(page, 'night_' + name);
}
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 4).join('\n') || 'none');
await close(); process.exit(0);
