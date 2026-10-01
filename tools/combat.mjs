import { launch, shot, sleep } from './harness.mjs';
const { page, close, logs } = await launch({ width: 1000, height: 560 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, a = window.__app, o = {};
  g.sky.time = 11; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  g.traffic.update = () => {};
  P.exit(); const x = P.x, z = P.z; g.rig.footYaw = 0;
  const p = g.peds.spawnStatic(x, z + 1.3, Math.PI, 'office'); p.stay = false; p.state = 'idle'; p.idleT = 99;
  for (let i = 0; i < 5; i++) { for (let k = 0; k < 15; k++) g.update(1 / 60); g.input.mouse.clicked = true; g.update(1 / 60); for (let k = 0; k < 25; k++) g.update(1 / 60); }
  o.state = p.state; o.hp = p.hp; o.wanted = g.police.level; o.pts = g.fx.pt.n;
  g.render(1 / 60); o.img = g.canvas.toDataURL('image/png');
  return o;
});
import fs from 'node:fs'; fs.writeFileSync('data/shots/combat.png', Buffer.from(out.img.split(',')[1], 'base64')); delete out.img;
console.log(out, logs.filter((l) => !/getImageData/.test(l)).slice(0, 4));
await close(); process.exit(0);
