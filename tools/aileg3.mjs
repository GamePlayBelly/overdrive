import { launch } from './harness.mjs';
// One AI rival drives a whole league race back to back (re-routing at each checkpoint like the race does); logs stalls.
const IDS = (process.env.IDS || 'lg_g2,lg_p2,lg_e2').split(',');
const TR = (process.env.TRACE || '').split(',').map(Number);
const REC = process.env.REC !== '0';
const MODEL = process.env.MODEL || 'arc', SK = Number(process.env.SK || 0.8), CAP = Number(process.env.CAP || 700);
const { page, close, logs } = await launch({ width: 800, height: 450 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
for (const id of IDS) {
  const r = await page.evaluate(async ({ id, MODEL, SK, CAP, TR, REC }) => {
    const g = window.__game, R = g.world.roads, { AIDriver } = await import('/src/vehicles/aiDriver.js');
    window.__pauseLoop = true;
    g.traffic.update = () => {}; g.peds.update = () => {}; g.police.update = () => {};
    g.sky.time = 12; g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
    const { LEAGUE } = await import('/src/data/meta.js');
    let race; for (const t of LEAGUE) for (const q of t.races) if (q.id === id) race = q;
    const P = race.pts;
    const na = R.nearestNode(P[0][0], P[0][1]), nb = R.nearestNode(P[1][0], P[1][1]);
    const rt = na.id !== nb.id ? R.route(na.id, nb.id) : null;
    let pp = rt ? R.routePoints(rt, 3.1) : [];
    if (pp.length < 10) pp = Array.from({ length: 10 }, (_, k) => ({ x: P[0][0] + (P[1][0] - P[0][0]) * k * 0.01, z: P[0][1] + (P[1][1] - P[0][1]) * k * 0.01 }));
    const yaw = Math.atan2(pp[8].x - pp[2].x, pp[8].z - pp[2].z);
    const v = g.spawnVehicle(MODEL, pp[2].x, pp[2].z, yaw, { color: '#cc2222' }, { yRef: g.world.groundY(pp[2].x, pp[2].z, 400) + 3, assist: 0.9 });
    v.input = { throttle: 0, brake: 0, steer: 0, hand: false };
    v.phys.vx = Math.sin(yaw) * 14; v.phys.vz = Math.cos(yaw) * 14;
    const ai = new AIDriver(g, v, { maxSpeed: 22 + SK * 28, aggr: 0.5, skill: SK, recover: REC });
    let idx = 1; ai.routeTo(P[1][0], P[1][1], false, P[2] ? { x: P[2][0], z: P[2][1] } : null);
    const rows = []; let nxt = 0; let t = 0, stall = 0, stalls = [], legT = [], lastLeg = 0, offMax = 0;
    while (t < CAP && idx < P.length) {
      ai.update(1 / 60); g.update(1 / 60); t += 1 / 60;
      if (TR.length > 1 && t >= TR[0] && t <= TR[1] && t >= nxt) { nxt = t + 1; rows.push([Math.round(t), Math.round(v.x), Math.round(v.z), +v.y.toFixed(1), +v.speed.toFixed(1), +v.input.steer.toFixed(2), +v.input.throttle.toFixed(1), +v.input.brake.toFixed(1), ai.pi + '/' + ai.path.length, +ai.cornerSpeed().toFixed(1)].join(' ')); }
      if (v.speed < 1.2) stall += 1 / 60; else { if (stall > 4) stalls.push([Math.round(t), +stall.toFixed(1), Math.round(v.x), Math.round(v.z), +v.y.toFixed(1)]); stall = 0; }
      if (Math.hypot(v.x - P[idx][0], v.z - P[idx][1]) < 20) { legT.push(Math.round(t - lastLeg)); lastLeg = t; idx++; if (idx < P.length) ai.routeTo(P[idx][0], P[idx][1], false, P[idx + 1] ? { x: P[idx + 1][0], z: P[idx + 1][1] } : null); }
    }
    return { rows, done: idx >= P.length, t: Math.round(t), legT, stalls, dmg: +v.damage.total.toFixed(2), at: [Math.round(v.x), Math.round(v.z), +v.y.toFixed(1)] };
  }, { id, MODEL, SK, CAP, TR, REC });
  console.log(id, JSON.stringify({ ...r, rows: undefined })); if (r.rows.length) console.log(r.rows.join('\n'));
}
console.log('logs:', logs.filter((l) => !/getImageData|ERR_CONNECTION/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
