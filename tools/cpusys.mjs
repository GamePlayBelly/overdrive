import { launch } from './harness.mjs';
// Average CPU milliseconds per system in Game.update at a spot (no rendering).
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const spots = JSON.parse(process.env.SPOTS || '[[-271.5,230,3.14],[-800,-100,1.57],[420,60,1.57],[-200,2470,0]]');
for (const [x, z, yaw] of spots) {
  const out = await page.evaluate(({ x, z, yaw }) => {
    window.__pauseLoop = true;
    const g = window.__game, v = g.player.vehicle;
    v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind();
    v.input.throttle = 0.6;
    const acc = {};
    const wrap = (obj, name, label) => { if (!obj || obj['__w_' + name]) return; const f = obj[name].bind(obj); obj['__w_' + name] = true; obj[name] = (...a) => { const t = performance.now(); const r = f(...a); acc[label] = (acc[label] || 0) + performance.now() - t; return r; }; };
    wrap(g.traffic, 'update', 'traffic'); wrap(g.peds, 'update', 'peds'); wrap(g.police, 'update', 'police'); wrap(g.crimes, 'update', 'crimes'); wrap(g.heat, 'update', 'heat');
    wrap(g.radio, 'update', 'radio'); wrap(g.seaTraffic, 'update', 'seaTraffic'); wrap(g.sky, 'update', 'sky'); wrap(g.world, 'update', 'world'); wrap(g.fx, 'update', 'fx');
    wrap(g.yard, 'update', 'yard'); wrap(g.grass, 'update', 'grass'); wrap(g.wake, 'update', 'wake'); wrap(g.audio, 'update', 'audio'); wrap(g.player, 'update', 'player'); wrap(g.rig, 'update', 'rig');
    for (const veh of g.vehicles) wrap(veh, 'update', 'vehicles');
    wrap(g.view, 'update', 'view'); wrap(g.contact, 'begin', 'contact');
    const N = 120;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    for (const k in acc) acc[k] = 0;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) g.update(1 / 60);
    const total = (performance.now() - t0) / N;
    const res = { total: +total.toFixed(2) };
    for (const k in acc) res[k] = +(acc[k] / N).toFixed(2);
    res.other = +(total - Object.values(acc).reduce((a, b) => a + b, 0) / N).toFixed(2);
    return res;
  }, { x, z, yaw });
  console.log(JSON.stringify({ at: [x, z], ...out }));
}
await close(); process.exit(0);
