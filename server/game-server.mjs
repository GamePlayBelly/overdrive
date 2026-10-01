// Multiplayer server: a tiny dependency-free WebSocket implementation plus presence, friends, chat, lobbies, crews,
// leaderboards, position relay and an authoritative copy of every profile (economy rules come from the shared apply()).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { apply, migrate } from '../src/game/economy.js';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encode(str) {
  const data = Buffer.from(str);
  const n = data.length;
  let head;
  if (n < 126) head = Buffer.from([0x81, n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, data]);
}

class Conn {
  constructor(socket, onMessage, onClose) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.frag = null;
    this.onMessage = onMessage; this.onClose = onClose; this.alive = true;
    socket.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    socket.on('close', () => this.close()); socket.on('error', () => this.close());
  }
  parse() {
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      const mlen = masked ? 4 : 0;
      if (b.length < off + mlen + len) return;
      if (len > 2_000_000) { this.close(); return; }
      let payload = b.subarray(off + mlen, off + mlen + len);
      if (masked) { const m = b.subarray(off, off + 4); const out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ m[i & 3]; payload = out; }
      this.buf = b.subarray(off + mlen + len);
      if (op === 8) { this.close(); return; }
      if (op === 9) { this.socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (op === 1 || op === 0 || op === 2) {
        this.frag = this.frag ? Buffer.concat([this.frag, payload]) : payload;
        if (fin) { const s = this.frag.toString(); this.frag = null; try { this.onMessage(s); } catch (e) { console.error('ws message error', e.message); } }
      }
    }
  }
  send(obj) { if (this.alive) { try { this.socket.write(encode(JSON.stringify(obj))); } catch { this.close(); } } }
  close() { if (!this.alive) return; this.alive = false; try { this.socket.destroy(); } catch { /* closed */ } this.onClose(); }
}

