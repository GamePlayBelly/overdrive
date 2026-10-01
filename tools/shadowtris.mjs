import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, R = g.renderer, res = [];
  g.gov.enabled = false;
  for (const [x, z, yaw, name] of [[-271.5, 230, 3.14, 'city'], [-800, -100, 1.57, 'park'], [420, 60, 1.57, 'suburb'], [-200, 2470, 0, 'sea']]) {
    const v = g.player.vehicle;
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 60; i++) g.update(1 / 60);
    g.sky.sun.castShadow = false; g.render(); const a = [R.info.render.triangles, R.info.render.calls];
    g.sky.sun.castShadow = true; g.render(); const b = [R.info.render.triangles, R.info.render.calls];
    // who casts
    const casters = {}; g.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.castShadow && o.visible) { const key = (o.name || o.constructor.name) + (o.isInstancedMesh ? ':inst' + o.count : ''); casters[key] = (casters[key] || 0) + 1; } });
    res.push({ name, colorTris: a[0], colorCalls: a[1], totalTris: b[0], totalCalls: b[1], shadowTris: b[0] - a[0], shadowCalls: b[1] - a[1], casters });
  }
  return res;
});
for (const r of out) console.log(JSON.stringify(r).slice(0, 700));
await close(); process.exit(0);
