import { launch, sleep } from './harness.mjs';
const ID = process.env.CAR || '';
const { page, close } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 180000 });
await sleep(500);
const res = await page.evaluate((ID) => {
  const g = window.__game; window.__pauseLoop = true;
  let v = g.player.vehicle;
  if (ID) { const home = g.world.poi.garage; const nv = g.spawnVehicle(ID, home.x + 20, home.z + 20, 0, {}, { hero: true }); g.player.exit(); g.player.enter(nv); v = nv; }
  const p = v.phys;
  g.traffic.update = () => {}; g.peds.update = () => {}; v.collideStatic = () => {};
  const out = {};
  const home = g.world.poi.garage;
  const n = g.world.roads.nearestLane(home.x, home.z, 1, 0, null, 200); const pt = n.lane.pl.at(n.s);
  const road = { x: pt.x, z: pt.z, yaw: Math.atan2(pt.dx, pt.dz) };
  const reset = () => { const y = g.world.groundY(road.x, road.z, 50); v.place(road.x, y, road.z, road.yaw); v.repair(); p.gear = 1; p.drift.chain = 0; p.drift.score = 0; };
  const run = (sec, inp) => { for (let i = 0; i < sec * 60; i++) window.__sim(1 / 60, typeof inp === 'function' ? inp : inp); };
  const setSpeed = (kmh) => { const s = kmh / 3.6; p.vx = Math.sin(p.yaw) * s; p.vz = Math.cos(p.yaw) * s; p.gear = Math.max(1, Math.min(p.gears.length, Math.round(kmh / 30))); };

  reset();
  let t = 0, t100 = null, t60 = null, maxpitch = 0;
  for (let i = 0; i < 1500; i++) { window.__sim(1 / 60, { throttle: 1 }); t += 1 / 60; maxpitch = Math.max(maxpitch, Math.abs(p.pitch)); if (!t60 && p.kmh >= 60) t60 = t; if (!t100 && p.kmh >= 100) t100 = t; if (p.kmh > 180 || v.z > 900) break; }
  out.accel = { t60: +(t60 || 0).toFixed(2), t100: +(t100 || 0).toFixed(2), topAfter: +p.kmh.toFixed(0), t: +t.toFixed(1), maxpitch: +maxpitch.toFixed(3) };

  reset(); setSpeed(100); const z0 = v.z; let tb = 0; for (let i = 0; i < 600 && p.kmh > 1; i++) { window.__sim(1 / 60, { brake: 1 }); tb += 1 / 60; }
  out.brake100 = { dist: +Math.hypot(v.z - z0, 0).toFixed(1), t: +tb.toFixed(2) };

  reset(); setSpeed(60); const yaw0 = p.yaw; let maxLat = 0, maxSlip = 0, rollMax = 0;
  for (let i = 0; i < 180; i++) { window.__sim(1 / 60, { throttle: 0.3, steer: 0.45 }); maxLat = Math.max(maxLat, Math.abs(p.alat)); maxSlip = Math.max(maxSlip, p.slipAngle); rollMax = Math.max(rollMax, Math.abs(p.roll)); }
  out.corner = { kmh: +p.kmh.toFixed(0), yawChange: +(p.yaw - yaw0).toFixed(2), maxLatG: +(maxLat / 9.81).toFixed(2), maxSlipDeg: +(maxSlip * 57.3).toFixed(1), roll: +rollMax.toFixed(3) };

  reset(); setSpeed(80); let dm = { angle: 0, score: 0, hand: 0, maxYawRate: 0 };
  for (let i = 0; i < 240; i++) {
    const tt = i / 60; const inp = tt < 0.3 ? { throttle: 1, steer: 0.6 } : tt < 1.6 ? { throttle: 0.8, steer: 0.35, hand: tt < 0.9 } : { throttle: 0.4, steer: -0.2 };
    window.__sim(1 / 60, inp); dm.angle = Math.max(dm.angle, p.slipAngle); dm.maxYawRate = Math.max(dm.maxYawRate, Math.abs(p.w));
  }
  dm.score = Math.round(p.drift.best || p.drift.score); dm.angleDeg = +(dm.angle * 57.3).toFixed(0); dm.finalKmh = +p.kmh.toFixed(0); dm.finalSlipDeg = +(p.slipAngle * 57.3).toFixed(0); delete dm.angle;
  out.drift = dm;

  reset(); setSpeed(90); run(0.3, {}); p.y += 1.8; p.vy = 2.5;
  let air = 0, minY = 99, maxY = 0, bounces = 0, lastGround = true, hardest = 0, maxComp = 0;
  const y0 = g.world.groundY(v.x, v.z, 50);
  for (let i = 0; i < 360; i++) { window.__sim(1 / 60, {}); if (!p.onGround) air += 1 / 60; if (lastGround && !p.onGround && i > 5) bounces++; lastGround = p.onGround; hardest = Math.max(hardest, p.hardLanding); maxComp = Math.max(maxComp, ...p.comp); }
  out.jump = { airSec: +air.toFixed(2), airEvents: bounces, hardestLandingMs: +hardest.toFixed(1), maxComp: +maxComp.toFixed(3), finalPitch: +p.pitch.toFixed(3), finalRoll: +p.roll.toFixed(3), y: +(p.y - y0).toFixed(3), kmh: +p.kmh.toFixed(0) };

  reset(); setSpeed(200); let osc = 0, prevSteerSign = 0; let yawMax = 0;
  for (let i = 0; i < 300; i++) { window.__sim(1 / 60, { throttle: 1, steer: i < 60 ? 0 : (i % 40 < 20 ? 0.08 : -0.08) }); yawMax = Math.max(yawMax, Math.abs(p.w)); }
  out.highspeed = { kmh: +p.kmh.toFixed(0), yawRateMax: +yawMax.toFixed(2), slipDeg: +(p.slipAngle * 57.3).toFixed(1) };
  return out;
}, ID);
console.log(JSON.stringify(res));
await close();
