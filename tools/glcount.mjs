import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
const PORT = 5470;
const up = () => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port: PORT, path: '/index.html', timeout: 1500 }, () => { r.destroy(); res(true); }); r.on('error', () => res(false)); });
let server = null;
if (!(await up())) { server = spawn(process.execPath, ['server.mjs', String(PORT)], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 150)); }
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  window.__glc = {}; window.__glOn = false;
  const proto = WebGL2RenderingContext.prototype;
  for (const k of Object.getOwnPropertyNames(proto)) {
    const d = Object.getOwnPropertyDescriptor(proto, k); if (!d || typeof d.value !== 'function' || k === 'constructor') continue;
    const f = d.value;
    try { proto[k] = function (...a) { if (window.__glOn) window.__glc[k] = (window.__glc[k] || 0) + 1; return f.apply(this, a); }; } catch (e) {}
  }
});
await page.goto(`http://127.0.0.1:${PORT}/index.html`);
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const [x, z, yaw] = JSON.parse(process.env.SPOT || '[0,-60,0]');
console.log(await page.evaluate(() => { const gl = window.__game.renderer.getContext(); return [String(gl.drawElements).slice(0, 60), gl.constructor.name, Object.getOwnPropertyNames(WebGL2RenderingContext.prototype).length]; }));
const r = await page.evaluate(({ x, z, yaw }) => {
  window.__pauseLoop = true;
  const g = window.__game, v = g.player.vehicle; v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); g.pipeline.setQuality({ scale: 0.7, samples: 2, bloom: false }); g.sky.envAge = -1e9;
  for (let i = 0; i < 60; i++) { g.update(1 / 60); g.render(1 / 60); }
  window.__glc = {}; window.__glOn = true;
  g.update(1 / 60); g.render(1 / 60);
  window.__glOn = false;
  const c = window.__glc; const tot = Object.values(c).reduce((a, b) => a + b, 0);
  return { total: tot, top: Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 22) };
}, { x, z, yaw });
console.log(JSON.stringify(r.total), '\n' + r.top.map(([k, n]) => k.padEnd(28) + n).join('\n'));
await browser.close(); if (server) server.kill(); process.exit(0);
