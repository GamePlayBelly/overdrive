import { launch } from './harness.mjs';
import fs from 'node:fs';
const { page, close, logs } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
fs.mkdirSync('data/shots', { recursive: true });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, pop = g.seaTraffic.pop;
  g.traffic.update = () => {}; g.peds.update = () => {};
  g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.time = 14;
  const boat = g.yard.slots.find((s) => s.id === 'sport').v;
  P.exit?.(); P.hidden = false; P.vehicle = null; P.state = 'foot'; P.seq = null;
  boat.place(-1500, 0, 100, -1.5); boat.moor = null; P.enter(boat);
  const log = {};
  const nav = pop.nav;
  log.nav = { w: nav.w, h: nav.h, ok: nav.ok.reduce((a, b) => a + b, 0), comps: nav.sizes.length - 1, big: nav.sizes[nav.big] };
  const acq = []; const orig = pop.acquire.bind(pop);
  pop.acquire = (a) => { const F = g.player.vehicle || g.player; acq.push(Math.round(Math.hypot(a.x - F.x, a.z - F.z))); return orig(a); };
  const spawned = []; const os = pop.spawn.bind(pop);
  pop.spawn = (...r) => { const F = g.player.vehicle || g.player; if (pop.ready) spawned.push(Math.round(Math.hypot(r[1] - F.x, r[2] - F.z))); return os(...r); };
  let tmax = 0, tsum = 0, n = 0;
  boat.phys.engineOn = true; g.input.down.add('KeyW');
  for (let i = 0; i < 60 * 150; i++) {
    const t0 = performance.now(); g.update(1 / 30); const dt = performance.now() - t0;
    if (i % 30 === 0 && i > 0) { tsum += dt; n++; }
    tmax = Math.max(tmax, dt);
    if (i === 600) g.input.down.delete('KeyW');
  }
  const t0 = performance.now(); for (let i = 0; i < 100; i++) pop.update(1 / 60); log.popMs = +((performance.now() - t0) / 100).toFixed(3);
  const st = {}; for (const a of pop.agents) st[a.state + (a.v ? '+real' : '')] = (st[a.state + (a.v ? '+real' : '')] || 0) + 1;
  log.agents = pop.agents.length; log.states = st; log.acquireDist = acq.slice(0, 20); log.spawnDist = spawned.slice(0, 20);
  log.proxy = { hull: pop.proxy.hull.count, rig: pop.proxy.rig.count }; log.real = g.vehicles.filter((v) => v.npcBoat).length;
  { const F = g.player.vehicle; log.pos = [Math.round(F.x), Math.round(F.z)]; log.near = pop.agents.map((a) => [Math.round(Math.hypot(a.x - F.x, a.z - F.z)), a.kind, a.state, !!a.v]).sort((p, q) => p[0] - q[0]).slice(0, 10); }
  g.player.vehicle.phys.yaw = 1.2; g.input.down.delete('KeyW'); g.rig.snapBehind?.(); g.rig.mode = 'far'; for (let i = 0; i < 90; i++) g.update(1 / 60);
  { const vs = g.view.sphere; g.view.sphere = () => true; pop.update(1 / 60); log.proxyAll = { hull: pop.proxy.hull.count, rig: pop.proxy.rig.count }; g.view.sphere = vs; pop.update(1 / 60); log.proxyView = pop.proxy.hull.count; }
  g.update(1 / 60); g.render(1 / 60);
  log.shot = g.canvas.toDataURL('image/jpeg', 0.85);
  return log;
});
fs.writeFileSync('data/shots/traffic.jpg', Buffer.from(out.shot.split(',')[1], 'base64')); delete out.shot;
console.log(JSON.stringify(out));
console.log(logs.filter((l) => !/getImageData/.test(l)).slice(0, 10).join('\n') || 'no errors');
await close();
