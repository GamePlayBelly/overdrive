import { launch } from './harness.mjs';
// Traces one AI leg in detail: position, speed, steering and the path point targeted.
const A = JSON.parse(process.env.A || '[-191,-930]'), B = JSON.parse(process.env.B || '[138,-1094]');
const T = Number(process.env.T || 90), EVERY = Number(process.env.EVERY || 2);
const { page, close, logs } = await launch({ width: 800, height: 450 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(async ({ A, B, T, EVERY }) => {
  const g = window.__game, R = g.world.roads, { AIDriver } = await import('/src/vehicles/aiDriver.js');
  window.__pauseLoop = true;
  g.traffic.update = () => {}; g.peds.update = () => {}; g.police.update = () => {};
  const na = R.nearestNode(A[0], A[1]), nb = R.nearestNode(B[0], B[1]);
  const path = R.route(na.id, nb.id);
  const pp = R.routePoints(path, 3.1);
  const y0 = g.world.groundY(pp[1].x, pp[1].z, 400);
  const v = g.spawnVehicle('arc', pp[1].x, pp[1].z, Math.atan2(pp[6].x - pp[1].x, pp[6].z - pp[1].z), { color: '#cc2222' }, { yRef: y0 + 3, assist: 0.9 });
  v.input = { throttle: 0, brake: 0, steer: 0, hand: false };
  const ai = new AIDriver(g, v, { maxSpeed: 44, aggr: 0.5, skill: 0.8 });
  ai.routeTo(B[0], B[1], false);
  const rows = []; let t = 0, nx = 0;
  const head = { yaw: +v.yaw.toFixed(2), start: [Math.round(v.x), Math.round(v.z)], path: ai.path.slice(0, 14).map((q) => Math.round(q.x) + ',' + Math.round(q.z)).join(' '), pp: pp.slice(0, 8).map((q) => Math.round(q.x) + ',' + Math.round(q.z)).join(' ') };
  const edges = path.map((s) => s.edge + (s.dir > 0 ? '+' : '-')).join(' ');
  while (t < T) {
    ai.update(1 / 60); g.update(1 / 60); t += 1 / 60;
    if (t >= nx) { nx += EVERY; rows.push([Math.round(t), Math.round(v.x), Math.round(v.z), +v.y.toFixed(1), +v.speed.toFixed(1), +v.input.steer.toFixed(2), +v.input.throttle.toFixed(1), +v.input.brake.toFixed(1), ai.pi, ai.path.length, +v.damage.total.toFixed(2), ai.reverseT > 0 ? 'REV' : ''].join(' ')); }
  }
  return { edges, pathPts: ai.path.length, rows, head };
}, { A, B, T, EVERY });
console.log(r.edges, r.pathPts, JSON.stringify(r.head)); console.log(r.rows.join('\n'));
console.log('logs:', logs.filter((l) => !/getImageData|ERR_CONNECTION/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
