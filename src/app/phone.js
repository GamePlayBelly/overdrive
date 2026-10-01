import { h, icon, fmt, toast, clear } from './ui.js';
import { NPCS, MESSAGES, RUMORS } from '../data/npcs.js';
import { MISSIONS, MISSION_BY_ID } from '../data/missions.js';
import { MAP, worldToMap, mapToWorld, BLIP } from '../ui/mapRender.js';

const APPS = [
  ['messages', 'Messages', 'mail', '#2f80ed'], ['map', 'Maps', 'map', '#2fb36a'], ['missions', 'Missions', 'target', '#e5383b'], ['garage', 'Garage', 'wrench', '#8a9096'],
  ['radio', 'Radio', 'music', '#c77dff'], ['camera', 'Camera', 'camera', '#3d4550'], ['contacts', 'Contacts', 'users', '#d4a72c'], ['settings', 'Settings', 'gear', '#4a5560'],
];

// In-game phone: messages, map with waypoints, mission list, garage service, radio, camera, contacts, quick settings.
export class Phone {
  constructor(app) {
    this.app = app; this.open = false; this.appId = null;
    this.status = h('div', { class: 'phone-status' }, h('span', { class: 'clk' }, '09:30'), h('span', null, icon('wifi')));
    this.body = h('div', { class: 'phone-body' });
    this.screen = h('div', { class: 'phone-screen' }, h('div', { class: 'phone-notch' }), this.status, this.body, h('div', { class: 'phone-bar' }, h('button', { title: 'Home', on: { click: () => this.home() } })));
    this.el = h('div', { id: 'phone' }, this.screen);
    document.getElementById('ui').appendChild(this.el);
  }

  show() {
    if (this.app.mode !== 'play') return;
    this.open = true; this.el.classList.add('show');
    this.status.firstChild.textContent = fmt.clock(this.app.game.sky.time);
    this.home();
    this.app.game.audio?.ui('open');
    this.msgBadge();
  }
  hide(fast) { if (!this.open) return; this.open = false; this.el.classList.remove('show'); if (!fast) this.app.game.audio?.ui('close'); }
  toggle() { this.open ? this.hide() : this.show(); }

  unread() { const p = this.app.profile; return this.messages().filter((m) => !(p.messages || []).includes('r:' + m.id)).length; }
  msgBadge() { const n = this.unread(); this.home(); if (n) this.body.querySelector('[data-app=messages] i')?.appendChild(h('span', { style: 'position:absolute;top:-4px;right:-4px;background:#e5383b;border-radius:9px;min-width:18px;height:18px;font-size:11px;display:grid;place-items:center;padding:0 4px' }, n)); }

  messages() {
    const p = this.app.profile;
    return MESSAGES.filter((m) => {
      const c = m.cond || {};
      if (c.level && p.level < c.level) return false;
      if (c.mission && !p.missions.done[c.mission]) return false;
      return true;
    });
  }

