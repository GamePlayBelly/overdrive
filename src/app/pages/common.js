import { h, icon, fmt } from '../ui.js';
import { LEVEL_REWARDS } from '../../data/progression.js';
import { ALL_ITEMS } from '../../data/items.js';
import { owns } from '../../game/economy.js';

const thumbCache = new Map();

// stylised side-view of a vehicle from its body proportions (used in lists)
export function carThumb(def, color = '#b8c2cc', w = 220, h2 = 110) {
  const key = def.id + color + w;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h2 * 2; c.style.width = '100%'; c.style.height = '100%';
  const x = c.getContext('2d'); x.scale(2, 2);
  if (def.boat) { drawBoatThumb(c, x, def, color, w, h2); thumbCache.set(key, c); return c; }
  if (def.air) { drawAirThumb(x, def, color, w, h2); thumbCache.set(key, c); return c; }
  const b = def.body, L = b.L, H = b.roofY || b.H;
  const s = Math.min((w - 30) / L, (h2 - 30) / H), ox = (w - L * s) / 2, gy = h2 - 20;
  const X = (z) => ox + (z + L / 2) * s, Y = (y) => gy - y * s;
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(w / 2, gy + 3, L * s * 0.48, 5, 0, 0, 7); x.fill();
  const zF = L / 2 - b.ohF, zR = zF - b.wb, wr = b.wr * s;
  const belt = b.beltY || H * 0.62, roof = H, hood = b.hoodY || belt - 0.05, deck = b.deckY || belt;
  const tA = b.tA ?? 0.65, tR = b.tR ?? 0.25, ws = b.ws ?? 0.14, rw = b.rw ?? 0.1;
  x.fillStyle = color; x.beginPath();
  x.moveTo(X(-L / 2), Y(b.clr + 0.05));
  x.lineTo(X(-L / 2 + 0.02), Y(deck - 0.05));
  x.lineTo(X(-L / 2 + tR * L), Y(deck));
  x.lineTo(X(-L / 2 + (tR + rw) * L), Y(roof * 0.985));
  x.lineTo(X(-L / 2 + (tA - ws) * L), Y(roof));
  x.lineTo(X(-L / 2 + tA * L), Y(belt + 0.02));
  x.lineTo(X(L / 2 - 0.1), Y(hood));
  x.lineTo(X(L / 2), Y(b.clr + 0.25));
  x.lineTo(X(L / 2), Y(b.clr + 0.02));
  x.closePath(); x.fill();
  x.fillStyle = 'rgba(15,22,32,0.9)'; x.beginPath();
  x.moveTo(X(-L / 2 + (tR + rw + 0.02) * L), Y(roof * 0.955)); x.lineTo(X(-L / 2 + (tA - ws - 0.01) * L), Y(roof * 0.965)); x.lineTo(X(-L / 2 + (tA - 0.02) * L), Y(belt + 0.03)); x.lineTo(X(-L / 2 + (tR + 0.03) * L), Y(belt + 0.03)); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.14)'; x.fillRect(X(-L / 2), Y(belt), L * s, 3);
  for (const z of [zF, zR]) { x.fillStyle = '#0c0d0f'; x.beginPath(); x.arc(X(z), Y(b.wr), wr + 3, 0, 7); x.fill(); x.fillStyle = '#c3c8ce'; x.beginPath(); x.arc(X(z), Y(b.wr), wr * 0.58, 0, 7); x.fill(); x.fillStyle = '#1b1c1e'; x.beginPath(); x.arc(X(z), Y(b.wr), wr * 0.2, 0, 7); x.fill(); }
  x.fillStyle = '#ffeec2'; x.fillRect(X(L / 2) - 4, Y(hood - 0.08), 4, 4);
  x.fillStyle = '#b8262b'; x.fillRect(X(-L / 2), Y(deck - 0.1), 3, 4);
  thumbCache.set(key, c);
  return c;
}

