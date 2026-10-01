import { launch } from './harness.mjs';
const { page, close, logs } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle && window.__app?.mode === 'play', null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const app = window.__app, g = window.__game, P = g.player, M = app.missions;
  const { MISSION_BY_ID } = await import('/src/data/missions.js');
  app.store.profile.level = 60; M.say = async () => {};
  g.traffic.update = () => {}; g.peds.update = () => {};
  app.fastTravel = async (x, z, yaw) => { const v = app.hero; v.place(x, g.world.groundY(x, z, 80), z, yaw); };
  const frame = (n = 1) => { for (let i = 0; i < n; i++) { g.update(1 / 60); M.update(1 / 60); } };
  const tp = (x, z, yaw = 0) => { const v = P.vehicle || app.hero; v.place(x, g.world.groundY(x, z, 80), z, yaw); v.phys.vx = v.phys.vz = 0; };
  const id = 'm06', p = app.store.profile;
  for (const r of (MISSION_BY_ID[id]?.requires || [])) p.missions.done[r] = 1;
  const ok = await app.startMission(id);
  if (!P.vehicle) P.enter(app.hero);
  const log = [`start ${ok}`];
  for (let i = 0; i < 400 && M.run; i++) {
    const st = M.run.step;
    if (!st) { frame(2); continue; }
    const name = st.constructor.name;
    if (name === 'Tail') {
      const c = st.car;
      tp(c.x - 30, c.z - 30); frame(20);
      if (i % 20 === 0) log.push(`i${i} car ${c.x.toFixed(0)},${c.z.toFixed(0)} sp ${c.speed.toFixed(1)} idx ${st.i}/${st.s.route.length} arrived ${st.ai.arrived} path ${st.ai.path?.length} stuckT ${st.stuckT?.toFixed?.(1)} fail ${st.fail} lost ${st.lost.toFixed(1)} close ${st.close.toFixed(1)} dist ${Math.hypot(P.vehicle.x - c.x, P.vehicle.z - c.z).toFixed(0)}`);
    } else if (name === 'Goto') { tp(st.pt.x, st.pt.z); frame(40); } else frame(10);
  }
  return log.join('\n');
});
console.log(out);
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
