import { launch } from './harness.mjs';
const WX = process.env.WX || 'sunny'; const BOAT = process.env.BOAT || 'sport';
const { page, close, logs } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async ({ WX, BOAT }) => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, I = g.input, sea = g.world.sea, pol = g.police, res = { log: [] }; window.__boat = BOAT;
  g.traffic.update = () => {}; g.peds.update = () => {};
  g.sky.timeScale = 0; g.sky.lockWeather = WX; g.sky.setWeather(WX, true); g.sky.time = 14;
  g.update(1 / 30); sea.waves.settle(1.6 + g.sky.w.wind * 11.5, g.sky.wind.dir);
  const boat = g.yard.slots.find((s) => s.id === (window.__boat || 'sport')).v;
  P.exit?.(); P.hidden = false; P.vehicle = null; P.state = 'foot'; P.seq = null;
  boat.place(-1600, 0, 200, -1.5); boat.moor = null; boat.phys.engineOn = true; P.enter(boat);
  res.ports = g.seaTraffic.pop.ports.map((p) => [Math.round(p.x), Math.round(p.z)]);
  for (let i = 0; i < 60; i++) g.update(1 / 30);
  const LVL = +(window.__lvl || 3);
  pol.raise(LVL, 'boatTheft'); pol.markSeen();
  I.down.add('KeyW');
  let maxUnits = 0, firstSeenLoss = null;
  const row = (t) => `t=${t} lvl=${pol.level} seen=${pol.seen} esc=${pol.escape.toFixed(2)} bust=${pol.bust.toFixed(2)} spd=${boat.phys.speed.toFixed(1)} units=` + pol.cg.units.map((u) => u.state[0] + u.role[0] + Math.round(Math.hypot(u.v.x - boat.x, u.v.z - boat.z)) + (u.v.def.id === 'cgfast' ? 'F' : u.v.def.id === 'cgcutter' ? 'C' : 'P')).join(',');
  for (let i = 0; i < 30 * 150; i++) {
    // steer gently in an arc so the pursuers have to lead
    I.down.delete('KeyA'); I.down.delete('KeyD'); const ph = Math.floor(i / 120) % 4; if (ph === 1) I.down.add('KeyA'); if (ph === 3) I.down.add('KeyD');
    g.update(1 / 30);
    maxUnits = Math.max(maxUnits, pol.cg.units.length);
    if (i % 150 === 0) { res.log.push(row(Math.round(i / 30))); for (const u of pol.cg.units) res.log.push('   ' + u.v.def.id + ' spd=' + u.v.phys.speed.toFixed(1) + ' mode=' + u.ai.mode + ' pi=' + u.ai.pi + '/' + (u.ai.path ? u.ai.path.length : '-') + ' arr=' + u.ai.arrived + ' max=' + u.ai.maxSpeed.toFixed(1) + ' thr=' + u.v.input.throttle.toFixed(2) + ' ph=' + u.phase + ' ground=' + u.v.phys.aground + ' pos=' + Math.round(u.v.x) + ',' + Math.round(u.v.z)); }
    if (pol.bust >= 1 || pol.level === 0) { res.log.push('END ' + row(Math.round(i / 30))); break; }
  }
  res.maxUnits = maxUnits; res.stats = pol.stats;
  return res;
}, { WX, BOAT });
console.log(out.ports.join(' '));
console.log(out.log.join('\n'));
console.log(out.maxUnits, JSON.stringify(out.stats));
console.log(logs.filter((l) => !/getImageData/.test(l)).slice(0, 10).join('\n') || 'no errors');
await close();
