// Pure profile logic shared by the client (offline) and the server (authoritative online play).
import { VEHICLE_BY_ID, vehicleStats } from '../data/vehicles.js';
import { xpToNext, MAX_LEVEL, LEVEL_REWARDS, levelMoney, rankFor, GARAGE_TIERS, PERF_PARTS, PART_LEVELS } from '../data/progression.js';
import { ALL_ITEMS, DEFAULT_INVENTORY, OUTFITS, PAINT_FINISHES } from '../data/items.js';
import { MISSION_BY_ID } from '../data/missions.js';
import { ACHIEVEMENTS, SEASON, challengesFor, periodKey, COLLECTIBLES, TOKEN_PRICES } from '../data/meta.js';

export const PROFILE_VERSION = 3;
const STAT_KEYS = ['distance', 'nightDistance', 'topSpeed', 'escapes', 'arrests', 'tickets', 'maxWanted', 'pursuitTime', 'unitsDisabled', 'racesWon', 'racesDone', 'podiums', 'missionsDone', 'deliveries', 'drift', 'bestDrift', 'airTime', 'bestAir', 'nearMisses', 'crashes', 'customizations', 'upgrades', 'photos', 'collectibles', 'districtVisits', 'districtsFound', 'meetVotes', 'racesPublished', 'rareFound', 'dailiesDone', 'playTime'];

const DEFAULT_AVATAR = {
  name: 'Driver', height: 1.78, build: 0.45, skin: '#c69272', eyes: '#4a3526', face: { jaw: 0.5, nose: 0.5, brow: 0.5 },
  hair: { style: 'short', color: '#2b1e16' }, facial: 'stubble',
  top: { type: 'tshirt', color: '#e9e9e6' }, jacket: { type: 'bomber', color: '#2c3440' }, pants: { type: 'jeans', color: '#34465e' }, shoes: { type: 'sneakers', color: '#f2f2f0' },
  hat: { type: 'none', color: '#222222' }, glasses: 'none', watch: 'steel', chain: 'none', bag: 'none',
  equipped: { top: 'top_tee_white', jacket: 'jacket_bomber', pants: 'pants_jeans', shoes: 'shoes_sneakers', hat: 'hat_none', glasses: 'glasses_none', watch: 'watch_steel', chain: 'chain_none', bag: 'bag_none' },
};

export const DEFAULT_SETTINGS = {
  general: { units: 'kmh', timeScale: 1, minimapRotate: true, hints: true, autosave: true, speedo: 'digital', language: 'en' },
  graphics: { preset: 'auto', resolution: 0.85, shadows: 'medium', reflections: true, drawDistance: 1, vegetation: 1, grass: true, wakes: true, traffic: 1, peds: 1, bloom: true, fov: 62, fpsCounter: false },
  audio: { master: 0.8, engine: 0.9, effects: 0.9, music: 0.45, ambience: 0.7, voice: 0.9, radio: 0.8 },
  controls: { binds: {}, mouseSens: 1, invertY: false, steerSens: 1, deadzone: 0.15, assist: 'standard', tc: true, autoCenter: true },
  access: { subtitles: true, textScale: 1, colorblind: 'none', reduceMotion: false, cameraShake: true, visualAudio: false, highContrast: false },
  privacy: { online: true, friendRequests: true, leaderboards: true, crewInvites: true },
};

let uidN = 0;
const uid = (p) => p + Date.now().toString(36) + (uidN++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);

export function newProfile(name = 'Driver') {
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  const p = {
    v: PROFILE_VERSION, id: uid('p'), name, created: Date.now(), updated: Date.now(), seq: 0,
    level: 1, xp: 0, rep: 0, money: 2500, tokens: 0, title: 'Newcomer', titles: ['Newcomer'],
    avatar: { ...structuredClone(DEFAULT_AVATAR), name },
    inventory: [...DEFAULT_INVENTORY], emotes: ['wave'],
    garage: { tier: 0, selected: 'v1', items: [], vehicles: [{ uid: 'v1', model: 'civa', name: '', favorite: true, custom: { color: '#7a1f23', finish: 'metallic', plate: 'NEW 2RVT' }, perf: {}, damage: 0, odometer: 0, acquired: Date.now() }] },
    unlockedVehicles: ['civa'],
    missions: { done: {}, best: {}, active: null },
    league: { rank: null, done: {} },
    achievements: {}, stats,
    challenges: {},
    battlepass: { season: SEASON.id, xp: 0, premium: false, claimed: { free: [], premium: [] } },
    collectibles: [], discovered: [], rumors: [], messages: [], hidden: [], rares: [],
    safehouse: { owned: [], placed: {} },
    heat: {},
    settings: structuredClone(DEFAULT_SETTINGS),
    photos: [], crew: null, friends: [], customRaces: [], records: {}, meet: { day: 0 },
    world: { time: 9.5, day: 1, weather: 'sunny', spawn: 'garage' },
    log: [],
  };
  refreshChallenges(p);
  return p;
}

