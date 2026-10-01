import { launch, shot } from './harness.mjs';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const { page, close } = await launch({ width: W, height: H, query: process.env.QUERY || '?dev=1' });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const cfg = { spot: JSON.parse(process.env.SPOT || '[0,-60,0]'), hour: process.env.HOUR ? Number(process.env.HOUR) : null, weather: process.env.WEATHER || null, foot: process.env.FOOT === '1', cam: process.env.CAM || null, code: process.env.CODE || '', frames: Number(process.env.FRAMES || 150), scale: process.env.SCALE ? Number(process.env.SCALE) : 1 };
await page.evaluate((c) => {
  window.__pauseLoop = true;
  const g = window.__game, v = g.player.vehicle, [x, z, yaw] = c.spot;
  g.pipeline.setQuality({ scale: c.scale, samples: 2, bloom: true });
  if (c.hour !== null) g.sky.time = c.hour;
  if (c.weather) { g.sky.lockWeather = c.weather; g.sky.setWeather(c.weather, true); g.sky.wetness = /rain|storm/i.test(c.weather) ? 1 : 0; }
  v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind();
  if (c.foot) { g.player.exit(); g.player.place(x + 3, z + 5, yaw); g.rig.footYaw = yaw; }
  if (c.cam) g.rig.mode = c.cam;
  if (c.code) new Function('g', 'THREE', c.code)(g, window.__THREE);
}, cfg);
for (let i = 0; i < cfg.frames; i += 30) { await page.evaluate(() => { const g = window.__game; for (let k = 0; k < 30; k++) g.update(1 / 60); g.render(1 / 60); }); }
await page.evaluate(() => window.__game.render(1 / 60));
const f = await shot(page, process.env.NAME || 'shot');
console.log(f);
await close(); process.exit(0);
