import { h, icon, fmt, btn, toast, chip } from '../ui.js';
import { SEASON } from '../../data/meta.js';
import { ALL_ITEMS } from '../../data/items.js';
import { VEHICLE_BY_ID } from '../../data/vehicles.js';

const rewardText = (r) => {
  if (!r) return '';
  const parts = [];
  if (r.money) parts.push(fmt.money(r.money)); if (r.xp) parts.push(`${r.xp} XP`); if (r.tokens) parts.push(`${r.tokens} tokens`);
  if (r.item) parts.push(ALL_ITEMS[r.item]?.name || r.item); if (r.items) parts.push(...r.items.map((i) => ALL_ITEMS[i]?.name || i));
  if (r.vehicle) parts.push(VEHICLE_BY_ID[r.vehicle]?.name || r.vehicle);
  return parts.join(', ');
};

const burst = (el) => {
  const r = el.getBoundingClientRect(), cols = ['#ffb02e', '#19e6c4', '#ff3fa4', '#ffffff', '#7a6cff'];
  for (let k = 0; k < 34; k++) {
    const d = h('i', { class: 'confetti', style: { left: r.left + r.width / 2 + 'px', top: r.top + r.height / 2 + 'px', background: cols[k % 5], '--dx': (Math.random() - 0.5) * 340 + 'px', '--dy': -80 - Math.random() * 260 + 'px', '--rot': Math.random() * 720 + 'deg', animationDelay: Math.random() * 0.12 + 's' } });
    document.body.appendChild(d); setTimeout(() => d.remove(), 1400);
  }
};

export const seasonPage = {
  title: 'Season Pass',
  render(app, ctx) {
    const st = app.store, P = () => st.profile;
    ctx.setSub(SEASON.name);
    const root = h('div', { class: 'sp' });
    let first = true;
    const draw = () => {
      const bp = P().battlepass, tier = Math.min(50, Math.floor(bp.xp / SEASON.xpPerTier)), into = (bp.xp % SEASON.xpPerTier) / SEASON.xpPerTier;
      const cell = (t, kind) => {
        const r = t[kind], claimed = bp.claimed[kind].includes(t.tier), locked = kind === 'premium' && !bp.premium, ready = tier >= t.tier && !claimed && !locked, veh = r && r.vehicle;
        const c = h('div', { class: 'sp-card ' + kind + (claimed ? ' got' : '') + (ready ? ' ready' : '') + (tier < t.tier || locked ? ' lock' : '') + (veh ? ' big' : ''), style: { animationDelay: Math.min(t.tier, 24) * 0.03 + 's' } },
          h('div', { class: 'sp-ico' }, icon(veh ? 'car' : r && r.money ? 'coin' : r && r.tokens ? 'bolt' : r && (r.item || r.items) ? 'shirt' : 'star')),
          h('div', { class: 'sp-txt' }, rewardText(r) || '-'),
          claimed ? h('div', { class: 'sp-ok' }, icon('check')) : locked ? h('div', { class: 'sp-ok' }, icon('lock')) : null);
        if (ready) c.addEventListener('click', () => { const res = st.act({ type: 'claimPass', tier: t.tier, track: kind }); if (res.ok) { app.game.audio.ui('unlock'); burst(c); c.classList.add('pop'); setTimeout(draw, 650); } else toast({ title: 'Cannot claim', sub: res.error, icon: 'x' }); });
        c.addEventListener('pointermove', (e) => { const b = c.getBoundingClientRect(); c.style.setProperty('--rx', ((e.clientY - b.top) / b.height - 0.5) * -14 + 'deg'); c.style.setProperty('--ry', ((e.clientX - b.left) / b.width - 0.5) * 16 + 'deg'); });
        c.addEventListener('pointerleave', () => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
        return c;
      };
      const track = h('div', { class: 'sp-track' }, SEASON.tiers.map((t) => h('div', { class: 'sp-col' + (t.tier === tier ? ' now' : '') + (t.tier <= tier ? ' past' : '') }, cell(t, 'free'), h('div', { class: 'sp-node' }, h('b', null, t.tier)), cell(t, 'premium'))));
      const hero = h('div', { class: 'sp-hero' }, h('div', { class: 'sp-orb' }), h('div', { class: 'sp-orb o2' }),
        h('div', { class: 'sp-title' }, h('small', null, 'SEASON 1'), h('h1', null, 'Riverton Nights')),
        h('div', { class: 'sp-lvl' }, h('div', { class: 'ring', style: { '--p': into * 100 } }, h('b', null, tier)), h('div', null, h('div', { class: 'bold' }, `Tier ${tier} / 50`), h('div', { class: 'dim sm' }, `${fmt.num(bp.xp % SEASON.xpPerTier)} / ${fmt.num(SEASON.xpPerTier)} XP`))),
        bp.premium ? chip('Premium unlocked', 'gold', 'star') : btn(`Unlock premium  ${SEASON.tokensPremium} tokens`, { kind: 'primary', icon: 'bolt', on: () => { const r = st.act({ type: 'buyPremiumPass' }); if (r.ok) { app.game.audio.ui('unlock'); draw(); } else toast({ title: 'Cannot unlock', sub: r.error, icon: 'x' }); } }));
      const rail = h('div', { class: 'sp-rail' }, h('i', { style: { width: Math.min(100, ((tier + into) / 50) * 100) + '%' } }));
      root.replaceChildren(hero, rail, h('div', { class: 'sp-lab' }, h('span', null, 'FREE'), h('span', null, 'PREMIUM')), track);
      track.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { track.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
      if (first) { first = false; requestAnimationFrame(() => track.scrollTo({ left: Math.max(0, (tier - 2) * 132), behavior: 'smooth' })); }
    };
    draw();
    return { el: root };
  },
};
