import { launch } from './harness.mjs';
// JS heap, geometry/texture counts and draw calls right after loading.
const { page, close } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 2500));
const r = await page.evaluate(() => {
  const m = performance.memory || {}, g = window.__game, ri = g.renderer?.info || g.pipeline?.renderer?.info;
  return { heapMB: Math.round((m.usedJSHeapSize || 0) / 1048576), totalMB: Math.round((m.totalJSHeapSize || 0) / 1048576), limitMB: Math.round((m.jsHeapSizeLimit || 0) / 1048576), geo: ri?.memory?.geometries, tex: ri?.memory?.textures, calls: ri?.render?.calls, tris: ri?.render?.triangles, buildMs: Math.round(g.world.buildMs || 0) };
});
console.log(JSON.stringify(r));
await close(); process.exit(0);
