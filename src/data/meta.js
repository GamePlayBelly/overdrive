// Challenges, achievements, dynamic events, battle pass, shop catalog, collectibles.
import { mulberry32, hashStr } from '../core/rng.js';

// stat keys tracked in profile.stats
export const CHALLENGE_POOL = {
  daily: [
    { id: 'd_drive10', name: 'Commuter', desc: 'Drive 10 km', stat: 'distance', goal: 10000, xp: 800, money: 1000 },
    { id: 'd_escape1', name: 'Slippery', desc: 'Escape the police once', stat: 'escapes', goal: 1, xp: 1000, money: 1500 },
    { id: 'd_race1', name: 'Podium', desc: 'Finish a race in the top 3', stat: 'podiums', goal: 1, xp: 900, money: 1200 },
    { id: 'd_speed180', name: 'Redline', desc: 'Reach 180 km/h', stat: 'topSpeed', goal: 180, max: true, xp: 700, money: 800 },
    { id: 'd_drift3k', name: 'Sideways', desc: 'Score 3,000 drift points', stat: 'drift', goal: 3000, xp: 800, money: 1000 },
    { id: 'd_air2', name: 'Airtime', desc: 'Get 2 seconds of total air time', stat: 'airTime', goal: 2, xp: 800, money: 900 },
    { id: 'd_custom', name: 'Fresh Look', desc: 'Customize a vehicle', stat: 'customizations', goal: 1, xp: 600, money: 700 },
    { id: 'd_photo3', name: 'Shutterbug', desc: 'Take 3 photos', stat: 'photos', goal: 3, xp: 600, money: 600 },
    { id: 'd_deliver', name: 'Courier', desc: 'Complete a delivery', stat: 'deliveries', goal: 1, xp: 900, money: 1200 },
    { id: 'd_districts', name: 'Tourist', desc: 'Visit 4 different districts', stat: 'districtVisits', goal: 4, xp: 700, money: 800 },
    { id: 'd_near', name: 'Close Call', desc: 'Perform 15 near misses', stat: 'nearMisses', goal: 15, xp: 700, money: 900 },
    { id: 'd_collect', name: 'Treasure Hunter', desc: 'Find 2 collectibles', stat: 'collectibles', goal: 2, xp: 900, money: 1000 },
  ],
  weekly: [
    { id: 'w_drive100', name: 'Road Warrior', desc: 'Drive 100 km', stat: 'distance', goal: 100000, xp: 3000, money: 6000 },
    { id: 'w_escape5', name: 'Ghost', desc: 'Escape the police 5 times', stat: 'escapes', goal: 5, xp: 3500, money: 7000 },
    { id: 'w_win5', name: 'Winner', desc: 'Win 5 races', stat: 'racesWon', goal: 5, xp: 3500, money: 7000, tokens: 50 },
    { id: 'w_level4', name: 'Most Wanted', desc: 'Reach wanted level 4', stat: 'maxWanted', goal: 4, max: true, xp: 3000, money: 5000 },
    { id: 'w_missions3', name: 'Contractor', desc: 'Complete 3 missions or jobs', stat: 'missionsDone', goal: 3, xp: 3000, money: 6000, tokens: 40 },
    { id: 'w_drift25k', name: 'Drift King', desc: 'Score 25,000 drift points', stat: 'drift', goal: 25000, xp: 3000, money: 5000 },
  ],
  monthly: [
    { id: 'mo_drive500', name: 'County Crosser', desc: 'Drive 500 km', stat: 'distance', goal: 500000, xp: 9000, money: 25000, tokens: 150 },
    { id: 'mo_escape20', name: 'Untouchable', desc: 'Escape the police 20 times', stat: 'escapes', goal: 20, xp: 9000, money: 25000, tokens: 150 },
    { id: 'mo_win20', name: 'Circuit Legend', desc: 'Win 20 races', stat: 'racesWon', goal: 20, xp: 9000, money: 25000, tokens: 150 },
    { id: 'mo_level6', name: 'Public Enemy', desc: 'Reach wanted level 6', stat: 'maxWanted', goal: 6, max: true, xp: 8000, money: 20000, tokens: 120 },
    { id: 'mo_collect', name: 'Archivist', desc: 'Find 15 collectibles', stat: 'collectibles', goal: 15, xp: 9000, money: 20000, tokens: 150 },
  ],
};

