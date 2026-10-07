// WebSocket client for the multiplayer server. Everything degrades gracefully when offline.
export class NetClient {
  // server address: ?server=wss://host/ws, then the one saved by the player, then a page-level override, then this very host
  static defaultUrl() {
    let u = '';
    try { u = new URLSearchParams(location.search).get('server') || localStorage.getItem('od.server') || ''; } catch { /* storage blocked */ }
    if (!u && typeof window !== 'undefined' && window.OVERDRIVE_SERVER) u = window.OVERDRIVE_SERVER;
    if (u) { if (/^https?:\/\//.test(u)) u = u.replace(/^http/, 'ws'); if (!/\/ws$/.test(u) && !/\/ws\?/.test(u)) u = u.replace(/\/+$/, '') + '/ws'; return u; }
    return NetClient.hostUrl();
  }

  static hostUrl() { return location.protocol === 'file:' ? 'ws://localhost:5466/ws' : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`; }

  constructor(app) {
    this.app = app;
    this.url = NetClient.defaultUrl();
    this.ws = null; this.state = 'offline';
    this.you = null; this.friends = []; this.requests = []; this.players = []; this.lobbies = []; this.lobby = null; this.crew = null; this.chat = []; this.count = 0;
    this.peers = new Map();
    this.listeners = new Set(); this.pending = new Map(); this.seq = 1; this.posT = 0;
    this.handlers = {};
    this.manualOff = false; this.fails = 0; this.retryT = 4; this.lastError = ''; this.lastRx = 0; this.pingT = 0; this.roster = new Map();
    this.auto = !/[?&]offline\b/.test(location.search) && location.protocol !== 'file:' && this.autoOk;
  }

  get autoOk() { try { return localStorage.getItem('od.net') !== 'off'; } catch { return true; } }
  get friendIds() { return this.app.store.profile?.social?.friends || []; }

  get connected() { return this.state === 'online'; }
  on(ev, fn) { if (ev === 'update') { this.listeners.add(fn); return () => this.listeners.delete(fn); } (this.handlers[ev] ||= []).push(fn); return () => { this.handlers[ev] = this.handlers[ev].filter((f) => f !== fn); }; }
  emit() { for (const f of this.listeners) f(); }
  fire(ev, data) { for (const f of this.handlers[ev] || []) f(data); }

  connect(url = this.url, manual = false) {
    if (this.ws) this.disconnect();
    this.url = url; this.state = 'connecting'; this.lastError = ''; this.emit();
    return new Promise((resolve, reject) => {
      let ws;
      this.manualOff = false; if (manual) { try { localStorage.setItem('od.net', 'on'); } catch { /* storage blocked */ } this.auto = true; }
      try { ws = new WebSocket(url); } catch (e) { this.state = 'offline'; this.emit(); reject(e); return; }
      this.ws = ws;
      const fail = (e) => { this.lastError = e.message || String(e); reject(e); };
      const t = setTimeout(() => { if (this.state !== 'online') { ws.close(); fail(new Error('Server did not answer (it may be waking up)')); } }, 20000);
      ws.onopen = () => { const p = this.app.profile; this.request('hello', { profile: p, friends: this.friendIds }).then((r) => { clearTimeout(t); if (!r.ok) { fail(new Error(r.error || 'Rejected')); return; } this.state = 'online'; this.fails = 0; this.lastRx = performance.now(); this.pingT = 0; if (manual) { try { if (url === NetClient.hostUrl()) localStorage.removeItem('od.server'); else localStorage.setItem('od.server', url); } catch { /* storage blocked */ } } this.you = r.you; this.players = r.players; this.count = r.count; this.emit(); if (r.profile && r.profile.seq > p.seq) this.app.store.replace(r.profile); resolve(r); }); };
      ws.onmessage = (e) => { this.lastRx = performance.now(); let m; try { m = JSON.parse(e.data); } catch { return; } this.onMessage(m); };
      ws.onclose = () => { clearTimeout(t); const was = this.state === 'online'; if (this.ws !== ws) return; this.state = 'offline'; this.ws = null; this.peers.clear(); this.roster.clear(); this.lobby = null; if (was) this.lastError = 'Connection lost'; this.emit(); this.fire('disconnect'); if (!was) fail(new Error(this.lastError || 'Could not reach the server')); };
      ws.onerror = () => { /* onclose handles it */ };
    });
  }

  disconnect(manual = true) { this.manualOff = manual; if (manual) { try { localStorage.setItem('od.net', 'off'); } catch { /* storage blocked */ } } if (this.ws) { try { this.ws.close(); } catch { /* closed */ } } this.ws = null; this.state = 'offline'; this.peers.clear(); this.lobby = null; this.crew = null; this.emit(); }

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
      case 'friends': {
        this.friends = m.friends; this.requests = m.requests;
        const ids = m.friends.map((f) => f.id), pr = this.app.store.profile;
        if (pr && JSON.stringify(ids) !== JSON.stringify(pr.social?.friends || [])) { pr.social = { ...(pr.social || {}), friends: ids }; this.app.store.save(); }
        break;
      }
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
      case 'peers': { const seen = new Set(); for (const p of m.peers) { seen.add(p.id); let q = this.peers.get(p.id); if (!q) { q = { id: p.id, name: p.n, model: p.m, color: p.c, foot: p.f, look: p.l, x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.s, px: p.x, pz: p.z, pyaw: p.yaw, t: performance.now() }; this.peers.set(p.id, q); } q.px = q.x; q.pz = q.z; q.pyaw = q.yaw; q.x = p.x; q.y = p.y; q.z = p.z; q.yaw = p.yaw; q.speed = p.s; q.model = p.m; q.color = p.c; q.foot = p.f; if (p.l) q.look = p.l; q.t = performance.now(); } for (const id of [...this.peers.keys()]) if (!seen.has(id)) this.peers.delete(id); return; }
      default: return;
    }
    this.emit();
  }

  // called every frame from the app; sends the local vehicle at 10 Hz
  tick(dt, game) {
    if (!this.connected) {
      // keep trying: the host may be waking up or may have restarted
      if (this.auto && !this.manualOff && this.state === 'offline' && this.app.store.profile) {
        this.retryT -= dt;
        if (this.retryT <= 0) { this.retryT = Math.min(30, 3 * 2 ** this.fails); this.fails++; this.connect().catch(() => {}); }
      }
      return;
    }
    this.pingT += dt;
    if (this.pingT > 15) { this.pingT = 0; this.send('ping'); }
    if (performance.now() - this.lastRx > 20000) { const ws = this.ws; this.ws = null; if (ws) { ws.onclose = null; try { ws.close(); } catch { /* closed */ } } this.state = 'offline'; this.lastError = 'Connection lost'; this.peers.clear(); this.roster.clear(); this.lobby = null; this.emit(); this.fire('disconnect'); return; }
    this.posT += dt;
    if (this.posT < 0.1) return;
    this.posT = 0;
    const P = game.player, v = P.vehicle && P.state === 'driving' ? P.vehicle : null;
    const pos = v || P;
    this.send('pos', { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), yaw: +(pos.yaw || 0).toFixed(3), speed: v ? +v.speed.toFixed(1) : P.speed, foot: !v, swim: !v && P.state === 'swim', model: v ? v.def.id : this.app.heroSpec().model, color: v ? '#' + (v.car?.mats?.paint?.color?.getHexString?.() || '888888') : undefined });
  }
}
