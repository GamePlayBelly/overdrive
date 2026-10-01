import { h, icon, fmt, btn, tabs, toast, chip, sect, modal, seg, kv } from '../ui.js';
import { thumbEl } from './common.js';
import { PRESETS, FEE, bidStep, conditionOf } from '../../game/auction.js';
import { vehicleValue, capacity } from '../../game/economy.js';
import { VEHICLE_BY_ID } from '../../data/vehicles.js';

const STATE = { won: 'Won', lost: 'Lost', passed: 'No bids', failed: 'Failed', sold: 'Sold', unsold: 'Unsold', cancelled: 'Withdrawn' };
const KIND = { won: 'green', sold: 'green', lost: 'red', failed: 'red' };

export const auctionPage = {
  title: 'Auction House',
  render(app, ctx) {
    const A = app.auction, P = () => app.profile;
    let tab = ctx.opts.tab || 'buy', ver = -1, timers = [];
    ctx.setSub('Riverton Auto Exchange  -  live bidding');
    ctx.setHelp([['Esc', 'Close']]);
    const root = h('div'), body = h('div');
    const fail = (title, sub) => toast({ title, sub, kind: 'red', icon: 'x' });
    const after = () => { app.menu.updateChips(); draw(); };
    const timeChip = (l) => { const c = h('span', { class: 'chip' }, icon('clock'), h('span', null, fmt.time(A.left(l)))); timers.push([c.lastChild, l, c]); return c; };

    const perfChips = (perf) => { const n = Object.values(perf || {}).reduce((a, b) => a + b, 0); return n ? chip(`Upgrades +${n}`, 'blue', 'wrench') : null; };

    const buyCard = (l) => {
      const d = l.def, open = l.state === 'live', locked = A.locked(l), mine = l.bidder === 'you', min = A.min(l), step = bidStep(min);
      const bidBtn = (amt) => btn(`Bid ${fmt.money(amt)}`, { kind: amt === min ? 'primary' : '', sm: true, icon: 'tag', disabled: locked || mine, on: () => { const r = A.bid(l, amt); if (r) fail('Cannot bid', r); else { app.game.audio.ui('click'); after(); } } });
      return h('div', { class: 'item' + (mine ? ' sel' : '') + (locked ? ' locked' : '') + (open ? '' : ' ended'), style: 'padding:10px;gap:7px;cursor:default' },
        h('div', { style: 'width:168px;align-self:center' }, thumbEl(d, l.color, 84)),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, `${d.brand} ${d.name}`), h('div', { class: 'dim sm' }, `${d.cls}  -  ${fmt.num(l.odometer)} km`)), open ? timeChip(l) : chip(STATE[l.state], KIND[l.state] || '')),
        h('div', { class: 'row wrap', style: 'gap:6px' }, chip(l.damage ? `${Math.round(l.damage * 100)}% damage` : 'Clean', l.damage > 0.3 ? 'red' : 'green'), perfChips(l.perf), locked ? chip(`Lv ${d.level - 4}`, '', 'lock') : null),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'dim sm' }, l.bids ? (mine ? 'Your bid' : `Top bid  -  ${l.bidder}`) : 'Starting bid'), h('div', { class: 'gold bold', style: 'font-size:1.2em' }, fmt.money(l.price || l.high))), h('div', { class: 'dim sm' }, `${l.bids} bid${l.bids === 1 ? '' : 's'}`)),
        open ? h('div', { class: 'row wrap', style: 'gap:6px' }, bidBtn(min), bidBtn(min + step * 3), l.high < l.buyNow ? btn(`Buy now ${fmt.money(l.buyNow)}`, { sm: true, icon: 'cart', disabled: locked, on: () => { const r = A.buyNow(l); if (r) fail('Cannot buy', r); else after(); } }) : null) : null);
    };

    const sellCard = (l) => {
      const d = l.def, open = l.state === 'live', met = l.bidder && l.high >= l.reserve;
      return h('div', { class: 'item' + (open ? '' : ' ended'), style: 'padding:10px;gap:7px;cursor:default' },
        h('div', { class: 'row', style: 'gap:10px' }, h('div', { style: 'width:96px;flex:none' }, thumbEl(d, l.color, 50)), h('div', { class: 'grow' }, h('div', { class: 'bold' }, `${d.brand} ${d.name}`), h('div', { class: 'dim sm' }, `${l.bids} bid${l.bids === 1 ? '' : 's'}${l.bidder ? `  -  ${l.bidder}` : ''}`)), open ? timeChip(l) : chip(STATE[l.state], KIND[l.state] || '')),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'dim sm' }, l.bids ? 'Top bid' : 'Opening at'), h('div', { class: 'gold bold', style: 'font-size:1.2em' }, fmt.money(l.price || l.high))), met ? chip('Reserve met', 'green', 'check') : chip(`Reserve ${fmt.money(l.reserve)}`, '', 'lock')),
        open ? h('div', { class: 'row wrap', style: 'gap:6px' }, btn(met ? `Accept ${fmt.money(l.high * (1 - FEE))}` : 'Accept', { kind: 'primary', sm: true, icon: 'check', disabled: !met, on: () => { const r = A.accept(l); if (r) fail('Cannot accept', r); else after(); } }), btn('Withdraw', { sm: true, icon: 'x', on: () => { A.cancel(l); after(); } })) : null);
    };

    const sellModal = (v) => {
      const d = VEHICLE_BY_ID[v.model], val = vehicleValue(v);
      let preset = PRESETS[1];
      const info = h('div', { class: 'col', style: 'gap:4px' });
      const paint = () => {
        const fair = Math.round(val * conditionOf({ damage: v.damage || 0, odometer: v.odometer || 0 }));
        info.replaceChildren(kv('Estimated value', fmt.money(fair)), kv('Reserve price', fmt.money(fair * preset.reserve)), kv('Runs for', fmt.time(preset.secs)), kv('Fee on sale', `${Math.round(FEE * 100)}%`));
      };
      paint();
      modal({
        title: `List ${d.brand} ${d.name}`,
        body: h('div', { class: 'col', style: 'gap:14px;min-width:min(420px,80vw)' }, thumbEl(d, v.custom?.color || d.colors[0], 96), seg(PRESETS.map((x) => [x.id, x.label]), preset.id, (id) => { preset = PRESETS.find((x) => x.id === id); paint(); }), info, h('div', { class: 'dim sm' }, 'The vehicle stays in your garage until it sells. If the reserve is not met, nothing changes.')),
        actions: [{ label: 'Cancel' }, { label: 'List vehicle', kind: 'primary', on: () => { const r = A.list(v.uid, preset); if (r) { fail('Cannot list', r); return false; } draw(); return true; } }],
      });
    };

    const draw = () => {
      ver = A.version; timers = [];
      const keep = ctx.page.scrollTop;
      body.replaceChildren();
      if (tab === 'buy') {
        const cap = P().garage.vehicles.length + '/' + capacity(P());
        const list = A.listings.filter((l) => l.kind === 'buy').sort((a, b) => (a.state === 'live' ? 0 : 1) - (b.state === 'live' ? 0 : 1) || A.left(a) - A.left(b));
        body.append(h('div', { class: 'row wrap', style: 'gap:8px;margin:6px 0 12px' }, chip(`Available ${fmt.money(A.free())}`, 'gold', 'coin'), A.held ? chip(`Held in bids ${fmt.money(A.held)}`, 'blue', 'lock') : null, chip(`Garage ${cap}`, '', 'car')),
          h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px' }, list.map((l) => buyCard(l))));
      } else if (tab === 'sell') {
        const listed = A.listedUids(), cars = P().garage.vehicles;
        const mine = A.listings.filter((l) => l.kind === 'sell');
        body.append(h('div', { class: 'grid', style: 'grid-template-columns:minmax(300px,1fr) minmax(300px,1fr);gap:22px;align-items:start' },
          h('div', null, sect('Your garage', `${Math.round(FEE * 100)}% fee on every sale`),
            h('div', { class: 'col', style: 'gap:8px' }, cars.map((v) => {
              const d = VEHICLE_BY_ID[v.model], inUse = v.uid === P().garage.selected, isListed = listed.has(v.uid);
              return h('div', { class: 'item' + (inUse ? ' locked' : ''), style: 'flex-direction:row;align-items:center;gap:12px;padding:8px 10px;cursor:default' },
                h('div', { style: 'width:92px;flex:none' }, thumbEl(d, v.custom?.color || d.colors[0], 48)),
                h('div', { class: 'grow' }, h('div', { class: 'bold' }, `${d.brand} ${d.name}`), h('div', { class: 'dim sm' }, `Worth about ${fmt.money(vehicleValue(v) * conditionOf({ damage: v.damage || 0, odometer: v.odometer || 0 }))}`)),
                inUse ? chip('In use', '', 'lock') : isListed ? chip('Listed', 'blue', 'tag') : btn('List', { sm: true, icon: 'tag', disabled: cars.length <= 1, on: () => sellModal(v) }));
            }))),
          h('div', null, sect('Your listings', 'Bidders compete in real time'),
            mine.length ? h('div', { class: 'col', style: 'gap:10px' }, mine.map((l) => sellCard(l))) : h('div', { class: 'empty' }, 'Nothing listed. Pick a vehicle on the left to put it up for auction.'))));
      } else {
        body.append(A.log.length ? h('div', { class: 'col', style: 'gap:6px' }, A.log.map((e) => h('div', { class: 'item', style: 'flex-direction:row;align-items:center;gap:10px;padding:8px 12px;cursor:default' }, icon(e.kind === 'green' ? 'check' : e.kind === 'red' ? 'x' : 'tag'), h('div', { class: 'grow' }, e.text), h('span', { class: 'dim sm' }, fmt.ago(e.t))))) : h('div', { class: 'empty' }, 'No activity yet. Place a bid to get started.'));
      }
      ctx.page.scrollTop = keep;
    };

    const tick = () => {
      for (const [el, l, c] of timers) {
        const s = A.left(l);
        el.textContent = fmt.time(s);
        c.classList.toggle('red', s < 15);
      }
    };

    root.append(tabs([['buy', 'Buy'], ['sell', 'Sell'], ['log', 'Activity']], tab, (t) => { tab = t; draw(); }), body);
    draw();
    const iv = setInterval(() => { if (A.version !== ver) draw(); else tick(); }, 400);
    return { el: root, dispose() { clearInterval(iv); } };
  },
};
