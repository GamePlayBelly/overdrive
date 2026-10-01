import { launch, shot, sleep } from './harness.mjs';
const { page, close, logs } = await launch({ width: 1280, height: 720, fastFrames: false });
const t0 = Date.now();
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 180000 });
console.log('ready in', Date.now() - t0, 'ms');
await sleep(1500);
const info = await page.evaluate(() => {
  const g = window.__game, gl = g.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { gpu: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL), vis: document.visibilityState, size: [innerWidth, innerHeight], timer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
});
console.log(info);
await shot(page, 'probe');
await close();
