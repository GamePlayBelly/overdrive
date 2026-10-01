import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
console.log(await page.evaluate(() => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, I = g.input;
  g.traffic.update = () => {}; g.peds.update = () => {};
  const v = g.vehicles.find((q) => q.def.id === 'skylark');
  P.place(v.x + 3, v.z + 4, 0); P.enter(v);
  I.down.add('ShiftLeft');
  const out = [];
  for (let i = 0; i < 60 * 22; i++) { I.down.delete('KeyS'); { const p = v.phys; if (p.fwdSpeed > 31 && p.pitch < 0.15) I.down.add('KeyS'); } g.update(1 / 60); if (i > 60 * 15 && i % 20 === 0) { const p = v.phys; out.push(`${(i / 60).toFixed(1)} v=${p.speed.toFixed(2)} fwd=${p.fwdSpeed.toFixed(2)} thr=${p.thr.toFixed(2)} on=${p.onGround} stalled=${p.stalled.toFixed(2)} pitch=${p.pitch.toFixed(3)} L=${p.dbg && p.dbg.L.toFixed(0)} T=${p.dbg && p.dbg.thrust.toFixed(0)} CL=${p.dbg && p.dbg.CL.toFixed(2)} vy=${p.vy.toFixed(2)} agl=${p.agl.toFixed(2)} brake=${v.input.brake} eng=${p.engineOn}`); } }
  return out.join('\n');
}));
await close(); process.exit(0);