export function migrate(p) {
  if (!p || typeof p !== 'object') return newProfile();
  const base = newProfile(p.name || 'Driver');
  for (const k of Object.keys(base)) if (p[k] === undefined) p[k] = base[k];
  for (const k of STAT_KEYS) if (p.stats[k] === undefined) p.stats[k] = 0;
  for (const s of Object.keys(DEFAULT_SETTINGS)) p.settings[s] = { ...DEFAULT_SETTINGS[s], ...(p.settings[s] || {}) };
  p.avatar = { ...structuredClone(DEFAULT_AVATAR), ...p.avatar };
  p.v = PROFILE_VERSION;
  refreshChallenges(p);
  return p;
}

// ---------------- helpers ----------------
export const capacity = (p) => GARAGE_TIERS[p.garage.tier].capacity;
export const findVehicle = (p, u) => p.garage.vehicles.find((v) => v.uid === u);
export const owns = (p, id) => p.inventory.includes(id);
export function vehicleValue(v) {
  const def = VEHICLE_BY_ID[v.model];
  let val = def.price || 6000;
  for (const [k, lvl] of Object.entries(v.perf || {})) for (let i = 1; i <= lvl; i++) val += PERF_PARTS[k].prices[i] * 0.5;
  return Math.round(val);
}
export const repairCost = (v) => Math.round((v.damage || 0) * (VEHICLE_BY_ID[v.model].price * 0.05 + 800));

function grant(p, out, g) { out.push(g); }

export function addXP(p, amount, out = []) {
  if (amount <= 0) return out;
  p.xp += Math.round(amount);
  p.battlepass.xp += Math.round(amount * 0.5);
  grant(p, out, { type: 'xp', amount: Math.round(amount) });
  while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    p.stats.level = p.level;
    const r = LEVEL_REWARDS[p.level] || {};
    const money = levelMoney(p.level);
    p.money += money;
    const lv = { type: 'level', level: p.level, money, rewards: r };
    if (r.vehicles) for (const v of r.vehicles) if (!p.unlockedVehicles.includes(v)) p.unlockedVehicles.push(v);
    if (r.items) for (const it of r.items) giveItem(p, it);
    if (r.emote && !p.emotes.includes(r.emote)) p.emotes.push(r.emote);
    if (r.title && !p.titles.includes(r.title)) p.titles.push(r.title);
    grant(p, out, lv);
  }
  if (p.level >= MAX_LEVEL) p.xp = Math.min(p.xp, xpToNext(MAX_LEVEL - 1));
  return out;
}

export function addRep(p, amount, out = []) {
  const before = rankFor(p.rep).id;
  p.rep = Math.max(0, p.rep + Math.round(amount));
  p.stats.rep = p.rep;
  const after = rankFor(p.rep).id;
  grant(p, out, { type: 'rep', amount: Math.round(amount) });
  if (before !== after) grant(p, out, { type: 'rank', rank: after });
  return out;
}

export function giveItem(p, id) {
  const it = ALL_ITEMS[id];
  if (!it) return false;
  if (it.kind === 'outfit') { for (const x of it.items) if (!p.inventory.includes(x)) p.inventory.push(x); }
  if (it.kind === 'emote') { const e = id.replace('emote_', ''); if (!p.emotes.includes(e)) p.emotes.push(e); }
  if (!p.inventory.includes(id)) p.inventory.push(id);
  return true;
}