export function periodKey(kind, date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  if (kind === 'daily') return d.toISOString().slice(0, 10);
  if (kind === 'monthly') return d.toISOString().slice(0, 7);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return 'W' + d.toISOString().slice(0, 10);
}
export function challengesFor(kind, key) {
  const pool = CHALLENGE_POOL[kind];
  const n = kind === 'daily' ? 3 : kind === 'weekly' ? 4 : 3;
  const r = mulberry32(hashStr(kind + key));
  const idx = pool.map((_, i) => i).sort(() => r() - 0.5);
  return idx.slice(0, n).map((i) => pool[i]);
}
export function periodEnds(kind, date = new Date()) {
  const d = new Date(date);
  if (kind === 'daily') { d.setHours(24, 0, 0, 0); }
  else if (kind === 'weekly') { const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() + (7 - day)); d.setHours(0, 0, 0, 0); }
  else { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0, 0); }
  return d;
}

export const ACHIEVEMENTS = [
  { id: 'first_escape', name: 'First Escape', desc: 'Escape the police for the first time', stat: 'escapes', goal: 1 },
  { id: 'clean_getaway', name: 'Clean Getaway', desc: 'Escape a level 3+ pursuit with less than 10% damage', flag: true },
  { id: 'speed_demon', name: 'Speed Demon', desc: 'Reach 250 km/h', stat: 'topSpeed', goal: 250 },
  { id: 'century', name: 'Century', desc: 'Reach 100 km/h', stat: 'topSpeed', goal: 100 },
  { id: 'collector', name: 'Collector', desc: 'Own 10 vehicles', stat: 'vehiclesOwned', goal: 10 },
  { id: 'starter_fleet', name: 'Starter Fleet', desc: 'Own 3 vehicles', stat: 'vehiclesOwned', goal: 3 },
  { id: 'mechanic', name: 'Mechanic', desc: 'Install 10 performance upgrades', stat: 'upgrades', goal: 10 },
  { id: 'stylist', name: 'Stylist', desc: 'Customize vehicles 15 times', stat: 'customizations', goal: 15 },
  { id: 'explorer', name: 'Explorer', desc: 'Discover every district in the county', stat: 'districtsFound', goal: 7 },
  { id: 'night_driver', name: 'Night Driver', desc: 'Drive 20 km at night', stat: 'nightDistance', goal: 20000 },
  { id: 'rain_man', name: 'Wet Weather Pro', desc: 'Win a race in the rain', flag: true },
  { id: 'master_racer', name: 'Master Racer', desc: 'Win 25 races', stat: 'racesWon', goal: 25 },
  { id: 'first_win', name: 'Checkered Flag', desc: 'Win your first race', stat: 'racesWon', goal: 1 },
  { id: 'story_1', name: 'New in Town', desc: 'Complete chapter 1', flag: true },
  { id: 'story_2', name: 'Rising', desc: 'Complete chapter 2', flag: true },
  { id: 'story_3', name: 'Known', desc: 'Complete chapter 3', flag: true },
  { id: 'story_4', name: 'Legend of Riverton', desc: 'Complete the story', flag: true },
  { id: 'wanted_6', name: 'Public Enemy', desc: 'Survive a level 6 response', stat: 'maxWanted', goal: 6 },
  { id: 'busted', name: 'Hands Where I Can See Them', desc: 'Get arrested', stat: 'arrests', goal: 1 },
  { id: 'ticket', name: 'Law-Abiding (Mostly)', desc: 'Pull over and accept a ticket', stat: 'tickets', goal: 1 },
  { id: 'disabler', name: 'Demolition Derby', desc: 'Disable 25 police units', stat: 'unitsDisabled', goal: 25 },
  { id: 'airborne', name: 'Airborne', desc: 'Get 3 seconds of air in one jump', stat: 'bestAir', goal: 3 },
  { id: 'drifter', name: 'Drift Artist', desc: 'Score 10,000 drift points in one chain', stat: 'bestDrift', goal: 10000 },
  { id: 'marathon', name: 'Marathon', desc: 'Drive 250 km in total', stat: 'distance', goal: 250000 },
  { id: 'level10', name: 'Getting There', desc: 'Reach level 10', stat: 'level', goal: 10 },
  { id: 'level25', name: 'Veteran', desc: 'Reach level 25', stat: 'level', goal: 25 },
  { id: 'level50', name: 'Maxed Out', desc: 'Reach level 50', stat: 'level', goal: 50 },
  { id: 'rep_legend', name: 'Street Legend', desc: 'Reach LEGEND reputation', stat: 'rep', goal: 45000 },
  { id: 'tokens10', name: 'Treasure Hunter', desc: 'Find 10 collectibles', stat: 'collectibles', goal: 10 },
  { id: 'photographer', name: 'Photographer', desc: 'Take 25 photos', stat: 'photos', goal: 25 },
  { id: 'social', name: 'Social Driver', desc: 'Join a crew', flag: true },
  { id: 'meet', name: 'Show and Shine', desc: 'Get 5 votes at a car meet', stat: 'meetVotes', goal: 5 },
  { id: 'creator', name: 'Track Designer', desc: 'Publish a custom race', stat: 'racesPublished', goal: 1 },
  { id: 'rare_find', name: 'Rare Find', desc: 'Discover a rare vehicle', stat: 'rareFound', goal: 1 },
  { id: 'garage_max', name: 'Showroom Owner', desc: 'Fully upgrade your garage', stat: 'garageTier', goal: 4 },
  { id: 'fashion', name: 'Fashion Plate', desc: 'Own 20 clothing items', stat: 'clothingOwned', goal: 20 },
  { id: 'near_miss', name: 'Threading the Needle', desc: 'Perform 100 near misses', stat: 'nearMisses', goal: 100 },
  { id: 'daily5', name: 'Routine', desc: 'Complete 5 daily challenges', stat: 'dailiesDone', goal: 5 },
];