  home() {
    if (!this.app.profile) return;
    this.appId = null; clear(this.body);
    this.body.appendChild(h('div', { class: 'phone-home' }, APPS.map(([id, label, ic, col]) => h('button', { class: 'app', 'data-app': id, on: { click: () => this.launch(id) } }, h('i', { style: { background: col, position: 'relative' } }, icon(ic)), label))));
    const p = this.app.profile;
    this.body.appendChild(h('div', { class: 'card flat', style: 'margin-top:18px' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, p.name), h('div', { class: 'dim sm' }, `Level ${p.level}`)), h('div', { class: 'bold' }, fmt.money(p.money)))));
  }

  head(title) { return h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn ghost sm', on: { click: () => this.home() } }, icon('back')), h('div', { class: 'bold', style: 'font-size:1.1em' }, title)); }

  launch(id) {
    this.appId = id; clear(this.body);
    const app = this.app, p = app.profile, g = app.game;
    if (id === 'messages') {
      this.body.appendChild(this.head('Messages'));
      const list = this.messages();
      if (!list.length) this.body.appendChild(h('div', { class: 'empty' }, 'No messages'));
      for (const m of list.slice().reverse()) {
        const n = NPCS[m.from];
        const read = (p.messages || []).includes('r:' + m.id);
        this.body.appendChild(h('div', { class: 'card flat', style: 'margin-bottom:8px;cursor:pointer', on: { click: () => this.thread(m) } }, h('div', { class: 'row' }, h('div', { style: `width:34px;height:34px;border-radius:50%;background:${n.color};display:grid;place-items:center;font-weight:700` }, n.name[0]), h('div', { class: 'grow' }, h('div', { class: 'bold sm' }, n.name), h('div', { class: 'dim sm', style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px' }, m.text)), read ? null : h('span', { class: 'chip red' }, 'new'))));
      }
    } else if (id === 'map') {
      this.body.appendChild(this.head('Maps'));
      const wrap = h('div', { class: 'map-wrap', style: 'height:250px;min-height:0' });
      const cv = h('canvas'); wrap.appendChild(cv); this.body.appendChild(wrap);
      this.body.appendChild(h('div', { class: 'dim sm', style: 'margin:8px 0' }, 'Tap the map to set a waypoint.'));
      this.body.appendChild(h('button', { class: 'btn sm', on: { click: () => { app.setWaypoint(null); this.launch('map'); } } }, 'Clear waypoint'));
      requestAnimationFrame(() => this.drawMiniMap(cv, wrap));
    } else if (id === 'missions') {
      this.body.appendChild(this.head('Missions'));
      for (const m of MISSIONS.filter((x) => p.level >= (x.level || 1) && !p.missions.done[x.id] && (x.requires || []).every((r) => p.missions.done[r])).slice(0, 8)) {
        this.body.appendChild(h('div', { class: 'card flat', style: 'margin-bottom:8px' }, h('div', { class: 'bold sm' }, m.title), h('div', { class: 'dim sm' }, `${m.type} - ${NPCS[m.giver]?.name || ''}`), h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: 'chip gold' }, fmt.money(m.rewards.money)), h('button', { class: 'btn sm end', on: { click: () => { app.startMission?.(m.id); this.hide(); } } }, 'Start'))));
      }
      if (!MISSIONS.some((x) => p.level >= (x.level || 1) && !p.missions.done[x.id])) this.body.appendChild(h('div', { class: 'empty' }, 'No new missions'));
    } else if (id === 'garage') {
      this.body.appendChild(this.head('Garage service'));
      const pv = app.heroSpec();
      this.body.appendChild(h('div', { class: 'card flat' }, h('div', { class: 'bold' }, `${pv.model.toUpperCase()}`), h('div', { class: 'dim sm' }, `Damage ${(pv.damage * 100) | 0}%`)));
      this.body.appendChild(h('button', { class: 'btn primary', style: 'margin-top:10px;width:100%', on: { click: () => { app.callVehicle(); this.hide(); } } }, icon('car'), 'Deliver my car - $250'));
      this.body.appendChild(h('button', { class: 'btn', style: 'margin-top:8px;width:100%', on: { click: () => { app.repairCurrent(); } } }, icon('wrench'), 'Repair current vehicle'));
    } else if (id === 'radio') {
      this.body.appendChild(this.head('Radio'));
      const R = g.radio;
      if (!R) this.body.appendChild(h('div', { class: 'empty' }, 'No signal'));
      else for (const [i, s] of R.stations.entries()) this.body.appendChild(h('button', { class: 'btn' + (R.index === i && R.on ? ' primary' : ''), style: 'width:100%;margin-bottom:8px;justify-content:flex-start', on: { click: () => { R.set(i); this.launch('radio'); } } }, icon('music'), h('span', null, s.name), h('span', { class: 'dim sm end' }, s.genre)));
      if (R) this.body.appendChild(h('button', { class: 'btn', style: 'width:100%', on: { click: () => { R.off(); this.launch('radio'); } } }, 'Radio off'));
    } else if (id === 'camera') { this.hide(true); app.enterPhoto(); }
    else if (id === 'contacts') {
      this.body.appendChild(this.head('Contacts'));
      for (const [k, n] of Object.entries(NPCS)) this.body.appendChild(h('div', { class: 'card flat', style: 'margin-bottom:8px' }, h('div', { class: 'row' }, h('div', { style: `width:34px;height:34px;border-radius:50%;background:${n.color};display:grid;place-items:center;font-weight:700` }, n.name[0]), h('div', { class: 'grow' }, h('div', { class: 'bold sm' }, n.name), h('div', { class: 'dim sm' }, n.role)), h('button', { class: 'btn sm', on: { click: () => this.call(k) } }, icon('phone')))));
    } else if (id === 'settings') {
      this.body.appendChild(this.head('Quick settings'));
      const S = p.settings;
      const row = (label, val, on) => h('div', { class: 'setting' }, h('div', { class: 'lbl' }, label), (() => { const b = h('button', { class: 'toggle' + (val ? ' on' : '') }); b.addEventListener('click', () => { b.classList.toggle('on'); on(b.classList.contains('on')); }); return b; })());
      this.body.append(
        row('Hints', S.general.hints, (v) => app.store.patch((pr) => { pr.settings.general.hints = v; })),
        row('Rotate minimap', S.general.minimapRotate, (v) => app.store.patch((pr) => { pr.settings.general.minimapRotate = v; })),
        row('Camera shake', S.access.cameraShake, (v) => { app.store.patch((pr) => { pr.settings.access.cameraShake = v; }); app.applySettings(); }),
        row('Traction control', S.controls.tc, (v) => { app.store.patch((pr) => { pr.settings.controls.tc = v; }); app.applySettings(); }));
      this.body.appendChild(h('button', { class: 'btn', style: 'width:100%;margin-top:12px', on: { click: () => { this.hide(); app.openMenu('settings'); } } }, 'All settings'));
    }
  }

  thread(m) {
    const p = this.app.profile, n = NPCS[m.from];
    clear(this.body);
    this.body.appendChild(h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn ghost sm', on: { click: () => this.launch('messages') } }, icon('back')), h('div', { class: 'bold' }, n.name)));
    this.body.appendChild(h('div', { class: 'msg-bubble' }, m.text));
    this.body.appendChild(h('div', { class: 'opt-row' }, h('button', { class: 'btn sm', on: { click: () => this.reply(m, 'On my way.') } }, 'On my way.'), h('button', { class: 'btn sm', on: { click: () => this.reply(m, 'Thanks!') } }, 'Thanks!')));
    if (!(p.messages || []).includes('r:' + m.id)) this.app.store.patch((pr) => { pr.messages.push('r:' + m.id); });
  }
  reply(m, text) { this.body.querySelector('.opt-row')?.remove(); this.body.appendChild(h('div', { class: 'msg-bubble me' }, text)); this.app.game.audio?.ui('confirm'); }

  call(k) {
    const app = this.app, n = NPCS[k], p = app.profile;
    this.hide(true);
    const pool = RUMORS.filter((r) => (r.cond?.level || 1) <= p.level && !p.rumors.includes(r.id));
    const r = pool[(Math.random() * pool.length) | 0];
    app.hud.say(n.name, r ? r.text : 'Nothing new. Drive safe out there.', 6500);
    if (r) { app.store.patch((pr) => { pr.rumors.push(r.id); }); if (r.hint) { app.setWaypoint(r.hint); toast({ title: 'Waypoint set', sub: 'Rumor location marked on your map', kind: 'blue', icon: 'flag' }); } }
  }

  drawMiniMap(cv, wrap) {
    const app = this.app, W = wrap.clientWidth, H = wrap.clientHeight;
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const view = { cx: (app.game.player.x - MAP.x0) * MAP.scale, cz: (app.game.player.z - MAP.z0) * MAP.scale, z: 0.32 };
    const draw = () => {
      x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#0b0e12'; x.fillRect(0, 0, W, H);
      x.translate(W / 2, H / 2); x.scale(view.z, view.z); x.translate(-view.cx, -view.cz);
      x.drawImage(app.mapCanvas, 0, 0);
      const poi = app.game.world.poi;
      const dot = (X, Z, c, r = 5) => { const [a, b] = worldToMap(X, Z); x.fillStyle = c; x.beginPath(); x.arc(a, b, r / view.z, 0, 7); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1 / view.z; x.stroke(); };
      dot(poi.garage.x, poi.garage.z, BLIP.garage); dot(poi.dealer.x, poi.dealer.z, BLIP.dealer); dot(poi.police.x, poi.police.z, BLIP.police); dot(poi.safehouse.x, poi.safehouse.z, BLIP.home);
      if (app.wpt) dot(app.wpt.x, app.wpt.z, BLIP.waypoint, 6);
      dot(app.game.player.x, app.game.player.z, '#fff', 6);
    };
    draw();
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
      const mx = (px - W / 2) / view.z + view.cx, mz = (py - H / 2) / view.z + view.cz;
      const [wx, wz] = mapToWorld(mx, mz);
      app.setWaypoint({ x: wx, z: wz }); draw();
      toast({ title: 'Waypoint set', kind: 'blue', icon: 'flag', ms: 1800 });
    });
  }
}