function giveRewards(p, r, out) {
  if (!r) return out;
  if (r.money) { p.money += r.money; grant(p, out, { type: 'money', amount: r.money }); }
  if (r.tokens) { p.tokens += r.tokens; grant(p, out, { type: 'tokens', amount: r.tokens }); }
  if (r.rep) addRep(p, r.rep, out);
  if (r.xp) addXP(p, r.xp, out);
  if (r.items) for (const it of r.items) { giveItem(p, it); grant(p, out, { type: 'item', id: it }); }
  if (r.item) { giveItem(p, r.item); grant(p, out, { type: 'item', id: r.item }); }
  if (r.title && !p.titles.includes(r.title)) { p.titles.push(r.title); grant(p, out, { type: 'title', title: r.title }); }
  if (r.vehicle) { addVehicle(p, r.vehicle, { color: r.color }); grant(p, out, { type: 'vehicle', model: r.vehicle }); }
  if (r.league) { p.league.rank = r.league; grant(p, out, { type: 'league', rank: r.league }); }
  return out;
}

export function addVehicle(p, model, custom = {}) {
  const v = { uid: uid('v'), model, name: '', favorite: false, custom: { color: custom.color || VEHICLE_BY_ID[model].colors[0], finish: 'metallic', ...custom }, perf: {}, damage: 0, odometer: 0, acquired: Date.now() };
  p.garage.vehicles.push(v);
  p.stats.vehiclesOwned = p.garage.vehicles.length;
  if (!p.unlockedVehicles.includes(model)) p.unlockedVehicles.push(model);
  return v;
}

// ---------------- stats / challenges / achievements ----------------
export function bumpStat(p, key, amount = 1, mode = 'add') {
  if (mode === 'max') p.stats[key] = Math.max(p.stats[key] || 0, amount);
  else p.stats[key] = (p.stats[key] || 0) + amount;
  for (const kind of ['daily', 'weekly', 'monthly']) {
    const c = p.challenges[kind];
    if (!c) continue;
    if (mode === 'max') c.max[key] = Math.max(c.max[key] || 0, amount);
  }
}

export function refreshChallenges(p, now = new Date()) {
  for (const kind of ['daily', 'weekly', 'monthly']) {
    const key = periodKey(kind, now);
    if (!p.challenges[kind] || p.challenges[kind].key !== key) p.challenges[kind] = { key, base: { ...p.stats }, max: {}, claimed: [] };
  }
}

export function challengeProgress(p, kind) {
  const c = p.challenges[kind];
  return challengesFor(kind, c.key).map((ch) => {
    const cur = ch.max ? c.max[ch.stat] || 0 : (p.stats[ch.stat] || 0) - (c.base[ch.stat] || 0);
    return { ...ch, value: Math.min(ch.goal, cur), done: cur >= ch.goal, claimed: c.claimed.includes(ch.id) };
  });
}

export function checkAchievements(p, out = []) {
  p.stats.level = p.level; p.stats.rep = p.rep; p.stats.vehiclesOwned = p.garage.vehicles.length; p.stats.garageTier = p.garage.tier;
  p.stats.clothingOwned = p.inventory.filter((i) => ALL_ITEMS[i]?.kind === 'clothing').length;
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id] || a.flag) continue;
    if ((p.stats[a.stat] || 0) >= a.goal) { p.achievements[a.id] = Date.now(); grant(p, out, { type: 'achievement', id: a.id, name: a.name }); addXP(p, 400, out); }
  }
  return out;
}
export function flagAchievement(p, id, out = []) {
  if (p.achievements[id]) return out;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return out;
  p.achievements[id] = Date.now();
  grant(p, out, { type: 'achievement', id, name: a.name });
  addXP(p, 600, out);
  return out;
}

