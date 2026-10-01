import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(() => new Promise((res) => {
  window.__pauseLoop = true;
  const g = window.__game, v = g.player.vehicle, gl = g.renderer.getContext();
  v.place(-271.5, g.world.groundY(-271.5, 230, 60), 230, 3.14); g.rig.snapBehind();
  const rows = []; let n = 0, last = performance.now();
  const f = (t) => {
    const a = performance.now(); g.update(1 / 60); const b = performance.now(); g.render(); const c = performance.now(); gl.finish(); const d = performance.now();
    rows.push({ upd: b - a, sub: c - b, gpu: d - c, gap: t - last }); last = t;
    if (++n < 120) requestAnimationFrame(f); else {
      const med = (k) => { const a = rows.slice(30).map((x) => x[k]).sort((p, q) => p - q); return +a[Math.floor(a.length / 2)].toFixed(1); };
      res({ upd: med('upd'), submit: med('sub'), gpuWait: med('gpu'), rafGap: med('gap') });
    }
  };
  requestAnimationFrame(f);
}));
console.log(JSON.stringify(r));
await close(); process.exit(0);
