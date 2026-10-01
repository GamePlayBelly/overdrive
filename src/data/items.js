// Item catalog: clothing, cosmetics, emotes, garage and safehouse items. Prices in $ (earned in game) or RC tokens (earned in play).
// source: 'default' owned at start, 'shop' purchasable, 'level' via level rewards, 'pass' via battle pass, 'event'.

const C = (id, cat, name, props, price = 0, source = 'shop', extra = {}) => ({ id, cat, name, props, price, source, ...extra });

export const CLOTHING = [
  // tops
  C('top_tee_white', 'top', 'Plain Tee — White', { type: 'tshirt', color: '#e9e9e6' }, 0, 'default'),
  C('top_tee_black', 'top', 'Plain Tee — Black', { type: 'tshirt', color: '#1b1c1e' }, 0, 'default'),
  C('top_tee_navy', 'top', 'Plain Tee — Navy', { type: 'tshirt', color: '#1f2e4a' }, 120),
  C('top_tee_red', 'top', 'Riverton Tee — Red', { type: 'tshirt', color: '#9e1b1f' }, 150),
  C('top_polo_sage', 'top', 'Polo — Sage', { type: 'polo', color: '#8fa68a' }, 240),
  C('top_shirt_blue', 'top', 'Oxford Shirt — Blue', { type: 'shirt', color: '#9fb8d8' }, 320),
  C('top_shirt_white', 'top', 'Oxford Shirt — White', { type: 'shirt', color: '#f2f2ef' }, 320),
  C('top_hoodie_grey', 'top', 'Hoodie — Heather Grey', { type: 'hoodie', color: '#8c9096' }, 0, 'level'),
  C('top_hoodie_black', 'top', 'Hoodie — Black', { type: 'hoodie', color: '#1a1a1c' }, 380),
  C('top_tank_white', 'top', 'Tank Top', { type: 'tank', color: '#efefec' }, 90),
  C('top_flannel', 'top', 'Flannel Shirt', { type: 'shirt', color: '#8c2f2b' }, 350),
  // jackets
  C('jacket_none', 'jacket', 'No jacket', { type: 'none', color: '#000000' }, 0, 'default'),
  C('jacket_bomber', 'jacket', 'Bomber — Charcoal', { type: 'bomber', color: '#2c3440' }, 0, 'default'),
  C('jacket_bomber_olive', 'jacket', 'Bomber — Olive', { type: 'bomber', color: '#4a5236' }, 650),
  C('jacket_denim', 'jacket', 'Denim Jacket', { type: 'denim', color: '#4a6a90' }, 0, 'level'),
  C('jacket_leather', 'jacket', 'Leather Jacket', { type: 'leather', color: '#1a1614' }, 0, 'level'),
  C('jacket_leather_brown', 'jacket', 'Leather Jacket — Tan', { type: 'leather', color: '#6b4630' }, 2400),
  C('jacket_puffer', 'jacket', 'Puffer — Black', { type: 'puffer', color: '#1c1d20' }, 0, 'level'),
  C('jacket_puffer_red', 'jacket', 'Puffer — Signal Red', { type: 'puffer', color: '#a3201f' }, 1600),
  C('jacket_blazer', 'jacket', 'Tailored Blazer', { type: 'blazer', color: '#23283a' }, 0, 'level'),
  C('jacket_track', 'jacket', 'Track Jacket', { type: 'track', color: '#1d4f91' }, 0, 'level'),
  C('jacket_racing', 'jacket', 'Racing Jacket', { type: 'bomber', color: '#e5383b' }, 0, 'pass'),
  C('jacket_workwear', 'jacket', 'Work Jacket', { type: 'bomber', color: '#8a6a3a' }, 900),
  // pants
  C('pants_jeans', 'pants', 'Jeans — Indigo', { type: 'jeans', color: '#34465e' }, 0, 'default'),
  C('pants_jeans_black', 'pants', 'Jeans — Black', { type: 'jeans', color: '#1c1d20' }, 280),
  C('pants_chinos', 'pants', 'Chinos — Khaki', { type: 'chinos', color: '#b8a57e' }, 260),
  C('pants_cargo', 'pants', 'Cargo — Olive', { type: 'cargo', color: '#5a5f3e' }, 320),
  C('pants_track', 'pants', 'Track Pants', { type: 'track', color: '#1a1a1c' }, 220),
  C('pants_shorts', 'pants', 'Shorts', { type: 'shorts', color: '#5a6a7a' }, 160),
  C('pants_suit', 'pants', 'Suit Trousers', { type: 'suit', color: '#23283a' }, 700),
  // shoes
  C('shoes_sneakers', 'shoes', 'Sneakers — White', { type: 'sneakers', color: '#f2f2f0' }, 0, 'default'),
  C('shoes_sneakers_black', 'shoes', 'Sneakers — Black', { type: 'sneakers', color: '#1a1a1c' }, 240),
  C('shoes_runners_red', 'shoes', 'Runners — Red', { type: 'runners', color: '#c62828' }, 0, 'level'),
  C('shoes_boots', 'shoes', 'Work Boots', { type: 'boots', color: '#6b4a2b' }, 0, 'level'),
  C('shoes_dress', 'shoes', 'Dress Shoes', { type: 'dress', color: '#1a1410' }, 600),
  // hats
  C('hat_none', 'hat', 'No hat', { type: 'none', color: '#000' }, 0, 'default'),
  C('hat_cap_black', 'hat', 'Cap — Black', { type: 'cap', color: '#1a1a1c' }, 0, 'level'),
  C('hat_cap_red', 'hat', 'Cap — Red', { type: 'cap', color: '#a3201f' }, 140),
  C('hat_beanie_red', 'hat', 'Beanie — Red', { type: 'beanie', color: '#a3201f' }, 0, 'level'),
  C('hat_beanie_grey', 'hat', 'Beanie — Grey', { type: 'beanie', color: '#6a6e74' }, 120),
  C('hat_bucket', 'hat', 'Bucket Hat', { type: 'bucket', color: '#c8b894' }, 220),
  C('hat_fedora', 'hat', 'Fedora', { type: 'fedora', color: '#2a2622' }, 0, 'level'),
  // accessories
  C('glasses_none', 'glasses', 'No glasses', { value: 'none' }, 0, 'default'),
  C('glasses_square', 'glasses', 'Square Frames', { value: 'square' }, 180),
  C('glasses_round', 'glasses', 'Round Frames', { value: 'round' }, 180),
  C('glasses_aviator', 'glasses', 'Aviators', { value: 'aviator' }, 0, 'level'),
  C('glasses_sport', 'glasses', 'Sport Shades', { value: 'sport' }, 0, 'level'),
  C('watch_none', 'watch', 'No watch', { value: 'none' }, 0, 'default'),
  C('watch_steel', 'watch', 'Steel Watch', { value: 'steel' }, 0, 'default'),
  C('watch_gold', 'watch', 'Gold Watch', { value: 'gold' }, 0, 'level'),
  C('watch_smart', 'watch', 'Smartwatch', { value: 'smart' }, 0, 'level'),
  C('chain_none', 'chain', 'No chain', { value: 'none' }, 0, 'default'),
  C('chain_thin', 'chain', 'Thin Chain', { value: 'thin' }, 0, 'level'),
  C('chain_thick', 'chain', 'Heavy Chain', { value: 'thick' }, 0, 'level'),
  C('bag_none', 'bag', 'No bag', { value: 'none' }, 0, 'default'),
  C('bag_backpack', 'bag', 'Backpack', { value: 'backpack' }, 350),
  C('bag_messenger', 'bag', 'Messenger Bag', { value: 'messenger' }, 0, 'level'),
];

