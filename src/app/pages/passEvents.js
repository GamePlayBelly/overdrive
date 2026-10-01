import { h, icon, fmt, btn, tabs, toast, chip, bar, sect } from '../ui.js';
import { SEASON, DYNAMIC_EVENTS, periodEnds } from '../../data/meta.js';
import { ALL_ITEMS } from '../../data/items.js';
import { VEHICLE_BY_ID } from '../../data/vehicles.js';
import { challengeProgress } from '../../game/economy.js';

const rewardText = (r) => {
  if (!r) return '';
  const parts = [];
  if (r.money) parts.push(fmt.money(r.money)); if (r.xp) parts.push(`${r.xp} XP`); if (r.tokens) parts.push(`${r.tokens} tokens`);
  if (r.item) parts.push(ALL_ITEMS[r.item]?.name || r.item); if (r.items) parts.push(...r.items.map((i) => ALL_ITEMS[i]?.name || i));
  if (r.vehicle) parts.push(VEHICLE_BY_ID[r.vehicle]?.name || r.vehicle);
  return parts.join(', ');
};

export const passPage = {
  title: 'Battle Pass',
  render(app, ctx) {
    const st = app.store, P = () => st.profile;
    ctx.setSub(SEASON.name);
    const root = h('div');
    const draw = () => {
      const bp = P().battlepass, tier = Math.min(50, Math.floor(bp.xp / SEASON.xpPerTier)), into = (bp.xp % SEASON.xpPerTier) / SEASON.xpPerTier;
      const track = h('div', { class: 'pass-track' }, SEASON.tiers.map((t) => {
        const reached = tier >= t.tier;
        const cell = (kind) => {
          const r = t[kind], claimed = bp.claimed[kind].includes(t.tier), locked = kind === 'premium' && !bp.premium;
          return h('div', { class: 'pass-cell ' + (claimed ? 'ok' : '') + (kind === 'premium' ? ' prem' : '') + (!reached || locked ? ' lock' : '') },
            h('div', null, h('div', { style: 'font-size:11px;line-height:1.3' }, rewardText(r) || '-'), reached && !claimed && !locked ? btn('Claim', { sm: true, kind: 'primary', cls: '', on: () => { const res = st.act({ type: 'claimPass', tier: t.tier, track: kind }); if (res.ok) { app.game.audio.ui('unlock'); draw(); } else toast({ title: 'Cannot claim', sub: res.error, icon: 'x' }); } }) : claimed ? h('div', { class: 'green', style: 'margin-top:6px' }, icon('check')) : null));
        };
        return h('div', { class: 'pass-tier' }, h('div', { class: 'bold', style: 'font-family:var(--cond);font-size:20px;color:' + (reached ? '#fff' : 'var(--dim)') }, t.tier), cell('free'), cell('premium'));
      }));
      root.replaceChildren(
        h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'ring', style: { '--p': into * 100 } }, h('b', null, tier)), h('div', { class: 'grow' }, h('div', { class: 'bold', style: 'font-size:1.2em' }, `Tier ${tier} of 50`), h('div', { class: 'dim sm' }, `${fmt.num(bp.xp % SEASON.xpPerTier)} / ${fmt.num(SEASON.xpPerTier)} XP to next tier`), h('div', { style: 'margin-top:8px' }, bar(into, 'blue'))),
          bp.premium ? chip('Premium unlocked', 'gold', 'star') : btn(`Unlock premium  ${SEASON.tokensPremium} tokens`, { kind: 'primary', icon: 'bolt', on: () => { const r = st.act({ type: 'buyPremiumPass' }); if (r.ok) { app.game.audio.ui('unlock'); draw(); } else toast({ title: 'Cannot unlock', sub: r.error, icon: 'x' }); } }))),
        h('div', { class: 'row', style: 'margin:18px 0 0' }, h('div', { class: 'dim sm', style: 'width:116px;text-align:center' }, ''), h('span', { class: 'dim sm' }, 'Free track (top)  -  Premium track (bottom)')),
        track);
    };
    draw();
    return { el: root };
  },
};

export const eventsPage = {
  title: 'Events',
  render(app, ctx) {
    const st = app.store, P = () => st.profile;
    let tab = ctx.opts.tab || 'daily';
    ctx.setSub('Live events and challenges');
    const root = h('div'), body = h('div');
    const left = (kind) => { const ms = periodEnds(kind) - Date.now(); const h2 = Math.floor(ms / 3600000); return h2 >= 24 ? `${Math.floor(h2 / 24)}d ${h2 % 24}h left` : `${h2}h ${Math.floor((ms % 3600000) / 60000)}m left`; };
    const draw = () => {
      body.replaceChildren();
      if (tab === 'events') {
        const active = app.game.events?.active || [];
        body.appendChild(h('div', { class: 'grid g-auto-l' }, DYNAMIC_EVENTS.map((e, i) => { const on = active.find((a) => a.id === e.id); return h('div', { class: 'item', style: `animation-delay:${i * 0.04}s` }, h('div', { class: 'row' }, h('div', { style: 'width:38px;height:38px;border-radius:9px;display:grid;place-items:center;background:var(--red-soft);color:#ff8a8c' }, icon(e.type === 'race' ? 'flag' : e.type === 'lockdown' ? 'siren' : e.type === 'hunt' ? 'search' : 'zap')), h('div', { class: 'grow' }, h('div', { class: 'bold' }, e.name), on ? chip('Active nearby', 'green') : chip('Random', '')), h('div', null)), h('div', { class: 'muted sm' }, e.desc), h('div', { class: 'row wrap' }, chip(fmt.money(e.money), 'gold'), chip(`${e.xp} XP`, 'blue'), on ? btn('Track', { sm: true, on: () => { app.setWaypoint({ x: on.x, z: on.z }); app.closeMenu(); } }) : null)); })));
      } else {
        body.appendChild(h('div', { class: 'row', style: 'margin-bottom:10px' }, h('div', { class: 'dim sm' }, `Resets in ${left(tab === 'daily' ? 'daily' : tab === 'weekly' ? 'weekly' : 'monthly')}`)));
        body.appendChild(h('div', { class: 'grid g-auto-l' }, challengeProgress(P(), tab).map((c, i) => h('div', { class: 'item', style: `animation-delay:${i * 0.05}s` }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, c.name), h('div', { class: 'dim sm' }, c.desc)), c.claimed ? chip('Claimed', 'green', 'check') : null),
          h('div', null, bar(c.value / c.goal, c.done ? 'green' : 'blue'), h('div', { class: 'row dim sm', style: 'margin-top:5px' }, h('span', null, `${fmt.num(c.value)} / ${fmt.num(c.goal)}`))),
          h('div', { class: 'row wrap' }, chip(fmt.money(c.money), 'gold'), chip(`${c.xp} XP`, 'blue'), c.tokens ? chip(`${c.tokens} tokens`, 'gold', 'bolt') : null, btn(c.claimed ? 'Claimed' : 'Claim', { sm: true, kind: 'primary', disabled: !c.done || c.claimed, cls: 'end', on: () => { const r = st.act({ type: 'claimChallenge', kind: tab, id: c.id }); if (r.ok) { app.game.audio.ui('unlock'); draw(); } else toast({ title: 'Cannot claim', sub: r.error, icon: 'x' }); } }))))));
      }
    };
    root.append(tabs([['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['events', 'World events']], tab, (t) => { tab = t; draw(); }), body);
    draw();
    return { el: root };
  },
};
void sect;