// hidden/collectible locations (world coordinates on or near roads)
export const COLLECTIBLES = [
  { id: 'key01', type: 'key', name: 'Spare Key — Founders Park', x: 18, z: 20 },
  { id: 'key02', type: 'key', name: 'Spare Key — Harbor Cranes', x: -1020, z: -140 },
  { id: 'key03', type: 'key', name: 'Spare Key — Ridge Overlook', x: 205, z: -650 },
  { id: 'key04', type: 'key', name: 'Spare Key — Old Market', x: -110, z: 305 },
  { id: 'key05', type: 'key', name: 'Spare Key — Farm Silo', x: 1146, z: -306 },
  { id: 'tok01', type: 'token', name: 'Riverton Token — Under the Freeway', x: -40, z: -420 },
  { id: 'tok02', type: 'token', name: 'Riverton Token — School Field', x: 600, z: 250 },
  { id: 'tok03', type: 'token', name: 'Riverton Token — Substation', x: 180, z: -340 },
  { id: 'tok04', type: 'token', name: 'Riverton Token — Foundry Yard', x: -660, z: 120 },
  { id: 'tok05', type: 'token', name: 'Riverton Token — Canal Street', x: -200, z: 474 },
  { id: 'tok06', type: 'token', name: 'Riverton Token — Eastgate', x: 880, z: 360 },
  { id: 'plt01', type: 'plate', name: 'Rare Plate "RVTN 1"', x: 330, z: 180 },
  { id: 'plt02', type: 'plate', name: 'Rare Plate "NORA"', x: -380, z: 38 },
  { id: 'plt03', type: 'plate', name: 'Rare Plate "FAST"', x: 960, z: -470 },
  { id: 'prt01', type: 'part', name: 'Vintage Carburetor', x: -905, z: 250 },
  { id: 'prt02', type: 'part', name: 'Rally Headlamp', x: 1210, z: 170 },
  { id: 'mem01', type: 'memorabilia', name: 'City Hall Postcard', x: 0, z: -185 },
  { id: 'mem02', type: 'memorabilia', name: 'Grand Meridian Matchbook', x: 220, z: -250 },
  { id: 'mem03', type: 'memorabilia', name: 'Transit Map 1987', x: 55, z: 300 },
  { id: 'pho01', type: 'photo', name: 'Photo Spot — Freeway at Dusk', x: 330, z: -380, photo: true },
  { id: 'pho02', type: 'photo', name: 'Photo Spot — Cargo Ship', x: -1040, z: 20, photo: true },
  { id: 'pho03', type: 'photo', name: 'Photo Spot — Founders Fountain', x: 0, z: 12, photo: true },
  // outer regions
  { id: 'key06', type: 'key', name: 'Spare Key — Calder Pass Overlook', x: 418, z: -724 },
  { id: 'key07', type: 'key', name: 'Spare Key — Alder Peak Chapel', x: -84, z: -1655 },
  { id: 'key08', type: 'key', name: 'Spare Key — Dry Springs Windmill', x: 3222, z: 136 },
  { id: 'key09', type: 'key', name: 'Spare Key — Marin Point Light', x: -2228, z: -925 },
  { id: 'tok07', type: 'token', name: 'Riverton Token — Sierra Switchback', x: 1870, z: -197 },
  { id: 'tok08', type: 'token', name: 'Riverton Token — Ski Lift', x: -132, z: -1921 },
  { id: 'tok09', type: 'token', name: 'Riverton Token — Mesa Overlook', x: 3471, z: 87 },
  { id: 'tok10', type: 'token', name: 'Riverton Token — Bayline Pylon', x: -1380, z: -414 },
  { id: 'tok11', type: 'token', name: 'Riverton Token — Marin Beach', x: -2163, z: -71 },
  { id: 'plt04', type: 'plate', name: 'Rare Plate "ALDER"', x: -40, z: -1745 },
  { id: 'plt05', type: 'plate', name: 'Rare Plate "MESA"', x: 2912, z: 162 },
  { id: 'pho04', type: 'photo', name: 'Photo Spot — Bayline Bridge', x: -1400, z: -426, photo: true },
  { id: 'pho05', type: 'photo', name: 'Photo Spot — Alder Peak at Dawn', x: 183, z: -1563, photo: true },
  { id: 'pho06', type: 'photo', name: 'Photo Spot — Mesa Sunset', x: 2408, z: -202, photo: true },
];

