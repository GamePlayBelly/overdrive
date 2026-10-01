import { launch } from './harness.mjs';
import fs from 'node:fs';
const STEP = process.env.STEP || 'board';
const BOAT = process.env.BOAT || 'sport';
const { page, close } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async ({ STEP, BOAT }) => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, I = g.input;
  g.pipeline.setQuality({ scale: 0.8, samples: 2, bloom: false });
  g.sky.time = 11; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  g.traffic.update = () => {}; g.peds.update = () => {};
  const key = (c, on = true) => { if (on) { I.down.add(c); I.pressed.add(c); } else I.down.delete(c); };
  const step = (n = 1) => { for (let i = 0; i < n; i++) g.update(1 / 60); };
  const log = [];
  const sheet = (times, cols = 5) => {
    const W = 384, H = 216;
    const cv = document.createElement('canvas'); cv.width = cols * W; cv.height = Math.ceil(times.length / cols) * H;
    return { cv, cx: cv.getContext('2d'), W, H, cols };
  };
  const slot = g.yard.slots.find((s) => s.id === BOAT);
  const boat = slot.v;
  const berth = g.world.marina.berths.find((b) => Math.abs(b.fx + b.dir * (1.65 + boat.def.body.W / 2) - boat.x) < 1) || { fx: boat.x - 3 };
  P.exit?.();
  const fx = berth.fx;
  P.hidden = false;
  P.vehicle = null; P.state = 'foot'; P.seq = null;
  P.place(fx, boat.z - 6, Math.atan2(boat.x - fx, 6));
  P.rig.root.visible = true;
  step(30);
  g.rig.footYaw = P.yaw;
  const times = [0.15, 0.35, 0.55, 0.8, 1.05, 1.3, 1.6, 2.0, 2.6, 3.4];
  const S = sheet(times);
  let t = 0, ti = 0;
  const grab = (label) => { g.render(1 / 60); S.cx.drawImage(g.canvas, (ti % S.cols) * S.W, Math.floor(ti / S.cols) * S.H, S.W, S.H); S.cx.fillStyle = '#fff'; S.cx.font = '14px monospace'; S.cx.fillText(label, (ti % S.cols) * S.W + 6, Math.floor(ti / S.cols) * S.H + 16); ti++; };
  log.push(`start pos ${P.x.toFixed(1)},${P.y.toFixed(2)},${P.z.toFixed(1)} boat ${boat.x.toFixed(1)},${boat.y.toFixed(2)},${boat.z.toFixed(1)} ground ${g.world.groundY(P.x, P.z, 5).toFixed(2)}`);
  key('KeyF'); step(1); key('KeyF', false);
  log.push(`after F: state ${P.state} seq ${P.seq ? P.seq.kind : null} driver ${!!boat.driver}`);
  if (STEP === 'board' || STEP === 'all') {
    while (ti < times.length && t < 6) {
      step(1); t += 1 / 60;
      if (t >= times[ti]) grab(`${t.toFixed(2)} ${P.state}`);
    }
    log.push(`boarded: state ${P.state} vehicle ${!!P.vehicle}`);
    window.__board = S.cv.toDataURL('image/png');
  }
  // drive out
  key('KeyW');
  for (let i = 0; i < 60 * 5; i++) { step(1); if (i % 60 === 59) log.push(`drive t${(i + 1) / 60} v=${boat.phys.speed.toFixed(1)} pos ${boat.x.toFixed(0)},${boat.z.toFixed(0)} hdg ${boat.yaw.toFixed(2)}`); }
  key('KeyD');
  for (let i = 0; i < 60 * 3; i++) step(1);
  key('KeyD', false);
  log.push(`after turn v=${boat.phys.speed.toFixed(1)} yaw ${boat.yaw.toFixed(2)}`);
  for (let i = 0; i < 60 * 4; i++) step(1);
  g.render(1 / 60);
  window.__drive = g.canvas.toDataURL('image/png');
  key('KeyW', false); key('KeyS');
  for (let i = 0; i < 60 * 9; i++) { step(1); if (boat.phys.speed < 1.0) break; }
  key('KeyS', false);
  log.push(`stopped v=${boat.phys.speed.toFixed(1)} state ${P.state}`);
  // leave the boat in open water
  const S2 = sheet(times); ti = 0; t = 0;
  S.cv = S2.cv; S.cx = S2.cx;
  key('KeyF'); step(1); key('KeyF', false);
  log.push(`exit: seq ${P.seq ? P.seq.kind : null} to ${P.seq?.to ? JSON.stringify({ swim: P.seq.to.swim, y: +P.seq.to.y.toFixed(2) }) : null}`);
  while (ti < times.length && t < 6) { step(1); t += 1 / 60; if (t >= times[ti]) grab(`${t.toFixed(2)} ${P.state}`); }
  log.push(`after exit: state ${P.state} player ${P.x.toFixed(1)},${P.y.toFixed(2)},${P.z.toFixed(1)} surface ${g.world.sea.waveAt(P.x, P.z).toFixed(2)}`);
  window.__exit = S2.cv.toDataURL('image/png');
  // swim around
  key('KeyW');
  for (let i = 0; i < 60 * 4; i++) step(1);
  log.push(`swim: state ${P.state} speed ${P.speed.toFixed(2)} y ${P.y.toFixed(2)}`);
  g.render(1 / 60);
  window.__swim = g.canvas.toDataURL('image/png');
  key('KeyW', false);
  window.__log = log.join('\n');
  return window.__log;
}, { STEP, BOAT });
console.log(out);
fs.mkdirSync('data/shots', { recursive: true });
for (const k of ['__board', '__drive', '__exit', '__swim']) { const url = await page.evaluate((k) => window[k], k); if (url) fs.writeFileSync(`data/shots/bf_${k.slice(2)}.png`, Buffer.from(url.split(',')[1], 'base64')); }
await close(); process.exit(0);
