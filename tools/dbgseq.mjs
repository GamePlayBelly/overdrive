import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
console.log(await page.evaluate(() => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, v = P.vehicle; g.traffic.update = () => {}; g.peds.update = () => {};
  const x = -300, z = 20; v.place(x, g.world.groundY(x, z, 50), z, Math.PI / 2);
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  P.tryExit();
  const out = [];
  for (let i = 0; i < 240; i++) { g.update(1 / 60); if (i % 20 === 0 || (P.state === 'foot' && i < 100 && i % 5 === 0)) out.push(`${(i / 60).toFixed(2)} ${P.state} yaw=${P.yaw.toFixed(2)} rootYaw=${P.rig.root.rotation.y.toFixed(2)} footYaw=${g.rig.footYaw.toFixed(2)} carYaw=${v.yaw.toFixed(2)} cam=${g.camera.position.x.toFixed(1)},${g.camera.position.z.toFixed(1)} pl=${P.x.toFixed(1)},${P.z.toFixed(1)}`); }
  return out.join('\n');
}));
await close(); process.exit(0);
