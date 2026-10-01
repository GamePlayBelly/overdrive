import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const [x, z, yaw] = JSON.parse(process.env.SPOT || '[0,-60,0]');
const r = await page.evaluate(({ x, z, yaw }) => new Promise((res) => {
  window.__pauseLoop = true;
  const g = window.__game, gl = g.renderer.getContext(), v = g.player.vehicle, px = new Uint8Array(4);
  v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); g.pipeline.setQuality({ scale: 0.5, samples: 0, bloom: false, fxaa: true }); g.sky.envAge = -1e9;
  const results = {};
  const trial = (label, doUpdate, n = 70) => new Promise((done) => {
    const rows = []; let i = 0;
    const step = () => {
      const t0 = performance.now();
      if (doUpdate) g.update(1 / 60);
      const t1 = performance.now();
      g.render(1 / 60);
      const t2 = performance.now();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t3 = performance.now();
      if (i++ > 15) rows.push({ upd: t1 - t0, sub: t2 - t1, gpuwait: t3 - t2 });
      if (i < n) setTimeout(step, 0); else { const med = (k) => { const a = rows.map((r) => r[k]).sort((p, q) => p - q); return +a[a.length >> 1].toFixed(1); }; results[label] = { update: med('upd'), submit: med('sub'), waitForGpu: med('gpuwait') }; done(); }
    };
    step();
  });
  (async () => { await trial('render only', false); await trial('update+render', true); res(results); })();
}), { x, z, yaw });
console.log(JSON.stringify(r, null, 1));
await close(); process.exit(0);
