import { launch, shot, sleep } from './harness.mjs';
import fs from 'node:fs';
// Race creator: place checkpoints in the editor by clicking the map, save, run the custom race with cheats and check rewards and records.
const { page, close, logs } = await launch({ width: 1440, height: 810 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
await page.evaluate(() => { const g = window.__game; g.sky.time = 11; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); window.__app.openMenu('missions'); });
await sleep(800);
await page.evaluate(() => window.__app.menu.go('raceEditor', { force: true }));
await sleep(900);
const box = await page.evaluate(() => { const r = document.querySelector('.map-wrap canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const pts = [[0.3, 0.5], [0.45, 0.45], [0.6, 0.55], [0.7, 0.4], [0.5, 0.3]];
for (const [fx, fy] of pts) { await page.mouse.click(box.x + box.w * fx, box.y + box.h * fy); await sleep(120); }
await sleep(300);
console.log(await shot(page, 'race_editor'));
const info = await page.evaluate(() => { const chips = [...document.querySelectorAll('.map-wrap')].length; return { chips, stats: document.querySelector('.menu-page .row.wrap')?.textContent }; });
console.log(JSON.stringify(info));
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn')].find((x) => /^Save$/.test(x.textContent.trim())); b?.click(); });
await sleep(800);
const saved = await page.evaluate(() => JSON.stringify(window.__app.profile.customRaces.map((r) => ({ id: r.id, n: r.pts.length, pts: r.pts, laps: r.laps, rivals: r.rivals }))));
console.log('saved', saved);
console.log(await shot(page, 'race_list'));
const run = await page.evaluate(async () => {
  const a = window.__app, g = window.__game, p = a.profile, out = {};
  const r = p.customRaces[0];
  a.closeMenu();
  const m0 = p.money, done0 = p.stats.racesDone;
  const started = await a.startCustomRace(r.id);
  out.started = started; out.kind = a.missions.run?.def.kind;
  out.start = a.missions.run?.def.start;
  window.__pauseLoop = true;
  const M = a.missions;
  for (let i = 0; i < 60 * 6; i++) { g.update(1 / 60); M.update(1 / 60); }
  out.phase = M.run?.step?.phase;
  const step = M.run.step;
  const v = g.player.vehicle;
  out.inCar = !!v;
  for (const pt of step.pts.concat(step.pts.slice(0, 0))) { v.place(pt.x, g.world.groundY(pt.x, pt.z, 60), pt.z, 0); v.phys.vx = 3; for (let k = 0; k < 4; k++) { g.update(1 / 60); M.update(1 / 60); } }
  for (let i = 0; i < 120 && M.run; i++) { g.update(1 / 60); M.update(1 / 60); }
  out.after = M.run ? 'still running' : 'finished';
  out.moneyGain = p.money - m0; out.racesDone = p.stats.racesDone - done0; out.record = p.records['c_' + r.id];
  return out;
});
console.log(JSON.stringify(run, null, 1));
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 8).join('\n') || 'none');
await close(); process.exit(0);