export function thumbEl(def, color, height = 120) {
  const box = h('div', { class: 'thumb', style: { height: height + 'px' } });
  const c = carThumb(def, color);
  const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; cc.getContext('2d').drawImage(c, 0, 0);
  cc.style.width = '100%'; cc.style.height = '100%';
  box.appendChild(cc);
  return box;
}

// level at which an item is granted, from LEVEL_REWARDS
export function unlockLevel(itemId) {
  for (const [lvl, r] of Object.entries(LEVEL_REWARDS)) {
    if ((r.items || []).includes(itemId)) return +lvl;
    if (r.emote && 'emote_' + r.emote === itemId) return +lvl;
  }
  return null;
}

// availability of an item for the profile: { state: 'owned'|'buy'|'locked'|'pass'|'event', text }
export function itemState(p, it) {
  if (!it) return { state: 'locked', text: 'Unavailable' };
  if (owns(p, it.id) || it.source === 'default') return { state: 'owned', text: 'Owned' };
  if (it.source === 'shop') return { state: 'buy', text: fmt.money(it.price) };
  if (it.source === 'level') { const l = unlockLevel(it.id); return { state: 'locked', text: l ? `Unlocks at level ${l}` : 'Unlocked by leveling up' }; }
  if (it.source === 'pass') return { state: 'locked', text: 'Battle pass reward' };
  return { state: 'locked', text: 'Event reward' };
}

export const rarityOf = (it) => (it.price >= 4000 ? 'legendary' : it.price >= 1800 ? 'epic' : it.price >= 700 ? 'rare' : it.price > 0 ? 'uncommon' : 'common');
export const lookFromProfile = (p) => ({ ...p.avatar });
void icon; void ALL_ITEMS;

