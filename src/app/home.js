import { h, icon, fmt, bar } from './ui.js';
import { rankFor, xpToNext, nextRank } from '../data/progression.js';
import { challengeProgress } from '../game/economy.js';
import { DYNAMIC_EVENTS, SEASON } from '../data/meta.js';

// Title screen shown over the live cinematic world.
export class Home {
  constructor(app) {
    this.app = app;
    this.el = h('div', { id: 'home' });
    document.getElementById('ui').appendChild(this.el);
  }

  build() {
    const app = this.app, p = app.store.profile;
    this.el.replaceChildren();
    const logo = h('div', { class: 'home-logo' }, h('div', { class: 'home-title' }, 'Overdrive'), h('div', { class: 'home-sub' }, 'Riverton County'));
    const item = (label, ic, sub, on, i, primary) => h('button', { class: 'home-item' + (primary ? ' primary' : ''), style: { animationDelay: 0.12 + i * 0.05 + 's' }, on: { click: on } }, icon(ic), label, sub ? h('small', null, sub) : null);
    const has = !!p;
    const menu = h('div', { class: 'home-menu' },
      item(has ? 'Continue' : 'New Game', 'play', has ? `Level ${p.level}  -  ${p.name}` : 'Create your driver', () => app.playFromHome(), 0, true),
      has ? item('Garage', 'wrench', 'Customize your cars', () => app.openMenu('garage'), 1) : null,
      has ? item('World Map', 'map', null, () => app.openMenu('world'), 2) : null,
      has ? item('Shop', 'bag', null, () => app.openMenu('shop'), 3) : null,
      has ? item('Multiplayer', 'globe', app.net?.connected ? 'Online' : 'Offline', () => app.openMenu('multiplayer'), 4) : null,
      has ? item('Profile', 'user', null, () => app.openMenu('profile'), 5) : null,
      has ? item('Settings', 'gear', null, () => app.openMenu('settings'), 6) : null);
    const foot = h('div', { class: 'home-foot' }, h('span', null, 'Version 1.0'), h('span', null, '-'), h('span', null, app.game.audio?.enabled === false ? 'Audio off' : 'WASD drive - Space handbrake/drift - F enter - C camera - M map - P phone - Esc menu'));
    const left = h('div', { class: 'home-left' }, h('div', null, logo, menu), foot);
    const right = h('div', { class: 'home-right' });
    if (has) {
      const need = xpToNext(p.level), rank = rankFor(p.rep), nr = nextRank(p.rep);
      right.appendChild(h('div', { class: 'card home-profile' },
        h('div', { class: 'ring', style: { '--p': (p.xp / need) * 100 } }, h('b', null, p.level)),
        h('div', { class: 'grow' }, h('div', { class: 'bold', style: 'font-size:1.15em' }, p.name), h('div', { class: 'muted sm' }, `${p.title}  -  ${rank.name}`),
          h('div', { style: 'margin-top:8px' }, bar(p.xp / need)), h('div', { class: 'dim sm', style: 'margin-top:4px' }, `${fmt.num(p.xp)} / ${fmt.num(need)} XP` + (nr ? `   next rank: ${nr.name}` : '')))));
      const dailies = challengeProgress(p, 'daily').slice(0, 3);
      right.appendChild(h('div', { class: 'card', style: 'width:100%' }, h('h3', null, 'Daily challenges'),
        h('div', { class: 'col' }, dailies.map((c) => h('div', null, h('div', { class: 'row sm' }, h('span', { class: c.done ? 'green' : '' }, c.name), h('span', { class: 'end dim' }, `${Math.round(c.value)}/${c.goal}`)), bar(c.value / c.goal, c.done ? 'green' : 'blue'))))));
      const ev = DYNAMIC_EVENTS.slice(0, 3);
      right.appendChild(h('div', { class: 'card news' }, h('h3', null, 'Happening in Riverton'),
        ev.map((e) => h('div', { class: 'news-item', on: { click: () => app.openMenu('events') } }, h('div', { class: 'dot' }, icon('flag')), h('div', null, h('div', { class: 't' }, e.name), h('div', { class: 's' }, e.desc || e.blurb || 'Live event'))))));
      right.appendChild(h('div', { class: 'card', style: 'width:100%' }, h('div', { class: 'row' }, icon('award'), h('div', null, h('div', { class: 'bold' }, SEASON.name || 'Season 1'), h('div', { class: 'dim sm' }, `Battle pass tier ${Math.floor(p.battlepass.xp / 1000) + 1}`)), h('button', { class: 'btn sm end', on: { click: () => app.openMenu('pass') } }, 'Open'))));
    }
    this.el.append(left, right);
  }

  show() { this.build(); requestAnimationFrame(() => this.el.classList.add('show')); }
  hide() { this.el.classList.remove('show'); }
}
