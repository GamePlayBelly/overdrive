// 50 player levels, reputation ranks, level rewards
export const MAX_LEVEL = 50;
export const xpToNext = (lvl) => Math.round((600 + 280 * lvl + 12 * lvl * lvl) / 50) * 50;
export const xpTotalFor = (lvl) => { let t = 0; for (let i = 1; i < lvl; i++) t += xpToNext(i); return t; };

export const REP_RANKS = [
  { id: 'ROOKIE', name: 'Rookie', min: 0, color: '#9aa3ad' },
  { id: 'RISING', name: 'Rising', min: 1500, color: '#5fb3e8' },
  { id: 'KNOWN', name: 'Known', min: 5000, color: '#2fb36a' },
  { id: 'RESPECTED', name: 'Respected', min: 12000, color: '#d4a72c' },
  { id: 'NOTORIOUS', name: 'Notorious', min: 25000, color: '#e5383b' },
  { id: 'LEGEND', name: 'Legend', min: 45000, color: '#c77dff' },
];
export const rankFor = (rep) => { let r = REP_RANKS[0]; for (const k of REP_RANKS) if (rep >= k.min) r = k; return r; };
export const nextRank = (rep) => REP_RANKS.find((k) => k.min > rep) || null;

// rewards: { money, vehicles:[], items:[], parts:tier, garage:tier, title, emote, league, feature }
export const LEVEL_REWARDS = {
  2: { vehicles: ['lumo'], items: ['top_hoodie_grey', 'outfit_street'] },
  3: { vehicles: ['meridian', 'porter'], title: 'Street Rookie', items: ['decal_sideStripe'] },
  4: { vehicles: ['ridge'], garage: 1, items: ['hat_cap_black'] },
  5: { vehicles: ['crown'], emote: 'wave', parts: 2, items: ['jacket_denim'] },
  6: { vehicles: ['arc', 'utility'], items: ['decal_stripes', 'rim_split'] },
  7: { vehicles: ['hauler'], items: ['jacket_leather', 'glasses_aviator'] },
  8: { vehicles: ['thunder'], emote: 'clap', items: ['decal_flames'] },
  9: { vehicles: ['r6'], items: ['shoes_boots'], title: 'Two Wheels' },
  10: { vehicles: ['trek'], league: 'Bronze', title: 'Known Driver', items: ['rim_deepdish', 'spoiler_ducktail'] },
  11: { items: ['watch_gold', 'decal_number'] },
  12: { vehicles: ['gts'], garage: 2, items: ['spoiler_wing'] },
  13: { items: ['jacket_puffer', 'hat_beanie_red'], emote: 'point' },
  14: { items: ['bumper_sport', 'hood_vented'] },
  15: { parts: 3, items: ['rim_mesh', 'exhaust_quad'] },
  16: { items: ['outfit_night', 'chain_thin'] },
  17: { items: ['decal_checker', 'finish_pearl'] },
  18: { emote: 'dance', items: ['glasses_sport'] },
  19: { items: ['hood_scoop', 'tint_limo'] },
  20: { league: 'Silver', title: 'Respected', items: ['rim_turbine', 'jacket_track'] },
  21: { items: ['bag_messenger'] },
  22: { garage: 3, items: ['decal_rally'] },
  23: { items: ['shoes_runners_red'], emote: 'shrug' },
  24: { items: ['bumper_aero'] },
  25: { vehicles: ['vireo'], parts: 4, title: 'Supercar Club', items: ['spoiler_gt'] },
  26: { items: ['jacket_blazer'] },
  27: { items: ['finish_matte'] },
  28: { emote: 'salute', items: ['hat_fedora'] },
  29: { items: ['watch_smart'] },
  30: { league: 'Gold', title: 'Notorious', items: ['decal_split', 'outfit_racer'] },
  32: { items: ['chain_thick'] },
  34: { items: ['garage_trophies'] },
  35: { garage: 4, items: ['rim_gold_color'] },
  38: { emote: 'cheer' },
  40: { league: 'Platinum', parts: 5, title: 'Top Driver' },
  42: { items: ['outfit_executive'] },
  45: { league: 'Elite', title: 'Elite' },
  48: { items: ['garage_turntable'] },
  50: { title: 'Legend of Riverton', items: ['finish_chrome', 'outfit_legend'] },
};
export const levelMoney = (lvl) => 400 + lvl * 350;

// XP sources
export const XP = {
  distanceKm: 40, escape: [0, 250, 450, 800, 1300, 2000, 3000], mission: 1, race1: 900, race2: 500, race3: 300, stuntAir: 60, drift1k: 25, collectible: 150, discover: 300, challengeDaily: 800, challengeWeekly: 3000, challengeMonthly: 9000, event: 1200, nearMiss: 15,
};

export const GARAGE_TIERS = [
  { tier: 0, name: 'Workshop Bay', capacity: 4, price: 0, level: 1 },
  { tier: 1, name: 'Double Bay', capacity: 8, price: 18000, level: 4 },
  { tier: 2, name: 'Tuning Shop', capacity: 16, price: 65000, level: 12 },
  { tier: 3, name: 'Collector Hall', capacity: 30, price: 180000, level: 22 },
  { tier: 4, name: 'Riverton Showroom', capacity: 50, price: 450000, level: 35 },
];

export const PERF_PARTS = {
  engine: { name: 'Engine', desc: 'Intake, ECU tune, internals', prices: [0, 2500, 6500, 14000, 28000, 52000] },
  turbo: { name: 'Turbo', desc: 'Forced induction kit', prices: [0, 4000, 9000, 18000, 34000, 60000] },
  trans: { name: 'Transmission', desc: 'Faster shifts, closer ratios', prices: [0, 1800, 4200, 9000, 17000, 30000] },
  brakes: { name: 'Brakes', desc: 'Pads, discs, calipers', prices: [0, 1200, 3000, 6500, 12500, 22000] },
  susp: { name: 'Suspension', desc: 'Springs, dampers, bars', prices: [0, 1500, 3800, 8000, 15000, 26000] },
  tires: { name: 'Tires', desc: 'Compound and width', prices: [0, 1000, 2600, 5500, 10000, 18000] },
  weight: { name: 'Weight', desc: 'Lightweight panels and seats', prices: [0, 2000, 5000, 11000, 21000, 38000] },
};
export const PART_LEVELS = [0, 1, 5, 15, 25, 40];
