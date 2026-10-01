import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
const PORT = 5470;
const up = () => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port: PORT, path: '/index.html', timeout: 1500 }, () => { r.destroy(); res(true); }); r.on('error', () => res(false)); });
let server = null;
if (!(await up())) { server = spawn(process.execPath, ['server.mjs', String(PORT)], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 150)); }
const headless = process.env.HEADLESS === '1';
const browser = await chromium.launch({ channel: 'msedge', headless, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--window-position=0,0', '--window-size=1300,800', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://127.0.0.1:${PORT}/index.html`);
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
if (process.env.Q) await page.evaluate((q) => { const g = window.__game; g.pipeline.setQuality(JSON.parse(q)); if (JSON.parse(q).shadow !== undefined) { g.sky.shadowSize = JSON.parse(q).shadow; g.sky.sun.shadow.mapSize.set(JSON.parse(q).shadow, JSON.parse(q).shadow); g.sky.sun.shadow.map?.dispose(); g.sky.sun.shadow.map = null; } }, process.env.Q);
const spots = JSON.parse(process.env.SPOTS || '[[-271.5,230,3.14],[0,-60,0],[420,60,1.57],[-800,-100,1.57]]');
for (const [x, z, yaw] of spots) {
  await page.evaluate(({ x, z, yaw }) => { const g = window.__game, v = g.player.vehicle; v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); }, { x, z, yaw });
  await new Promise((r) => setTimeout(r, 1500));
  const r = await page.evaluate(() => new Promise((res) => {
    const ts = []; const t0 = performance.now();
    const f = (t) => { ts.push(t); if (t - t0 < 4000) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); const info = window.__game.renderer.info; const pf = window.__game.perf; res({ jsUpdate: +window.__ft.u.toFixed(1), jsRender: +window.__ft.r.toFixed(1), fps: +(d.length / ((ts[ts.length - 1] - ts[0]) / 1000)).toFixed(1), p50: +d[Math.floor(d.length * 0.5)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), gpuMs: +pf.gpu.toFixed(1), gpuP95: +pf.gpuP95().toFixed(1), cpuRenderMs: +pf.cpu.toFixed(1), tris: info.render.triangles, calls: info.render.calls }); } };
    requestAnimationFrame(f);
  }));
  console.log(JSON.stringify({ at: [x, z], mode: headless ? 'headless' : 'headed', ...r }));
}
await browser.close(); if (server) server.kill(); process.exit(0);