export const HIDDEN_LOCATIONS = [
  { id: 'hl_workshop', name: 'Hidden Workshop', x: 180, z: -340, desc: 'An abandoned workshop behind the substation.' },
  { id: 'hl_underpass', name: 'Freeway Underpass', x: 200, z: -420, desc: 'Cover from helicopters under the viaduct.' },
  { id: 'hl_quay', name: 'The Quay', x: -1050, z: 280, desc: 'Quiet corner of the port.' },
  { id: 'hl_overlook', name: 'Secret Overlook', x: 360, z: -700, desc: 'The best view of the skyline.' },
  { id: 'hl_barn', name: 'Old Barn', x: 1170, z: 180, desc: 'Somebody keeps a car under a tarp here.' },
  { id: 'hl_pass', name: 'Switchback Lookout', x: -190, z: -930, desc: 'Most drivers rush past this bend of Route 12. The view over the pass is worth the stop.' },
  { id: 'hl_quarry', name: 'Mesa Overlook', x: 3250, z: 135, desc: 'The last bend before Route 40 drops into the desert. Nobody patrols it.' },
];

// rare vehicles that appear only under conditions
export const RARE_VEHICLES = [
  { id: 'rare_gold_vireo', model: 'vireo', color: '#d4af37', name: 'Golden Vireo', x: -970, z: -150, yaw: 0.3, cond: { night: true, level: 8 }, story: 'A one-off built for a collector who vanished in 2009. The harbor workers say it only appears at night.' },
  { id: 'rare_rain_thunder', model: 'thunder', color: '#2e8b57', name: '"Green Ghost" Thunder', x: 200, z: -655, yaw: 1.2, cond: { rain: true, level: 6 }, story: 'Sam Kowalski\'s old rival car. It shows up at the overlook when it rains.' },
  { id: 'rare_barn_trek', model: 'trek', color: '#d8cfb8', name: 'Barn-Find Trek', x: 1168, z: 186, yaw: 2.2, cond: { level: 4 }, story: 'Found under a tarp in an old barn. Still starts on the first try.' },
];

