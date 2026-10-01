import { PLAYER_VEHICLES, VEHICLE_BY_ID } from '../data/vehicles.js';
import { PERF_PARTS } from '../data/progression.js';
import { vehicleValue, findVehicle, capacity } from './economy.js';

const NAMES = ['M. Okafor', 'Lena V.', 'Dirk', 'Harbor Motors', 'Silvia R.', 'J. Tanaka', 'Dealer 14', 'Big Al', 'Noor', 'Westgate Classics', 'Tomas', 'Kit & Sons', 'Ramona', 'Eastside Auto'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const snap = (v, s) => Math.max(s, Math.round(v / s) * s);
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const names = (n) => NAMES.slice().sort(() => Math.random() - 0.5).slice(0, n);

export const FEE = 0.08;
export const PRESETS = [
  { id: 'quick', label: 'Quick sale', secs: 60, reserve: 0.7 },
  { id: 'standard', label: 'Standard', secs: 150, reserve: 0.9 },
  { id: 'patient', label: 'Patient', secs: 300, reserve: 1.1 },
];
export const bidStep = (v) => (v < 2000 ? 50 : v < 10000 ? 250 : v < 50000 ? 500 : v < 200000 ? 2500 : 10000);
export const conditionOf = (l) => 1 - l.damage * 0.45 - Math.min(0.25, l.odometer / 800000);

// Live auctions: AI bidders, real-time countdowns, the player's own listings. State lives in memory; money only moves when a deal closes.
export class AuctionHouse {
  constructor(app) { this.app = app; this.listings = []; this.now = 0; this.version = 0; this.log = []; this.held = 0; this.n = 1; this.fillT = 0; }

  get p() { return this.app.profile; }
  get store() { return this.app.store; }
  left(l) { return Math.max(0, l.endsAt - this.now); }
  min(l) { return l.bids ? l.high + bidStep(l.high) : l.start; }
  free() { return this.p ? this.p.money - this.held : 0; }
  locked(l) { return this.p.level < l.def.level - 4 && !this.p.unlockedVehicles.includes(l.model); }
  live(kind) { return this.listings.filter((l) => l.kind === kind && l.state === 'live'); }
  toast(o) { this.app.toast?.(o); }
  note(text, kind = '') { this.log.unshift({ text, kind, t: Date.now() }); if (this.log.length > 30) this.log.pop(); this.version++; }

  make() {
    const p = this.p, taken = new Set(this.live('buy').map((l) => l.model));
    const pool = PLAYER_VEHICLES.filter((d) => d.price > 0 && d.level <= p.level + 10 && !taken.has(d.id));
    if (!pool.length) return null;
    const w = pool.map((d) => 1 / Math.sqrt(d.price / 10000 + 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0), def = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { def = pool[i]; break; } }
    const worn = Math.random() < 0.55, perf = {};
    if (Math.random() < 0.45) for (const k of Object.keys(PERF_PARTS)) if (Math.random() < 0.5) perf[k] = 1 + Math.floor(Math.random() * 3);
    const l = { id: this.n++, kind: 'buy', model: def.id, def, color: pick(def.colors), perf, damage: worn ? Math.round(Math.random() * 50) / 100 : 0, odometer: Math.round(worn ? rnd(20000, 190000) : rnd(200, 12000)), state: 'live', bids: 0, bidder: null, my: 0, ext: 0 };
    l.value = vehicleValue(l);
    const fair = l.value * conditionOf(l), step = bidStep(fair);
    l.fair = snap(fair, step);
    l.start = Math.max(snap(fair * rnd(0.35, 0.6), step), Math.ceil((l.value * 0.16) / step) * step);
    l.high = l.start; l.buyNow = snap(fair * rnd(1.25, 1.5), step);
    l.endsAt = this.now + rnd(70, 300); l.next = this.now + rnd(3, 9);
    l.bidders = names(2 + Math.floor(Math.random() * 3)).map((name) => ({ name, max: snap(fair * rnd(0.72, 1.18), step) }));
    for (let k = Math.floor(Math.random() * 4); k > 0; k--) this.aiBid(l);
    return l;
  }

  fill() {
    let added = false;
    for (let i = this.live('buy').length; i < 8; i++) { const l = this.make(); if (!l) break; this.listings.push(l); added = true; }
    if (added) this.version++;
  }

  update(dt) {
    if (!this.p) return;
    this.now += Math.min(dt, 0.25);
    this.fillT -= dt;
    if (this.fillT <= 0) { this.fillT = 1; this.fill(); }
    let gone = false;
    for (const l of this.listings) {
      if (l.state === 'live') {
        if (this.now >= l.next) this.aiBid(l);
        if (this.now >= l.endsAt) this.finish(l);
      } else if (this.now > l.removeAt) { l.gone = true; gone = true; }
    }
    if (gone) { this.listings = this.listings.filter((l) => !l.gone); this.version++; }
  }

  aiBid(l) {
    const can = l.bidders.filter((b) => b.name !== l.bidder && b.max >= this.min(l));
    if (!can.length) { l.next = Infinity; return; }
    const b = pick(can), amt = Math.min(b.max, this.min(l) + bidStep(l.high) * Math.floor(rnd(0, 3)));
    this.setHigh(l, amt, b.name);
    l.next = this.now + rnd(3, 11);
  }

  setHigh(l, amt, who) {
    const was = l.bidder;
    l.high = amt; l.bidder = who; l.bids++;
    if (l.kind === 'buy' && was === 'you' && who !== 'you') {
      this.held -= l.my; l.my = 0;
      this.note(`Outbid on ${l.def.brand} ${l.def.name}: ${money(amt)}`, 'red');
      this.toast({ title: 'Outbid', sub: `${l.def.brand} ${l.def.name} is now ${money(amt)}`, kind: 'red', icon: 'tag' });
    }
    if (l.endsAt - this.now < 8 && l.ext < 3) { l.endsAt += 8; l.ext++; }
    this.version++;
  }

  bid(l, amt) {
    if (l.state !== 'live' || l.kind !== 'buy') return 'Auction closed';
    if (this.locked(l)) return `Needs level ${l.def.level - 4}`;
    if (l.bidder === 'you') return 'You are already the highest bidder';
    amt = Math.round(amt);
    if (amt < this.min(l)) return 'Bid too low';
    if (amt > l.value * 2.1) return 'Bid too high';
    if (amt > this.free()) return 'Not enough money';
    if (this.p.garage.vehicles.length >= capacity(this.p)) return 'Garage is full';
    this.held += amt; l.my = amt;
    this.setHigh(l, amt, 'you');
    l.next = Math.min(l.next, this.now + rnd(1.5, 4.5));
    return null;
  }

  buyNow(l) {
    if (l.state !== 'live' || l.kind !== 'buy') return 'Auction closed';
    if (this.locked(l)) return `Needs level ${l.def.level - 4}`;
    if (l.high >= l.buyNow) return 'Buy-now price passed';
    if (l.buyNow - (l.bidder === 'you' ? l.my : 0) > this.free()) return 'Not enough money';
    if (l.bidder === 'you') { this.held -= l.my; l.my = 0; }
    const r = this.settleBuy(l, l.buyNow);
    l.removeAt = this.now + 6;
    return r.ok ? null : r.error;
  }

  settleBuy(l, price) {
    const r = this.store.act({ type: 'auctionBuy', model: l.model, color: l.color, perf: l.perf, damage: l.damage, odometer: l.odometer, price });
    l.state = r.ok ? 'won' : 'failed'; l.price = price;
    if (r.ok) { this.app.game?.audio?.ui?.('buy'); this.note(`Won ${l.def.brand} ${l.def.name} for ${money(price)}`, 'green'); }
    else { this.note(`Could not complete ${l.def.brand} ${l.def.name}: ${r.error}`, 'red'); this.toast({ title: 'Purchase failed', sub: r.error, kind: 'red', icon: 'x' }); }
    this.version++;
    return r;
  }

  settleSell(l, price) {
    const v = findVehicle(this.p, l.uid);
    if (!v || v.uid === this.p.garage.selected) { l.state = 'unsold'; this.note(`${l.def.brand} ${l.def.name} is no longer available to sell`, 'red'); return { ok: false }; }
    const r = this.store.act({ type: 'auctionSell', uid: l.uid, price });
    l.state = r.ok ? 'sold' : 'unsold'; l.price = price;
    if (r.ok) { this.app.game?.audio?.ui?.('buy'); this.note(`Sold ${l.def.brand} ${l.def.name} for ${money(price)} (${money(price * (1 - FEE))} after fees)`, 'green'); this.toast({ title: `${l.def.brand} ${l.def.name} sold`, sub: `${money(price * (1 - FEE))} after the ${Math.round(FEE * 100)}% fee`, kind: 'green', icon: 'coin' }); }
    else { this.note(`Sale failed: ${r.error}`, 'red'); this.toast({ title: 'Sale failed', sub: r.error, kind: 'red', icon: 'x' }); }
    this.version++;
    return r;
  }

  finish(l) {
    if (l.kind === 'buy') {
      if (l.bidder === 'you') { this.held -= l.my; l.my = 0; this.settleBuy(l, l.high); }
      else { l.state = l.bids ? 'lost' : 'passed'; if (l.bids) this.note(`${l.def.brand} ${l.def.name} went to ${l.bidder} for ${money(l.high)}`); }
    } else if (l.bidder && l.high >= l.reserve) this.settleSell(l, l.high);
    else { l.state = 'unsold'; this.note(`${l.def.brand} ${l.def.name} did not reach its reserve`, 'red'); this.toast({ title: 'Reserve not met', sub: `${l.def.brand} ${l.def.name} stays in your garage`, icon: 'tag' }); }
    l.removeAt = this.now + (l.kind === 'buy' ? 25 : 40);
    this.version++;
  }

  list(uid, preset) {
    const p = this.p, v = findVehicle(p, uid);
    if (!v) return 'No such vehicle';
    if (v.uid === p.garage.selected) return 'Select another vehicle first';
    if (p.garage.vehicles.length <= 1) return 'You need at least one vehicle';
    if (this.live('sell').some((l) => l.uid === uid)) return 'Already listed';
    if (this.live('sell').length >= 3) return 'Three listings at a time';
    const def = VEHICLE_BY_ID[v.model];
    const l = { id: this.n++, kind: 'sell', uid, model: v.model, def, color: v.custom?.color || def.colors[0], perf: v.perf || {}, damage: v.damage || 0, odometer: v.odometer || 0, state: 'live', bids: 0, bidder: null, ext: 0, preset: preset.id };
    l.value = vehicleValue(v);
    const fair = l.value * conditionOf(l), step = bidStep(fair);
    l.fair = snap(fair, step); l.reserve = snap(fair * preset.reserve, step);
    l.start = snap(l.reserve * 0.45, step); l.high = l.start;
    l.endsAt = this.now + preset.secs; l.next = this.now + rnd(2, 6);
    l.bidders = names(3 + Math.floor(Math.random() * 3)).map((name) => ({ name, max: snap(fair * rnd(0.6, 1.3), step) }));
    this.listings.push(l);
    this.note(`Listed ${def.brand} ${def.name} (${preset.label.toLowerCase()}, reserve ${money(l.reserve)})`);
    return null;
  }

  accept(l) {
    if (l.state !== 'live' || l.kind !== 'sell') return 'Auction closed';
    if (!l.bidder || l.high < l.reserve) return 'Reserve not met yet';
    const r = this.settleSell(l, l.high);
    l.removeAt = this.now + 6;
    return r.ok ? null : r.error || 'Sale failed';
  }

  cancel(l) {
    if (l.state !== 'live' || l.kind !== 'sell') return;
    l.state = 'cancelled'; l.removeAt = this.now + 1;
    this.note(`Withdrew ${l.def.brand} ${l.def.name}`);
  }

  listedUids() { return new Set(this.live('sell').map((l) => l.uid)); }
}
