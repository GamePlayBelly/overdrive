import { launch, shot, sleep } from './harness.mjs';
import fs from 'node:fs';
// Drives a scripted run, records it, starts the replay mode, renders a contact sheet of every camera shot and checks the state is restored on exit.
const SCENE = process.env.SCENE || 'car';
const { page, close, logs } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
const res = await page.evaluate(async (SCENE) => {
  window.__pauseLoop = true;
  const a = window.__app, g = window.__game, P = g.player, I = g.input, R = a.replay, out = {};
  g.pipeline.setQuality({ scale: 0.8, samples: 2, bloom: true });
  g.sky.time = 11; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  let v = P.vehicle;
  if (SCENE === 'boat') { const b = g.spawnVehicle('sport', -200, 2470, 0, {}, { owned: true }); P.exit(); P.enter(b); v = b; g.rig.snapBehind(); }
  else v.place(-55, g.world.groundY(-55, -330, 50), -330, 0);
  for (let i = 0; i < 40; i++) { g.update(1 / 60); R.record(1 / 60); }
  I.down.add('KeyW');
  for (let i = 0; i < 780; i++) {
    if (i === 200) I.down.add('KeyD'); if (i === 300) I.down.delete('KeyD'); if (i === 420) I.down.add('KeyA'); if (i === 520) I.down.delete('KeyA');
    if (i === 560 && SCENE === 'car') I.down.add('Space'); if (i === 640) I.down.delete('Space');
    g.update(1 / 60); R.record(1 / 60);
  }
  I.down.delete('KeyW');
  out.recorded = R.n; out.length = R.length.toFixed(1); out.ready = R.ready();
  const p = v.phys, before = { x: p.x, z: p.z, yaw: p.yaw, rpm: p.rpm, wheelRot: p.wheelRot };
  a.replay.active = false;
  a.mode = 'play';
  const pr = a.startReplay();
  await pr;
  out.mode = a.mode; out.active = R.active;
  out.hiddenCount = R.hidden.length;
  const names = ['chase', 'track', 'side', 'front', 'heli', 'wheel', 'hood', 'cockpit', 'auto'];
  const W = 320, H = 180, cv = document.createElement('canvas'); cv.width = 3 * W; cv.height = 3 * H;
  const cx = cv.getContext('2d');
  window.__pauseLoop = true;
  for (let i = 0; i < 4; i++) { R.frame(1 / 60); g.render(1 / 60); }
  names.forEach((n, k) => {
    R.shot = n; R.seek(6 + k * 0.5);
    for (let i = 0; i < 8; i++) { R.frame(1 / 60); }
    g.render(1 / 60);
    (out.dist ||= []).push(`${n} d=${Math.hypot(g.camera.position.x - v.group.position.x, g.camera.position.z - v.group.position.z).toFixed(1)} fov=${g.camera.fov.toFixed(0)} t=${R.t.toFixed(2)} key=${R.C.key} sp=${v.phys.speed.toFixed(1)}`);
    cx.drawImage(g.canvas, (k % 3) * W, Math.floor(k / 3) * H, W, H);
    cx.fillStyle = '#fff'; cx.font = '14px monospace'; cx.fillText(n, (k % 3) * W + 6, Math.floor(k / 3) * H + 16);
  });
  out.sheet = cv.toDataURL('image/png');
  R.shot = 'auto'; R.seek(0); R.paused = false;
  let moved = 0; const x0 = p.x;
  for (let i = 0; i < 300; i++) { R.frame(1 / 60); moved = Math.max(moved, Math.abs(p.x - x0)); }
  out.atT = R.t.toFixed(2); out.moved = moved.toFixed(1);
  out.cam = g.camera.position.toArray().map((q) => +q.toFixed(1));
  const ex = a.exitReplay();
  await ex;
  out.after = { mode: a.mode, dx: +(p.x - before.x).toFixed(3), dz: +(p.z - before.z).toFixed(3), dyaw: +(p.yaw - before.yaw).toFixed(3), drpm: +(p.rpm - before.rpm).toFixed(2), dwheel: +(p.wheelRot - before.wheelRot).toFixed(3), hidden: R.hidden.length, vis: v.group.visible, inputOn: I.enabled };
  g.update(1 / 60); g.render(1 / 60);
  return out;
}, SCENE);
const sheet = res.sheet; delete res.sheet;
console.log(JSON.stringify(res, null, 1));
fs.mkdirSync('data/shots', { recursive: true });
fs.writeFileSync(`data/shots/replay_${SCENE}.png`, Buffer.from(sheet.split(',')[1], 'base64'));
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 8).join('\n') || 'none');
await close(); process.exit(0);
