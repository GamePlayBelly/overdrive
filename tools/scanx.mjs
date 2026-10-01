import { launch } from './harness.mjs';
// Terrain height profile along a line: X0,X1,Z (or Z0,Z1,X) with a step.
const A = Number(process.env.A), B = Number(process.env.B), C = Number(process.env.C), STEP = Number(process.env.STEP || 20), AX = process.env.AX || 'x';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(({ A, B, C, STEP, AX }) => {
  const T = window.__game.world.terrain, out = [];
  for (let u = A; (STEP > 0 ? u <= B : u >= B); u += STEP) { const x = AX === 'x' ? u : C, z = AX === 'x' ? C : u; out.push(`${Math.round(u)}:${T.height(x, z).toFixed(1)}`); }
  return out.join(' ');
}, { A, B, C, STEP, AX });
console.log(r);
await close(); process.exit(0);
