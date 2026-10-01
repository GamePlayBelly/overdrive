import { launch, sleep } from './harness.mjs';
const ID = process.env.CAR || '';
const SCEN = process.env.SCEN || 'a';
const { page, close } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 180000 });
await sleep(500);
const res = await page.evaluate(({ ID, SCEN }) => {
  const g = window.__game; window.__pauseLoop = true;
  let v = g.player.vehicle;
  if (ID) { const home = g.world.poi.garage; const nv = g.spawnVehicle(ID, home.x + 20, home.z + 20, 0, {}, { hero: true }); g.player.exit(); g.player.enter(nv); v = nv; }
  const p = v.phys;
  g.traffic.update = () => {}; g.peds.update = () => {}; v.collideStatic = () => {};
  const home = g.world.poi.garage;
  const n = g.world.roads.nearestLane(home.x, home.z, 1, 0, null, 200); const pt = n.lane.pl.at(n.s);
  const road = { x: pt.x, z: pt.z, yaw: Math.atan2(pt.dx, pt.dz) };
  const y = g.world.groundY(road.x, road.z, 50); v.place(road.x, y, road.z, road.yaw); v.repair(); p.gear = 3;
  const s = 80 / 3.6; p.vx = Math.sin(p.yaw) * s; p.vz = Math.cos(p.yaw) * s;
  const rows = [];
  const sc = {
    a: (t) => (t < 0.3 ? { throttle: 1, steer: 0.6 } : t < 0.9 ? { throttle: 0.8, steer: 0.35, hand: true } : t < 2.5 ? { throttle: 0.8, steer: 0.0 } : { throttle: 0.4, steer: -0.2 }),
    b: (t) => (t < 0.4 ? { throttle: 1, steer: 0.7 } : t < 0.7 ? { throttle: 1, steer: 0.7, hand: true } : { throttle: 0.9, steer: -0.3 }),
    d: (t) => (t < 0.2 ? { throttle: 1, steer: 1, hand: false } : t < 0.5 ? { throttle: 1, steer: 1, hand: true } : t < 3 ? { throttle: 1, steer: 1 } : t < 4 ? { throttle: 1, steer: 0 } : { throttle: 0.2, steer: 0 }),
    e: (t) => (t < 0.3 ? { throttle: 1, steer: 1, hand: true } : t < 2.5 ? { throttle: 1, steer: -1 } : { throttle: 0.5, steer: 0 }),
    c: (t) => (t < 1 ? { throttle: 1, steer: 0.5 } : { throttle: 1, steer: 0.2 }),
  }[SCEN];
  for (let i = 0; i < 300; i++) {
    const t = i / 60; window.__sim(1 / 60, sc(t));
    if (i % 6 === 0) rows.push([+t.toFixed(1), Math.round(p.kmh), Math.round(Math.atan2(p.lateralSpeed, Math.max(1, p.fwdSpeed)) * 57.3), +p.w.toFixed(2), +p.steer.toFixed(2), +p.handK.toFixed(1), +p.spin.toFixed(1), +p.skidR.toFixed(1), p.gear].join(' '));
  }
  return rows.join('\n');
}, { ID, SCEN });
console.log('t kmh beta w steer hand spin skidR gear');
console.log(res);
await close();
