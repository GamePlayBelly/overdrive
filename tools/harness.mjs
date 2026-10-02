import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.RW_PORT || 5470);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

async function up(port) {
  return new Promise((res) => { const r = http.get({ host: '127.0.0.1', port, path: '/index.html', timeout: 1500 }, () => { r.destroy(); res(true); }); r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); }); });
}

export async function launch({ width = 1280, height = 720, dpr = 1, query = '?dev=1', headless = true, fastFrames = false } = {}) {
  let server = null;
  if (!(await up(PORT))) {
    server = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 40 && !(await up(PORT)); i++) await new Promise((r) => setTimeout(r, 150));
  }
  const exe = process.env.CHROME_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
  const args = exe ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required']
    : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
  if (fastFrames) args.push('--disable-frame-rate-limit', '--disable-gpu-vsync');
  const browser = await chromium.launch(exe ? { executablePath: exe, headless, args } : { channel: 'msedge', headless, args });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  const logs = [];
  page.on('pageerror', (e) => { logs.push('PAGEERROR ' + e.message); console.error('pageerror:', e.message); });
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') { logs.push(t + ' ' + m.text()); if (!/getImageData|willReadFrequently/.test(m.text())) console.error(t + ':', m.text()); } });
  await page.goto(`http://127.0.0.1:${PORT}/index.html${query}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const close = async () => { await browser.close(); if (server) server.kill(); };
  return { page, browser, close, logs, port: PORT };
}

export async function shot(page, name) {
  const dir = path.join(ROOT, 'data', 'shots');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name + '.png');
  await page.screenshot({ path: f });
  return f;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
