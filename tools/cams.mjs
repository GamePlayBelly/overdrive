import { launch } from './harness.mjs';
import fs from 'node:fs';
// Contact sheet of every camera mode while driving: SCENE=car|boat|jet
const SCENE = process.env.SCENE || 'car';
const { page, close, logs } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const url = await page.evaluate(async (SCENE) => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player;
  g.pipeline.setQuality({ scale: 0.8, samples: 2, bloom: true });
  g.sky.time = 11; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  g.traffic.update = () => {}; g.peds.update = () => {};
  let v = P.vehicle;
  if (SCENE !== 'car') {
    const id = SCENE === 'jet' ? 'jetski' : 'sport';
    const b = g.spawnVehicle(id, -200, 2470, 0, {}, { owned: true });
    P.exit(); P.enter(b); v = b; g.rig.snapBehind();
  } else v.place(-55, g.world.groundY(-55, -330, 50), -330, 0);
  const modes = ['chase', 'far', 'hood', 'cockpit', 'bumper'];
  const W = 384, H = 216, cv = document.createElement('canvas'); cv.width = 5 * W; cv.height = 2 * H;
  const cx = cv.getContext('2d');
  const I = g.input;
  let n = 0;
  for (const m of modes) {
    g.rig.mode = m;
    I.down.add('KeyW');
    for (let i = 0; i < 150; i++) { g.update(1 / 60); if (i === 60 && SCENE !== 'car') I.down.add('KeyD'); if (i === 110) I.down.delete('KeyD'); }
    g.render(1 / 60);
    cx.drawImage(g.canvas, (n % 5) * W, 0, W, H); cx.fillStyle = '#fff'; cx.font = '16px monospace'; cx.fillText(`${m} ${v.kmh.toFixed(0)}km/h`, (n % 5) * W + 8, 18);
    n++;
  }
  // look back and drift
  g.rig.mode = 'chase'; g.rig.lookBack = true;
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  g.render(1 / 60); cx.drawImage(g.canvas, 0, H, W, H); cx.fillText('lookBack', 8, H + 18);
  g.rig.lookBack = false;
  I.down.add('Space'); I.down.add('KeyD');
  for (let i = 0; i < 70; i++) g.update(1 / 60);
  g.render(1 / 60); cx.drawImage(g.canvas, W, H, W, H); cx.fillText(`drift ${v.phys.drift.active}`, W + 8, H + 18);
  I.down.delete('Space'); I.down.delete('KeyD');
  for (let i = 0; i < 40; i++) g.update(1 / 60);
  g.rig.mode = 'far'; g.render(1 / 60); cx.drawImage(g.canvas, 2 * W, H, W, H); cx.fillText('after', 2 * W + 8, H + 18);
  I.down.delete('KeyW'); I.down.add('KeyS');
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  g.rig.mode = 'chase'; g.render(1 / 60); cx.drawImage(g.canvas, 3 * W, H, W, H); cx.fillText(`brake/reverse ${v.phys.fwdSpeed.toFixed(1)}`, 3 * W + 8, H + 18);
  return cv.toDataURL('image/png');
}, SCENE);
fs.mkdirSync('data/shots', { recursive: true });
fs.writeFileSync(`data/shots/cams_${SCENE}.png`, Buffer.from(url.split(',')[1], 'base64'));
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
