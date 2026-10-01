import { h, icon, fmt, bar, sect, btn, toast, confirm } from '../ui.js';
import { rankFor, nextRank, xpToNext } from '../../data/progression.js';
import { challengeProgress } from '../../game/economy.js';
import { VEHICLE_BY_ID, vehicleStats } from '../../data/vehicles.js';
import { ACTION_LABELS } from '../../core/input.js';

export const homePage = {
  title: 'Home',
  render(app, ctx) {
    const p = app.profile, playing = app.mode === 'menu-play';
    ctx.setSub(playing ? 'Game paused' : 'Riverton County');
    ctx.setHelp([['Esc', 'Resume'], ['M', 'Map'], ['P', 'Phone']]);
    const need = xpToNext(p.level), rank = rankFor(p.rep), nr = nextRank(p.rep);
    const pv = app.heroSpec(), def = VEHICLE_BY_ID[pv.model], st = vehicleStats(def, p.garage.vehicles.find((v) => v.uid === pv.uid)?.perf || {});
    const el = h('div', { class: 'grid', style: 'grid-template-columns: 1.1fr 1fr; gap:18px' },
      h('div', { class: 'col' },
        h('div', { class: 'card' },
          h('div', { class: 'row' },
            h('div', { class: 'ring', style: { '--p': (p.xp / need) * 100 } }, h('b', null, p.level)),
            h('div', { class: 'grow' }, h('div', { class: 'bold', style: 'font-size:1.3em' }, p.name), h('div', { class: 'muted' }, `${p.title}  -  ${rank.name} (${fmt.num(p.rep)} rep)`)),
            h('div', { class: 'col', style: 'align-items:flex-end;gap:2px' }, h('div', { class: 'bold', style: 'font-size:1.2em' }, fmt.money(p.money)), h('div', { class: 'dim sm' }, `${fmt.num(p.tokens)} tokens`))),
          h('div', { style: 'margin-top:14px' }, bar(p.xp / need), h('div', { class: 'row dim sm', style: 'margin-top:5px' }, h('span', null, `${fmt.num(p.xp)} / ${fmt.num(need)} XP`), nr ? h('span', { class: 'end' }, `Next rank ${nr.name} at ${fmt.num(nr.min)} rep`) : null))),
        h('div', { class: 'row wrap' },
          playing ? btn('Resume', { kind: 'primary', lg: true, icon: 'play', on: () => app.closeMenu() }) : btn('Play', { kind: 'primary', lg: true, icon: 'play', on: () => { app.closeMenu(); app.startPlay(); } }),
          playing && app.replay?.ready() ? btn('Replay', { lg: true, icon: 'clock', on: () => { app.closeMenu(); setTimeout(() => app.startReplay(), 300); } }) : null,
          btn('Save', { icon: 'download', lg: true, on: () => { app.saveWorld(); app.store.save(true); toast({ title: 'Game saved', kind: 'green', icon: 'check' }); } }),
          playing ? btn('Quit to title', { lg: true, icon: 'home', on: async () => { if (await confirm('Quit to title', 'Your progress is saved automatically.', 'Quit')) { app.menu.hide(); app.quitToHome(); } } }) : null),
        sect('Current vehicle'),
        h('div', { class: 'card flat' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, `${def.brand} ${def.name}`), h('div', { class: 'dim sm' }, `${def.cls}  -  rating ${st.rating}`)), btn('Garage', { sm: true, on: () => ctx.menu.go('garage') })),
          h('div', { class: 'col', style: 'margin-top:12px;gap:6px' }, ['speed', 'accel', 'handling', 'braking'].map((k) => h('div', { class: 'stat' }, h('span', null, k[0].toUpperCase() + k.slice(1)), bar(st[k] / 10, k === 'braking' ? 'gold' : 'blue'), h('b', null, st[k].toFixed(1))))))),
      h('div', { class: 'col' },
        sect('Daily challenges'),
        h('div', { class: 'card flat col' }, challengeProgress(p, 'daily').map((c) => h('div', null, h('div', { class: 'row sm' }, h('span', { class: c.done ? 'green bold' : 'bold' }, c.name), h('span', { class: 'dim' }, c.desc), h('span', { class: 'end dim' }, `${Math.round(c.value)} / ${c.goal}`)), bar(c.value / c.goal, c.done ? 'green' : 'blue')))),
        sect('Driving stats'),
        h('div', { class: 'card flat' }, [['Distance driven', fmt.dist(p.stats.distance, app.units)], ['Top speed', Math.round(p.stats.topSpeed) + ' km/h'], ['Races won', p.stats.racesWon], ['Police escapes', p.stats.escapes], ['Best drift', fmt.num(p.stats.bestDrift)], ['Longest air time', (p.stats.bestAir || 0).toFixed(1) + ' s'], ['Play time', fmt.hours(p.stats.playTime)]].map(([k, v]) => h('div', { class: 'kv' }, h('span', null, k), h('b', null, v)))),
        sect('Controls'),
        h('div', { class: 'card flat', style: 'columns:2;column-gap:24px;font-size:0.86em' }, ['throttle', 'brake', 'left', 'right', 'handbrake', 'enter', 'camera', 'nitro', 'horn', 'lights', 'engine', 'map', 'phone', 'photo', 'replay'].map((a) => h('div', { class: 'row', style: 'gap:8px;padding:3px 0;break-inside:avoid' }, h('span', { class: 'kbd' }, (app.game.input.binds[a]?.[0] || '').replace('Key', '').replace('Arrow', '').replace('Left', '').replace('Space', 'Space')), h('span', { class: 'muted' }, (ACTION_LABELS[a] || a)))))),
    );
    return { el };
  },
};
void icon;