// side profile of a boat: hull above and below the waterline plus a superstructure per type
function drawBoatThumb(c, x, def, color, w, h2) {
  const b = def.body, L = b.L, H = b.H, d = b.draft || 0.4;
  const sl = def.perf?.sail;
  const s = Math.min((w - 30) / L, (h2 - 34) / (H + d * 0.8)), ox = (w - L * s) / 2, wl = h2 - 20 - d * s * 0.8;
  const X = (z) => ox + (z + L / 2) * s, Y = (y) => wl - y * s;
  const fbS = H * 0.2, fbB = H * 0.32, t = def.boat;
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.ellipse(w / 2, h2 - 12, L * s * 0.5, 4, 0, 0, 7); x.fill();
  // hull below the waterline
  x.fillStyle = '#1c2b38'; x.beginPath(); x.moveTo(X(-L / 2), Y(0)); x.lineTo(X(-L / 2 + 0.1), Y(-d)); x.quadraticCurveTo(X(L * 0.15), Y(-d * 1.05), X(L / 2 - 0.3), Y(-d * 0.1)); x.lineTo(X(L / 2 - 0.1), Y(0)); x.closePath(); x.fill();
  // topsides
  x.fillStyle = t === 'rib' ? '#6b7076' : color;
  x.beginPath(); x.moveTo(X(-L / 2), Y(0)); x.lineTo(X(-L / 2), Y(fbS)); x.quadraticCurveTo(X(0), Y(fbS * 0.85), X(L / 2 - 0.1), Y(fbB)); x.lineTo(X(L / 2 - 0.05), Y(0)); x.closePath(); x.fill();
  const glass = 'rgba(15,22,32,0.92)', rect = (z0, z1, y0, y1, fill) => { x.fillStyle = fill; x.fillRect(X(z0), Y(y1), (z1 - z0) * s, (y1 - y0) * s); };
  if (t === 'rib') { x.strokeStyle = color; x.lineWidth = Math.max(5, 0.5 * s); x.lineCap = 'round'; x.beginPath(); x.moveTo(X(-L / 2 + 0.2), Y(fbS + 0.12)); x.quadraticCurveTo(X(0), Y(fbS + 0.05), X(L / 2 - 0.15), Y(fbB + 0.12)); x.stroke(); rect(-0.2, 0.4, fbS, fbS + 0.55, color); rect(-0.15, 0.3, fbS + 0.55, fbS + 0.8, glass); x.fillStyle = '#23272c'; x.fillRect(X(-L / 2) - 7, Y(fbS + 0.15), 9, 20); }
  else if (t === 'jetski') { x.fillStyle = color; x.beginPath(); x.moveTo(X(0.0), Y(fbS)); x.quadraticCurveTo(X(L * 0.25), Y(fbS + 0.42), X(L / 2 - 0.15), Y(fbB)); x.lineTo(X(0.0), Y(fbS)); x.fill(); rect(-0.9, 0.1, fbS, fbS + 0.14, '#15171a'); x.strokeStyle = '#d7dadd'; x.lineWidth = 2; x.beginPath(); x.moveTo(X(0.3), Y(fbS + 0.3)); x.lineTo(X(0.18), Y(fbS + 0.75)); x.stroke(); x.beginPath(); x.moveTo(X(0.1), Y(fbS + 0.75)); x.lineTo(X(0.26), Y(fbS + 0.75)); x.stroke(); }
  else if (t === 'sport') { rect(-0.4, 1.2, fbS + 0.05, fbS + 0.55, color); x.fillStyle = glass; x.beginPath(); x.moveTo(X(0.9), Y(fbS + 0.5)); x.lineTo(X(1.2), Y(fbS + 0.5)); x.lineTo(X(0.75), Y(fbS + 1.05)); x.lineTo(X(0.55), Y(fbS + 1.05)); x.closePath(); x.fill(); x.fillStyle = '#23272c'; x.fillRect(X(-L / 2) - 8, Y(fbS + 0.25), 10, 28); x.fillStyle = '#e9e4d6'; x.fillRect(X(-L / 2 + 0.3), Y(fbS + 0.45), 1.1 * s, 0.4 * s); }
  else if (t === 'fisher') { rect(-0.3, 2.4, fbS + 0.05, fbS + 1.6, color); rect(0.0, 2.05, fbS + 0.65, fbS + 1.35, glass); rect(-0.5, 2.6, fbS + 1.6, fbS + 1.75, '#dfe3e6'); x.strokeStyle = '#c9ccd0'; x.lineWidth = 2; x.beginPath(); x.moveTo(X(0.3), Y(fbS + 1.75)); x.lineTo(X(0.3), Y(fbS + 3.2)); x.stroke(); x.beginPath(); x.moveTo(X(0.3), Y(fbS + 2.8)); x.lineTo(X(-2.2), Y(fbS + 1.7)); x.stroke(); }
  else if (sl) {
    const mz = L * 0.08, base = fbS + 0.06, m = Math.min(sl.mast, (wl - 8) / s);
    x.fillStyle = '#1c2b38'; x.beginPath(); x.moveTo(X(-L * 0.04), Y(-d)); x.lineTo(X(L * 0.2), Y(-d)); x.lineTo(X(L * 0.14), Y(-sl.keel)); x.lineTo(X(L * 0.07), Y(-sl.keel)); x.closePath(); x.fill();
    rect(-L * 0.2, L * 0.1, fbS, fbS + H * 0.3, color); rect(-L * 0.14, L * 0.07, fbS + H * 0.12, fbS + H * 0.24, glass);
    x.strokeStyle = '#c9ccd0'; x.lineWidth = 2; x.beginPath(); x.moveTo(X(mz), Y(base)); x.lineTo(X(mz), Y(m)); x.stroke();
    x.fillStyle = '#f4f2ea'; x.beginPath(); x.moveTo(X(mz - 0.1), Y(base + 0.35)); x.lineTo(X(mz - 0.1), Y(m * 0.97)); x.lineTo(X(-L * 0.44), Y(base + 0.5)); x.closePath(); x.fill();
    x.fillStyle = '#e4e1d6'; x.beginPath(); x.moveTo(X(mz + 0.18), Y(m * 0.92)); x.lineTo(X(L * 0.46), Y(base + 0.12)); x.lineTo(X(mz + 0.3), Y(base + 0.55)); x.closePath(); x.fill();
  }
  else { rect(-3.6, 1.4, fbS + 0.05, fbS + 1.45, color); rect(-3.2, 1.1, fbS + 0.5, fbS + 1.15, glass); rect(-2.6, 0.4, fbS + 1.45, fbS + 2.4, color); rect(-2.2, 0.15, fbS + 1.75, fbS + 2.2, glass); rect(-3.7, 1.6, fbS + 2.4, fbS + 2.5, '#dfe3e6'); x.strokeStyle = '#c9ccd0'; x.lineWidth = 2; x.beginPath(); x.moveTo(X(-1.6), Y(fbS + 2.5)); x.lineTo(X(-1.6), Y(fbS + 3.3)); x.moveTo(X(-3.2), Y(fbS + 2.5)); x.lineTo(X(-3.2), Y(fbS + 3.3)); x.moveTo(X(-3.2), Y(fbS + 3.3)); x.lineTo(X(-1.6), Y(fbS + 3.3)); x.stroke(); }
  // water line and a soft wave
  x.fillStyle = 'rgba(76,170,178,0.55)'; x.beginPath(); x.moveTo(6, Y(0)); for (let i = 0; i <= 40; i++) x.lineTo(6 + (w - 12) * i / 40, Y(0) + Math.sin(i * 0.9) * 1.6); x.lineTo(w - 6, Y(0) + 26); x.lineTo(6, Y(0) + 26); x.closePath(); x.fill();
}

