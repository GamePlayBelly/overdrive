import { launch } from './harness.mjs';
// Steady-state turn radius at fixed steering and speed on a flat runway (finds the car's real cornering limit).
const ID = process.env.CAR || '';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(async ({ ID }) => {
  window.__pauseLoop = true;
  const g = window.__game;
  g.traffic.update = () => {}; g.peds.update = () => {}; g.police.update = () => {};
  let v = g.player.vehicle;
  if (ID) { const nv = g.spawnVehicle(ID, 0, 0, 0, {}, { hero: true }); g.player.exit(); g.player.enter(nv); v = nv; }
  v.collideStatic = () => {};
  const p = v.phys, out = [];
  const X = 1050, Z = 2100;
  for (const sp of [8, 11, 14, 17, 20, 25]) for (const st of [0.35, 0.7, 1]) {
    v.place(X, g.world.groundY(X, Z, 50), Z, Math.PI / 2); v.repair(); p.vx = Math.sin(p.yaw) * sp; p.vz = Math.cos(p.yaw) * sp; p.gear = 3;
    let sm = 0, n = 0, yaw0 = 0, ok = true;
    for (let i = 0; i < 420; i++) {
      window.__sim(1 / 60, { throttle: v.phys.speed < sp ? 0.7 : 0.12, brake: v.phys.speed > sp + 1.5 ? 0.3 : 0, steer: st });
      if (i === 240) yaw0 = p.yaw;
      if (i > 240) { sm += p.speed; n++; }
    }
    let dyaw = p.yaw - yaw0; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    const om = Math.abs(dyaw) / 3, spd = sm / n;
    out.push({ target: sp, steer: st, speed: +spd.toFixed(1), yawRate: +om.toFixed(2), R: +(spd / om).toFixed(1), latA: +(spd * om).toFixed(1), slip: Math.round(Math.atan2(p.lateralSpeed, Math.max(1, p.fwdSpeed)) * 57.3) });
  }
  return out;
}, { ID });
for (const l of r) console.log(JSON.stringify(l));
await close(); process.exit(0);
