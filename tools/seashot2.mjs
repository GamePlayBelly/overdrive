import { launch } from './harness.mjs';
import fs from 'node:fs';
const WEATHERS = (process.env.WX || 'sunny,heavyRain,storm').split(',');
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
fs.mkdirSync('data/shots', { recursive: true });
for (const wx of WEATHERS) {
  const url = await page.evaluate(async (wx) => {
    window.__pauseLoop = true;
    const g = window.__game, P = g.player;
    g.traffic.update = () => {}; g.peds.update = () => {};
    g.pipeline.setQuality({ scale: 1, samples: 2, bloom: true });
    g.sky.time = 14; g.sky.timeScale = 0; g.sky.lockWeather = wx; g.sky.setWeather(wx, true);
    const slot = g.yard.slots.find((s) => s.id === 'sport');
    const boat = slot.v;
    P.exit?.(); P.hidden = false; P.vehicle = null; P.state = 'foot'; P.seq = null;
    boat.place(-1500, 0, 100, 1.2); boat.moor = null; boat.phys.engineOn = true;
    P.enter(boat);
    g.update(1 / 60); g.world.sea.waves.settle(1.6 + g.sky.w.wind * 11.5, g.sky.wind.dir); for (let i = 0; i < 60 * 8; i++) { g.update(1 / 30); }
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    g.render(1 / 60);
    return g.canvas.toDataURL('image/jpeg', 0.9);
  }, wx);
  fs.writeFileSync(`data/shots/sea_${wx}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
}
console.log(logs.filter((l) => !/getImageData/.test(l)).slice(0, 10).join('\n') || 'no errors');
await close();
