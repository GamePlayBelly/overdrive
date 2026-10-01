import { launch, shot, sleep } from './harness.mjs';
// Car meet: opens in the evening, spawns show cars and owners, judges the parked player car and pays once per day.
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const a = window.__app, g = window.__game, P = g.player, M = a.meet, out = {};
  g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  const v = P.vehicle, poi = g.world.poi.meet;
  g.sky.time = 11;
  v.place(380, g.world.groundY(380, 247, 50), 247, Math.PI / 2);
  for (let i = 0; i < 30; i++) { g.update(1 / 60); a.meet.update(1 / 60); }
  out.dayState = M.state;
  g.sky.time = 20.2; g.sky.timeScale = 0;
  for (let i = 0; i < 30; i++) { g.update(1 / 60); M.update(1 / 60); g.traffic.parkT = 0; g.traffic.updateParked(v.pos, 1); }
  out.state = M.state; out.parkedCars = g.traffic.parkedActive.filter((c) => c.parkedRef.showcar).length; out.cars = M.cars.map((c) => c.def.id); out.peds = M.peds.length; out.center = M.C;
  v.place(410, g.world.groundY(410, 247, 50), 247, Math.PI / 2);
  g.rig.snapBehind();
  for (let i = 0; i < 90; i++) { g.update(1 / 60); M.update(1 / 60); a.hud.update(1 / 60); g.traffic.parkT = 0; g.traffic.updateParked(v.pos, 1); }
  g.render(1 / 60);
  out.shot1 = g.canvas.toDataURL('image/png');
  out.poiOk = !!poi.lot;
  v.place(M.C.x, g.world.groundY(M.C.x, M.C.z, 50), M.C.z, Math.PI / 2);
  v.phys.vx = v.phys.vz = 0;
  for (let i = 0; i < 120; i++) { g.update(1 / 60); M.update(1 / 60); }
  out.afterPark = M.state;
  const p0 = a.profile, m0 = p0.money, votes0 = p0.stats.meetVotes;
  for (let i = 0; i < 60 * 16; i++) { g.update(1 / 60); M.update(1 / 60); if (i === 60 * 6) { g.rig.mode = 'far'; } }
  out.state2 = M.state; out.votes = M.votes; out.moneyGain = p0.money - m0; out.meetVotes = p0.stats.meetVotes - votes0; out.day = p0.meet.day;
  g.render(1 / 60);
  out.shot2 = g.canvas.toDataURL('image/png');
  // second attempt the same day pays nothing
  M.state = 'open'; M.leave = false; M.hold = 2;
  M.startJudging(v);
  for (let i = 0; i < 60 * 16; i++) { g.update(1 / 60); M.update(1 / 60); }
  out.secondGain = p0.money - m0 - out.moneyGain;
  M.teardown();
  out.afterTeardown = { state: M.state, cars: M.cars.length };
  return out;
});
import fs from 'node:fs';
fs.mkdirSync('data/shots', { recursive: true });
for (const k of ['shot1', 'shot2']) { fs.writeFileSync(`data/shots/meet_${k}.png`, Buffer.from(out[k].split(',')[1], 'base64')); delete out[k]; }
console.log(JSON.stringify(out, null, 1));
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 8).join('\n') || 'none');
await close(); process.exit(0);
