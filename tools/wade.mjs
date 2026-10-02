import { launch } from './harness.mjs';
const { page, close, logs } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, I = g.input, T = g.world.terrain, res = [];
  g.traffic.update = () => {}; g.peds.update = () => {};
  g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  P.exit?.(); P.hidden = false; P.vehicle = null; P.seq = null;
  // find a shore: walk west from x=-900 until the ground drops below water
  let sx = -900, z = 300; while (T.height(sx, z) > -1.9 && sx > -1400) sx -= 2;
  P.state = 'foot'; P.x = sx + 14; P.z = z; P.y = g.world.groundY(P.x, P.z, 20); P.yaw = -1.57; g.rig.footYaw = -1.57;
  let wades = 0; g.on('player:wade', () => wades++);
  I.down.add('KeyW');
  for (let i = 0; i < 30 * 16; i++) { g.update(1 / 30); if (i % 30 === 0) res.push(`t=${i / 30} st=${P.state} x=${P.x.toFixed(1)} y=${P.y.toFixed(2)} bed=${T.height(P.x, P.z).toFixed(2)} spd=${P.speed.toFixed(2)} wade=${(P.wade || 0).toFixed(2)}`); }
  res.push('wade events ' + wades);
  I.down.delete('KeyW'); I.down.add('KeyS'); I.down.add('KeyW'); I.down.delete('KeyW');
  return res;
});
console.log(out.join('\n'));
console.log(logs.filter((l) => !/getImageData/.test(l)).slice(0, 5).join('\n') || 'no errors');
await close();