// side profile of an aircraft: fuselage, wing, tail and rotor
function drawAirThumb(x, def, color, w, h2) {
  const t = def.air, cx = w / 2, cy = h2 / 2 + 6, L = w * 0.78;
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.ellipse(cx, h2 - 14, L * 0.4, 4, 0, 0, 7); x.fill();
  x.fillStyle = color; x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 1;
  if (t === 'heli') {
    x.beginPath(); x.ellipse(cx - L * 0.1, cy, L * 0.2, 16, 0, 0, 7); x.fill(); x.fillRect(cx - L * 0.02, cy - 4, L * 0.5, 6); x.fillRect(cx + L * 0.44, cy - 18, 4, 18);
    x.fillStyle = '#10151c'; x.fillRect(cx - L * 0.4, cy - 26, L * 0.8, 2); x.fillRect(cx - L * 0.12, cy + 20, L * 0.28, 2);
    x.fillStyle = 'rgba(25,34,45,0.9)'; x.beginPath(); x.ellipse(cx - L * 0.22, cy - 3, L * 0.09, 10, 0, 0, 7); x.fill();
    return;
  }
  x.beginPath(); x.ellipse(cx, cy, L * 0.45, t === 'jet' ? 13 : 14, 0, 0, 7); x.fill();
  x.fillRect(cx - L * 0.44, cy - 24, 8, 24);
  x.fillStyle = '#e9edf0'; x.fillRect(cx - L * 0.06, cy - 15, L * 0.3, 3);
  x.fillStyle = color; x.fillRect(cx - L * 0.2, cy - (t === 'jet' ? 3 : 16), L * 0.3, 4);
  x.fillStyle = 'rgba(25,34,45,0.9)'; x.beginPath(); x.ellipse(cx + L * 0.1, cy - 6, L * 0.1, 7, 0, 0, 7); x.fill();
  if (t === 'prop') { x.fillStyle = '#10151c'; x.fillRect(cx + L * 0.45, cy - 18, 2, 36); }
  x.fillStyle = '#10151c'; x.beginPath(); x.arc(cx + L * 0.12, cy + 18, 3, 0, 7); x.arc(cx - L * 0.1, cy + 18, 3, 0, 7); x.fill();
}
