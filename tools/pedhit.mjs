import { launch } from './harness.mjs';
import fs from 'node:fs';
const SPEED = Number(process.env.SPEED || 60);
const { page, close } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const res = await page.evaluate(async (SPEED) => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, v = P.vehicle;
  g.pipeline.setQuality({ scale: 0.8, samples: 2, bloom: false });
  g.sky.time = 11; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  g.traffic.update = () => {};
  const home = g.world.poi.garage;
  const n = g.world.roads.nearestLane(home.x, home.z, 1, 0, null, 200); const pt = n.lane.pl.at(n.s);
  const yaw = Math.atan2(pt.dx, pt.dz);
  v.place(pt.x, g.world.groundY(pt.x, pt.z, 50), pt.z, yaw);
  const sp = SPEED / 3.6; v.phys.vx = Math.sin(yaw) * sp; v.phys.vz = Math.cos(yaw) * sp; v.phys.gear = 3;
  for (let i = 0; i < 400 && g.peds.list.length < 8; i++) g.update(1 / 60);
  v.place(pt.x, g.world.groundY(pt.x, pt.z, 50), pt.z, yaw); v.phys.vx = Math.sin(yaw) * sp; v.phys.vz = Math.cos(yaw) * sp; v.phys.gear = 3;
  const p = g.peds.list[0];
  p.state = 'idle'; p.idleT = 99; p.noDodge = true; p.x = pt.x + Math.sin(yaw) * 26 + Math.cos(yaw) * 0.3; p.z = pt.z + Math.cos(yaw) * 26 - Math.sin(yaw) * 0.3; p.y = g.world.groundY(p.x, p.z, 50);
  const cols = 5, W = 384, H = 216, times = [0.1, 0.35, 0.6, 0.8, 1.0, 1.2, 1.6, 2.0, 2.6, 4.0];
  const cv = document.createElement('canvas'); cv.width = cols * W; cv.height = Math.ceil(times.length / cols) * H;
  const cx = cv.getContext('2d');
  const log = [];
  const events = []; g.on('ped:hit', (e) => events.push(`hit sp=${e.speed.toFixed(1)} sev=${e.severity} fatal=${e.fatal}`)); g.on('ped:bounce', (e) => events.push(`bounce ${e.impact.toFixed(1)}`));
  let t = 0, ti = 0;
  while (ti < times.length && t < 8) {
    v.input.throttle = 0.4; v.input.brake = 0;
    g.controlVehicle = () => {};
    g.update(1 / 60); t += 1 / 60;
    if (t >= times[ti]) { g.render(1 / 60); cx.drawImage(g.canvas, (ti % cols) * W, Math.floor(ti / cols) * H, W, H); cx.fillStyle = '#fff'; cx.font = '14px monospace'; cx.fillText(`${t.toFixed(2)} ${p.state}`, (ti % cols) * W + 6, Math.floor(ti / cols) * H + 16); ti++; }
    log.push(`${t.toFixed(2)} ${p.state} d=${Math.hypot(p.x - v.x, p.z - v.z).toFixed(1)} y=${p.y.toFixed(2)} kmh=${v.kmh.toFixed(0)}`);
  }
  window.__log = events.join('\n') + '\n' + log.filter((_, i) => i % 15 === 0).join('\n');
  return cv.toDataURL('image/png');
}, SPEED);
fs.mkdirSync('data/shots', { recursive: true });
fs.writeFileSync('data/shots/pedhit.png', Buffer.from(res.split(',')[1], 'base64'));
console.log(await page.evaluate(() => window.__log));
await close(); process.exit(0);
