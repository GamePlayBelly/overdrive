import { h, icon, fmt, btn, tabs, toast, chip, sect, select, modal } from '../ui.js';

const MODES = [['freeroam', 'Free roam'], ['race', 'Street race'], ['pvd', 'Police vs Drivers'], ['coop', 'Co-op missions'], ['team', 'Team race']];
const BOARDS = [['level', 'Level'], ['rep', 'Reputation'], ['racesWon', 'Races won'], ['bestDrift', 'Best drift'], ['topSpeed', 'Top speed'], ['distance', 'Distance (km)']];

const connectCard = (app, refresh) => {
  const net = app.net;
  const url = h('input', { class: 'txt', value: net.url || '', style: 'min-width:260px' });
  return h('div', { class: 'card' }, h('div', { class: 'row wrap' }, icon('wifi'), h('div', { class: 'grow' }, h('div', { class: 'bold' }, net.connected ? `Online as ${net.you?.name || app.profile.name}` : net.state === 'connecting' ? 'Connecting…' : 'Offline'), h('div', { class: 'dim sm' }, net.connected ? `${net.count} player(s) online` : 'Connect to a Real World server to play with friends')), url,
    net.connected ? btn('Disconnect', { on: () => { net.disconnect(); refresh(); } }) : btn('Connect', { kind: 'primary', on: async () => { net.url = url.value; try { await net.connect(url.value); toast({ title: 'Connected', kind: 'green', icon: 'wifi' }); } catch (e) { toast({ title: 'Connection failed', sub: 'Is the server running? (node server.mjs)', icon: 'x' }); } refresh(); } })));
};

const person = (p, actions = []) => h('div', { class: 'item', style: 'flex-direction:row;align-items:center;padding:10px 12px' },
  h('div', { style: `width:38px;height:38px;border-radius:50%;background:${p.color || '#39414a'};display:grid;place-items:center;font-weight:800;font-family:var(--cond);font-size:18px;position:relative` }, (p.name || '?')[0].toUpperCase(), p.online ? h('i', { style: 'position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:var(--green);border:2px solid var(--panel2)' }) : null),
  h('div', { class: 'grow' }, h('div', { class: 'bold' }, p.name), h('div', { class: 'dim sm' }, `Level ${p.level ?? 1}` + (p.status ? `  -  ${p.status}` : ''))), ...actions);

export const friendsPage = {
  title: 'Friends',
  render(app, ctx) {
    const net = app.net, root = h('div');
    const draw = () => {
      root.replaceChildren(connectCard(app, draw));
      const code = app.profile.id.slice(-8).toUpperCase();
      root.appendChild(h('div', { class: 'card', style: 'margin-top:14px' }, h('div', { class: 'row wrap' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, 'Your friend code'), h('div', { class: 'dim sm' }, 'Share it so friends can add you')), h('span', { class: 'chip blue', style: 'font-size:1.1em;letter-spacing:0.15em' }, code), btn('Copy', { sm: true, on: () => { navigator.clipboard?.writeText(code); toast({ title: 'Copied', kind: 'green', icon: 'check', ms: 1400 }); } }))));
      const inp = h('input', { class: 'txt', placeholder: 'Enter a friend code', style: 'text-transform:uppercase' });
      root.appendChild(h('div', { class: 'row', style: 'margin:14px 0' }, inp, btn('Add friend', { icon: 'plus', kind: 'primary', disabled: !net.connected, on: async () => { const r = await net.request('friends.add', { code: inp.value.trim().toUpperCase() }); toast({ title: r.ok ? 'Request sent' : 'Could not add', sub: r.error, kind: r.ok ? 'green' : '', icon: r.ok ? 'check' : 'x' }); draw(); } })));
      if (net.requests.length) { root.appendChild(sect('Requests')); root.appendChild(h('div', { class: 'grid g-auto-l' }, net.requests.map((r) => person(r, [btn('Accept', { sm: true, kind: 'primary', on: async () => { await net.request('friends.accept', { id: r.id }); draw(); } }), btn('Decline', { sm: true, on: async () => { await net.request('friends.remove', { id: r.id }); draw(); } })])))); }
      root.appendChild(sect('Friends', `${net.friends.length}`));
      root.appendChild(net.friends.length ? h('div', { class: 'grid g-auto-l' }, net.friends.map((f) => person(f, [...(f.online && f.x !== undefined ? [btn('Waypoint', { sm: true, on: () => { app.setWaypoint({ x: f.x, z: f.z }); toast({ title: 'Waypoint set', sub: f.name, kind: 'green', icon: 'check' }); } })] : []), btn('Remove', { sm: true, on: async () => { await net.request('friends.remove', { id: f.id }); draw(); } })]))) : h('div', { class: 'empty' }, net.connected ? 'No friends yet. Add someone with their code.' : 'Connect to a server to manage friends.'));
      root.appendChild(sect('Players online', `${net.players.length}`));
      root.appendChild(net.players.length ? h('div', { class: 'grid g-auto-l' }, net.players.filter((p) => p.id !== net.you?.id).slice(0, 24).map((p) => person({ ...p, online: true }, [btn('Add', { sm: true, on: async () => { const r = await net.request('friends.add', { id: p.id }); toast({ title: r.ok ? 'Request sent' : 'Could not add', sub: r.error, kind: r.ok ? 'green' : '', icon: r.ok ? 'check' : 'x' }); } })]))) : h('div', { class: 'empty' }, 'Nobody else is online right now.'));
    };
    draw();
    const off = net.on('update', () => { if (ctx.menu.current === 'friends') draw(); });
    return { el: root, dispose: off };
  },
};

