// WebSocket client for the multiplayer server. Everything degrades gracefully when offline.
export class NetClient {
  constructor(app) {
    this.app = app;
    this.url = NetClient.defaultUrl();
    this.ws = null; this.state = 'offline'; this.wantOnline = false; this.retry = 0; this.retryT = 0; this.lastRx = 0; this.pingT = 0; this.lastError = '';
    this.roster = new Map();
    this.you = null; this.friends = []; this.requests = []; this.players = []; this.lobbies = []; this.lobby = null; this.crew = null; this.chat = []; this.count = 0;
    this.peers = new Map();
    this.listeners = new Set(); this.pending = new Map(); this.seq = 1; this.posT = 0;
    this.handlers = {};
  }

  // server address: ?server=wss://host/ws, then the one saved by the player, then a page-level override, then this very host
  static defaultUrl() {
    let u = '';
    try { u = new URLSearchParams(location.search).get('server') || localStorage.getItem('od.server') || ''; } catch { /* storage blocked */ }
    if (!u && typeof window !== 'undefined' && window.OVERDRIVE_SERVER) u = window.OVERDRIVE_SERVER;
    if (u) { if (/^https?:\/\//.test(u)) u = u.replace(/^http/, 'ws'); if (!/\/ws$/.test(u) && !/\/ws\?/.test(u)) u = u.replace(/\/+$/, '') + '/ws'; return u; }
    return NetClient.hostUrl();
  }

  static hostUrl() { return location.protocol === 'file:' ? 'ws://localhost:5466/ws' : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`; }

  get connected() { return this.state === 'online'; }
  get autoOk() { try { return localStorage.getItem('od.net') !== 'off'; } catch { return true; } }
  get friendIds() { return this.friends.map((f) => f.id); }
  on(ev, fn) { if (ev === 'update') { this.listeners.add(fn); return () => this.listeners.delete(fn); } (this.handlers[ev] ||= []).push(fn); return () => { this.handlers[ev] = this.handlers[ev].filter((f) => f !== fn); }; }
  emit() { for (const f of this.listeners) f(); }
  fire(ev, data) { for (const f of this.handlers[ev] || []) f(data); }

  // join automatically and keep trying (sleeping free hosts need a while to wake up, and mobile networks drop)
  autoConnect() {
    if (!this.autoOk || this.wantOnline) return;
    this.wantOnline = true; this.retry = 0;
    this.connect().catch(() => this.scheduleRetry());
  }

  scheduleRetry() {
    if (!this.wantOnline || this.state === 'online' || this.state === 'connecting') return;
    this.retry++;
    this.retryT = Math.min(20, 1.5 * 2 ** Math.min(4, this.retry - 1));
  }

  connect(url = this.url, manual = false) {
    if (this.ws) this.close(true);
    this.url = url; this.state = 'connecting'; this.lastError = ''; this.emit();
    if (manual) { this.wantOnline = true; try { localStorage.setItem('od.net', 'on'); } catch { /* storage blocked */ } }
    return new Promise((resolve, reject) => {
      let ws, settled = false;
      const fail = (e) => { if (settled) return; settled = true; clearTimeout(t); this.lastError = e.message || String(e); reject(e); };
      try { ws = new WebSocket(url); } catch (e) { this.state = 'offline'; this.lastError = 'Bad server address'; this.emit(); reject(e); return; }
      this.ws = ws;
      const t = setTimeout(() => { if (this.state !== 'online') { try { ws.close(); } catch { /* closed */ } fail(new Error('Server did not answer (it may be waking up)')); } }, 15000);
      ws.onopen = () => {
        const p = this.app.profile;
        this.request('hello', { profile: p, friends: this.friendIds.length ? this.friendIds : this.savedFriends() }).then((r) => {
          if (!r.ok) { fail(new Error(r.error || 'Rejected')); return; }
          settled = true; clearTimeout(t); this.state = 'online';
          if (manual) { try { if (url === NetClient.hostUrl()) localStorage.removeItem('od.server'); else localStorage.setItem('od.server', url); } catch { /* storage blocked */ } } this.retry = 0; this.you = r.you; this.players = r.players; this.count = r.count; this.lastRx = performance.now(); this.pingT = 0; this.emit();
          if (r.profile && r.profile.seq > p.seq) this.app.store.replace(r.profile);
          resolve(r);
        });
      };
      ws.onmessage = (e) => { this.lastRx = performance.now(); let m; try { m = JSON.parse(e.data); } catch { return; } this.onMessage(m); };
      ws.onclose = () => {
        clearTimeout(t); const was = this.state === 'online';
        if (this.ws !== ws) return;
        this.state = 'offline'; this.ws = null; this.peers.clear(); this.roster.clear(); this.lobby = null; this.emit(); this.fire('disconnect');
        fail(new Error(was ? 'Connection lost' : 'Could not reach the server'));
        this.scheduleRetry();
      };
      ws.onerror = () => { /* onclose handles it */ };
    });
  }

  savedFriends() { try { return JSON.parse(localStorage.getItem('od.friends') || '[]'); } catch { return []; } }

  close(silent) { const ws = this.ws; this.ws = null; if (ws) { ws.onclose = null; try { ws.close(); } catch { /* closed */ } } this.state = 'offline'; this.peers.clear(); this.roster.clear(); this.lobby = null; if (!silent) this.emit(); }

  disconnect() { this.wantOnline = false; try { localStorage.setItem('od.net', 'off'); } catch { /* storage blocked */ } this.close(); this.crew = null; this.emit(); this.fire('disconnect'); }

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
      case 'friends': this.friends = m.friends; this.requests = m.requests; try { localStorage.setItem('od.friends', JSON.stringify(m.friends.map((f) => f.id))); } catch { /* storage blocked */ } break;
      case 'roster': this.roster = new Map(m.list.map((p) => [p.id, p])); this.count = m.list.length + 1; break;
      case 'pong': return;
      case 'lobbies': this.lobbies = m.lobbies; break;
      case 'lobbies-changed': this.request('lobby.list'); return;
      case 'lobby': this.lobby = m.lobby; this.fire('lobby', m.lobby); break;
      case 'lobby.start': this.fire('lobbyStart', m); break;
      case 'race.results': this.fire('raceResults', m.results); break;
      case 'crew': this.crew = m.crew; this.app.store.profile && m.crew && this.app.store.act({ type: 'stat', key: 'crewJoined', amount: 1 }); break;
      case 'chat': this.chat.push(m); if (this.chat.length > 100) this.chat.shift(); this.fire('chat', m); break;
      case 'count': this.count = m.n; break;
      case 'peers': { const seen = new Set(); for (const p of m.peers) { seen.add(p.id); let q = this.peers.get(p.id); if (!q) { q = { id: p.id, name: p.n, model: p.m, color: p.c, x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.s, foot: !!p.f, px: p.x, pz: p.z, py: p.y, pyaw: p.yaw, t: performance.now() }; this.peers.set(p.id, q); } q.px = q.x; q.pz = q.z; q.pyaw = q.yaw; q.py = q.y; q.x = p.x; q.y = p.y; q.z = p.z; q.yaw = p.yaw; q.speed = p.s; q.foot = !!p.f; q.model = p.m; q.color = p.c; q.t = performance.now(); } for (const id of [...this.peers.keys()]) if (!seen.has(id)) this.peers.delete(id); return; }
      default: return;
    }
    this.emit();
  }

  // called every frame from the app; sends the local vehicle at 10 Hz
  tick(dt, game) {
    if (!this.connected) {
      if (this.wantOnline && this.state === 'offline' && this.retryT > 0) { this.retryT -= dt; if (this.retryT <= 0) this.connect().catch(() => this.scheduleRetry()); }
      return;
    }
    this.pingT += dt;
    if (this.pingT > 15) { this.pingT = 0; this.send('ping'); }
    if (performance.now() - this.lastRx > 20000) { this.close(); this.fire('disconnect'); this.emit(); this.scheduleRetry(); return; }
    this.posT += dt;
    if (this.posT < 0.1) return;
    this.posT = 0;
    const P = game.player, v = P.vehicle && P.state === 'driving' ? P.vehicle : null;
    const pos = v || P;
    this.send('pos', { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), yaw: +(pos.yaw || 0).toFixed(3), speed: v ? +v.speed.toFixed(1) : P.speed, foot: v ? 0 : 1, model: v ? v.def.id : this.app.heroSpec().model, color: v ? '#' + (v.car?.mats?.paint?.color?.getHexString?.() || '888888') : undefined });
  }
}
