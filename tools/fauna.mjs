import { launch } from './harness.mjs';
import fs from 'node:fs';
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
fs.mkdirSync('data/shots', { recursive: true });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, I = g.input, sea = g.world.sea, T = g.world.terrain, res = { log: [], shots: [] };
  g.traffic.update = () => {}; g.peds.update = () => {}; g.seaTraffic.update = () => {};
  g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.time = 12;
  g.pipeline.setQuality({ scale: 1, samples: 2, bloom: true });
  P.exit?.(); P.hidden = false; P.vehicle = null; P.seq = null;
  // find a reef-like spot: moderate depth, rocky noise
  let best = null;
  for (let x = -1700; x < -1080; x += 20) for (let z = -300; z < 700; z += 20) {
    const d = -2.2 - T.height(x, z); if (d < 3 || d > 7) continue;
    const h = g.marine.habitat(x, z); const sc = h.rock; if (!best || sc > best.sc) best = { x, z, sc, d };
  }
  res.spot = best;
  P.x = best.x; P.z = best.z; P.y = sea.waveAt(best.x, best.z) - 1.08; P.state = 'swim'; P.yaw = 1; g.rig.footYaw = 1; g.rig.footPitch = 0.1;
  const key = (c, on) => { if (on) I.down.add(c); else I.down.delete(c); };
  const step = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); };
  step(60);
  key('ControlLeft', true); step(90); key('ControlLeft', false);
  step(120);
  let t0 = performance.now(); for (let i = 0; i < 60; i++) g.marine.update(1 / 60); res.marineMs = +((performance.now() - t0) / 60).toFixed(3);
  t0 = performance.now(); g.seabed.rebuild(g.camera.position); res.seabedRebuildMs = +(performance.now() - t0).toFixed(2);
  const sp = {}; for (const s of g.marine.schools) if (s.active) sp[s.key] = (sp[s.key] || 0) + s.fish.length;
  res.fish = sp; res.total = g.marine.count; res.decor = Object.fromEntries(Object.entries(g.seabed.m).map(([k, m]) => [k, m.count]));
  const snap = (label) => { g.render(1 / 60); res.shots.push(g.canvas.toDataURL('image/jpeg', 0.88)); res.log.push(label + ' dive=' + P.dive.toFixed(1)); };
  snap('underwater idle');
  { const THREE = window.__THREE; const sc = g.marine.schools.filter((q) => q.active).sort((a, b) => Math.hypot(a.cx - P.x, a.cz - P.z) - Math.hypot(b.cx - P.x, b.cz - P.z));
    for (const q of sc.slice(0, 3)) { const d = Math.hypot(q.cx - P.x, q.cz - P.z), ux = (q.cx - P.x) / d, uz = (q.cz - P.z) / d; const dist = Math.min(d, 9);
      g.rig.cinematic({ from: new THREE.Vector3(q.cx - ux * dist, q.cy + 0.3, q.cz - uz * dist), target: new THREE.Vector3(q.cx, q.cy, q.cz), dur: 99, snap: 100 }); step(8); snap('school ' + q.key + ' n=' + q.fish.length + ' d=' + d.toFixed(0)); }
    g.rig.cine = null; }
  step(60); snap('underwater later');
  key('KeyW', true); step(90); key('KeyW', false); snap('after swim');
  key('Space', true); step(150); key('Space', false); step(60); snap('surface');
  g.renderer.info.reset(); g.render(1 / 60); res.calls = g.renderer.info.render.calls;
  return res;
});
out.shots.forEach((u, i) => fs.writeFileSync(`data/shots/fauna_${i}.jpg`, Buffer.from(u.split(',')[1], 'base64')));
console.log(JSON.stringify({ ...out, shots: undefined }));
console.log(logs.filter((l) => !/getImageData/.test(l)).slice(0, 10).join('\n') || 'no errors');
await close();
