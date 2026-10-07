import { launch } from './harness.mjs';
const WX = process.env.WX || 'storm';
const { page, close, logs } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async (WX) => {
  window.__pauseLoop = true;
  const g = window.__game, sea = g.world.sea;
  g.traffic.update = () => {}; g.peds.update = () => {}; g.seaTraffic.update = () => {};
  g.sky.timeScale = 0; g.sky.lockWeather = WX; g.sky.setWeather(WX, true);
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  sea.waves.settle(1.6 + g.sky.w.wind * 11.5, g.sky.wind.dir);
  const res = {};
  const ids = ['rib', 'jetski', 'sport', 'fisher', 'yacht', 'dinghy', 'sloop', 'cruiser'];
  let n = 0;
  for (const id of ids) {
    const v = g.spawnVehicle(id, -1500 + n * 60, 300, 1.2, {}, { kind: 'civilian' });
    n++;
    v.moor = null; v.phys.engineOn = true;
    const p = v.phys, env = { sea, terrain: g.world.terrain, t: 0, wind: g.sky.wind };
    let maxRoll = 0, maxPitch = 0, maxVy = 0, bad = 0, maxSpd = 0, minY = 1e9, maxY = -1e9;
    const run = (secs, inp) => {
      Object.assign(v.input, inp);
      for (let i = 0; i < secs * 60; i++) {
        sea.t += 1 / 60; v.update(1 / 60, env);
        if (!Number.isFinite(p.x + p.y + p.roll + p.pitch)) bad++;
        maxRoll = Math.max(maxRoll, Math.abs(p.roll)); maxPitch = Math.max(maxPitch, Math.abs(p.pitch)); maxVy = Math.max(maxVy, Math.abs(p.vy)); maxSpd = Math.max(maxSpd, p.speed);
        minY = Math.min(minY, p.y - sea.waveAt(p.x, p.z)); maxY = Math.max(maxY, p.y - sea.waveAt(p.x, p.z));
      }
    };
    run(20, { throttle: 0.9, brake: 0, steer: 0, hand: false });
    run(20, { throttle: 0.9, brake: 0, steer: 0.5, hand: false });
    run(30, { throttle: 0, brake: 0, steer: 0, hand: false });
    res[id] = { roll: +maxRoll.toFixed(2), pitch: +maxPitch.toFixed(2), vy: +maxVy.toFixed(1), spd: +maxSpd.toFixed(1), rel: [+minY.toFixed(2), +maxY.toFixed(2)], bad, sunk: !!v.sunk, swamp: +(v.swamp || 0).toFixed(2), x: Math.round(p.x), z: Math.round(p.z) };
  }
  return res;
}, WX);
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
console.log(logs.filter((l) => !/getImageData/.test(l)).slice(0, 10).join('\n') || 'no errors');
await close();
