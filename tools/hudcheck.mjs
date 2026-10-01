import { launch, shot } from './harness.mjs';
const { page, close } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));
const r = await page.evaluate(() => {
  const h = document.getElementById('hud'), cs = h && getComputedStyle(h);
  const ui = document.getElementById('ui'), cu = ui && getComputedStyle(ui);
  return { hud: !!h, display: cs?.display, opacity: cs?.opacity, vis: cs?.visibility, ui: cu?.display, uiOp: cu?.opacity, cls: document.body.className, uiCls: ui?.className, hudCls: h?.className, wind: !!document.querySelector('.wind-box'), mode: window.__app.mode, hidden: window.__app.hud?.hidden };
});
console.log(JSON.stringify(r));
console.log(await shot(page, 'hudcheck'));
await close(); process.exit(0);
