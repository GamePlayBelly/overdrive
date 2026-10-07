import { launch, shot } from './harness.mjs';
const SCENE = process.env.SCENE || 'storm';
const { page, close, logs } = await launch({ width: 1280, height: 720, query: '?dev=1&hud' });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
await page.evaluate(async (SCENE) => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, I = g.input, sea = g.world.sea, pol = g.police;
  g.traffic.update = () => {}; g.peds.update = () => {};
  g.sky.timeScale = 0; g.sky.time = SCENE === 'night' ? 22.3 : 16;
  const wx = SCENE === 'storm' || SCENE === 'chase' ? 'storm' : SCENE === 'night' ? 'roughSea' : 'sunny';
  g.sky.lockWeather = wx; g.sky.setWeather(wx, true); g.update(1 / 30); sea.waves.settle(1.6 + g.sky.w.wind * 11.5, g.sky.wind.dir);
  const boat = g.yard.slots.find((s) => s.id === 'sport').v;
  P.exit?.(); P.hidden = false; P.vehicle = null; P.state = 'foot'; P.seq = null;
  boat.place(-1600, 0, 200, -1.5); boat.moor = null; boat.phys.engineOn = true; P.enter(boat);
  for (let i = 0; i < 90; i++) g.update(1 / 30);
  if (SCENE === 'chase' || SCENE === 'night') {
    pol.raise(4, 'boatTheft'); pol.markSeen(); I.down.add('KeyW');
    for (let i = 0; i < 30 * 70; i++) { if (i % 90 === 0) pol.markSeen(); g.update(1 / 30); }
    I.down.delete('KeyW');
  }
  if (SCENE === 'dolphins') {
    const p = g.seaNav.random(Math.random, 0, boat.x, boat.z, 60, 90); g.maritime.spawnEvent(boat, 'dolphins', p);
    I.down.add('KeyW'); for (let i = 0; i < 30 * 20; i++) g.update(1 / 30); I.down.delete('KeyW');
  }
  for (let i = 0; i < 20; i++) g.update(1 / 30);
  window.__app.hud.update(0.3); window.__app.hud.update(0.3);
  g.render(1 / 60);
}, SCENE);
console.log(await shot(page, 'final_' + SCENE));
console.log(logs.filter((l) => !/getImageData|X3595/.test(l)).slice(0, 5).join('\n') || 'no errors');
await close(); process.exit(0);
