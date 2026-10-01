import { h, icon, fmt, btn, tabs, toast, sect, chip } from '../ui.js';
import { stageLayout } from './creator.js';
import { itemState, rarityOf } from './common.js';
import { CLOTHING, OUTFITS, EMOTES, COSMETICS, GARAGE_ITEMS, ALL_ITEMS } from '../../data/items.js';
import { SHOP_FEATURED, TOKEN_PRICES } from '../../data/meta.js';
import { owns } from '../../game/economy.js';

const CAT_LABEL = { top: 'Tops', jacket: 'Jackets', pants: 'Pants', shoes: 'Shoes', hat: 'Hats', glasses: 'Glasses', watch: 'Watches', chain: 'Chains', bag: 'Bags' };

export const shopPage = {
  title: 'Shop',
  stage: true,
  render(app, ctx) {
    const st = app.store, stage = app.stage, P = () => st.profile;
    let tab = ctx.opts.tab || 'featured', cat = 'top', sel = null;
    let look = JSON.parse(JSON.stringify(P().avatar));
    ctx.setHelp([['Drag', 'Rotate'], ['Wheel', 'Zoom']]);
    stage.showAvatar(look); stage.frame(-2); stage.auto = 0.18;
    const content = h('div'), action = h('div', { class: 'preview-tools' });
    app.menu.el.appendChild(action);
    const tokens = () => h('div', { class: 'pill' }, icon('bolt'), fmt.num(P().tokens) + ' tokens');
    const applyLook = (it) => {
      const l = JSON.parse(JSON.stringify(P().avatar));
      const put = (item) => { if (!item || item.kind !== 'clothing') return; if (['top', 'jacket', 'pants', 'shoes', 'hat'].includes(item.cat)) l[item.cat] = { ...item.props }; else l[item.cat] = item.props.value; };
      if (it?.kind === 'clothing') put(it); else if (it?.kind === 'outfit') for (const x of it.items) put(ALL_ITEMS[x]);
      look = l; const keep = stage.tYaw; stage.showAvatar(look); stage.tYaw = stage.yaw = keep;
    };
    const emoteName = { wave: 'wave', clap: 'clap', point: 'point', dance: 'dance', shrug: 'shrug', salute: 'salute', cheer: 'cheer', lean: 'lean' };
    const card = (it, i) => {
      const s = itemState(P(), it);
      const tok = TOKEN_PRICES[it.id];
      const r = rarityOf(it);
      return h('div', { class: 'item' + (sel === it ? ' sel' : '') + (s.state === 'locked' ? ' locked' : ''), style: `animation-delay:${Math.min(i, 20) * 0.018}s;cursor:pointer`, on: { click: () => { sel = it; if (it.kind === 'clothing' || it.kind === 'outfit') applyLook(it); if (it.kind === 'emote') stage.playEmote(emoteName[it.id.replace('emote_', '')] || 'wave'); draw(); } } },
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, it.name), h('div', { class: 'meta rarity-' + r }, r)), it.props?.color ? h('span', { class: 'swatch', style: { background: it.props.color, width: '20px', height: '20px' } }) : null),
        h('div', { class: 'row' }, s.state === 'owned' ? chip('Owned', 'green', 'check') : s.state === 'buy' ? chip(fmt.money(it.price), 'gold', 'coin') : chip(s.text, '', 'lock'), tok && s.state !== 'owned' ? chip(tok + ' tokens', 'blue', 'bolt') : null));
    };
    const draw = () => {
      let items = [];
      if (tab === 'featured') items = SHOP_FEATURED.map((id) => ALL_ITEMS[id]).filter(Boolean);
      else if (tab === 'clothing') items = CLOTHING.filter((c) => c.cat === cat);
      else if (tab === 'outfits') items = OUTFITS.map((o) => ALL_ITEMS[o.id]);
      else if (tab === 'emotes') items = EMOTES.map((e) => ALL_ITEMS['emote_' + e.id]);
      else if (tab === 'vehicle') items = COSMETICS.filter((c) => c.source === 'shop' || c.price >= 3000);
      else if (tab === 'garage') items = GARAGE_ITEMS.map((g) => ALL_ITEMS[g.id]);
      content.replaceChildren(
        h('div', { class: 'row', style: 'margin-bottom:6px' }, h('div', { class: 'grow' }), tokens()),
        tabs([['featured', 'Featured'], ['clothing', 'Clothing'], ['outfits', 'Outfits'], ['emotes', 'Emotes'], ['vehicle', 'Vehicle parts'], ['garage', 'Garage']], tab, (t) => { tab = t; sel = null; draw(); }),
        tab === 'clothing' ? h('div', { class: 'opt-grid', style: 'margin-bottom:12px' }, Object.entries(CAT_LABEL).map(([k, l]) => h('button', { class: 'opt' + (k === cat ? ' on' : ''), on: { click: () => { cat = k; sel = null; draw(); } } }, l))) : null,
        h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(190px,1fr));max-height:calc(100vh - 340px);overflow-y:auto;padding:2px' }, items.map(card)));
      action.replaceChildren();
      if (sel) {
        const s = itemState(P(), sel), tok = TOKEN_PRICES[sel.id];
        if (s.state === 'buy') {
          action.append(h('div', { class: 'pill' }, sel.name), btn(`Buy  ${fmt.money(sel.price)}`, { kind: 'primary', icon: 'cart', disabled: P().money < sel.price, on: () => doBuy(sel, 'money') }));
          if (tok) action.append(btn(`${tok} tokens`, { icon: 'bolt', disabled: P().tokens < tok, on: () => doBuy(sel, 'tokens') }));
        } else if (s.state === 'owned' && (sel.kind === 'clothing' || sel.kind === 'outfit')) action.append(h('div', { class: 'pill' }, sel.name), btn('Equip', { kind: 'primary', icon: 'check', on: () => { const r = st.act({ type: 'equip', id: sel.id }); if (r.ok) { app.game.player.setLook(P().avatar); toast({ title: 'Equipped', sub: sel.name, kind: 'green', icon: 'shirt' }); draw(); } } }));
        else if (s.state === 'locked') action.append(h('div', { class: 'pill' }, icon('lock'), s.text));
        else if (s.state === 'owned') action.append(h('div', { class: 'pill' }, icon('check'), 'Owned'));
      }
    };
    const doBuy = (it, currency) => { const r = st.act({ type: 'buyItem', id: it.id, currency }); if (r.ok) { app.game.audio.ui('buy'); toast({ title: 'Purchased', sub: it.name, kind: 'green', icon: 'bag' }); draw(); } else toast({ title: 'Cannot buy', sub: r.error, icon: 'x' }); };
    draw();
    return { el: stageLayout(content), stage: 'avatar', dispose() { action.remove(); stage.frame(0); stage.auto = 0.22; void sect; void owns; } };
  },
};
