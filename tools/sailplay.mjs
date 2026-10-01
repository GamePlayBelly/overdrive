import { launch, shot } from './harness.mjs';
// Boards a sailboat through the normal player path, sails for a while with the HUD on and screenshots the result.
const BOAT = process.env.BOAT || 'sloop', SECS = Number(process.env.SECS || 25), W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const KEYS = process.env.KEYS || '';   // e.g. "KeyD:3-6,Space:10-12" (code:from-to seconds)
const { page, close } = await launch({ width: W, height: H });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const res = await page.evaluate(async ({ BOAT, SECS, KEYS }) => {
  window.__pauseLoop = true;
  const app = window.__app, g = window.__game, P = g.player, I = g.input;
  g.sky.time = 11; g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  g.traffic.update = () => {}; g.peds.update = () => {};
  document.getElementById('hud').classList.add('show');
  const x = -120, z = 2640;
  const v = g.spawnVehicle(BOAT, x, z, 0.3, {}, { kind: 'civilian' });
  const old = P.vehicle;
  P.vehicle = null; P.state = 'foot'; P.seq = null; P.hidden = false;
  if (old) old.driver = null;
  P.place(x, 0, z - 3, 0);
  P.enter(v);
  const sched = KEYS ? KEYS.split(',').map((q) => { const [c, r] = q.split(':'), [a, b] = r.split('-').map(Number); return { c, a, b }; }) : [];
  const out = [];
  for (let i = 0; i < SECS * 60; i++) {
    const t = i / 60;
    for (const k of sched) { if (t >= k.a && t < k.b) { I.down.add(k.c); } else I.down.delete(k.c); }
    app.tick(1 / 60, 1 / 60);
    if (i % 120 === 119) { const p = v.phys; out.push(`t${(t + 1 / 60).toFixed(0)} ${(p.speed * 1.944).toFixed(1)}kn heel ${(p.roll * 57.3).toFixed(0)} yaw ${(p.yaw * 57.3).toFixed(0)} tws ${(g.sky.wind.speed).toFixed(1)} awa ${(p.awa * 57.3).toFixed(0)} luff ${p.sailLuff.toFixed(2)} eng ${p.engineOn}`); }
  }
  return { state: P.state, inBoat: P.vehicle === v, out };
}, { BOAT, SECS, KEYS });
console.log(JSON.stringify(res, null, 1));
console.log(await shot(page, process.env.NAME || 'sailplay'));
await close(); process.exit(0);