RARE_VEHICLES.push(
  { id: 'rare_mesa_arc', model: 'arc', color: '#d9a21b', name: 'Mesa Mirage Arc', x: 3249, z: 147, yaw: 1.6, cond: { level: 10 }, story: 'A desert racer left it at the roadside. It idles like it is waiting for someone.' },
  { id: 'rare_snow_ridge', model: 'ridge', color: '#e8eaee', name: 'Snow Wolf Ridge', x: -66, z: -1604, yaw: 0.2, cond: { level: 14, night: true }, story: 'The ski patrol vehicle that vanished one winter. It parks outside Alder Peak after dark.' },
);

export const DYNAMIC_EVENTS = [
  { id: 'ev_street', name: 'Street Race', type: 'race', desc: 'A local racer is waiting at the lights. Flash your lights to accept.', xp: 900, money: 1800 },
  { id: 'ev_lockdown', name: 'Police Lockdown', type: 'lockdown', desc: 'RCPD is sweeping a district. Stay clean or stay away.', xp: 600, money: 0 },
  { id: 'ev_convoy', name: 'Armored Convoy', type: 'convoy', desc: 'A security convoy is moving through town. Follow it to the depot for a tip.', xp: 800, money: 1500 },
  { id: 'ev_hunt', name: 'Treasure Hunt', type: 'hunt', desc: 'Three tokens are hidden nearby. Find them before the timer ends.', xp: 1000, money: 2000 },
  { id: 'ev_stunt', name: 'Stunt Challenge', type: 'stunt', desc: 'Beat the local stunt record in this area.', xp: 800, money: 1500 },
  { id: 'ev_pursuit', name: 'Highway Pursuit', type: 'pursuit', desc: 'Police are chasing a stolen car on the freeway. Help stop it.', xp: 1200, money: 2500 },
  { id: 'ev_rush', name: 'Delivery Rush', type: 'rush', desc: 'Three deliveries, one timer. Go!', xp: 1200, money: 3000 },
  { id: 'ev_rare', name: 'Rare Vehicle Sighting', type: 'rare', desc: 'Someone spotted a rare car nearby.', xp: 1500, money: 0 },
];