// ---------------- actions ----------------
// every mutation goes through apply(); returns { ok, error?, grants[] }
export function apply(p, a) {
  const out = [];
  const fail = (error) => ({ ok: false, error, grants: [] });
  try {
    switch (a.type) {
      case 'reward': { // generic gameplay reward (validated by caps)
        const money = Math.min(a.money || 0, 50000), xp = Math.min(a.xp || 0, 20000), rep = clamp(a.rep || 0, -5000, 10000);
        if (money) { p.money += money; grant(p, out, { type: 'money', amount: money, reason: a.reason }); }
        if (money < 0) p.money = Math.max(0, p.money);
        if (rep) addRep(p, rep, out);
        if (xp) addXP(p, xp, out);
        if (a.tokens) { p.tokens += Math.min(a.tokens, 500); grant(p, out, { type: 'tokens', amount: a.tokens }); }
        break;
      }
      case 'fine': { const f = Math.min(p.money, Math.max(0, Math.round(a.amount))); p.money -= f; grant(p, out, { type: 'money', amount: -f, reason: a.reason || 'Fine' }); break; }
      case 'missionComplete': {
        const m = MISSION_BY_ID[a.id];
        if (!m) return fail('Unknown mission');
        const first = !p.missions.done[a.id];
        p.missions.done[a.id] = (p.missions.done[a.id] || 0) + 1;
        if (a.time && (!p.missions.best[a.id] || a.time < p.missions.best[a.id])) p.missions.best[a.id] = a.time;
        p.stats.missionsDone++;
        const r = first ? m.rewards : { money: Math.round(m.rewards.money * 0.35), xp: Math.round(m.rewards.xp * 0.35), rep: Math.round(m.rewards.rep * 0.2) };
        giveRewards(p, r, out);
        grant(p, out, { type: 'mission', id: a.id, first });
        const ch = m.ch;
        const chDone = Object.values(MISSION_BY_ID).filter((x) => x.ch === ch).every((x) => p.missions.done[x.id]);
        if (chDone) flagAchievement(p, 'story_' + (ch + 1), out);
        break;
      }
      case 'jobComplete': { giveRewards(p, { money: Math.min(a.money, 6000), xp: Math.min(a.xp, 3000), rep: Math.min(a.rep || 0, 800) }, out); p.stats.missionsDone++; if (a.delivery) p.stats.deliveries++; break; }
      case 'raceResult': {
        p.stats.racesDone++;
        if (a.place === 1) p.stats.racesWon++;
        if (a.place <= 3) p.stats.podiums++;
        const base = a.place === 1 ? 1 : a.place === 2 ? 0.55 : a.place === 3 ? 0.35 : 0.15;
        giveRewards(p, { money: Math.round(Math.min(a.purse || 2000, 20000) * base), xp: Math.round(Math.min(a.xp || 900, 6000) * base), rep: Math.round(400 * base) }, out);
        if (a.raceId && a.time && (!p.records[a.raceId] || a.time < p.records[a.raceId])) { p.records[a.raceId] = a.time; grant(p, out, { type: 'record', raceId: a.raceId, time: a.time }); }
        if (a.place === 1 && a.league) { p.league.done[a.raceId] = true; }
        if (a.place === 1 && a.rain) flagAchievement(p, 'rain_man', out);
        break;
      }
      case 'pursuitEnd': {
        const lvl = clamp(a.level, 1, 6);
        if (a.result === 'escape') {
          p.stats.escapes++;
          const bounty = Math.min(Math.round(a.bounty || 0), 60000);
          giveRewards(p, { money: bounty, xp: [0, 250, 450, 800, 1300, 2000, 3000][lvl] + Math.round((a.time || 0) * 2), rep: lvl * 120 }, out);
          if (lvl >= 3 && a.damage < 0.1) flagAchievement(p, 'clean_getaway', out);
        } else if (a.result === 'arrest') {
          p.stats.arrests++;
          const fine = Math.min(p.money, Math.round(500 + lvl * 700 + (a.bounty || 0) * 0.25));
          p.money -= fine;
          grant(p, out, { type: 'money', amount: -fine, reason: 'Fines & impound' });
          addRep(p, -lvl * 60, out);
        } else if (a.result === 'ticket') {
          p.stats.tickets++;
          const fine = Math.min(p.money, Math.round(a.fine || 200));
          p.money -= fine; grant(p, out, { type: 'money', amount: -fine, reason: 'Traffic citation' });
        }
        bumpStat(p, 'maxWanted', lvl, 'max');
        break;
      }
      case 'buyVehicle': {
        const def = VEHICLE_BY_ID[a.model];
        if (!def || def.npc) return fail('Not for sale');
        const early = p.level < def.level && !p.unlockedVehicles.includes(a.model), cost = early ? Math.round(def.price * 1.6) : def.price;
        if (early && def.level - p.level > 12) return fail(`Needs level ${def.level - 12}`);
        if (p.garage.vehicles.length >= capacity(p)) return fail('Garage is full — upgrade it or sell a vehicle');
        if (p.money < cost) return fail('Not enough money');
        p.money -= cost;
        const v = addVehicle(p, a.model, { color: a.color });
        grant(p, out, { type: 'vehicle', model: a.model, uid: v.uid });
        grant(p, out, { type: 'money', amount: -cost });
        break;
      }
      case 'sellVehicle': {
        const v = findVehicle(p, a.uid);
        if (!v) return fail('No such vehicle');
        if (p.garage.vehicles.length <= 1) return fail('You need at least one vehicle');
        const val = Math.round(vehicleValue(v) * 0.6 - repairCost(v));
        p.garage.vehicles = p.garage.vehicles.filter((x) => x !== v);
        p.money += Math.max(0, val);
        if (p.garage.selected === v.uid) p.garage.selected = p.garage.vehicles[0].uid;
        grant(p, out, { type: 'money', amount: Math.max(0, val), reason: 'Vehicle sold' });
        break;
      }
      case 'auctionBuy': {
        const def = VEHICLE_BY_ID[a.model];
        if (!def || def.npc) return fail('Not for sale');
        const perf = {};
        for (const [k, l] of Object.entries(a.perf || {})) if (PERF_PARTS[k]) perf[k] = clamp(Math.floor(l), 0, 5);
        const probe = { model: a.model, perf, damage: clamp(a.damage || 0, 0, 1) };
        const worth = vehicleValue(probe), price = Math.round(a.price);
        if (!(price >= worth * 0.15 && price <= worth * 2.2)) return fail('Bid out of range');
        if (p.level < def.level - 4 && !p.unlockedVehicles.includes(a.model)) return fail(`Needs level ${def.level - 4}`);
        if (p.garage.vehicles.length >= capacity(p)) return fail('Garage is full — upgrade it or sell a vehicle');
        if (p.money < price) return fail('Not enough money');
        p.money -= price;
        const v = addVehicle(p, a.model, { color: a.color });
        v.perf = perf; v.damage = probe.damage; v.odometer = Math.max(0, Math.round(a.odometer || 0));
        grant(p, out, { type: 'vehicle', model: a.model, uid: v.uid });
        grant(p, out, { type: 'money', amount: -price, reason: 'Auction purchase' });
        break;
      }
      case 'auctionSell': {
        const v = findVehicle(p, a.uid);
        if (!v) return fail('No such vehicle');
        if (p.garage.vehicles.length <= 1) return fail('You need at least one vehicle');
        const worth = vehicleValue(v), price = Math.round(a.price);
        if (!(price >= worth * 0.3 && price <= worth * 1.7)) return fail('Price out of range');
        const net = Math.round(price * 0.92);
        p.garage.vehicles = p.garage.vehicles.filter((x) => x !== v);
        p.money += net;
        if (p.garage.selected === v.uid) p.garage.selected = p.garage.vehicles[0].uid;
        grant(p, out, { type: 'money', amount: net, reason: 'Auction sale (8% fee)' });
        break;
      }
      case 'saveRace': {
        const r = a.race || {};
        if (!Array.isArray(r.pts) || r.pts.length < 3 || r.pts.length > 18) return fail('A race needs 3 to 18 checkpoints');
        const pts = r.pts.map((q) => [Math.round(q[0]), Math.round(q[1])]);
        if (pts.some((q) => !Number.isFinite(q[0]) || !Number.isFinite(q[1]) || Math.abs(q[0]) > 4000 || Math.abs(q[1]) > 4000)) return fail('Invalid checkpoint');
        const rec = { id: r.id && p.customRaces.find((x) => x.id === r.id) ? r.id : uid('r'), name: String(r.name || 'Custom race').slice(0, 28), pts, laps: clamp(Math.floor(r.laps || 1), 1, 5), rivals: clamp(Math.floor(r.rivals || 0), 0, 5), created: Date.now() };
        const i = p.customRaces.findIndex((x) => x.id === rec.id);
        if (i >= 0) p.customRaces[i] = rec; else { if (p.customRaces.length >= 12) return fail('Delete a race first'); p.customRaces.push(rec); bumpStat(p, 'racesPublished'); }
        grant(p, out, { type: 'race', id: rec.id });
        break;
      }
      case 'meetResult': {
        const votes = clamp(Math.floor(a.votes || 0), 0, 10), day = Math.floor(a.day || 0);
        if (votes > 0) bumpStat(p, 'meetVotes', votes);
        if (!day || p.meet.day === day) { out.push({ type: 'meet', votes, repeat: true }); break; }
        p.meet.day = day;
        giveRewards(p, { money: votes * 160 + (votes >= 8 ? 600 : 0), xp: votes * 45, rep: votes * 5 }, out);
        out.push({ type: 'meet', votes, repeat: false });
        break;
      }
      case 'customRaceDone': {
        const r = p.customRaces.find((x) => x.id === a.id);
        if (!r) return fail('No such race');
        const place = clamp(Math.floor(a.place || 1), 1, 6), time = Math.max(0, +a.time || 0), key = 'c_' + r.id, best = p.records[key];
        p.stats.racesDone++; if (place === 1) p.stats.racesWon++; if (place <= 3) p.stats.podiums++;
        let bonus = 0;
        if (time > 5 && (!best || time < best)) { p.records[key] = time; bonus = 250; grant(p, out, { type: 'record', raceId: key, time }); }
        if (!r.paid || Date.now() - r.paid > 600000) {
          r.paid = Date.now();
          const k = place === 1 ? 1 : place === 2 ? 0.5 : place === 3 ? 0.3 : 0.1;
          giveRewards(p, { money: Math.round((300 + r.rivals * 500) * k) + bonus, xp: Math.round((250 + r.rivals * 200) * k), rep: Math.round((20 + r.rivals * 15) * k) }, out);
        }
        break;
      }
      case 'deleteRace': { p.customRaces = p.customRaces.filter((x) => x.id !== a.id); break; }
      case 'selectVehicle': { if (!findVehicle(p, a.uid)) return fail('No such vehicle'); p.garage.selected = a.uid; break; }
      case 'renameVehicle': { const v = findVehicle(p, a.uid); if (!v) return fail('No such vehicle'); v.name = String(a.name || '').slice(0, 24); break; }
      case 'favoriteVehicle': { const v = findVehicle(p, a.uid); if (!v) return fail('No such vehicle'); v.favorite = !v.favorite; break; }
      case 'repairVehicle': {
        const v = findVehicle(p, a.uid);
        if (!v) return fail('No such vehicle');
        const cost = repairCost(v);
        if (p.money < cost) return fail('Not enough money');
        p.money -= cost; v.damage = 0;
        grant(p, out, { type: 'money', amount: -cost, reason: 'Repair' });
        break;
      }
      case 'setDamage': { const v = findVehicle(p, a.uid); if (v) { v.damage = clamp(a.damage, 0, 1); v.odometer = (v.odometer || 0) + Math.max(0, a.km || 0); } break; }
      case 'buyPart': {
        const v = findVehicle(p, a.uid);
        const part = PERF_PARTS[a.part];
        if (!v || !part) return fail('Invalid');
        const cur = v.perf[a.part] || 0, next = a.tier;
        if (next !== cur + 1 || next > 5) return fail('Install upgrades in order');
        if (p.level < PART_LEVELS[next]) return fail(`Tier ${next} unlocks at level ${PART_LEVELS[next]}`);
        const price = Math.round(part.prices[next] * (VEHICLE_BY_ID[v.model].price > 80000 ? 1.6 : 1));
        if (p.money < price) return fail('Not enough money');
        p.money -= price; v.perf[a.part] = next; p.stats.upgrades++;
        grant(p, out, { type: 'money', amount: -price, reason: `${part.name} T${next}` });
        break;
      }
      case 'customize': {
        const v = findVehicle(p, a.uid);
        if (!v) return fail('No such vehicle');
        const cost = customizeCost(p, v, a.changes);
        if (cost.error) return fail(cost.error);
        if (p.money < cost.total) return fail('Not enough money');
        p.money -= cost.total;
        Object.assign(v.custom, a.changes);
        p.stats.customizations++;
        grant(p, out, { type: 'money', amount: -cost.total, reason: 'Customization' });
        break;
      }
      case 'buyItem': {
        const it = ALL_ITEMS[a.id];
        if (!it) return fail('Unknown item');
        if (owns(p, a.id)) return fail('Already owned');
        if (a.currency === 'tokens') {
          const price = TOKEN_PRICES[a.id];
          if (!price) return fail('Not available for tokens');
          if (p.tokens < price) return fail('Not enough tokens');
          p.tokens -= price;
        } else {
          if (it.source !== 'shop' || !it.price) return fail('Not sold in the shop');
          if (p.money < it.price) return fail('Not enough money');
          p.money -= it.price;
        }
        giveItem(p, a.id);
        grant(p, out, { type: 'item', id: a.id });
        break;
      }
      case 'equip': {
        const it = ALL_ITEMS[a.id];
        if (!it || !owns(p, a.id)) return fail('Not owned');
        if (it.kind === 'outfit') { for (const x of it.items) equipClothing(p, x); }
        else if (it.kind === 'clothing') equipClothing(p, a.id);
        break;
      }
      case 'avatar': {
        const allowed = ['height', 'build', 'skin', 'eyes', 'face', 'hair', 'facial', 'name'], hex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
        for (const k of allowed) if (a.changes[k] !== undefined) p.avatar[k] = a.changes[k];
        const ch = a.changes;
        if (['human', 'android', 'alien', 'fox', 'cat', 'skull', 'elf', 'cyber'].includes(ch.species)) p.avatar.species = ch.species;
        if (Array.isArray(ch.acc)) p.avatar.acc = ch.acc.filter((x) => ['vr', 'vest', 'catEars', 'headphones', 'flowers', 'hood', 'cyber', 'choker'].includes(x)).slice(0, 3);
        for (const k of ['top', 'jacket', 'pants', 'shoes', 'hat']) if (ch[k] && typeof ch[k].type === 'string' && hex(ch[k].color)) p.avatar[k] = { type: ch[k].type.slice(0, 16), color: ch[k].color, ...(hex(ch[k].band) ? { band: ch[k].band } : {}) };
        if (typeof ch.glasses === 'string') p.avatar.glasses = ch.glasses.slice(0, 12);
        if (a.changes.name) p.name = String(a.changes.name).slice(0, 20);
        break;
      }
      case 'upgradeGarage': {
        const next = GARAGE_TIERS[p.garage.tier + 1];
        if (!next) return fail('Garage fully upgraded');
        if (p.level < next.level) return fail(`Requires level ${next.level}`);
        if (p.money < next.price) return fail('Not enough money');
        p.money -= next.price; p.garage.tier++;
        grant(p, out, { type: 'garage', tier: p.garage.tier, name: next.name });
        break;
      }
      case 'claimChallenge': {
        const list = challengeProgress(p, a.kind);
        const ch = list.find((c) => c.id === a.id);
        if (!ch || !ch.done) return fail('Not completed');
        if (ch.claimed) return fail('Already claimed');
        p.challenges[a.kind].claimed.push(a.id);
        if (a.kind === 'daily') p.stats.dailiesDone++;
        giveRewards(p, { money: ch.money, xp: ch.xp, tokens: ch.tokens }, out);
        break;
      }
      case 'claimPass': {
        const bp = p.battlepass;
        const tier = SEASON.tiers[a.tier - 1];
        if (!tier) return fail('Invalid tier');
        if (Math.floor(bp.xp / SEASON.xpPerTier) < a.tier) return fail('Tier not reached');
        if (a.track === 'premium' && !bp.premium) return fail('Premium track locked');
        if (bp.claimed[a.track].includes(a.tier)) return fail('Already claimed');
        bp.claimed[a.track].push(a.tier);
        const r = tier[a.track];
        giveRewards(p, r, out);
        break;
      }
      case 'buyPremiumPass': {
        if (p.battlepass.premium) return fail('Already unlocked');
        if (p.tokens < SEASON.tokensPremium) return fail(`Needs ${SEASON.tokensPremium} RC tokens (earned by playing)`);
        p.tokens -= SEASON.tokensPremium; p.battlepass.premium = true;
        grant(p, out, { type: 'premium' });
        break;
      }
      case 'collect': {
        const c = COLLECTIBLES.find((x) => x.id === a.id);
        if (!c || p.collectibles.includes(a.id)) return fail('Invalid');
        p.collectibles.push(a.id); p.stats.collectibles++;
        giveRewards(p, { money: 750, xp: 300, tokens: c.type === 'token' ? 15 : 0 }, out);
        grant(p, out, { type: 'collectible', id: a.id, name: c.name });
        break;
      }
      case 'discover': {
        if (p.discovered.includes(a.id)) return fail('Known');
        p.discovered.push(a.id);
        if (a.district) p.stats.districtsFound = p.discovered.filter((d) => !d.startsWith('hl_')).length;
        giveRewards(p, { xp: 300, money: 250 }, out);
        grant(p, out, { type: 'discover', id: a.id, name: a.name });
        break;
      }
      case 'rareFound': {
        if (p.rares.includes(a.id)) return fail('Known');
        p.rares.push(a.id); p.stats.rareFound++;
        giveRewards(p, { xp: 1500 }, out);
        break;
      }
      case 'buySafehouse': {
        const it = ALL_ITEMS[a.id];
        if (!it || it.kind !== 'safehouse') return fail('Invalid');
        if (p.safehouse.owned.includes(a.id)) return fail('Owned');
        if (p.money < it.price) return fail('Not enough money');
        p.money -= it.price; p.safehouse.owned.push(a.id); p.safehouse.placed[a.id] = true;
        grant(p, out, { type: 'item', id: a.id });
        break;
      }
      case 'toggleSafehouse': { if (!p.safehouse.owned.includes(a.id)) return fail('Not owned'); p.safehouse.placed[a.id] = !p.safehouse.placed[a.id]; break; }
      case 'garageItem': {
        const it = ALL_ITEMS[a.id];
        if (!it || it.kind !== 'garage') return fail('Invalid');
        if (!owns(p, a.id)) { if (it.source !== 'shop') return fail('Unlock required'); if (p.money < it.price) return fail('Not enough money'); p.money -= it.price; giveItem(p, a.id); }
        if (!p.garage.items.includes(a.id)) p.garage.items.push(a.id); else p.garage.items = p.garage.items.filter((x) => x !== a.id);
        break;
      }
      case 'setTitle': { if (!p.titles.includes(a.title)) return fail('Locked'); p.title = a.title; break; }
      case 'stat': { bumpStat(p, a.key, a.amount, a.mode); break; }
      default: return fail('Unknown action ' + a.type);
    }
  } catch (e) { return fail(e.message); }
  checkAchievements(p, out);
  p.seq++;
  p.updated = Date.now();
  return { ok: true, grants: out };
}

