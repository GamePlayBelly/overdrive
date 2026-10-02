import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
const PORT = 5481;
const up = () => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port: PORT, path: '/index.html', timeout: 1500 }, () => { r.destroy(); res(true); }); r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); }); });
const server = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 150));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } }), page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(name, 'PAGEERROR', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html?dev=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
  return page;
};
const [A, B] = await Promise.all([mk('A'), mk('B')]);
const wait = (p, f, t = 25000) => p.waitForFunction(f, null, { timeout: t }).then(() => true).catch(() => false);
console.log('A auto online', await wait(A, () => window.__app.net.connected), 'B auto online', await wait(B, () => window.__app.net.connected));
// distinguish the two profiles (dev starts both as 'Dev')
const idB = await B.evaluate(() => { window.__app.store.profile.name = 'Beta'; return window.__app.store.profile.id; });
await A.evaluate(() => { window.__app.store.profile.name = 'Alpha'; });
const codeB = idB.slice(-8).toUpperCase();
console.log('codeB', codeB);
const r1 = await A.evaluate(async (c) => (await window.__app.net.request('friends.add', { code: c })), codeB);
console.log('A add B', JSON.stringify(r1));
console.log('B sees request', await wait(B, () => window.__app.net.requests.length > 0, 5000));
const idA = await A.evaluate(() => window.__app.store.profile.id);
const r2 = await B.evaluate(async (id) => (await window.__app.net.request('friends.accept', { id })), idA);
console.log('B accept', JSON.stringify(r2));
console.log('A friends', await wait(A, () => window.__app.net.friends.length === 1, 5000), 'B friends', await wait(B, () => window.__app.net.friends.length === 1, 5000));
console.log('persisted', JSON.stringify(await A.evaluate(() => window.__app.store.profile.social)));
// put both in the same place: A in a car, B on foot
await A.evaluate(() => { const g = window.__game, v = g.player.vehicle; v.place(-271, g.world.groundY(-271, 230, 60), 230, 0); });
await B.evaluate(() => { const g = window.__game, P = g.player; P.exit?.(); P.vehicle = null; P.seq = null; P.state = 'foot'; P.x = -265; P.z = 240; P.y = g.world.groundY(-265, 240, 60); });
await new Promise((r) => setTimeout(r, 2500));
for (const [n, p] of [['A', A], ['B', B]]) console.log(n, JSON.stringify(await p.evaluate(() => { const net = window.__app.net, rem = window.__app.remote; return { peers: net.peers.size, ghosts: rem.list.size, foot: [...net.peers.values()].map((q) => q.foot), kinds: [...rem.list.values()].map((r) => (r.foot ? 'person' : 'car')), friendLoc: net.friends.map((f) => [f.online, Math.round(f.x || 0)]) }; })));
// server restart simulation: new server would forget friends; client re-sends them on hello
await A.evaluate(() => window.__app.net.ws.close());
console.log('A reconnects', await wait(A, () => window.__app.net.connected, 25000));
console.log('A friends after reconnect', await A.evaluate(() => window.__app.net.friends.length));
await browser.close(); server.kill(); process.exit(0);
