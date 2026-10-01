import { launch } from './harness.mjs';
const { page, close } = await launch({});
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const ids = (process.env.BOATS || 'rib,jetski,sport,fisher,yacht').split(',');
const out = await page.evaluate(async (ids) => {
  const g = window.__game;
  g.traffic.update = () => {}; g.peds.update = () => {};
  const sea = g.world.sea, res = [];
  const env = { ground: (x, z, y) => g.world.ground(x, z, y), wet: 0, rain: 0, night: 0, fog: 0 };
  const dt = 1 / 60;
  const run = (v, secs, inp, log) => { Object.assign(v.input, inp); for (let i = 0; i < secs * 60; i++) { sea.t += dt; v.update(dt, env); if (log && i % 60 === 59) log(i / 60 + 1); } };
  const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
  for (const id of ids) {
    const v = g.spawnVehicle(id, 0, 2620, 0, {}, {});
    const p = v.phys;
    const rows = [];
    const L = [];
    L.push(`== ${id} vmax ${p.vmax} T0 ${Math.round(p.T0)} k2 ${r2(p.k2)} d0 ${r2(p.d0)}`);
    // acceleration
    let t50 = null, t90 = null;
    run(v, 22, { throttle: 1, brake: 0, steer: 0, hand: false, boost: false }, (t) => {
      const s = p.speed;
      if (t50 === null && s > 0.5 * p.vmax) t50 = t; if (t90 === null && s > 0.9 * p.vmax) t90 = t;
      if (t <= 6 || t % 4 === 0) rows.push(`t${t} v${r1(s)} pitch${r2(p.pitch)} roll${r2(p.roll)} y${r2(p.y - sea.waveAt(p.x, p.z))} plane${r2(p.planing)} rpm${Math.round(p.rpm)}`);
    });
    L.push(`accel: 50% at ${t50}s 90% at ${t90}s top ${r1(p.speed)} m/s (${r1(p.kmh)} km/h)`); L.push(...rows); rows.length = 0;
    // turn at 70%
    run(v, 1, { throttle: 0.7, steer: 0 });
    const v0 = p.speed, yaw0 = p.yaw;
    let maxRoll = 0, maxSlip = 0;
    run(v, 5, { throttle: 0.7, steer: 1 }, () => { maxRoll = Math.max(maxRoll, Math.abs(p.roll)); maxSlip = Math.max(maxSlip, p.slipAngle); });
    const dyaw = p.yaw - yaw0;
    L.push(`turn: speed ${r1(v0)} -> ${r1(p.speed)} yawrate ${r2(p.w)} rad/s radius ${r1(p.speed / Math.max(0.01, Math.abs(p.w)))} m roll ${r2(p.roll)} maxroll ${r2(maxRoll)} slip ${r2(maxSlip)} dyaw ${r2(dyaw)}`);
    // drift
    run(v, 2, { throttle: 1, steer: 0 });
    let maxBeta = 0, chain = 0;
    run(v, 4, { throttle: 1, steer: 1, hand: true }, () => { maxBeta = Math.max(maxBeta, p.slipAngle); chain = Math.max(chain, p.drift.chain); });
    L.push(`drift: speed ${r1(p.speed)} maxbeta ${r2(maxBeta)} chain ${Math.round(chain)} w ${r2(p.w)} active ${p.drift.active}`);
    run(v, 1.5, { throttle: 0, steer: 0, hand: false });
    // brake
    run(v, 6, { throttle: 1, steer: 0 });
    const x0 = p.x, z0 = p.z, sp0 = p.speed;
    let tb = null; let dmax = 0; run(v, 12, { throttle: 0, brake: 1 }, (t) => { if (tb === null && p.fwdSpeed < 0.5) { tb = t; dmax = Math.hypot(p.x - x0, p.z - z0); } });
    L.push(`brake: from ${r1(sp0)} m/s stop after ${tb}s, dist ${r1(dmax)} m, final v ${r1(p.fwdSpeed)}`);
    run(v, 4, { throttle: 0, brake: 1 });
    L.push(`reverse: v ${r1(p.fwdSpeed)} gear ${p.gear}`);
    run(v, 8, { throttle: 0, brake: 0 });
    L.push(`coast: v ${r1(p.speed)} y-wave ${r2(p.y - sea.waveAt(p.x, p.z))}`);
    g.removeVehicle(v);
    res.push(L.join('\n'));
  }
  return res.join('\n');
}, ids);
console.log(out);
await close(); process.exit(0);
