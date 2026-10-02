import { launch } from './harness.mjs';
const { page, close, logs } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, sea = g.world.sea, M = g.maritime, res = {};
  g.traffic.update = () => {}; g.peds.update = () => {};
  g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.time = 14;
  g.update(1 / 30);
  const boat = g.yard.slots.find((s) => s.id === 'sport').v;
  P.exit?.(); P.hidden = false; P.vehicle = null; P.state = 'foot'; P.seq = null;
  boat.place(-1600, 0, 200, -1.5); boat.moor = null; boat.phys.engineOn = true; P.enter(boat);
  g.seaTraffic.pop.density = 0; for (const a of [...g.seaTraffic.pop.agents]) g.seaTraffic.pop.drop(a);
  const rets = [];
  g.on('hud:gain', (e) => rets.push(e.text));
  const radio = []; g.on('marine:radio', (e) => radio.push(e.text));
  for (const type of ['distress', 'overboard', 'debris', 'dolphins', 'cgOp', 'squall']) {
    const nav = g.seaNav, p = nav.random(Math.random, 0, boat.x, boat.z, 120, 220);
    M.spawnEvent(boat, type, p);
    const e = M.events[M.events.length - 1];
    for (let i = 0; i < 60; i++) g.update(1 / 30);
    res[type] = { state: e.state, ents: Object.keys(e.ents), d: Math.round(Math.hypot(e.x - boat.x, e.z - boat.z)) };
    // drive to the event and wait
    boat.place(e.x + 12, 0, e.z, 0); boat.phys.engineOn = true;
    for (let i = 0; i < 30 * 14; i++) { g.update(1 / 30); }
    res[type].after = e.state; res[type].fx = e.type;
    if (type === 'squall') res.squall.sq = g.sky.squall ? [Math.round(g.sky.squall.x), g.sky.squall.k.toFixed(2), g.sky.w.rain.toFixed(2)] : null;
    M.finish?.(e);
  }
  res.rewards = rets; res.radio = radio.length; res.events = M.events.length;
  return res;
});
console.log(JSON.stringify(out, null, 1));
console.log(logs.filter((l) => !/getImageData/.test(l)).slice(0, 10).join('\n') || 'no errors');
await close();
