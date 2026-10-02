import { launch } from './harness.mjs';
import fs from 'node:fs';
const { page, close, logs } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const urls = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, pop = g.seaTraffic.pop, THREE = window.__THREE;
  g.traffic.update = () => {}; g.peds.update = () => {};
  g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.time = 14;
  g.pipeline.setQuality({ scale: 1, samples: 2, bloom: true });
  const boat = g.yard.slots.find((s) => s.id === 'sport').v;
  P.exit?.(); P.hidden = false; P.vehicle = null; P.state = 'foot'; P.seq = null;
  boat.place(-1500, 0, 100, -1.5); boat.moor = null; P.enter(boat);
  for (let i = 0; i < 120; i++) g.update(1 / 30);
  const F = boat, res = [];
  const sorted = pop.agents.filter((a) => !a.v && a.state !== 'sheltered').map((a) => [Math.hypot(a.x - F.x, a.z - F.z), a]).filter((q) => q[0] > 380 && q[0] < 1500).sort((p, q) => p[0] - q[0]);
  for (const [dist, a] of sorted.slice(0, 2)) {
    const ang = 0.6, cx = a.x - Math.sin(ang) * 220, cz = a.z - Math.cos(ang) * 220;
    g.rig.cinematic({ from: new THREE.Vector3(cx, 6, cz), target: new THREE.Vector3(a.x, 1.5, a.z), dur: 999, snap: 100 });
    for (let i = 0; i < 10; i++) g.update(1 / 30);
    g.render(1 / 60);
    res.push(g.canvas.toDataURL('image/jpeg', 0.85));
    res.push(a.kind);
  }
  return res;
});
for (let i = 0; i < urls.length; i += 2) fs.writeFileSync(`data/shots/proxy_${i / 2}.jpg`, Buffer.from(urls[i].split(',')[1], 'base64'));
console.log(urls.filter((_, i) => i % 2).join(','));
console.log(logs.filter((l) => !/getImageData/.test(l)).slice(0, 10).join('\n') || 'no errors');
await close();
