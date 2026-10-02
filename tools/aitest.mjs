import { launch } from './harness.mjs';
const { page, close, logs } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, pop = g.seaTraffic.pop, res = {};
  g.traffic.update = () => {}; g.peds.update = () => {};
  g.sky.timeScale = 0; g.sky.lockWeather = 'cloudy'; g.sky.setWeather('cloudy', true);
  const boat = g.yard.slots.find((s) => s.id === 'sport').v;
  P.exit?.(); P.hidden = false; P.vehicle = null; P.state = 'foot'; P.seq = null;
  boat.place(-1420, 0, 380, 0); boat.moor = null; P.enter(boat);
  g.update(1 / 30);
  g.world.sea.waves.settle(1.6 + g.sky.w.wind * 11.5, g.sky.wind.dir);
  pop.density = 0;
  for (const a of [...pop.agents]) pop.drop(a);
  // head-on
  const A = pop.spawn('rib', -1550, 300, Math.PI / 2, true), B = pop.spawn('rib', -1250, 300, -Math.PI / 2, true);
  A.state = 'cruise'; A.path = [{ x: -1250, z: 300 }]; A.pi = 0; B.state = 'cruise'; B.path = [{ x: -1550, z: 300 }]; B.pi = 0;
  let minD = 1e9, ground = 0;
  for (let i = 0; i < 60 * 45; i++) {
    g.update(1 / 30);
    if (A.v && B.v) { minD = Math.min(minD, Math.hypot(A.v.x - B.v.x, A.v.z - B.v.z)); if (A.v.phys.aground || B.v.phys.aground) ground++; }
  }
  res.headOn = { minD: +minD.toFixed(1), realA: !!A.v, realB: !!B.v, ground, posA: A.v ? [Math.round(A.v.x), Math.round(A.v.z)] : null, arrivedA: A.state, arrivedB: B.state };
  pop.drop(A); pop.drop(B);
  // upwind sailing
  const wd = g.sky.wind, from = Math.atan2(-wd.x, -wd.z);
  const S = pop.spawn('sloop', -1500, 300, from, true), gx = -1500 + Math.sin(from) * 700, gz = 300 + Math.cos(from) * 700;
  S.state = 'cruise'; S.path = [{ x: gx, z: gz }]; S.pi = 0;
  let tacks = 0, last = 0, d0 = Math.hypot(gx + 1500, gz - 300), minTrav = 0, maxHeel = 0, spdSum = 0, n = 0;
  for (let i = 0; i < 60 * 120; i++) {
    g.update(1 / 30);
    if (S.v) { const p = S.v.phys, s = Math.sign(p.awa); if (s && last && s !== last) tacks++; if (s) last = s; maxHeel = Math.max(maxHeel, Math.abs(p.roll)); if (i % 30 === 0) { spdSum += p.speed; n++; } }
  }
  res.upwind = { d0: Math.round(d0), dEnd: S.v ? Math.round(Math.hypot(gx - S.v.x, gz - S.v.z)) : null, tacks, heel: +maxHeel.toFixed(2), avgSpd: +(spdSum / Math.max(1, n)).toFixed(2), U: +g.sky.wind.speed.toFixed(1) };
  return res;
});
console.log(JSON.stringify(out));
console.log(logs.filter((l) => !/getImageData/.test(l)).slice(0, 10).join('\n') || 'no errors');
await close();
