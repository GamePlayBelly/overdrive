import { launch } from './harness.mjs';
// Runs league races on the new routes with the player parked at the start; reports how far each AI rival gets.
const IDS = (process.env.IDS || 'lg_g2,lg_p2,lg_e2').split(',');
const SIM = Number(process.env.SIM || 420);
const { page, close, logs } = await launch({ width: 800, height: 450 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
for (const id of IDS) {
  const r = await page.evaluate(async ({ id, SIM }) => {
    const a = window.__app, g = window.__game, M = a.missions, R = g.world.roads;
    window.__pauseLoop = true;
    g.traffic.update = () => {}; g.peds.update = () => {}; g.police.update = () => {};
    g.sky.time = 12; g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
    a.store.profile.level = 60;
    const { LEAGUE } = await import('/src/data/meta.js');
    let race; for (const t of LEAGUE) for (const q of t.races) if (q.id === id) race = q;
    const pts = race.pts, last = pts[pts.length - 1];
    const path = R.route(R.nearestNode(last[0], last[1]).id, R.nearestNode(pts[0][0], pts[0][1]).id);
    const rp = R.routePoints(path, 3.1), n = rp.length;
    const s = rp[Math.max(0, n - 18)], e = rp[n - 1];
    const v = g.player.vehicle;
    v.place(s.x, g.world.groundY(s.x, s.z, 400), s.z, Math.atan2(e.x - s.x, e.z - s.z)); v.phys.vx = v.phys.vz = 0;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    const ok = await a.startLeagueRace(id);
    if (!ok) return { error: 'not started' };
    const st0 = M.run.step;
    const log = []; let t = 0, lastLog = -99;
    while (M.run && t < SIM) {
      const st = M.run.step;
      v.input.brake = 1; v.input.throttle = 0;
      g.update(1 / 60); M.update(1 / 60); t += 1 / 60;
      if (st && st.rivals && t - lastLog >= 30) { lastLog = t; log.push(Math.round(t) + 's ' + st.rivals.map((q) => `${q.id}:${q.passed}@${Math.round(q.v.speed)}`).join(' ')); }
      if (st && st.rivals && st.rivals.every((q) => q.fin)) break;
    }
    const st = st0;
    return { t: Math.round(t), total: st.pts.length * st.laps, rivals: st.rivals.map((q) => ({ id: q.id, passed: q.passed, fin: q.fin ? Math.round(q.fin) : null, pos: [Math.round(q.v.x), Math.round(q.v.z), +q.v.y.toFixed(1)], dmg: +q.v.damage.total.toFixed(2) })), log };
  }, { id, SIM });
  console.log(id, JSON.stringify(r, null, 1));
  await page.evaluate(() => window.__app.missions.cancel());
}
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
