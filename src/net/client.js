// WebSocket client for the multiplayer server. Everything degrades gracefully when offline.
export class NetClient {
  constructor(app) {
    this.app = app;
    this.url = location.protocol === 'file:' ? 'ws://localhost:5466/ws' : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    this.ws = null; this.state = 'offline';
    this.you = null; this.friends = []; this.requests = []; this.players = []; this.lobbies = []; this.lobby = null; this.crew = null; this.chat = []; this.count = 0;
    this.peers = new Map();
    this.listeners = new Set(); this.pending = new Map(); this.seq = 1; this.posT = 0;
    this.handlers = {};
  }

  get connected() { return this.state === 'online'; }
  on(ev, fn) { if (ev === 'update') { this.listeners.add(fn); return () => this.listeners.delete(fn); } (this.handlers[ev] ||= []).push(fn); return () => { this.handlers[ev] = this.handlers[ev].filter((f) => f !== fn); }; }
  emit() { for (const f of this.listeners) f(); }
  fire(ev, data) { for (const f of this.handlers[ev] || []) f(data); }

  connect(url = this.url) {
    if (this.ws) this.disconnect();
    this.url = url; this.state = 'connecting'; this.emit();
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { this.state = 'offline'; this.emit(); reject(e); return; }
      this.ws = ws;
      const t = setTimeout(() => { if (this.state !== 'online') { ws.close(); reject(new Error('timeout')); } }, 6000);
      ws.onopen = () => { const p = this.app.profile; this.request('hello', { profile: p }).then((r) => { clearTimeout(t); if (!r.ok) { reject(new Error(r.error)); return; } this.state = 'online'; this.you = r.you; this.players = r.players; this.count = r.count; this.emit(); if (r.profile && r.profile.seq > p.seq) this.app.store.replace(r.profile); resolve(r); }); };
      ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
      ws.onclose = () => { clearTimeout(t); const was = this.state === 'online'; this.state = 'offline'; this.ws = null; this.peers.clear(); this.lobby = null; this.emit(); this.fire('disconnect'); if (!was) reject(new Error('closed')); };
      ws.onerror = () => { /* onclose handles it */ };
    });
  }

  disconnect() { if (this.ws) { try { this.ws.close(); } catch { /* closed */ } } this.ws = null; this.state = 'offline'; this.peers.clear(); this.lobby = null; this.crew = null; this.emit(); }

  send(type, data) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type, data })); }
  request(type, data) {
    if (!this.ws || this.ws.readyState !== 1) return Promise.resolve({ ok: false, error: 'Offline' });
    const id = this.seq++;
    return new Promise((res) => { this.pending.set(id, res); this.ws.send(JSON.stringify({ id, type, data })); setTimeout(() => { if (this.pending.delete(id)) res({ ok: false, error: 'No response' }); }, 8000); });
  }

  sendAction(action) { this.request('action', { action }).then((r) => { if (!r.ok && r.profile) this.app.store.replace(r.profile); }); }

  onMessage(m) {
    if (m.re !== undefined) { const f = this.pending.get(m.re); if (f) { this.pending.delete(m.re); f(m); } return; }
    switch (m.t) {
      case 'friends': this.friends = m.friends; this.requests = m.requests; break;
      case 'lobbies': this.lobbies = m.lobbies; break;
      case 'lobbies-changed': this.request('lobby.list'); return;
      case 'lobby': this.lobby = m.lobby; this.fire('lobby', m.lobby); break;
      case 'lobby.start': this.fire('lobbyStart', m); break;
      case 'race.results': this.fire('raceResults', m.results); break;
      case 'crew': this.crew = m.crew; this.app.store.profile && m.crew && this.app.store.act({ type: 'stat', key: 'crewJoined', amount: 1 }); break;
      case 'chat': this.chat.push(m); if (this.chat.length > 100) this.chat.shift(); this.fire('chat', m); break;
      case 'count': this.count = m.n; break;
      case 'peers': { const seen = new Set(); for (const p of m.peers) { seen.add(p.id); let q = this.peers.get(p.id); if (!q) { q = { id: p.id, name: p.n, model: p.m, color: p.c, x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.s, px: p.x, pz: p.z, pyaw: p.yaw, t: performance.now() }; this.peers.set(p.id, q); } q.px = q.x; q.pz = q.z; q.pyaw = q.yaw; q.x = p.x; q.y = p.y; q.z = p.z; q.yaw = p.yaw; q.speed = p.s; q.model = p.m; q.color = p.c; q.t = performance.now(); } for (const id of [...this.peers.keys()]) if (!seen.has(id)) this.peers.delete(id); return; }
      default: return;
    }
    this.emit();
  }

  // called every frame from the app; sends the local vehicle at 10 Hz
  tick(dt, game) {
    if (!this.connected) return;
    this.posT += dt;
    if (this.posT < 0.1) return;
    this.posT = 0;
    const P = game.player, v = P.vehicle && P.state === 'driving' ? P.vehicle : null;
    const pos = v || P;
    this.send('pos', { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), yaw: +(pos.yaw || 0).toFixed(3), speed: v ? +v.speed.toFixed(1) : P.speed, model: v ? v.def.id : this.app.heroSpec().model, color: v ? '#' + (v.car?.mats?.paint?.color?.getHexString?.() || '888888') : undefined });
  }
}
