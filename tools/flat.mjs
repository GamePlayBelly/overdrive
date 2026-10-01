import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
console.log(JSON.stringify(await page.evaluate(() => {
  const w = window.__game.world, T = w.terrain, res = [];
  for (let x = -1200; x <= 1300; x += 100) for (let z = -1000; z <= 2300; z += 100) {
    let lo = 1e9, hi = -1e9, bad = 0;
    for (let i = 0; i <= 14; i++) for (let j = 0; j <= 2; j++) { const h = T.height(x + i * 50 - 350, z + j * 40 - 40); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    let n = 0; w.colliders.query(x, z, 420, -5, 40, (c) => { if (Math.abs(c.x - x) < 380 && Math.abs(c.z - z) < 90) n++; });
    if (hi - lo < 4 && lo > -0.2 && n <= 2) res.push([x, z, +lo.toFixed(1), +hi.toFixed(1)]);
  }
  return res.sort((a, b) => (a[3] - a[2]) - (b[3] - b[2])).slice(0, 12);
})));
await close(); process.exit(0);
