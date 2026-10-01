import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
const PORT = 5470;
const up = () => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port: PORT, path: '/index.html', timeout: 1500 }, () => { r.destroy(); res(true); }); r.on('error', () => res(false)); });
let server = null;
if (!(await up())) { server = spawn(process.execPath, ['server.mjs', String(PORT)], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 150)); }
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--window-position=0,0', '--window-size=1300,800', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${PORT}/index.html`);
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
await page.evaluate(() => { const g = window.__game, v = g.player.vehicle; v.place(0, g.world.groundY(0, -60, 60), -60, 0); g.rig.snapBehind(); g.pipeline.setQuality({ scale: 0.7, samples: 2, bloom: false }); g.sky.envAge = -1e9; });
await new Promise((r) => setTimeout(r, 3000));
await browser.startTracing(page, { categories: ['gpu', 'gpu.angle', 'disabled-by-default-gpu.angle', 'disabled-by-default-gpu.service', 'toplevel'] });
await new Promise((r) => setTimeout(r, 2500));
const buf = await browser.stopTracing();
fs.writeFileSync('data/trace.json', buf);
const tr = JSON.parse(buf.toString()); const ev = tr.traceEvents || tr;
const names = {}; const threads = {};
for (const e of ev) { if (e.ph === 'M' && e.name === 'thread_name') threads[e.pid + ':' + e.tid] = e.args.name; }
const byThread = {};
const evs = ev.filter((e) => e.ph === 'X' && e.dur).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
const stacks = {};
for (const e of evs) {
  const th = threads[e.pid + ':' + e.tid] || (e.pid + ':' + e.tid);
  const st = (stacks[th] = stacks[th] || []);
  while (st.length && st[st.length - 1].end <= e.ts) st.pop();
  const rec = { end: e.ts + e.dur, name: e.name, dur: e.dur, child: 0 };
  if (st.length) st[st.length - 1].child += e.dur;
  st.push(rec); e.__rec = rec;
}
for (const e of evs) {
  const th = threads[e.pid + ':' + e.tid] || (e.pid + ':' + e.tid);
  const self = e.dur - e.__rec.child;
  byThread[th] = byThread[th] || { total: 0, top: {} };
  byThread[th].total += self; byThread[th].top[e.name] = (byThread[th].top[e.name] || 0) + self;
}
const rows = Object.entries(byThread).sort((a, b) => b[1].total - a[1].total).slice(0, 4);
for (const [th, v] of rows) { console.log(th.padEnd(28), 'self-busy ms in window:', Math.round(v.total / 1000)); const top = Object.entries(v.top).sort((a, b) => b[1] - a[1]).slice(0, 14); for (const [n, d] of top) console.log('     ', String(Math.round(d / 1000)).padStart(6), n.slice(0, 80)); }
await browser.close(); if (server) server.kill(); process.exit(0);
