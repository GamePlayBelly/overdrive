import { h, icon, fmt, btn, tabs, toast, chip, bar, sect, select } from '../ui.js';
import { stageLayout } from './creator.js';
import { ACHIEVEMENTS, COLLECTIBLES, HIDDEN_LOCATIONS, RARE_VEHICLES } from '../../data/meta.js';
import { RUMORS } from '../../data/npcs.js';
import { rankFor, nextRank, xpToNext } from '../../data/progression.js';
import { SAFEHOUSE_ITEMS, GARAGE_ITEMS, EMOTES, ALL_ITEMS } from '../../data/items.js';
import { VEHICLE_BY_ID } from '../../data/vehicles.js';
import { DISTRICTS } from '../../data/world.js';
import { GARAGE_TIERS } from '../../data/progression.js';

export const profilePage = {
  title: 'Profile',
  stage: true,
  render(app, ctx) {
    const st = app.store, stage = app.stage, P = () => st.profile;
    let tab = ctx.opts.tab || 'overview';
    stage.showAvatar(P().avatar); stage.frame(-2); stage.auto = 0.2;
    ctx.setSub('Your driver');
    const content = h('div'), body = h('div');
    const draw = () => {
      const p = P(), rank = rankFor(p.rep), nr = nextRank(p.rep), need = xpToNext(p.level);
      body.replaceChildren();
      if (tab === 'overview') {
        body.append(
          h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'ring', style: { '--p': (p.xp / need) * 100 } }, h('b', null, p.level)), h('div', { class: 'grow' }, h('div', { class: 'bold', style: 'font-size:1.3em' }, p.name), h('div', { class: 'muted' }, `${rank.name}  -  ${fmt.num(p.rep)} rep` + (nr ? `  -  next ${nr.name}` : ''))), btn('Edit', { sm: true, icon: 'user', on: () => ctx.menu.go('creator') })),
            h('div', { style: 'margin-top:12px' }, bar(p.xp / need)), h('div', { class: 'dim sm', style: 'margin-top:4px' }, `${fmt.num(p.xp)} / ${fmt.num(need)} XP`)),
          h('div', { class: 'setting' }, h('div', { class: 'lbl' }, 'Title'), select(p.titles.map((t) => [t, t]), p.title, (v) => { st.act({ type: 'setTitle', title: v }); })),
          sect('Emotes'), h('div', { class: 'opt-grid' }, EMOTES.filter((e) => p.emotes.includes(e.id)).map((e) => h('button', { class: 'opt', on: { click: () => stage.playEmote(e.id) } }, e.name))),
          sect('Wallet'), h('div', { class: 'card flat' }, [['Cash', fmt.money(p.money)], ['Tokens', fmt.num(p.tokens)], ['Vehicles', p.garage.vehicles.length], ['Achievements', `${Object.keys(p.achievements).length} / ${ACHIEVEMENTS.length}`]].map(([k, v]) => h('div', { class: 'kv' }, h('span', null, k), h('b', null, v)))));
      } else if (tab === 'stats') {
        const S = p.stats;
        body.appendChild(h('div', { class: 'card flat' }, [['Distance driven', fmt.dist(S.distance, app.units)], ['At night', fmt.dist(S.nightDistance, app.units)], ['Top speed', Math.round(S.topSpeed) + ' km/h'], ['Play time', fmt.hours(S.playTime)], ['Races', `${S.racesWon} won of ${S.racesDone}`], ['Podiums', S.podiums], ['Missions', S.missionsDone], ['Deliveries', S.deliveries], ['Police escapes', S.escapes], ['Arrests', S.arrests], ['Highest wanted level', S.maxWanted], ['Police units disabled', S.unitsDisabled], ['Drift points', fmt.num(S.drift)], ['Best drift chain', fmt.num(S.bestDrift)], ['Total air time', (S.airTime || 0).toFixed(1) + ' s'], ['Best jump', (S.bestAir || 0).toFixed(1) + ' s'], ['Near misses', S.nearMisses], ['Crashes', S.crashes], ['Photos', S.photos], ['Collectibles', S.collectibles]].map(([k, v]) => h('div', { class: 'kv' }, h('span', null, k), h('b', null, v)))));
      } else {
        body.appendChild(p.photos.length ? h('div', { class: 'grid', style: 'grid-template-columns:repeat(2,1fr)' }, p.photos.map((ph) => h('div', { class: 'item', style: 'padding:6px' }, h('img', { src: ph.url, style: 'width:100%;border-radius:6px' }), h('div', { class: 'dim sm' }, fmt.ago(ph.t))))) : h('div', { class: 'empty' }, 'No photos yet. Press F2 in the world to open photo mode.'));
      }
    };
    content.append(tabs([['overview', 'Overview'], ['stats', 'Statistics'], ['photos', 'Photos']], tab, (t) => { tab = t; draw(); }), body);
    draw();
    return { el: stageLayout(content), stage: 'avatar', dispose() { stage.frame(0); stage.auto = 0.22; void icon; void chip; } };
  },
};

