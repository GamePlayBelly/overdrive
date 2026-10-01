import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

// Renders one car from several angles on a studio floor: CAR=gts VIEWS=front34,rear34,side,top node tools/carstudio.mjs
const PORT = Number(process.env.RW_PORT || 5470);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const up = (port) => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port, path: '/index.html', timeout: 1500 }, () => { r.destroy(); res(true); }); r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); }); });
let server = null;
if (!(await up(PORT))) { server = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: ROOT, stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up(PORT)); i++) await new Promise((r) => setTimeout(r, 150)); }
const q = new URLSearchParams();
for (const k of ['car', 'color', 'views', 'env', 'fov', 'exp', 'bg', 'floor', 'spoiler', 'rims', 'doors', 'hide', 'lights', 'brake', 'w', 'h']) if (process.env[k.toUpperCase()]) q.set(k, process.env[k.toUpperCase()]);
const W = Number(process.env.W || 1600), H = Number(process.env.H || 900);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(m.type() + ':', m.text().slice(0, 500)); });
await page.goto(`http://127.0.0.1:${PORT}/tools/car_studio.html?${q}`);
await page.waitForFunction(() => window.__done, null, { timeout: 60000 });
const out = path.join(ROOT, 'data', 'shots', (process.env.NAME || 'studio_' + (process.env.CAR || 'gts')) + '.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log(out);
await browser.close(); if (server) server.kill(); process.exit(0);
