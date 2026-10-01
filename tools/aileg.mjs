import { launch } from './harness.mjs';
// Drives an AI rival along each leg of the new league races and reports arrival, time, damage and where it stalls.
const IDS = (process.env.IDS || 'lg_g2,lg_p2,lg_e2').split(',');
const MODEL = process.env.MODEL || 'arc';
const { page, close, logs } = await launch({ width: 800, height: 450 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
for (const id of IDS) {
  const r = await page.evaluate(async ({ id, MODEL }) => {
    const g = window.__game, R = g.world.roads, { AIDriver } = await import('/src/vehicles/aiDriver.js');
    window.__pauseLoop = true;
    g.traffic.update = () => {}; g.peds.update = () => {}; g.police.update = () => {};
    g.sky.time = 12; g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
    const { LEAGUE } = await import('/src/data/meta.js');
    let race; for (const t of LEAGUE) for (const q of t.races) if (q.id === id) race = q;
    const out = [];
    for (let i = 0; i < race.pts.length - 1; i++) {
      const a = race.pts[i], b = race.pts[i + 1];
      const na = R.nearestNode(a[0], a[1]), nb = R.nearestNode(b[0], b[1]);
      const path = R.route(na.id, nb.id);
      if (!path) { out.push({ leg: i, error: 'no route' }); continue; }
      const pp = R.routePoints(path, 3.1);
      const y0 = g.world.groundY(pp[1].x, pp[1].z, 400);
      const v = g.spawnVehicle(MODEL, pp[1].x, pp[1].z, Math.atan2(pp[6].x - pp[1].x, pp[6].z - pp[1].z), { color: '#cc2222' }, { yRef: y0 + 3, assist: 0.9 });
      v.input = { throttle: 0, brake: 0, steer: 0, hand: false };
      const ai = new AIDriver(g, v, { maxSpeed: 44, aggr: 0.5, skill: 0.8 });
      ai.routeTo(b[0], b[1], false);
      let t = 0, stall = 0, maxStall = 0, stallAt = null, dist = 0, lx = v.x, lz = v.z;
      while (t < 260) {
        ai.update(1 / 60); g.update(1 / 60); t += 1 / 60;
        dist += Math.hypot(v.x - lx, v.z - lz); lx = v.x; lz = v.z;
        if (v.speed < 1) stall += 1 / 60; else stall = 0;
        if (stall > maxStall) { maxStall = stall; stallAt = [Math.round(v.x), Math.round(v.z), +v.y.toFixed(1)]; }
        if (Math.hypot(v.x - b[0], v.z - b[1]) < 20) break;
      }
      const arrived = Math.hypot(v.x - b[0], v.z - b[1]) < 20;
      out.push({ leg: i, arrived, t: Math.round(t), dist: Math.round(dist), avg: +(dist / t).toFixed(1), dmg: +v.damage.total.toFixed(2), maxStall: +maxStall.toFixed(1), stallAt, end: [Math.round(v.x), Math.round(v.z)] });
      g.removeVehicle(v);
    }
    return out;
  }, { id, MODEL });
  console.log(id); for (const l of r) console.log(' ', JSON.stringify(l));
}
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