// Battle pass — Season 1 "Riverton Nights"
export const SEASON = {
  id: 's1', name: 'Season 1 — Riverton Nights', xpPerTier: 2500, tokensPremium: 950,
  start: '2026-09-01', end: '2026-12-01',
  tiers: Array.from({ length: 50 }, (_, i) => {
    const t = i + 1;
    const free = t % 10 === 0 ? { tokens: 100 } : t % 5 === 0 ? { item: ['garage_flag', 'decal_stripes', 'hat_cap_red', 'rim_split', 'top_tee_red'][(t / 5 - 1) % 5] } : t % 2 === 0 ? { money: 1500 + t * 100 } : { xp: 500 };
    const premium = t === 50 ? { vehicle: 'vireo', color: '#6b3fa0' } : t === 25 ? { vehicle: 'thunder', color: '#e5383b' } : t % 10 === 0 ? { item: ['jacket_racing', 'sh_carportrait', 'outfit_night', 'garage_ledstrip', 'rim_turbine'][t / 10 - 1] } : t % 3 === 0 ? { tokens: 60 } : t % 4 === 0 ? { item: ['decal_checker', 'hat_bucket', 'jacket_bomber_olive', 'exhaust_sport', 'mirror_carbon', 'glasses_round', 'interior_red', 'hat_beanie_grey', 'pants_cargo', 'jacket_puffer_red', 'emote_lean', 'sh_art'][((t / 4) - 1) % 12] } : { money: 2500 + t * 150 };
    return { tier: t, free, premium };
  }),
};

// shop: purchasable things (in-game $ or RC tokens). Nothing is sold for real money.
export const SHOP_FEATURED = ['jacket_leather_brown', 'spoiler_gt', 'decal_rally', 'garage_arcade', 'sh_tv', 'emote_lean'];
export const TOKEN_PRICES = { jacket_leather_brown: 450, garage_arcade: 300, emote_lean: 200, sh_kitchen: 500 };

// underground league structure
export const LEAGUE = [
  { rank: 'Bronze', level: 10, races: [{ id: 'lg_b1', name: 'Downtown Loop', pts: [[55, -55], [275, -55], [275, 165], [-165, 165], [-165, -165], [55, -165]], laps: 2, rivals: ['marco', 'rhea', 'rowan'] }, { id: 'lg_b2', name: 'Foundry Sprint', pts: [[-275, 55], [-595, 55], [-595, 275], [-875, 275], [-875, -275], [-275, -275]], rivals: ['marco', 'rhea'] }] },
  { rank: 'Silver', level: 20, races: [{ id: 'lg_s1', name: 'Eastside Run', pts: [[275, 55], [875, 55], [875, 385], [395, 385], [395, -275], [875, -275]], rivals: ['kira', 'rowan', 'hector'] }] },
  { rank: 'Gold', level: 30, races: [{ id: 'lg_g1', name: 'Freeway Loop', pts: [[-55, -392], [60, -393], [400, -414], [600, -393], [635, -275], [635, -55], [275, -55], [55, -55], [55, -275], [-55, -275]], rivals: ['dex', 'kira', 'hector'] }, { id: 'lg_g2', name: 'Bayline Dash', pts: [[-960, -420], [-1339.4, -420], [-1719.2, -420], [-1870, -420]], rivals: ['dex', 'kira'] }] },
  { rank: 'Platinum', level: 40, races: [{ id: 'lg_p1', name: 'Ridge Runner', pts: [[-945, -500], [-720, -585], [-470, -600], [-160, -610], [60, -600], [360, -690], [635, -575], [900, -520]], rivals: ['dex', 'kira', 'lena'] }, { id: 'lg_p2', name: 'Calder Hillclimb', pts: [[-55, -560], [298.2, -819.7], [-257.1, -945], [200.6, -1108.2], [-64.2, -1271.5], [222.9, -1555], [-40, -1610]], rivals: ['dex', 'lena', 'kira'] }] },
  { rank: 'Elite', level: 45, races: [{ id: 'lg_e1', name: 'County Grand Prix', pts: [[-275, -55], [-875, -55], [-875, -275], [-960, -420], [-595, -560], [-55, -560], [-55, -275], [275, -275], [875, -275], [875, 385], [275, 385], [275, 55], [-275, 55]], rivals: ['dex', 'lena', 'kira'] }, { id: 'lg_e2', name: 'Mesa Run', pts: [[1000, 55], [1560, -0.5], [1693, -293.5], [2024.4, -505.5], [2447.2, -144.5], [2740, 150]], rivals: ['dex', 'lena', 'kira'] }] },
];
