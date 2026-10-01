import { h, icon, fmt, clear } from './ui.js';
import { rankFor } from '../data/progression.js';

export const NAV = [
  ['home', 'Home', 'home'], ['world', 'World', 'map'], ['missions', 'Missions', 'target'], ['garage', 'Garage', 'wrench'], ['vehicles', 'Vehicles', 'car'], ['shop', 'Shop', 'bag'], ['auction', 'Auctions', 'tag'],
  ['pass', 'Season Pass', 'award'], ['events', 'Events', 'calendar'], ['friends', 'Friends', 'users'], ['multiplayer', 'Multiplayer', 'globe'], ['crews', 'Crews', 'shield'],
  ['leaderboards', 'Leaderboards', 'trophy'], ['profile', 'Profile', 'user'], ['achievements', 'Achievements', 'star'], ['collection', 'Collection', 'box'],
  ['safehouse', 'Safehouse', 'house'], ['phone', 'Phone', 'phone'], ['settings', 'Settings', 'gear'],
];

// Full-screen menu with a navigation rail and swappable pages. Pages may ask for the 3D stage (garage, shop...).
export class Menu {
  constructor(app) {
    this.app = app;
    this.pages = {};
    this.current = null; this.cur = null; this.open = false; this.history = [];
    this.rail = h('nav', { class: 'menu-rail' });
    this.title = h('div', { class: 'menu-title' }); this.sub = h('div', { class: 'menu-sub' });
    this.chips = h('div', { class: 'row' });
    this.top = h('div', { class: 'menu-top' }, h('div', null, this.title, this.sub), h('div', { class: 'menu-spacer' }), this.chips, h('button', { class: 'btn ghost', title: 'Close (Esc)', on: { click: () => this.app.closeMenu() } }, icon('x')));
    this.page = h('div', { class: 'menu-page' });
    this.help = h('div', { class: 'menu-help' });
    this.main = h('div', { class: 'menu-main' }, this.top, this.page, this.help);
    this.el = h('div', { id: 'menu' }, this.rail, this.main);
    document.getElementById('ui').appendChild(this.el);
    this.railBtns = {};
    this.rail.appendChild(h('div', { class: 'menu-brand' }, h('span', { class: 't' }, 'Overdrive')));
    for (const [id, label, ic] of NAV) {
      const b = h('button', { class: 'rail-item', on: { click: () => this.go(id) } }, icon(ic), h('span', { class: 't' }, label));
      this.railBtns[id] = b; this.rail.appendChild(b);
    }
    this.badges = {};
    this.el.addEventListener('wheel', (e) => { if (this.cur?.stage && !e.target.closest('.menu-page')) this.app.stage?.zoom(e.deltaY); }, { passive: true });
    let drag = null;
    this.el.addEventListener('pointerdown', (e) => { if (this.cur?.stage && e.target.closest('[data-stage-drag]')) { drag = { x: e.clientX, y: e.clientY }; e.target.setPointerCapture?.(e.pointerId); } });
    addEventListener('pointermove', (e) => { if (drag) { this.app.stage?.drag(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; } });
    addEventListener('pointerup', () => { drag = null; });
  }

  register(id, def) { this.pages[id] = def; }

  show(id = 'home', opts = {}) {
    this.open = true;
    const has = !!this.app.store.profile;
    for (const k in this.railBtns) this.railBtns[k].classList.toggle('disabled', !has && k !== 'settings');
    this.el.classList.add('show');
    requestAnimationFrame(() => this.el.classList.add('vis'));
    this.go(id, opts, true);
  }

  hide() {
    this.open = false;
    this.disposeCurrent();
    this.el.classList.remove('vis');
    setTimeout(() => { if (!this.open) this.el.classList.remove('show'); }, 260);
  }

  disposeCurrent() { try { this.cur?.dispose?.(); } catch (e) { console.warn(e); } this.cur = null; }

  go(id, opts = {}, first = false) {
    const def = this.pages[id];
    if (!def) return;
    if (!this.app.store.profile && id !== 'settings' && id !== 'creator') return;
    if (id === 'phone' && this.app.mode === 'menu-play') { this.app.openPhone(); return; }
    if (!first && this.current === id && !opts.force) return;
    if (!first && this.current) this.history.push(this.current);
    this.disposeCurrent();
    this.current = id;
    for (const k in this.railBtns) this.railBtns[k].classList.toggle('on', k === id);
    const nav = NAV.find((n) => n[0] === id);
    this.title.textContent = def.title || nav?.[1] || id;
    this.sub.textContent = '';
    clear(this.help);
    this.updateChips();
    clear(this.page);
    this.page.style.animation = 'none'; void this.page.offsetWidth; this.page.style.animation = '';
    this.page.style.padding = def.flush ? '0' : '';
    const ctx = { menu: this, opts, setSub: (t) => { this.sub.textContent = t; }, setHelp: (items) => this.setHelp(items), refresh: () => this.go(id, { ...opts, force: true }), page: this.page };
    const cur = def.render(this.app, ctx);
    this.cur = cur.el ? cur : { el: cur };
    this.page.appendChild(this.cur.el);
    this.el.classList.toggle('clear', !!def.stage);
    this.cur.stage = def.stage;
    this.app.setStageMode(!!def.stage);
    cur.onEnter?.();
  }

  setHelp(items) { clear(this.help); for (const [k, t] of items) this.help.appendChild(h('span', { class: 'row', style: 'gap:6px' }, k ? h('span', { class: 'kbd' }, k) : null, t)); }

  updateChips() {
    const p = this.app.store.profile; if (!p) return;
    clear(this.chips);
    this.chips.append(h('div', { class: 'pill' }, icon('coin'), fmt.money(p.money)), h('div', { class: 'pill' }, icon('bolt'), fmt.num(p.tokens) + ' tokens'), h('div', { class: 'pill' }, icon('star'), 'Lv ' + p.level), h('div', { class: 'pill' }, rankFor(p.rep).name));
  }

  badge(id, n) { const b = this.railBtns[id]; if (!b) return; b.querySelector('.badge')?.remove(); if (n) b.appendChild(h('span', { class: 'badge' }, n)); }
}
