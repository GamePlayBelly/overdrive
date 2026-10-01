import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
console.log(JSON.stringify(await page.evaluate(async () => {
  const { headGeo } = await import('/src/actors/avatarParts.js');
  const g = headGeo({ jaw: 0.5, nose: 0.5, brow: 0.5 }, '#f1d0b5'), p = g.attributes.position, c = g.attributes.color;
  let best = null, bd = 1e9;
  for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getY(i) + 0.061, p.getZ(i) - 0.09); if (d < bd) { bd = d; best = i; } }
  const ex = [];
  for (let i = 0; i < p.count; i += 1) if (p.getZ(i) > 0.075 && Math.abs(p.getX(i)) < 0.003) ex.push([+p.getY(i).toFixed(3), +p.getZ(i).toFixed(3)]);
  ex.sort((a, b) => b[0] - a[0]);
  return { n: p.count, lipVertex: [p.getX(best), p.getY(best), p.getZ(best)], col: [c.getX(best), c.getY(best), c.getZ(best)], profile: ex.filter((_, i) => i % 3 === 0).slice(0, 40) };
})));
await close(); process.exit(0);