export const multiplayerPage = {
  title: 'Multiplayer',
  render(app, ctx) {
    const net = app.net, root = h('div');
    let chatBox = null;
    const draw = () => {
      root.replaceChildren(connectCard(app, draw));
      if (!net.connected) { root.appendChild(h('div', { class: 'empty', style: 'margin-top:14px' }, 'Multiplayer needs a server. Start it with "node server.mjs" and press Connect. Solo play works fully offline.')); return; }
      const L = net.lobby;
      if (L) {
        root.appendChild(h('div', { class: 'card', style: 'margin-top:14px' }, h('div', { class: 'row' }, icon('globe'), h('div', { class: 'grow' }, h('div', { class: 'bold', style: 'font-size:1.2em' }, L.name), h('div', { class: 'dim sm' }, `${MODES.find((m) => m[0] === L.mode)?.[1]}  -  ${L.players.length} / ${L.max}  -  ${L.state}`)), btn('Leave', { on: async () => { await net.request('lobby.leave'); draw(); } }), L.host === net.you.id && L.state === 'open' ? btn('Start', { kind: 'primary', icon: 'play', on: async () => { await net.request('lobby.start'); app.closeMenu(); } }) : null),
          h('div', { class: 'grid g-auto-l', style: 'margin-top:12px' }, L.players.map((p) => person({ ...p, online: true, status: p.id === L.host ? 'Host' : p.ready ? 'Ready' : '' }))),
          L.state === 'open' && L.host !== net.you.id ? h('div', { style: 'margin-top:10px' }, btn('Toggle ready', { on: async () => { await net.request('lobby.ready'); draw(); } })) : null));
      } else {
        const name = h('input', { class: 'txt', value: `${app.profile.name}'s lobby`, style: 'min-width:200px' });
        let mode = 'freeroam';
        root.appendChild(h('div', { class: 'card', style: 'margin-top:14px' }, h('div', { class: 'row wrap' }, name, select(MODES, mode, (v) => { mode = v; }), btn('Create lobby', { kind: 'primary', icon: 'plus', on: async () => { const r = await net.request('lobby.create', { name: name.value, mode, max: 8 }); if (!r.ok) toast({ title: 'Cannot create', sub: r.error, icon: 'x' }); draw(); } }), btn('Refresh', { icon: 'refresh', on: async () => { await net.request('lobby.list'); draw(); } }))));
        root.appendChild(sect('Open lobbies', `${net.lobbies.length}`));
        root.appendChild(net.lobbies.length ? h('div', { class: 'grid g-auto-l' }, net.lobbies.map((l) => h('div', { class: 'item' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, l.name), h('div', { class: 'dim sm' }, `${MODES.find((m) => m[0] === l.mode)?.[1]}  -  ${l.count} / ${l.max}`)), chip(l.state, l.state === 'open' ? 'green' : '')), btn('Join', { sm: true, kind: 'primary', disabled: l.state !== 'open', on: async () => { const r = await net.request('lobby.join', { id: l.id }); if (!r.ok) toast({ title: 'Cannot join', sub: r.error, icon: 'x' }); draw(); } })))) : h('div', { class: 'empty' }, 'No open lobbies. Create one!'));
      }
      chatBox = h('div', { class: 'card flat', style: 'margin-top:14px' }, h('h4', null, 'Chat'), h('div', { class: 'col', style: 'max-height:180px;overflow-y:auto;gap:4px;margin-bottom:8px' }, net.chat.slice(-40).map((m) => h('div', { class: 'sm' }, h('b', { style: 'color:var(--muted);margin-right:6px' }, m.name), m.text))), h('div', { class: 'row' }, (() => { const i = h('input', { class: 'txt grow', placeholder: 'Say something…' }); i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && i.value.trim()) { net.send('chat.send', { text: i.value }); i.value = ''; } }); return i; })()));
      root.appendChild(chatBox);
    };
    draw();
    const off = net.on('update', () => { if (ctx.menu.current === 'multiplayer') draw(); });
    return { el: root, dispose: off };
  },
};