// outfit presets (apply multiple items)
export const OUTFITS = [
  { id: 'outfit_default', name: 'Arrival', items: ['top_tee_white', 'jacket_bomber', 'pants_jeans', 'shoes_sneakers', 'hat_none'], source: 'default' },
  { id: 'outfit_street', name: 'Street Casual', items: ['top_hoodie_grey', 'jacket_none', 'pants_jeans_black', 'shoes_sneakers', 'hat_cap_black'], source: 'level' },
  { id: 'outfit_night', name: 'Night Shift', items: ['top_tee_black', 'jacket_leather', 'pants_jeans_black', 'shoes_boots', 'glasses_none'], source: 'level' },
  { id: 'outfit_racer', name: 'Racer', items: ['top_tee_black', 'jacket_racing', 'pants_track', 'shoes_runners_red', 'hat_cap_red'], source: 'level' },
  { id: 'outfit_executive', name: 'Executive', items: ['top_shirt_white', 'jacket_blazer', 'pants_suit', 'shoes_dress', 'watch_gold'], source: 'level' },
  { id: 'outfit_legend', name: 'Legend', items: ['top_tee_black', 'jacket_leather_brown', 'pants_jeans', 'shoes_boots', 'glasses_aviator', 'chain_thick'], source: 'level' },
];

