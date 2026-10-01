import { launch } from './harness.mjs';
// Draw calls per scene group at a spot. LIVE=<ms> lets the real game loop run for that long first and inspects the live state.
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const spots = JSON.parse(process.env.SPOTS || '[[460,247,1.57],[-271.5,230,3.14]]');
const live = Number(process.env.LIVE || 0);
for (const [x, z, yaw] of spots) {
  if (live) {
    await page.evaluate(({ x, z, yaw }) => { const g = window.__game, v = g.player.vehicle; v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); }, { x, z, yaw });
    await new Promise((r) => setTimeout(r, live));
  }
  const out = await page.evaluate(({ x, z, yaw, live }) => {
    const g = window.__game, R = g.renderer, v = g.player.vehicle;
    if (!live) { window.__pauseLoop = true; g.gov.enabled = false; v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); for (let i = 0; i < 60; i++) g.update(1 / 60); }
    g.render(); const total = R.info.render.calls, shadowOn = g.sky.sun.castShadow;
    g.sky.sun.castShadow = false; g.render(); const noShadow = R.info.render.calls; g.sky.sun.castShadow = shadowOn;
    const res = { total, shadowCalls: total - noShadow, parts: [], vehicles: g.vehicles.length, peds: g.peds.list.length, cars: g.traffic.cars.length, time: +g.sky.time.toFixed(1), wanted: g.police.level };
    for (const k of g.scene.children.filter((c) => c.visible)) {
      k.visible = false; g.render(); const t = R.info.render.calls; k.visible = true;
      const d = total - t; if (d >= 3) res.parts.push([(k.name || k.type) + ':' + k.children.length, d]);
    }
    res.parts.sort((a, b) => b[1] - a[1]);
    return res;
  }, { x, z, yaw, live: !!live });
  console.log(JSON.stringify({ at: [x, z], ...out, parts: undefined }));
  for (const p of out.parts.slice(0, 8)) console.log('  ', p[0], p[1]);
}
await close(); process.exit(0);
