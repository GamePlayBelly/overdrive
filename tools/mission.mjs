import { launch } from './harness.mjs';
const IDS = (process.env.IDS || 'm01,m02,m03,m04').split(',');
const { page, close, logs } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle && window.__app?.mode === 'play', null, { timeout: 240000 });
const out = await page.evaluate(async (ids) => {
  window.__pauseLoop = true;
  const app = window.__app, g = window.__game, P = g.player, M = app.missions;
  const log = [];
  const { MISSION_BY_ID } = await import('/src/data/missions.js');
  app.store.profile.level = 60;
  M.say = async () => {};
  g.traffic.update = () => {}; g.peds.update = () => {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  app.fastTravel = async (x, z, yaw) => { const v = app.hero; v.place(x, g.world.groundY(x, z, 80), z, yaw); };
  const origFail = M.fail.bind(M); M.fail = (r) => { log.push('  FAIL: ' + r + ' at ' + (M.run?.step?.car ? Math.round(M.run.step.car.x) + ',' + Math.round(M.run.step.car.z) : '')); return origFail(r); };
  const frame = (n = 1) => { for (let i = 0; i < n; i++) { g.update(1 / 60); M.update(1 / 60); } };
  const tp = (x, z, yaw = 0) => { const v = P.vehicle || app.hero; v.place(x, g.world.groundY(x, z, 80), z, yaw); v.phys.vx = v.phys.vz = 0; };
  for (const id of ids) {
    const p = app.store.profile;
    for (const r of (MISSION_BY_ID[id]?.requires || [])) p.missions.done[r] = 1;
    const ok = await app.startMission(id);
    log.push(`${id}: start ${ok}`);
    if (!M.run) { log.push('  no run'); continue; }
    if (!P.vehicle) P.enter(app.hero);
    let guard = 0, last = '';
    while (M.run && guard++ < 6000) {
      const R = M.run, st = R.step;
      if (!st) { frame(2); await sleep(4); continue; }
      const name = st.constructor.name;
      if (name !== last) { log.push(`  step ${R.idx}: ${name} "${st.text}"`); last = name; console.log(`step ${R.idx}: ${name}`); }
      const v = P.vehicle || app.hero;
      switch (name) {
        case 'Onfoot': if (P.vehicle) P.exit(); P.place(st.pt.x, st.pt.z, 0); frame(20); break;
        case 'Goto': case 'Deliver': if (!P.vehicle) { app.hero.place(P.x + 3, g.world.groundY(P.x + 3, P.z, 80), P.z, 0); P.enter(app.hero); } tp(st.pt.x, st.pt.z); frame(40); break;
        case 'Pickup': v.phys.vx = v.phys.vz = 0; frame(30); break;
        case 'Checkpoints': {
          if (st.phase === 'wait' || st.phase === 'count') { frame(30); break; }
          const pt = st.pts[st.idx]; const prev = { x: v.x, z: v.z }; tp(pt.x, pt.z); frame(2); break;
        }
        case 'Escape': frame(120); g.police.clear('escape'); frame(10); break;
        case 'Recover': P.enter(st.car); frame(3); break;
        case 'Tail': { const c = st.car; tp(c.x - 30, c.z - 30); frame(20); break; }
        case 'Escort': { const c = st.car; tp(c.x - 20, c.z - 20); frame(20); break; }
        case 'Stunt': v.phys.drift.score += 6000; g.emit('vehicle:landing', { v, air: 3, speed: 5, x: v.x, y: v.y, z: v.z }); frame(5); break;
        case 'Photo': st.targets.forEach((t) => (t.shot = true)); frame(5); break;
        case 'Ram': { const c = st.car; tp(c.x - 10, c.z - 10); c.damage.total = 0.95; frame(5); break; }
        default: frame(10);
      }
    }
    if (M.run?.step) { const st = M.run.step, w = st.who(); log.push(`  stuck: ${st.constructor.name} pt ${JSON.stringify(st.pt)} who ${w.x.toFixed(1)},${w.z.toFixed(1)} speed ${w.speed.toFixed(2)} hold ${st.hold} r ${st.r} phase ${M.run.phase} fail ${st.fail} done ${st.done}`); }
    log.push(`  done=${!!p.missions.done[id]} guard=${guard} active=${!!M.run} level ${p.level} money ${p.money}`);
    p.missions.done[id] = p.missions.done[id] || 0;
  }
  return log.join('\n');
}, IDS);
console.log(out);
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 10).join('\n') || 'none');
await close(); process.exit(0);