export const EMOTES = [
  { id: 'wave', name: 'Wave', source: 'default' }, { id: 'clap', name: 'Clap', source: 'level' }, { id: 'point', name: 'Point', source: 'level' },
  { id: 'dance', name: 'Dance', source: 'level' }, { id: 'shrug', name: 'Shrug', source: 'level' }, { id: 'salute', name: 'Salute', source: 'level' },
  { id: 'cheer', name: 'Cheer', source: 'level' }, { id: 'lean', name: 'Lean Back', price: 800, source: 'shop' },
];

export const PAINT_FINISHES = [
  { id: 'gloss', name: 'Gloss', price: 300 }, { id: 'metallic', name: 'Metallic', price: 600 }, { id: 'matte', name: 'Matte', price: 900, unlock: 'finish_matte' },
  { id: 'pearl', name: 'Pearlescent', price: 1400, unlock: 'finish_pearl' }, { id: 'chrome', name: 'Chrome', price: 8000, unlock: 'finish_chrome' },
];
export const PAINT_SWATCHES = ['#f2f2f0', '#c8ccd0', '#8a9096', '#3d3f42', '#141518', '#7a1f23', '#b01e23', '#d3431f', '#e0a21a', '#e6c229', '#3e5c2f', '#2e8b57', '#0f6e6e', '#1d4f91', '#1f2e4a', '#2c4f7c', '#6b3fa0', '#8c2f5a', '#6b4630', '#d8cfb8'];