function equipClothing(p, id) {
  const it = ALL_ITEMS[id];
  if (!it || it.kind !== 'clothing') return;
  const cat = it.cat;
  p.avatar.equipped[cat] = id;
  if (['top', 'jacket', 'pants', 'shoes', 'hat'].includes(cat)) p.avatar[cat] = { ...it.props };
  else p.avatar[cat] = it.props.value;
}

export function customizeCost(p, v, changes) {
  let total = 0;
  const lines = [];
  for (const [k, val] of Object.entries(changes)) {
    if (JSON.stringify(v.custom[k]) === JSON.stringify(val)) continue;
    let c = 0;
    if (k === 'color') c = 300;
    else if (k === 'finish') { const f = PAINT_FINISHES.find((x) => x.id === val); if (!f) return { error: 'Invalid finish' }; if (f.unlock && !owns(p, f.unlock)) return { error: `${f.name} is locked` }; c = f.price; }
    else if (k === 'plate') c = 150;
    else if (k === 'decalColor' || k === 'number') c = 100;
    else if (k === 'wheelScale') c = 800;
    else {
      const it = Object.values(ALL_ITEMS).find((x) => x.kind === 'cosmetic' && x.slot === k && x.value === val);
      if (val === null || val === undefined || val === 'none' || val === 0) c = 0;
      else if (!it) return { error: 'Invalid part' };
      else if (it.source !== 'default' && it.source !== 'shop' && !owns(p, it.id)) return { error: `${it.name} is locked` };
      else c = it.price;
    }
    total += c;
    lines.push({ k, c });
  }
  return { total, lines };
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export { STAT_KEYS, DEFAULT_AVATAR, vehicleStats };