export function attachGameServer(httpServer, dataDir = 'data') {
  const file = path.join(dataDir, 'server.json');
  let db = { profiles: {}, friends: {}, crews: {}, boards: {} };
  try { db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  let dirty = false;
  const save = () => { if (!dirty) return; dirty = false; try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(db)); } catch (e) { console.error('save failed', e.message); } };
  setInterval(save, 5000).unref?.();
  const touch = () => { dirty = true; };

  const clients = new Map(); // id -> client
  const lobbies = new Map();
  let lobbySeq = 1, crewSeq = 1;
  const summary = (c) => ({ id: c.id, name: c.name, level: c.level, rep: c.rep, color: c.color, model: c.model, status: c.lobbyId ? 'In lobby' : 'Free roam' });
  const broadcast = (fn, msg) => { for (const c of clients.values()) if (!fn || fn(c)) c.conn.send(msg); };
  const codeOf = (id) => id.slice(-8).toUpperCase();
  const byCode = (code) => { for (const id of Object.keys(db.profiles)) if (codeOf(id) === code) return id; return null; };

  const sendFriends = (c) => {
    const f = db.friends[c.id] || { list: [], incoming: [] };
    const card = (id) => { const o = clients.get(id); const p = db.profiles[id]; return o ? { ...summary(o), online: true } : p ? { id, name: p.name, level: p.level, online: false, color: '#39414a' } : { id, name: 'Unknown', online: false }; };
    c.conn.send({ t: 'friends', friends: f.list.map(card), requests: f.incoming.map(card) });
  };
  const lobbyView = (l) => ({ id: l.id, name: l.name, mode: l.mode, max: l.max, state: l.state, host: l.host, players: [...l.players].map((id) => ({ ...summary(clients.get(id) || { id, name: '?' }), ready: l.ready.has(id) })) });
  const sendLobbies = (c) => c.conn.send({ t: 'lobbies', lobbies: [...lobbies.values()].map((l) => ({ id: l.id, name: l.name, mode: l.mode, max: l.max, count: l.players.size, state: l.state })) });
  const pushLobby = (l) => { for (const id of l.players) clients.get(id)?.conn.send({ t: 'lobby', lobby: lobbyView(l) }); };
  const crewView = (id) => { const cr = db.crews[id]; if (!cr) return null; return { id, name: cr.name, tag: cr.tag, rep: cr.members.reduce((s, m) => s + (db.profiles[m.id]?.rep || 0), 0), members: cr.members.map((m) => ({ id: m.id, name: db.profiles[m.id]?.name || '?', level: db.profiles[m.id]?.level || 1, role: m.role, online: clients.has(m.id) })) }; };
  const leaveLobby = (c) => {
    const l = lobbies.get(c.lobbyId); c.lobbyId = null; if (!l) return;
    l.players.delete(c.id); l.ready.delete(c.id);
    if (!l.players.size) lobbies.delete(l.id); else { if (l.host === c.id) l.host = [...l.players][0]; pushLobby(l); }
    broadcast(null, { t: 'lobbies-changed' });
  };
  const count = () => broadcast(null, { t: 'count', n: clients.size });

  httpServer.on('upgrade', (req, socket) => {
    if (!req.url.startsWith('/ws')) { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    let me = null;
    const conn = new Conn(socket, (raw) => {
      const m = JSON.parse(raw);
      const reply = (o) => conn.send({ re: m.id, ...o });
      if (m.type === 'hello') {
        const pr = m.data.profile;
        if (!pr || !pr.id || typeof pr.id !== 'string') return reply({ ok: false, error: 'Bad profile' });
        // authoritative copy: keep what we already know, otherwise accept the first upload
        if (!db.profiles[pr.id]) { db.profiles[pr.id] = migrate(pr); touch(); }
        const P = db.profiles[pr.id];
        const old = clients.get(pr.id); if (old) old.conn.close();
        me = { id: pr.id, conn, name: P.name, level: P.level, rep: P.rep, color: P.garage.vehicles[0]?.custom?.color || '#888', model: P.garage.vehicles[0]?.model, x: 0, y: 0, z: 0, yaw: 0, speed: 0, lobbyId: null, at: Date.now(), profile: P };
        clients.set(me.id, me);
        reply({ ok: true, t: 'welcome', you: summary(me), profile: P, players: [...clients.values()].map(summary), count: clients.size });
        sendFriends(me); sendLobbies(me);
        const crewId = Object.keys(db.crews).find((id) => db.crews[id].members.some((x) => x.id === me.id));
        if (crewId) me.conn.send({ t: 'crew', crew: crewView(crewId) });
        const fl = db.friends[me.id]; if (fl) for (const id of fl.list) if (clients.has(id)) sendFriends(clients.get(id));
        count();
        return;
      }
      if (!me) return reply({ ok: false, error: 'Say hello first' });
      const d = m.data || {};
      switch (m.type) {
        case 'action': {
          const r = apply(me.profile, d.action);
          if (r.ok) { me.name = me.profile.name; me.level = me.profile.level; me.rep = me.profile.rep; touch(); }
          return reply({ ok: r.ok, error: r.error, grants: r.grants, profile: r.ok ? undefined : me.profile });
        }
        case 'pos': { me.x = d.x; me.y = d.y; me.z = d.z; me.yaw = d.yaw; me.speed = d.speed; me.model = d.model || me.model; me.color = d.color || me.color; me.at = Date.now(); return; }
        case 'friends.add': {
          const id = d.id || byCode(String(d.code || '').toUpperCase());
          if (!id || id === me.id || !db.profiles[id]) return reply({ ok: false, error: 'Player not found' });
          const mine = (db.friends[me.id] ||= { list: [], incoming: [] }), theirs = (db.friends[id] ||= { list: [], incoming: [] });
          if (mine.list.includes(id)) return reply({ ok: false, error: 'Already friends' });
          if (mine.incoming.includes(id)) { mine.incoming = mine.incoming.filter((x) => x !== id); mine.list.push(id); theirs.list.push(me.id); }
          else if (!theirs.incoming.includes(me.id)) theirs.incoming.push(me.id);
          touch(); reply({ ok: true }); sendFriends(me); if (clients.has(id)) sendFriends(clients.get(id));
          return;
        }
        case 'friends.accept': {
          const mine = (db.friends[me.id] ||= { list: [], incoming: [] }), theirs = (db.friends[d.id] ||= { list: [], incoming: [] });
          if (mine.incoming.includes(d.id)) { mine.incoming = mine.incoming.filter((x) => x !== d.id); mine.list.push(d.id); theirs.list.push(me.id); touch(); }
          reply({ ok: true }); sendFriends(me); if (clients.has(d.id)) sendFriends(clients.get(d.id));
          return;
        }
        case 'friends.remove': {
          const mine = (db.friends[me.id] ||= { list: [], incoming: [] }), theirs = (db.friends[d.id] ||= { list: [], incoming: [] });
          mine.list = mine.list.filter((x) => x !== d.id); mine.incoming = mine.incoming.filter((x) => x !== d.id); theirs.list = theirs.list.filter((x) => x !== me.id); touch();
          reply({ ok: true }); sendFriends(me); if (clients.has(d.id)) sendFriends(clients.get(d.id));
          return;
        }
        case 'chat.send': {
          const text = String(d.text || '').slice(0, 200); if (!text) return;
          const l = lobbies.get(me.lobbyId);
          const msg = { t: 'chat', name: me.name, id: me.id, text, lobby: !!l };
          if (l) for (const id of l.players) clients.get(id)?.conn.send(msg); else broadcast(null, msg);
          return;
        }
        case 'lobby.list': sendLobbies(me); return reply({ ok: true });
        case 'lobby.create': {
          if (me.lobbyId) leaveLobby(me);
          const id = 'L' + lobbySeq++;
          const l = { id, name: String(d.name || 'Lobby').slice(0, 30), mode: d.mode || 'freeroam', max: Math.min(16, d.max || 8), state: 'open', host: me.id, players: new Set([me.id]), ready: new Set() };
          lobbies.set(id, l); me.lobbyId = id; pushLobby(l); broadcast(null, { t: 'lobbies-changed' });
          return reply({ ok: true });
        }
        case 'lobby.join': {
          const l = lobbies.get(d.id); if (!l) return reply({ ok: false, error: 'Lobby closed' }); if (l.state !== 'open') return reply({ ok: false, error: 'Already started' }); if (l.players.size >= l.max) return reply({ ok: false, error: 'Lobby full' });
          if (me.lobbyId) leaveLobby(me);
          l.players.add(me.id); me.lobbyId = l.id; pushLobby(l); broadcast(null, { t: 'lobbies-changed' });
          return reply({ ok: true });
        }
        case 'lobby.leave': leaveLobby(me); me.conn.send({ t: 'lobby', lobby: null }); return reply({ ok: true });
        case 'lobby.ready': { const l = lobbies.get(me.lobbyId); if (l) { if (l.ready.has(me.id)) l.ready.delete(me.id); else l.ready.add(me.id); pushLobby(l); } return reply({ ok: true }); }
        case 'lobby.start': {
          const l = lobbies.get(me.lobbyId); if (!l || l.host !== me.id) return reply({ ok: false, error: 'Only the host can start' });
          l.state = 'running'; l.t0 = Date.now() + 5000; l.results = [];
          for (const id of l.players) clients.get(id)?.conn.send({ t: 'lobby.start', mode: l.mode, t0: l.t0, players: [...l.players], seed: (Math.random() * 1e9) | 0 });
          pushLobby(l); broadcast(null, { t: 'lobbies-changed' });
          return reply({ ok: true });
        }
        case 'race.finish': {
          const l = lobbies.get(me.lobbyId); if (!l) return reply({ ok: false });
          l.results.push({ id: me.id, name: me.name, time: d.time });
          for (const id of l.players) clients.get(id)?.conn.send({ t: 'race.results', results: l.results });
          if (l.results.length >= l.players.size) { l.state = 'open'; l.ready.clear(); pushLobby(l); }
          return reply({ ok: true, place: l.results.length });
        }
        case 'crew.list': return reply({ ok: true, crews: Object.entries(db.crews).map(([id, c]) => ({ id, name: c.name, tag: c.tag, count: c.members.length, rep: c.members.reduce((s, x) => s + (db.profiles[x.id]?.rep || 0), 0) })) });
        case 'crew.create': {
          if (Object.values(db.crews).some((c) => c.members.some((x) => x.id === me.id))) return reply({ ok: false, error: 'Leave your crew first' });
          const name = String(d.name || '').trim().slice(0, 24), tag = String(d.tag || '').trim().slice(0, 4).toUpperCase();
          if (name.length < 3 || tag.length < 2) return reply({ ok: false, error: 'Name 3+ letters, tag 2-4 letters' });
          const id = 'C' + Date.now().toString(36) + crewSeq++;
          db.crews[id] = { name, tag, members: [{ id: me.id, role: 'Leader' }] }; touch();
          me.conn.send({ t: 'crew', crew: crewView(id) });
          return reply({ ok: true });
        }
        case 'crew.join': {
          const c = db.crews[d.id]; if (!c) return reply({ ok: false, error: 'Crew not found' });
          if (Object.values(db.crews).some((x) => x.members.some((y) => y.id === me.id))) return reply({ ok: false, error: 'Leave your crew first' });
          if (c.members.length >= 20) return reply({ ok: false, error: 'Crew is full' });
          c.members.push({ id: me.id, role: 'Member' }); touch();
          for (const m of c.members) clients.get(m.id)?.conn.send({ t: 'crew', crew: crewView(d.id) });
          return reply({ ok: true });
        }
        case 'crew.leave': {
          const id = Object.keys(db.crews).find((k) => db.crews[k].members.some((x) => x.id === me.id)); if (!id) return reply({ ok: true });
          const c = db.crews[id]; c.members = c.members.filter((x) => x.id !== me.id);
          if (!c.members.length) delete db.crews[id]; else if (!c.members.some((x) => x.role === 'Leader')) c.members[0].role = 'Leader';
          touch(); me.conn.send({ t: 'crew', crew: null });
          if (db.crews[id]) for (const m of c.members) clients.get(m.id)?.conn.send({ t: 'crew', crew: crewView(id) });
          return reply({ ok: true });
        }
        case 'board.get': {
          const key = d.board, rows = Object.values(db.profiles).filter((p) => p.settings?.privacy?.leaderboards !== false).map((p) => ({ id: p.id, name: p.name, value: key === 'level' ? p.level : key === 'rep' ? p.rep : key === 'distance' ? Math.round((p.stats.distance || 0) / 1000) : p.stats[key] || 0 })).sort((a, b) => b.value - a.value).slice(0, 50);
          return reply({ ok: true, rows });
        }
        default: return reply({ ok: false, error: 'Unknown request' });
      }
    }, () => {
      if (!me) return;
      if (clients.get(me.id) === me) { leaveLobby(me); clients.delete(me.id); const fl = db.friends[me.id]; if (fl) for (const id of fl.list) if (clients.has(id)) sendFriends(clients.get(id)); count(); }
    });
  });

  // position relay: everybody near you (or in your lobby) at 10 Hz
  setInterval(() => {
    const now = Date.now();
    for (const a of clients.values()) {
      const peers = [];
      for (const b of clients.values()) {
        if (a === b || now - b.at > 4000) continue;
        const near = Math.hypot(a.x - b.x, a.z - b.z) < 500 || (a.lobbyId && a.lobbyId === b.lobbyId);
        if (near) peers.push({ id: b.id, n: b.name, x: b.x, y: b.y, z: b.z, yaw: b.yaw, s: b.speed, m: b.model, c: b.color });
      }
      a.conn.send({ t: 'peers', peers });
    }
  }, 100).unref?.();
  process.on('exit', save);
  return { clients, lobbies };
}