export const COSMETICS = [
  { id: 'rim_fivespoke', slot: 'rims', value: 'fivespoke', name: 'Classic 5-Spoke', price: 900, source: 'default' },
  { id: 'rim_multispoke', slot: 'rims', value: 'multispoke', name: 'Multi-Spoke', price: 1100, source: 'default' },
  { id: 'rim_steel', slot: 'rims', value: 'steel', name: 'Steelies', price: 300, source: 'default' },
  { id: 'rim_offroad', slot: 'rims', value: 'offroad', name: 'Trail 8', price: 1200, source: 'default' },
  { id: 'rim_split', slot: 'rims', value: 'split', name: 'Split 10', price: 1600, source: 'level' },
  { id: 'rim_deepdish', slot: 'rims', value: 'deepdish', name: 'Deep Dish', price: 2200, source: 'level' },
  { id: 'rim_mesh', slot: 'rims', value: 'mesh', name: 'Mesh Forged', price: 3400, source: 'level' },
  { id: 'rim_turbine', slot: 'rims', value: 'turbine', name: 'Turbine', price: 3000, source: 'level' },
  { id: 'rim_gold_color', slot: 'rimColor', value: '#c9a23a', name: 'Gold Finish', price: 1500, source: 'level' },
  { id: 'spoiler_lip', slot: 'spoiler', value: 'lip', name: 'Lip Spoiler', price: 700, source: 'default' },
  { id: 'spoiler_ducktail', slot: 'spoiler', value: 'ducktail', name: 'Ducktail', price: 1400, source: 'level' },
  { id: 'spoiler_wing', slot: 'spoiler', value: 'wing', name: 'Street Wing', price: 2600, source: 'level' },
  { id: 'spoiler_gt', slot: 'spoiler', value: 'gt', name: 'GT Wing', price: 5200, source: 'level' },
  { id: 'bumper_sport', slot: 'bumper', value: 'sport', name: 'Sport Bumpers', price: 2400, source: 'level' },
  { id: 'bumper_aero', slot: 'bumper', value: 'aero', name: 'Aero Kit', price: 5800, source: 'level' },
  { id: 'hood_vented', slot: 'hood', value: 'vented', name: 'Vented Hood', price: 1800, source: 'level' },
  { id: 'hood_scoop', slot: 'hood', value: 'scoop', name: 'Scoop Hood', price: 2200, source: 'level' },
  { id: 'exhaust_dual', slot: 'exhaust', value: 'dual', name: 'Dual Tips', price: 900, source: 'default' },
  { id: 'exhaust_quad', slot: 'exhaust', value: 'quad', name: 'Quad Tips', price: 1800, source: 'level' },
  { id: 'exhaust_sport', slot: 'exhaust', value: 'sport', name: 'Center Sport', price: 1500, source: 'shop' },
  { id: 'tint_light', slot: 'tint', value: 0.2, name: 'Light Tint', price: 250, source: 'default' },
  { id: 'tint_dark', slot: 'tint', value: 0.6, name: 'Dark Tint', price: 500, source: 'default' },
  { id: 'tint_limo', slot: 'tint', value: 0.9, name: 'Limo Tint', price: 900, source: 'level' },
  { id: 'mirror_carbon', slot: 'mirrorColor', value: '#1a1a1c', name: 'Carbon Mirrors', price: 600, source: 'shop' },
  { id: 'decal_sideStripe', slot: 'decal', value: 'sideStripe', name: 'Side Stripe', price: 600, source: 'level' },
  { id: 'decal_stripes', slot: 'decal', value: 'stripes', name: 'Racing Stripes', price: 900, source: 'level' },
  { id: 'decal_number', slot: 'decal', value: 'number', name: 'Race Number', price: 700, source: 'level' },
  { id: 'decal_flames', slot: 'decal', value: 'flames', name: 'Flames', price: 1500, source: 'level' },
  { id: 'decal_checker', slot: 'decal', value: 'checker', name: 'Checker Band', price: 1200, source: 'level' },
  { id: 'decal_split', slot: 'decal', value: 'split', name: 'Two-Tone Split', price: 1800, source: 'level' },
  { id: 'decal_rally', slot: 'decal', value: 'rally', name: 'Riverton Rally', price: 2000, source: 'level' },
  { id: 'finish_matte', slot: 'finishUnlock', value: 'matte', name: 'Matte Finish', price: 0, source: 'level' },
  { id: 'finish_pearl', slot: 'finishUnlock', value: 'pearl', name: 'Pearl Finish', price: 0, source: 'level' },
  { id: 'finish_chrome', slot: 'finishUnlock', value: 'chrome', name: 'Chrome Finish', price: 0, source: 'level' },
  { id: 'interior_tan', slot: 'interior', value: '#8a6a4a', name: 'Tan Interior', price: 1200, source: 'shop' },
  { id: 'interior_red', slot: 'interior', value: '#7a1f23', name: 'Red Interior', price: 1200, source: 'shop' },
];

