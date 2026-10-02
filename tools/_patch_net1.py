def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('server/game-server.mjs', [
 ("  send(obj) { if (this.alive)", "  ping() { if (this.alive) { try { this.socket.write(Buffer.from([0x89, 0])); } catch { this.close(); } } }\n  send(obj) { if (this.alive)"),
 ("  httpServer.on('upgrade', (req, socket) => {", "  httpServer.on('upgrade', (req, socket, head) => {"),
 ("    let me = null;\n    const conn = new Conn(socket, (raw) => {", "    let me = null;\n    const hello = (m) => m;\n    void hello;\n    const conn = new Conn(socket, (raw) => {"),
 ("        me = { id: pr.id, conn, name: P.name, level: P.level, rep: P.rep, color: P.garage.vehicles[0]?.custom?.color || '#888', model: P.garage.vehicles[0]?.model, x: 0, y: 0, z: 0, yaw: 0, speed: 0, lobbyId: null, at: Date.now(), profile: P };",
  "        me = { id: pr.id, conn, name: P.name, level: P.level, rep: P.rep, color: P.garage.vehicles[0]?.custom?.color || '#888', model: P.garage.vehicles[0]?.model, x: 0, y: 0, z: 0, yaw: 0, speed: 0, foot: true, lobbyId: null, at: Date.now(), profile: P, knows: new Map() };\n        me.lookSig = JSON.stringify(P.avatar || {});\n        // the server forgets everything when its host restarts: friends the client remembers are put back\n        if (Array.isArray(m.data.friends)) { const mine = (db.friends[me.id] ||= { list: [], incoming: [] }); for (const id of m.data.friends.slice(0, 200)) if (typeof id === 'string' && id !== me.id && !mine.list.includes(id)) { mine.list.push(id); touch(); } }"),
 ("          if (r.ok) { me.name = me.profile.name; me.level = me.profile.level; me.rep = me.profile.rep; touch(); }", "          if (r.ok) { me.name = me.profile.name; me.level = me.profile.level; me.rep = me.profile.rep; if (d.action?.type === 'avatar') me.lookSig = JSON.stringify(me.profile.avatar || {}); touch(); }"),
 ("case 'pos': { me.x = d.x; me.y = d.y; me.z = d.z; me.yaw = d.yaw; me.speed = d.speed;", "case 'pos': { me.x = d.x; me.y = d.y; me.z = d.z; me.yaw = d.yaw; me.speed = d.speed; me.foot = !!d.foot; me.swim = !!d.swim;"),
 ("        if (near) peers.push({ id: b.id, n: b.name, x: b.x, y: b.y, z: b.z, yaw: b.yaw, s: b.speed, m: b.model, c: b.color });", "        if (near) {\n          const o = { id: b.id, n: b.name, x: b.x, y: b.y, z: b.z, yaw: b.yaw, s: b.speed, m: b.model, c: b.color, f: b.foot ? (b.swim ? 2 : 1) : 0 };\n          if (b.foot && a.knows.get(b.id) !== b.lookSig) { o.l = b.profile.avatar; a.knows.set(b.id, b.lookSig); }\n          peers.push(o);\n        }"),
 ("    const card = (id) => { const o = clients.get(id); const p = db.profiles[id]; return o ? { ...summary(o), online: true }", "    const card = (id) => { const o = clients.get(id); const p = db.profiles[id]; return o ? { ...summary(o), online: true, x: o.x, z: o.z }"),
 ("  setInterval(save, 5000).unref?.();", "  setInterval(save, 5000).unref?.();\n  setInterval(() => { for (const c of clients.values()) c.conn.ping(); }, 25000).unref?.();"),
])
# head bytes after the handshake
s = open('server/game-server.mjs', encoding='utf8').read()
s = s.replace("    }, () => {\n      if (!me) return;", "    }, () => {\n      if (!me) return;", 1)
a = s.index("    let me = null;\n    const hello")
b = s.index("    const conn = new Conn(socket")
s = s[:a] + "    let me = null;\n" + s[b:]
s = s.replace("  });\n\n  // position relay", "    if (head && head.length) { conn.buf = Buffer.concat([conn.buf, head]); conn.parse(); }\n  });\n\n  // position relay", 1)
open('server/game-server.mjs', 'w', encoding='utf8').write(s)

patch('server.mjs', [("  if (url.pathname.startsWith('/api/')) return;", "  if (url.pathname.startsWith('/api/')) { res.writeHead(404).end('no api'); return; }")])

patch('src/net/client.js', [
 ("    this.handlers = {};\n  }", "    this.handlers = {};\n    this.manualOff = false; this.fails = 0; this.retryT = 4;\n    this.auto = !/[?&]offline\\b/.test(location.search) && location.protocol !== 'file:';\n  }\n\n  get friendIds() { return this.app.store.profile?.social?.friends || []; }"),
 ("request('hello', { profile: p })", "request('hello', { profile: p, friends: this.friendIds })"),
 ("this.state = 'online'; this.you = r.you;", "this.state = 'online'; this.fails = 0; this.you = r.you;"),
 ("  disconnect() { if (this.ws)", "  disconnect(manual = true) { this.manualOff = manual; if (this.ws)"),
 ("      case 'friends': this.friends = m.friends; this.requests = m.requests; break;", "      case 'friends': {\n        this.friends = m.friends; this.requests = m.requests;\n        const ids = m.friends.map((f) => f.id), pr = this.app.store.profile;\n        if (pr && JSON.stringify(ids) !== JSON.stringify(pr.social?.friends || [])) { pr.social = { ...(pr.social || {}), friends: ids }; this.app.store.save(); }\n        break;\n      }"),
 ("q = { id: p.id, name: p.n, model: p.m, color: p.c, x: p.x,", "q = { id: p.id, name: p.n, model: p.m, color: p.c, foot: p.f, look: p.l, x: p.x,"),
 ("q.speed = p.s; q.model = p.m; q.color = p.c; q.t = performance.now(); }", "q.speed = p.s; q.model = p.m; q.color = p.c; q.foot = p.f; if (p.l) q.look = p.l; q.t = performance.now(); }"),
 ("  tick(dt, game) {\n    if (!this.connected) return;", "  tick(dt, game) {\n    if (!this.connected) {\n      // keep trying: the host may be waking up or may have restarted\n      if (this.auto && !this.manualOff && this.state === 'offline' && this.app.store.profile) {\n        this.retryT -= dt;\n        if (this.retryT <= 0) { this.retryT = Math.min(30, 3 * 2 ** this.fails); this.fails++; this.connect().catch(() => {}); }\n      }\n      return;\n    }"),
 ("speed: v ? +v.speed.toFixed(1) : P.speed, model:", "speed: v ? +v.speed.toFixed(1) : P.speed, foot: !v, swim: !v && P.state === 'swim', model:"),
 ("      try { ws = new WebSocket(url); }", "      this.manualOff = false;\n      try { ws = new WebSocket(url); }"),
 ("const t = setTimeout(() => { if (this.state !== 'online') { ws.close(); reject(new Error('timeout')); } }, 6000);", "const t = setTimeout(() => { if (this.state !== 'online') { ws.close(); reject(new Error('timeout')); } }, 20000);"),
])
print('ok')