export const achievementsPage = {
  title: 'Achievements',
  render(app, ctx) {
    const p = app.profile;
    const done = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;
    ctx.setSub(`${done} / ${ACHIEVEMENTS.length} unlocked`);
    return { el: h('div', { class: 'grid g-auto-l' }, ACHIEVEMENTS.map((a, i) => {
      const got = p.achievements[a.id], val = a.stat ? Math.min(a.goal, p.stats[a.stat] || 0) : got ? 1 : 0, goal = a.stat ? a.goal : 1;
      return h('div', { class: 'item', style: `animation-delay:${Math.min(i, 24) * 0.02}s;${got ? '' : 'opacity:0.85'}` },
        h('div', { class: 'row' }, h('div', { style: `width:40px;height:40px;border-radius:10px;display:grid;place-items:center;background:${got ? 'rgba(214,169,53,0.16)' : '#20252b'};color:${got ? 'var(--gold)' : 'var(--dim)'}` }, icon(got ? 'trophy' : 'lock')), h('div', { class: 'grow' }, h('div', { class: 'bold' }, a.name), h('div', { class: 'dim sm' }, a.desc)), got ? chip(fmt.ago(got), 'gold') : null),
        a.stat ? h('div', null, bar(val / goal, got ? 'gold' : 'blue'), h('div', { class: 'dim sm', style: 'margin-top:4px' }, `${fmt.num(val)} / ${fmt.num(goal)}`)) : null);
    })) };
  },
};

export const collectionPage = {
  title: 'Collection',
  render(app, ctx) {
    const p = app.profile;
    let tab = ctx.opts.tab || 'items';
    ctx.setSub(`${p.collectibles.length} / ${COLLECTIBLES.length} collectibles found`);
    const root = h('div'), body = h('div');
    const TYPES = { key: 'Spare keys', token: 'Riverton tokens', plate: 'Rare plates', part: 'Vintage parts', memorabilia: 'Memorabilia', photo: 'Photo spots' };
    const draw = () => {
      body.replaceChildren();
      if (tab === 'items') for (const [t, label] of Object.entries(TYPES)) {
        const list = COLLECTIBLES.filter((c) => c.type === t);
        body.appendChild(sect(label, `${list.filter((c) => p.collectibles.includes(c.id)).length} / ${list.length}`));
        body.appendChild(h('div', { class: 'grid g-auto' }, list.map((c) => { const got = p.collectibles.includes(c.id); return h('div', { class: 'item', style: got ? '' : 'opacity:0.6' }, h('div', { class: 'row' }, icon(got ? 'check' : 'lock'), h('div', { class: 'grow bold sm' }, got ? c.name : '???')), got ? null : h('div', { class: 'dim sm' }, 'Not found yet - explore the county'), got ? null : btn('Hint', { sm: true, on: () => { app.setWaypoint({ x: c.x + (Math.random() - 0.5) * 240, z: c.z + (Math.random() - 0.5) * 240 }); toast({ title: 'Approximate area marked', sub: 'Look around the waypoint', kind: 'blue', icon: 'flag' }); } })); })));
      } else if (tab === 'places') {
        body.appendChild(h('div', { class: 'grid g-auto' }, [...DISTRICTS.map((d) => ({ id: d.id, name: d.name })), ...HIDDEN_LOCATIONS].map((d) => { const got = p.discovered.includes(d.id) || d.id === 'cbd'; return h('div', { class: 'item', style: got ? '' : 'opacity:0.6' }, h('div', { class: 'row' }, icon(got ? 'map' : 'lock'), h('div', { class: 'grow bold sm' }, got ? d.name : '???')), d.desc && got ? h('div', { class: 'muted sm' }, d.desc) : null); })));
      } else if (tab === 'rare') {
        body.appendChild(h('div', { class: 'grid g-auto-l' }, RARE_VEHICLES.map((r) => { const got = p.rares.includes(r.id); return h('div', { class: 'item', style: got ? '' : 'opacity:0.6' }, h('div', { class: 'row' }, icon('car'), h('div', { class: 'grow bold' }, got ? r.name : 'Unknown rare vehicle'), got ? chip(VEHICLE_BY_ID[r.model].cls, 'gold') : null), h('div', { class: 'muted sm' }, got ? r.story : 'Rumors say it only appears under special conditions.'), r.cond.night || r.cond.rain ? h('div', { class: 'dim sm' }, r.cond.night ? 'Only at night' : 'Only in the rain') : null); })));
      } else {
        const known = RUMORS.filter((r) => p.rumors.includes(r.id));
        body.appendChild(known.length ? h('div', { class: 'col' }, known.map((r) => h('div', { class: 'card flat' }, h('div', { class: 'muted' }, r.text), r.hint ? btn('Mark on map', { sm: true, on: () => { app.setWaypoint(r.hint); toast({ title: 'Waypoint set', kind: 'blue', icon: 'flag' }); } }) : null))) : h('div', { class: 'empty' }, 'Call your contacts from the phone to hear rumors.'));
      }
    };
    root.append(tabs([['items', 'Collectibles'], ['places', 'Places'], ['rare', 'Rare vehicles'], ['rumors', 'Rumors']], tab, (t) => { tab = t; draw(); }), body);
    draw();
    return { el: root };
  },
};

