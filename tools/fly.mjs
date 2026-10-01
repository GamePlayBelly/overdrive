import { launch } from './harness.mjs';
import fs from 'node:fs';
// Takes each aircraft off from the airfield with scripted key presses and logs speed/altitude, plus screenshots.
const WHICH = (process.env.WHICH || 'skylark,swift,stratus').split(',');
const { page, close, logs } = await launch({ width: 1000, height: 560 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
const res = await page.evaluate(async (WHICH) => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, I = g.input, out = [], shots = [];
  g.sky.time = 12; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  g.traffic.update = () => {}; g.peds.update = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) g.update(1 / 60); };
  for (const id of WHICH) {
    const v = g.vehicles.find((q) => q.def.id === id && q.isAir);
    if (!v) { out.push(id + ': not found'); continue; }
    if (P.vehicle) P.exit();
    P.place(v.x + 3, v.z + 4, 0); P.enter(v); g.rig.snapBehind(); g.rig.mode = 'chase';
    const log = [];
    I.down.add('ShiftLeft');
    const t0 = v.phys.y;
    for (let i = 0; i < 60 * 40; i++) {
      step(1);
      const p = v.phys, t = i / 60;
      if (id !== 'swift') { I.down.delete('KeyS'); I.down.delete('KeyW'); const tgt = p.fwdSpeed > v.def.perf.vr ? (p.agl > 150 ? 0.07 : 0.2) : 0; if (p.pitch < tgt - 0.015) I.down.add('KeyS'); else if (p.pitch > tgt + 0.02) I.down.add('KeyW'); if (p.agl > 60 && t > 20 && t < 26) I.down.add('KeyD'); else I.down.delete('KeyD'); }
      else { if (t > 6 && t < 14) { I.down.add('KeyW'); } else I.down.delete('KeyW'); if (t > 14) I.down.delete('ShiftLeft'); if (t > 14) I.down.add('ControlLeft'); }
      if (i % 300 === 0) { log.push(`t${t.toFixed(0)} agl ${p.agl.toFixed(1)} v ${p.speed.toFixed(1)} pitch ${p.pitch.toFixed(2)} roll ${p.roll.toFixed(2)} thr ${p.thr.toFixed(2)} gnd ${p.onGround}`); }
      if (i === 60 * 18 || i === 60 * 30) { g.render(1 / 60); shots.push(g.canvas.toDataURL('image/jpeg', 0.8)); }
    }
    for (const k of ['ShiftLeft', 'KeyS', 'KeyW', 'KeyD', 'ControlLeft']) I.down.delete(k);
    out.push(id + ':\n  ' + log.join('\n  '));
    P.exit?.();
  }
  return { out, shots };
}, WHICH);
console.log(res.out.join('\n'));
res.shots.forEach((s, i) => fs.writeFileSync(`data/shots/fly_${i}.jpg`, Buffer.from(s.split(',')[1], 'base64')));
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
