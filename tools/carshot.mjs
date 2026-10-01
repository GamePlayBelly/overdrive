import { launch, shot } from './harness.mjs';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const { page, close } = await launch({ width: W, height: H });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const cfg = { car: process.env.CAR || '', cam: JSON.parse(process.env.CAMPOS || '[3.2,1.4,3.4]'), look: JSON.parse(process.env.LOOK || '[0,0.7,0]'), open: (process.env.OPEN || '').split(',').filter(Boolean), fov: Number(process.env.FOV || 45), hour: Number(process.env.HOUR || 11), code: process.env.CODE || '', doors: process.env.DOORS !== '0', frames: Number(process.env.FRAMES || 40) };
await page.evaluate((c) => {
  window.__pauseLoop = true;
  const g = window.__game, THREE = window.__THREE; const process_doors = c.doors;
  g.pipeline.setQuality({ scale: 1, samples: 4, bloom: true });
  g.sky.time = c.hour; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  let v = g.player.vehicle;
  const [x, z] = [-300, 20];
  if (c.car) { const nv = g.spawnVehicle(c.car, x, z, Math.PI / 2, { color: '#7a1f23', doors: process_doors }, { hero: true }); g.player.exit(); g.player.enter(nv); v = nv; }
  v.place(x, g.world.groundY(x, z, 60), z, Math.PI / 2); g.player.exit?.call(g.player); g.player.rig.root.visible = false;
  for (const o of c.open) v.setDoor(o, true);
  if (c.code) new Function('g', 'v', 'THREE', c.code)(g, v, THREE);
  window.__cam = () => {
    const s = Math.sin(v.yaw), co = Math.cos(v.yaw), gp = v.group.position;
    const w = (l) => new THREE.Vector3(gp.x + l[0] * co + l[2] * s, gp.y + l[1], gp.z - l[0] * s + l[2] * co);
    g.rig.cinematic({ from: w(c.cam), target: w(c.look), fov: c.fov, snap: 200 });
    g.rig.pos.copy(w(c.cam)); g.rig.look.copy(w(c.look));
  };
  window.__cam();
}, cfg);
for (let i = 0; i < cfg.frames; i += 10) await page.evaluate(() => { const g = window.__game; for (let k = 0; k < 10; k++) { g.update(1 / 60); window.__cam(); } g.render(1 / 60); });
await page.evaluate(() => window.__game.render(1 / 60));
console.log(await shot(page, process.env.NAME || 'car'));
await close(); process.exit(0);
