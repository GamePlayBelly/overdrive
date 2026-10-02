import { launch, shot } from './harness.mjs';
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, sea = g.world.sea, W = sea.waves, res = {};
  g.traffic.update = () => {}; g.peds.update = () => {};
  for (const k of ['calm', 'breezy', 'windy', 'roughSea', 'thunderstorm', 'gale', 'storm']) {
    g.sky.lockWeather = k; g.sky.setWeather(k, true);
    g.sky.timeScale = 0; g.sky.update(0.1, g.camera.position, g.camera); W.settle(1.6 + g.sky.w.wind * 11.5, g.sky.wind.dir); for (let i = 0; i < 60 * 20; i++) g.update(1 / 30);
    let mn = 1e9, mx = -1e9;
    for (let i = 0; i < 4000; i++) { const y = sea.waveAt(-1500 + Math.random() * 400, 100 + Math.random() * 400); mn = Math.min(mn, y); mx = Math.max(mx, y); }
    res[k] = { U: +W.U.toFixed(1), hs: +W.hs.toFixed(2), lam: +W.lam.toFixed(0), steep: +W.steep.toFixed(2), q: +W.q[0].toFixed(2), range: +(mx - mn).toFixed(2) };
  }
  return res;
});
console.log(JSON.stringify(out));
console.log(logs.filter((l) => !/getImageData/.test(l)).slice(0, 10).join('\n') || 'no errors');
await close();