export const crewsPage = {
  title: 'Crews',
  render(app, ctx) {
    const net = app.net, root = h('div');
    const draw = async () => {
      root.replaceChildren(connectCard(app, draw));
      if (!net.connected) { root.appendChild(h('div', { class: 'empty', style: 'margin-top:14px' }, 'Connect to a server to create or join a crew.')); return; }
      if (net.crew) {
        const c = net.crew;
        root.appendChild(h('div', { class: 'card', style: 'margin-top:14px' }, h('div', { class: 'row' }, icon('shield'), h('div', { class: 'grow' }, h('div', { class: 'bold', style: 'font-size:1.25em' }, `[${c.tag}] ${c.name}`), h('div', { class: 'dim sm' }, `${c.members.length} members  -  ${fmt.num(c.rep)} crew rep`)), btn('Leave crew', { on: async () => { await net.request('crew.leave'); draw(); } })), h('div', { class: 'grid g-auto-l', style: 'margin-top:12px' }, c.members.map((m) => person({ ...m, online: m.online, status: m.role })))));
      } else {
        const name = h('input', { class: 'txt', placeholder: 'Crew name' }), tag = h('input', { class: 'txt', placeholder: 'TAG', maxlength: 4, style: 'min-width:80px;width:90px;text-transform:uppercase' });
        root.appendChild(h('div', { class: 'card', style: 'margin-top:14px' }, h('div', { class: 'row wrap' }, name, tag, btn('Create crew', { kind: 'primary', icon: 'plus', on: async () => { const r = await net.request('crew.create', { name: name.value, tag: tag.value.toUpperCase() }); if (!r.ok) toast({ title: 'Cannot create', sub: r.error, icon: 'x' }); else app.store.act({ type: 'stat', key: 'crewJoined', amount: 1 }); draw(); } }))));
        const r = await net.request('crew.list');
        root.appendChild(sect('Crews', `${(r.crews || []).length}`));
        root.appendChild((r.crews || []).length ? h('div', { class: 'grid g-auto-l' }, r.crews.map((c) => h('div', { class: 'item' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, `[${c.tag}] ${c.name}`), h('div', { class: 'dim sm' }, `${c.count} members`)), chip(`${fmt.num(c.rep)} rep`, 'gold')), btn('Join', { sm: true, kind: 'primary', on: async () => { const j = await net.request('crew.join', { id: c.id }); if (j.ok) app.store.act({ type: 'stat', key: 'crewJoined', amount: 1 }); draw(); } })))) : h('div', { class: 'empty' }, 'No crews yet. Start the first one!'));
      }
    };
    draw();
    return { el: root };
  },
};

export const leaderboardsPage = {
  title: 'Leaderboards',
  render(app, ctx) {
    const net = app.net, p = app.profile;
    let board = ctx.opts.board || 'level';
    const root = h('div'), body = h('div');
    const draw = async () => {
      body.replaceChildren(h('div', { class: 'dim' }, 'Loading…'));
      let rows = [];
      const mine = { id: p.id, name: p.name, value: board === 'level' ? p.level : board === 'rep' ? p.rep : board === 'distance' ? Math.round(p.stats.distance / 1000) : p.stats[board] || 0 };
      if (net.connected && p.settings.privacy.leaderboards) { const r = await net.request('board.get', { board }); rows = r.rows || []; }
      if (!rows.some((r) => r.id === p.id)) rows = [...rows, mine];
      rows.sort((a, b) => b.value - a.value);
      body.replaceChildren(!net.connected ? h('div', { class: 'dim sm', style: 'margin-bottom:10px' }, 'Offline: showing your personal record only. Connect to a server for global rankings.') : null,
        h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Driver'), h('th', { style: 'text-align:right' }, BOARDS.find((b) => b[0] === board)[1]))),
          h('tbody', null, rows.slice(0, 50).map((r, i) => h('tr', { class: r.id === p.id ? 'me' : '' }, h('td', null, i + 1), h('td', null, r.name), h('td', { style: 'text-align:right;font-variant-numeric:tabular-nums' }, fmt.num(r.value)))))));
    };
    root.append(tabs(BOARDS, board, (b) => { board = b; draw(); }), body);
    draw();
    return { el: root };
  },
};
void modal;