export const GARAGE_ITEMS = [
  { id: 'garage_posters', name: 'Vintage Posters', price: 600, source: 'shop' },
  { id: 'garage_toolwall', name: 'Tool Wall', price: 1500, source: 'shop' },
  { id: 'garage_lift', name: 'Two-Post Lift', price: 4500, source: 'shop' },
  { id: 'garage_tirerack', name: 'Tire Rack', price: 900, source: 'shop' },
  { id: 'garage_ledstrip', name: 'LED Strip Lighting', price: 2200, source: 'shop' },
  { id: 'garage_sofa', name: 'Leather Sofa', price: 1800, source: 'shop' },
  { id: 'garage_flag', name: 'Riverton Flag', price: 300, source: 'pass' },
  { id: 'garage_trophies', name: 'Trophy Shelf', price: 0, source: 'level' },
  { id: 'garage_turntable', name: 'Display Turntable', price: 0, source: 'level' },
  { id: 'garage_arcade', name: 'Arcade Cabinet', price: 3200, source: 'shop' },
];

export const SAFEHOUSE_ITEMS = [
  { id: 'sh_sofa', name: 'Corner Sofa', price: 1400, slot: 'living' },
  { id: 'sh_tv', name: 'Wall TV', price: 2200, slot: 'living' },
  { id: 'sh_plants', name: 'Indoor Plants', price: 300, slot: 'decor' },
  { id: 'sh_lamp', name: 'Floor Lamp', price: 450, slot: 'lighting' },
  { id: 'sh_pendant', name: 'Pendant Lights', price: 900, slot: 'lighting' },
  { id: 'sh_bookshelf', name: 'Bookshelf', price: 800, slot: 'decor' },
  { id: 'sh_rug', name: 'Wool Rug', price: 500, slot: 'decor' },
  { id: 'sh_desk', name: 'Work Desk', price: 1100, slot: 'office' },
  { id: 'sh_art', name: 'Framed Prints', price: 700, slot: 'decor' },
  { id: 'sh_trophies', name: 'Trophy Cabinet', price: 1600, slot: 'decor' },
  { id: 'sh_bed', name: 'Queen Bed', price: 1900, slot: 'bedroom' },
  { id: 'sh_kitchen', name: 'Kitchen Upgrade', price: 5200, slot: 'kitchen' },
  { id: 'sh_carportrait', name: 'Car Portrait', price: 400, slot: 'decor', source: 'pass' },
];

export const ALL_ITEMS = {};
for (const it of CLOTHING) ALL_ITEMS[it.id] = { ...it, kind: 'clothing' };
for (const it of OUTFITS) ALL_ITEMS[it.id] = { ...it, kind: 'outfit' };
for (const it of EMOTES) ALL_ITEMS['emote_' + it.id] = { ...it, id: 'emote_' + it.id, kind: 'emote' };
for (const it of COSMETICS) ALL_ITEMS[it.id] = { ...it, kind: 'cosmetic' };
for (const it of GARAGE_ITEMS) ALL_ITEMS[it.id] = { ...it, kind: 'garage' };
for (const it of SAFEHOUSE_ITEMS) ALL_ITEMS[it.id] = { ...it, kind: 'safehouse', source: it.source || 'shop' };

export const DEFAULT_INVENTORY = Object.values(ALL_ITEMS).filter((i) => i.source === 'default').map((i) => i.id);

// avatar pieces available in the barber / creator (free)
export const HAIR_STYLES = ['buzz', 'short', 'tousled', 'medium', 'slick', 'curly', 'afro', 'long', 'wavy', 'bob', 'spiky', 'ponytail', 'bun', 'mohawk', 'none'];
export const FACIAL = ['none', 'stubble', 'mustache', 'goatee', 'beard'];
export const SKIN_TONES = ['#f1d0b5', '#e8b995', '#d6a078', '#c69272', '#a9714c', '#8d5a3b', '#6b4127', '#4e2f1d'];
export const HAIR_COLORS = ['#1c1510', '#2b1e16', '#4a3222', '#6b4a2e', '#8a5a2e', '#b89a6a', '#d8c090', '#ffd84a', '#a33a24', '#9a9a9a', '#e0e0e0', '#ff7aa8', '#8a4fd8', '#3b6bff', '#4fd66b'];
export const EYE_COLORS = ['#4a3526', '#2b1e16', '#3d6b8c', '#4a7a4a', '#7a6a4a', '#5a6a7a'];
