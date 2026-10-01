import { launch } from './harness.mjs';
import fs from 'node:fs';
const KIND = process.env.KIND || 'exit';
const CAR = process.env.CAR || '';
const { page, close } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const url = await page.evaluate(async ({ KIND, CAR }) => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player;
  g.pipeline.setQuality({ scale: 0.8, samples: 2, bloom: false });
  g.sky.time = 11; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  g.traffic.update = () => {}; g.peds.update = () => {};
  let v = P.vehicle;
  const x = -300, z = 20;
  if (CAR) { const nv = g.spawnVehicle(CAR, x + 10, z, Math.PI / 2, { color: '#7a1f23' }, { hero: true }); P.exit(); P.enter(nv); v = nv; }
  v.place(x, g.world.groundY(x, z, 50), z, Math.PI / 2);
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  g.rig.snapBehind();
  const cols = 5, W = 384, H = 216;
  const times = KIND === 'exit' ? [0.1, 0.3, 0.55, 0.8, 1.05, 1.3, 1.6, 2.0, 2.6, 3.4] : [0.1, 0.35, 0.6, 0.85, 1.1, 1.35, 1.6, 1.9, 2.3, 2.8];
  const cv = document.createElement('canvas'); cv.width = cols * W; cv.height = Math.ceil(times.length / cols) * H;
  const cx = cv.getContext('2d');
  if (KIND === 'enter') { P.exit(); P.place(x + 4.2, z + 3.5, Math.PI); for (let i = 0; i < 20; i++) g.update(1 / 60); g.rig.footYaw = Math.PI; }
  const ok = KIND === 'exit' ? P.tryExit() : P.tryEnter(v);
  let t = 0, ti = 0;
  const log = [];
  while (ti < times.length && t < 8) {
    g.update(1 / 60); t += 1 / 60;
    if (t >= times[ti]) {
      g.render(1 / 60);
      cx.drawImage(g.canvas, (ti % cols) * W, Math.floor(ti / cols) * H, W, H);
      cx.fillStyle = '#fff'; cx.font = '14px monospace'; cx.fillText(`${t.toFixed(2)} ${P.state}`, (ti % cols) * W + 6, Math.floor(ti / cols) * H + 16);
      log.push(`${t.toFixed(2)} state=${P.state} doorL=${v.doorState.L.toFixed(2)} pos=${P.x.toFixed(1)},${P.z.toFixed(1)}`);
      ti++;
    }
  }
  window.__log = log.join('\n') + '\nok=' + ok;
  return cv.toDataURL('image/png');
}, { KIND, CAR });
fs.mkdirSync('data/shots', { recursive: true });
fs.writeFileSync(`data/shots/seq_${KIND}.png`, Buffer.from(url.split(',')[1], 'base64'));
console.log(await page.evaluate(() => window.__log));
await close(); process.exit(0);
