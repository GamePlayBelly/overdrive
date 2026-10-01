import { launch } from './harness.mjs';
// For each target, finds the nearest flat dry spot that is 6-45 m from a road (so items can be reached by car or on foot).
const T = JSON.parse(process.env.T || '{"key06":[430,-770]}');
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate((T) => {
  const W = window.__game.world, R = W.roads, Te = W.terrain, out = {};
  const slope = (x, z, h) => { let s = 0; for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) s = Math.max(s, Math.abs(Te.height(x + dx, z + dz) - h) / 3); return s; };
  for (const [id, [x0, z0]] of Object.entries(T)) {
    let best = null;
    for (let rad = 0; rad <= 90; rad += 3) for (let a = 0; a < (rad ? 24 : 1); a++) {
      const th = (a / 24) * Math.PI * 2, x = x0 + Math.cos(th) * rad, z = z0 + Math.sin(th) * rad;
      const g = W.ground(x, z, 400), h = Te.height(x, z);
      if (h < 1.2 || g.surf === 6 || g.surf === 2 || g.surf === 1) continue;
      const e = R.nearest(x, z, g.y, 60);
      if (!e || e.d < 6 || e.d > 45) continue;
      if (Math.abs(g.y - e.y) > 3) continue;
      const sl = slope(x, z, h);
      if (sl > 0.13) continue;
      const score = rad + sl * 40;
      if (!best || score < best.score) best = { score, x: Math.round(x), z: Math.round(z), y: +g.y.toFixed(1), d: Math.round(e.d), sl: +sl.toFixed(2), road: e.e?.name };
    }
    out[id] = best;
  }
  return out;
}, T);
for (const [k, v] of Object.entries(r)) console.log(k, JSON.stringify(v));
await close(); process.exit(0);