export const safehousePage = {
  title: 'Safehouse',
  render(app, ctx) {
    const st = app.store, P = () => st.profile;
    ctx.setSub('Birch Lane, Eastside');
    let tab = ctx.opts.tab || 'home';
    const root = h('div'), body = h('div');
    const draw = () => {
      const p = P();
      body.replaceChildren();
      if (tab === 'home') {
        body.appendChild(h('div', { class: 'grid g-auto' }, SAFEHOUSE_ITEMS.map((it, i) => { const owned = p.safehouse.owned.includes(it.id), placed = p.safehouse.placed[it.id]; return h('div', { class: 'item', style: `animation-delay:${i * 0.03}s` }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, it.name), h('div', { class: 'dim sm' }, it.slot)), owned ? chip(placed ? 'Placed' : 'Stored', placed ? 'green' : '') : chip(it.source === 'pass' ? 'Pass reward' : fmt.money(it.price), 'gold')),
          owned ? btn(placed ? 'Remove' : 'Place', { sm: true, on: () => { st.act({ type: 'toggleSafehouse', id: it.id }); draw(); } }) : btn('Buy', { sm: true, kind: 'primary', icon: 'cart', disabled: it.source === 'pass' || p.money < it.price, on: () => { const r = st.act({ type: 'buySafehouse', id: it.id }); if (r.ok) { app.game.audio.ui('buy'); draw(); } else toast({ title: 'Cannot buy', sub: r.error, icon: 'x' }); } })); })));
      } else {
        body.appendChild(h('div', { class: 'card flat' }, h('div', { class: 'row' }, icon('house'), h('div', { class: 'grow' }, h('div', { class: 'bold' }, GARAGE_TIERS[p.garage.tier].name), h('div', { class: 'dim sm' }, `${p.garage.vehicles.length} / ${GARAGE_TIERS[p.garage.tier].capacity} vehicles`)), btn('Upgrade', { sm: true, on: () => ctx.menu.go('garage', { tab: 'details' }) }))));
        body.appendChild(h('div', { class: 'grid g-auto', style: 'margin-top:14px' }, GARAGE_ITEMS.map((it, i) => { const on = p.garage.items.includes(it.id), own = p.inventory.includes(it.id); return h('div', { class: 'item', style: `animation-delay:${i * 0.03}s` }, h('div', { class: 'row' }, h('div', { class: 'grow bold' }, it.name), on ? chip('Installed', 'green') : own ? chip('Owned') : chip(it.source === 'shop' ? fmt.money(it.price) : it.source === 'pass' ? 'Pass' : 'Level unlock', 'gold')), btn(on ? 'Remove' : own ? 'Install' : 'Buy', { sm: true, kind: own ? '' : 'primary', disabled: !own && it.source !== 'shop', on: () => { const r = st.act({ type: 'garageItem', id: it.id }); if (r.ok) draw(); else toast({ title: 'Cannot', sub: r.error, icon: 'x' }); } })); })));
      }
    };
    root.append(tabs([['home', 'Safehouse'], ['garage', 'Garage decor']], tab, (t) => { tab = t; draw(); }), body);
    draw();
    return { el: root };
  },
};
void ALL_ITEMS;
