import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(() => new Promise((res) => {
  window.__pauseLoop = true;
  const g = window.__game, R = g.renderer, gl = R.getContext();
  const saved = []; g.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isLine) { saved.push([o, o.visible]); if (o !== g.sky.dome) o.visible = false; } });
  const orig = R.shadowMap.render.bind(R.shadowMap); let shCpu = 0, shN = 0;
  R.shadowMap.render = (...a) => { const t = performance.now(); orig(...a); shCpu += performance.now() - t; shN++; };
  const trials = {};
  const loop = (label, n, fn) => new Promise((done) => { let i = 0, t0 = 0; shCpu = 0; shN = 0; const f = () => { if (i === 5) { t0 = performance.now(); shCpu = 0; shN = 0; } fn(); gl.finish(); if (++i < n + 5) requestAnimationFrame(f); else { trials[label] = { frameMs: +((performance.now() - t0) / n).toFixed(1), shadowCpuMs: +(shCpu / Math.max(1, shN)).toFixed(2) }; done(); } }; requestAnimationFrame(f); });
  (async () => {
    await loop('empty scene, shadow on', 60, () => g.render());
    g.sky.sun.castShadow = false; await loop('empty scene, shadow off', 60, () => g.render()); g.sky.sun.castShadow = true;
    R.shadowMap.enabled = false; await loop('shadowMap.enabled=false', 60, () => g.render()); R.shadowMap.enabled = true;
    const sh = g.sky.sun.shadow; const old = sh.mapSize.x; sh.mapSize.set(512, 512); sh.map?.dispose(); sh.map = null; await loop('shadow map 512', 60, () => g.render()); sh.mapSize.set(old, old); sh.map?.dispose(); sh.map = null;
    res(trials);
  })();
}));
console.log(JSON.stringify(r, null, 1));
await close(); process.exit(0);
