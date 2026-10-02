// Multiplayer protocol test without a browser: two WebSocket clients against a fresh server (hello, friends by code, far-away roster,
// near-peer relay, keepalive, and friends surviving a server restart).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attachGameServer } from '../server/game-server.mjs';
import { newProfile } from '../src/game/economy.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };

function boot(port) {
  const srv = http.createServer((q, r) => { r.writeHead(200).end('ok'); });
  const game = attachGameServer(srv, dir);
  return new Promise((res) => srv.listen(port, () => res({ srv, game })));
}
function client(port, profile, friends) {
  const c = { ws: new WebSocket(`ws://127.0.0.1:${port}/ws`), seq: 1, pend: new Map(), msgs: [], profile };
  c.req = (type, data) => new Promise((res) => { const id = c.seq++; c.pend.set(id, res); c.ws.send(JSON.stringify({ id, type, data })); });
  c.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.re !== undefined) { c.pend.get(m.re)?.(m); c.pend.delete(m.re); } else c.msgs.push(m); };
  return new Promise((res, rej) => { c.ws.onopen = async () => res(Object.assign(c, { hello: await c.req('hello', { profile, friends }) })); c.ws.onerror = rej; });
}
const last = (c, t) => [...c.msgs].reverse().find((m) => m.t === t);

const A = newProfile('Alice'), B = newProfile('Bob');
A.id = 'prof-alice-' + 'a1b2c3d4'; B.id = 'prof-bob-' + 'e5f6a7b8';
let { srv, game } = await boot(5481);
let a = await client(5481, A), b = await client(5481, B);
ok(a.hello.ok && b.hello.ok, 'both clients say hello');
ok(b.hello.count === 2, 'server counts 2 players');
const code = B.id.slice(-8).toUpperCase();
ok((await a.req('friends.add', { code })).ok, 'Alice adds Bob by code');
await sleep(150);
ok(last(b, 'friends')?.requests.length === 1, 'Bob sees the request');
ok((await b.req('friends.accept', { id: A.id })).ok, 'Bob accepts');
await sleep(150);
ok(last(a, 'friends')?.friends.some((f) => f.id === B.id && f.online), 'Alice sees Bob as an online friend');
// positions: far apart -> roster only; close -> peers
a.ws.send(JSON.stringify({ type: 'pos', data: { x: 0, y: 0, z: 0, yaw: 0, speed: 0, model: 'civa' } }));
b.ws.send(JSON.stringify({ type: 'pos', data: { x: 3000, y: 0, z: 3000, yaw: 0, speed: 0, model: 'civa' } }));
await sleep(2300);
ok(last(a, 'peers')?.peers.length === 0, 'far player is not relayed at 10 Hz');
const ro = last(a, 'roster');
ok(ro && ro.list.some((p) => p.id === B.id && p.x === 3000), 'far player appears in the roster with position');
b.ws.send(JSON.stringify({ type: 'pos', data: { x: 30, y: 0, z: 40, yaw: 1, speed: 12, model: 'civa' } }));
await sleep(300);
ok(last(a, 'peers')?.peers.some((p) => p.id === B.id && p.s === 12), 'near player is relayed with speed');
b.ws.send(JSON.stringify({ type: 'pos', data: { x: 30, y: 0, z: 40, yaw: 1, speed: 2, foot: 1, model: 'civa' } }));
await sleep(250);
ok(last(a, 'peers')?.peers.some((p) => p.id === B.id && p.f === 1), 'on-foot players are flagged so clients draw an avatar');
const lk = await a.req('player.look', { id: B.id });
ok(lk.ok && typeof lk.look === 'object', 'avatar look can be fetched for a remote player');
b.ws.send(JSON.stringify({ type: 'pos', data: { x: 'bad', y: 0, z: 0, yaw: 0, speed: 0 } }));
await sleep(150);
ok(last(a, 'peers')?.peers.every((p) => Number.isFinite(p.x)), 'garbage positions are ignored');
ok((await a.req('ping')).ok, 'ping answered');
// lobby
ok((await a.req('lobby.create', { name: 'T', mode: 'race' })).ok, 'lobby create');
await sleep(100);
const lid = last(a, 'lobby')?.lobby?.id;
ok((await b.req('lobby.join', { id: lid })).ok, 'lobby join');
// server restart: wipe sessions, keep disk
a.ws.close(); b.ws.close(); await sleep(200);
await new Promise((r) => srv.close(r)); game = null;
await sleep(300);
fs.rmSync(path.join(dir, 'server.json'), { force: true }); // worst case: a host with an ephemeral disk
({ srv, game } = await boot(5482));
a = await client(5482, A, ['x', B.id]); b = await client(5482, B, [A.id]);
await sleep(300);
ok(last(a, 'friends')?.friends.some((f) => f.id === B.id), 'friendship restored after the server lost its data');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
