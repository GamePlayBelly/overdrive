import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
const PORT = 5470;
const up = () => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port: PORT, path: '/index.html', timeout: 1500 }, () => { r.destroy(); res(true); }); r.on('error', () => res(false)); });
let server = null;
if (!(await up())) { server = spawn(process.execPath, ['server.mjs', String(PORT)], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 150)); }
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--window-position=0,0', '--window-size=1300,800', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://127.0.0.1:${PORT}/index.html`);
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const [x, z, yaw] = JSON.parse(process.env.SPOT || '[0,-60,0]');
await page.evaluate(({ x, z, yaw }) => { const g = window.__game, v = g.player.vehicle; v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); }, { x, z, yaw });
await new Promise((r) => setTimeout(r, 2500));
const measure = async (label, secs = 3) => {
  await new Promise((r) => setTimeout(r, 1500));
  const r = await page.evaluate((secs) => new Promise((res) => { const ts = []; const t0 = performance.now(); const f = (t) => { ts.push(t); if (t - t0 < secs * 1000) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ ms: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1), p50: +d[Math.floor(d.length / 2)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1) }); } }; requestAnimationFrame(f); }), secs);
  console.log(label.padEnd(28), JSON.stringify(r));
};
const run = (fn) => page.evaluate(fn);
const scenarios = eval('(' + (process.env.SCEN || '[]') + ')');
const items = {
  terrain: () => window.__game.world.terrain.group, veg: () => window.__game.world.veg.group, props: () => window.__game.world.props.group,
  cars: () => window.__game.traffic.batch.group, cast: () => window.__game.world.store.batches.cast, ground: () => window.__game.world.store.batches.ground, decal: () => window.__game.world.store.batches.decal,
  proxy: () => window.__game.world.store.proxyBM, contact: () => window.__game.contact.mesh, peds: () => window.__game.peds.renderer.meshes,
};
if (process.env.Q) await page.evaluate((q) => { window.__game.pipeline.setQuality(JSON.parse(q)); }, process.env.Q);
if (process.env.NOPERF) await page.evaluate(() => { window.__game.perf.ext = null; });
await run(() => { const g = window.__game; g.sky.envAge = -1e9; });
await measure('baseline');
await measure('baseline again');
await browser.close(); if (server) server.kill(); process.exit(0);
