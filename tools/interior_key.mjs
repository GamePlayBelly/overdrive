import { launch, sleep } from './harness.mjs';
const { page, close, logs } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const found = await page.evaluate(() => {
  const a = window.__app, g = window.__game, P = g.player;
  g.sky.timeScale = 0; g.sky.time = 12;
  P.exit?.(); P.vehicle = null; P.seq = null; P.state = 'foot';
  const houses = g.world.colliders.list ? g.world.colliders.list.filter((c) => c.kind === 'building' && c.ref === 'house') : [];
  let best = null; for (const c of houses) { const d = Math.hypot(c.x - 575, c.z + 224); if (!best || d < best.d) best = { c, d }; }
  if (!best) return { n: houses.length };
  const c = best.c, lz = c.hz + 1.2, px = c.x - lz * c.sin, pz = c.z + lz * c.cos;
  P.x = px; P.z = pz; P.y = g.world.groundY(px, pz, 60); P.yaw = Math.atan2(c.x - px, c.z - pz); g.rig.footYaw = P.yaw;
  return { n: houses.length, at: [Math.round(px), Math.round(pz)] };
});
console.log('house', JSON.stringify(found));
await sleep(800);
console.log('prompt', JSON.stringify(await page.evaluate(() => ({ p: window.__app.interiors.prompt, hud: !document.querySelector('.prompt')?.classList.contains('hide') }))));
await page.keyboard.press('KeyE');
const ins = await page.waitForFunction(() => window.__app.interiors.inside, null, { timeout: 20000 }).then(() => true).catch(() => false);
console.log('entered by key E', ins);
await sleep(1500);
console.log('inside', JSON.stringify(await page.evaluate(() => { const a = window.__app, P = window.__game.player; return { inside: !!a.interiors.inside, type: a.interiors.inside?.type, busy: a.interiors.busy, pos: [Math.round(P.x), Math.round(P.z)], prompt: a.interiors.prompt }; })));
// walk to the door and leave with E
await page.evaluate(() => { const P = window.__game.player; P.x = 6000; P.z = 6000.8; });
await sleep(600);
await page.keyboard.press('KeyE');
const out = await page.waitForFunction(() => !window.__app.interiors.inside, null, { timeout: 6000 }).then(() => true).catch(() => false);
console.log('left by key E', out, JSON.stringify(await page.evaluate(() => { const P = window.__game.player; return [Math.round(P.x), Math.round(P.z)]; })));
console.log(logs.filter((l) => !/getImageData/.test(l)).slice(0, 5).join('\n') || 'no errors');
await close();
