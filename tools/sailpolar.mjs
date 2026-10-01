import { launch } from './harness.mjs';
// Speed polar of a sailboat: holds fixed headings against a fixed true wind and reports speed, heel and sail state.
const BOAT = process.env.BOAT || 'sloop', TWS = (process.env.TWS || '4.5,8').split(',').map(Number), SECS = Number(process.env.SECS || 40);
const ANG = (process.env.ANG || '30,45,60,90,120,150,175').split(',').map(Number);
const { page, close } = await launch({ width: 800, height: 450 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async ({ BOAT, TWS, SECS, ANG }) => {
  const g = window.__game;
  window.__pauseLoop = true;
  g.traffic.update = () => {}; g.peds.update = () => {};
  const sea = g.world.sea, wdir = 0.9, dt = 1 / 60;
  const env = { ground: (x, z, y) => g.world.ground(x, z, y), wet: 0, rain: 0, night: 0, fog: 0 };
  const setWind = (s) => { const w = g.sky.wind; w.speed = s; w.dir = wdir; w.x = Math.cos(wdir) * s; w.z = Math.sin(wdir) * s; };
  Object.defineProperty(sea, 'amp', { get: () => 0.12, set() {} });
  const X = 0, Z = 2700, rows = [];
  const v = g.spawnVehicle(BOAT, X, Z, 0, {}, { kind: 'civilian' }), p = v.phys;
  const windFrom = Math.atan2(-Math.cos(wdir), -Math.sin(wdir));
  for (const tws of TWS) {
    setWind(tws);
    for (const a of ANG) {
      const hd = windFrom + (a * Math.PI) / 180;
      v.place(X, 0, Z, hd); p.vx = Math.sin(hd) * 2; p.vz = Math.cos(hd) * 2; p.roll = 0; p.rollV = 0;
      let sp = 0, n = 0, heel = 0, luff = 0, trim = 0, pw = 0;
      for (let i = 0; i < SECS * 60; i++) {
        let e = hd - p.yaw; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
        Object.assign(v.input, { throttle: 0, brake: 0, steer: Math.max(-1, Math.min(1, -e * 2.5 + p.w * 0.6)), hand: false });
        sea.t += dt; v.update(dt, env);
        if (i > (SECS - 10) * 60) { sp += p.speed; heel += p.roll; luff += p.sailLuff; trim += Math.abs(p.sailT); pw += p.sailPow; n++; }
      }
      rows.push({ tws, awa: a, kn: +(sp / n * 1.944).toFixed(1), mps: +(sp / n).toFixed(2), heelDeg: +(heel / n * 57.3).toFixed(1), luff: +(luff / n).toFixed(2), trimDeg: +(trim / n * 57.3).toFixed(0), pow: +(pw / n).toFixed(2), aws: +p.aws.toFixed(1), yawErrDeg: +((hd - p.yaw) * 57.3).toFixed(1), x: Math.round(p.x), z: Math.round(p.z) });
    }
  }
  return rows;
}, { BOAT, TWS, SECS, ANG });
for (const r of out) console.log(JSON.stringify(r));
await close(); process.exit(0);
