import { launch } from './harness.mjs';
const { page, close, logs } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
const res = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const a = window.__app, g = window.__game, P = g.player, I = g.input, R = a.replay, out = [];
  const v = P.vehicle;
  v.place(-55, g.world.groundY(-55, -330, 50), -330, 0);
  for (let i = 0; i < 40; i++) { g.update(1 / 60); R.record(1 / 60); }
  I.down.add('KeyW');
  for (let i = 0; i < 500; i++) { g.update(1 / 60); R.record(1 / 60); }
  I.down.delete('KeyW');
  await a.startReplay();
  R.shot = 'chase';
  for (const t of [3, 5, 6, 7]) {
    R.seek(t);
    for (let i = 0; i < 8; i++) { R.frame(1 / 60); const c = g.camera.position, p = v.phys; if (i === 0 || i === 7) out.push({ t, i, sp: +p.speed.toFixed(1), d: +Math.hypot(c.x - v.group.position.x, c.z - v.group.position.z).toFixed(1), dims: [v.dims.L, v.dims.H], key: R.C.key }); }
  }
  return out;
});
console.log(JSON.stringify(res));
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 8).join('\n') || 'none');
await close(); process.exit(0);
