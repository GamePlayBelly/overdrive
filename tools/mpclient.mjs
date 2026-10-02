// NetClient against a real server without a browser: auto-connect, saved server address, silent link loss, automatic reconnect with
// backoff, keepalive ping, and a clean manual disconnect that stays disconnected.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attachGameServer } from '../server/game-server.mjs';
import { newProfile } from '../src/game/economy.js';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.location = { protocol: 'http:', host: '127.0.0.1:5491', search: '' };
const { NetClient } = await import('../src/net/client.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-'));
const boot = (port) => new Promise((res) => { const srv = http.createServer((q, r) => r.end('ok')); const sockets = new Set(); srv.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); }); srv.on('upgrade', (q, s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); }); const g = attachGameServer(srv, dir); srv.listen(port, () => res({ srv, g, kill: () => new Promise((r) => { for (const s of sockets) s.destroy(); srv.close(r); }) })); });

const profile = newProfile('Tester'); profile.id = 'prof-test-12345678';
const app = { profile, store: { replace() {}, profile }, heroSpec: () => ({ model: 'civa' }) };
let s = await boot(5491);
const net = new NetClient(app);
ok(net.url === 'ws://127.0.0.1:5491/ws', 'default address is this host: ' + net.url);
net.autoConnect();
for (let i = 0; i < 40 && !net.connected; i++) await sleep(100);
ok(net.connected, 'auto-connected');
ok(net.count === 1, 'sees itself online');
// link drops: server dies
let dropped = false; net.on('disconnect', () => { dropped = true; });
await s.kill(); await sleep(400);
ok(!net.connected && dropped, 'link loss detected');
ok(net.wantOnline && net.retryT > 0, 'retry scheduled (' + net.retryT + ' s)');
s = await boot(5491);
for (let i = 0; i < 400 && !net.connected; i++) { net.tick(0.05, { player: { vehicle: null, x: 0, y: 0, z: 0, yaw: 0, speed: 0 } }); await sleep(10); }
ok(net.connected, 'reconnected by itself after the server came back');
// keepalive
net.pingT = 100; net.tick(0.01, { player: { vehicle: null, x: 0, y: 0, z: 0, yaw: 0, speed: 0 } });
await sleep(200); ok(performance.now() - net.lastRx < 1000, 'server traffic keeps arriving');
// manual disconnect stays off
net.disconnect(); await sleep(200);
ok(!net.connected && !net.wantOnline && store.get('od.net') === 'off', 'manual disconnect sticks');
for (let i = 0; i < 100; i++) net.tick(0.1, { player: { vehicle: null, x: 0, y: 0, z: 0, yaw: 0, speed: 0 } });
ok(!net.ws, 'does not reconnect after a manual disconnect');
// explicit address is remembered and understood in several spellings
globalThis.location.search = '?server=https://game.example.com';
ok(NetClient.defaultUrl() === 'wss://game.example.com/ws', 'https:// address becomes wss://…/ws: ' + NetClient.defaultUrl());
globalThis.location.search = '?server=wss://game.example.com/ws';
ok(NetClient.defaultUrl() === 'wss://game.example.com/ws', 'full wss address kept');
await s.kill();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
