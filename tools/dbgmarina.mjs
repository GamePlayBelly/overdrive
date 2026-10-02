import { launch } from './harness.mjs';
const { page, close, logs } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.player, I = g.input, res = [];
  g.traffic.update = () => {}; g.peds.update = () => {};
  g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  const slot = g.yard.slots.find((s) => s.id === 'sport'), boat = slot.v;
  P.exit?.(); P.hidden = false; P.vehicle = null; P.state = 'foot'; P.seq = null;
  P.enter(boat);
  I.down.add('KeyW');
  for (let i = 0; i < 60 * 4; i++) { g.update(1 / 60); if (i % 60 === 59) { const p = boat.phys; res.push(`v=${p.speed.toFixed(1)} pos=${boat.x.toFixed(0)},${boat.z.toFixed(0)} eng=${p.engineOn} thr=${boat.input.throttle.toFixed(2)} wet=${p.wetN} gnd=${p.aground} propK=${p.propK.toFixed(2)} buoy=${p.buoy} y=${p.y.toFixed(2)} swamp=${boat.swamp} sunk=${boat.sunk} dis=${boat.disabled}`); } }
  return res;
});
console.log(out.join('\n'));
await close();
