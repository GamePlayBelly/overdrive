import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
const PORT = 5470;
const up = () => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port: PORT, path: '/index.html', timeout: 1500 }, () => { r.destroy(); res(true); }); r.on('error', () => res(false)); });
let server = null;
if (!(await up())) { server = spawn(process.execPath, ['server.mjs', String(PORT)], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 150)); }
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--window-position=0,0', '--window-size=1300,800', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://127.0.0.1:${PORT}/index.html`);
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const [x, z, yaw] = JSON.parse(process.env.SPOT || '[0,-60,0]');
await page.evaluate(({ x, z, yaw }) => { const g = window.__game, v = g.player.vehicle; v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); }, { x, z, yaw });
await new Promise((r) => setTimeout(r, 2500));
const sample = async (label) => {
  await new Promise((r) => setTimeout(r, 3500));
  const r = await page.evaluate(() => { const p = window.__game.perf; p._gpuHist.length = 0; return new Promise((res) => setTimeout(() => res({ gpuMed: +p.gpuMed().toFixed(1), p95: +p.gpuP95().toFixed(1), cpu: +p.cpu.toFixed(1) }), 2500)); });
  console.log(label.padEnd(30), JSON.stringify(r));
};
const run = (fn) => page.evaluate(fn);
const G = 'window.__game';
await sample('baseline');
await run(() => { const g = window.__game; g.__vis = g.scene.children.map((c) => c.visible); g.scene.children.forEach((c) => { if (c !== g.sky.dome) c.visible = false; }); }); await sample('sky only');
await run(() => { const g = window.__game; g.world.group.visible = true; g.world.group.children.forEach((c) => (c.__v = c.visible)); g.world.group.children.forEach((c) => { c.visible = false; }); }); await sample('sky + world group shell');
await run(() => { const g = window.__game; g.scene.children.forEach((c, i) => (c.visible = g.__vis[i])); g.world.group.children.forEach((c) => (c.visible = c.__v)); });
await run(() => { const g = window.__game; g.world.group.children.forEach((c) => (c.__v = c.visible)); g.world.group.children.forEach((c) => { if (c !== g.world.terrain.group && !c.isBatchedMesh) c.visible = false; }); }); await sample('hide misc world children');
await run(() => { const g = window.__game; g.world.group.children.forEach((c) => (c.visible = c.__v)); });
await browser.close(); if (server) server.kill(); process.exit(0);
