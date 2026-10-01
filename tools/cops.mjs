import { launch } from './harness.mjs';
const { page, close, logs } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
console.log(JSON.stringify(await page.evaluate(() => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, out = {};
  const v = P.vehicle; v.place(-271, g.world.groundY(-271, 230, 60), 230, 3.14);
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  g.police.raise(2, 'test'); g.police.markSeen?.();
  let t = 0, first = null;
  for (let i = 0; i < 60 * 40; i++) { g.update(1 / 60); t += 1 / 60; if (!first && g.police.units.length) { first = t; out.firstUnitDist = Math.hypot(g.police.units[0].v.x - v.x, g.police.units[0].v.z - v.z); } }
  out.firstUnitAt = first && +first.toFixed(1); out.units = g.police.units.length; out.level = g.police.level;
  return out;
})));
await close(); process.exit(0);
