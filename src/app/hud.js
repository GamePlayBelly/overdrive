import { h, icon, fmt, bar } from './ui.js';
import { MAP, BLIP } from '../ui/mapRender.js';
import { clamp, lerp, smoothstep, wrapAngle } from '../core/math.js';
import { xpToNext, rankFor } from '../data/progression.js';
import { WEATHERS } from '../world/sky.js';

const STAR = '<path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6 12 2z"/>';

// sailing dial: wind from the top with the no-go sector fixed there, the boat turning against it, the boom, wind speed and heel
function makeWindDial() {
  const NS = 'http://www.w3.org/2000/svg', el = document.createElement('div');
  el.className = 'wind-box hide';
  const wedge = (a) => `M0,0 L${(50 * Math.sin(-a)).toFixed(2)},${(-50 * Math.cos(a)).toFixed(2)} A50,50 0 0 1 ${(50 * Math.sin(a)).toFixed(2)},${(-50 * Math.cos(a)).toFixed(2)} Z`;
  let ticks = '';
  for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6, r0 = i % 3 ? 47 : 43; ticks += `<line x1="${(r0 * Math.sin(a)).toFixed(1)}" y1="${(-r0 * Math.cos(a)).toFixed(1)}" x2="${(51 * Math.sin(a)).toFixed(1)}" y2="${(-51 * Math.cos(a)).toFixed(1)}"/>`; }
  el.innerHTML = `<svg viewBox="-60 -60 120 120"><circle class="w-ring" r="52"/><g class="w-ticks">${ticks}</g><path class="w-nogo" d="${wedge(0.66)}"/>
    <g class="w-boat"><path class="w-hull" d="M0,-26 C10,-14 11,10 7,24 L-7,24 C-11,10 -10,-14 0,-26Z"/><line class="w-boom" x1="0" y1="-6" x2="0" y2="26"/></g>
    <g class="w-arrow"><path d="M0,-38 L7,-54 L-7,-54 Z"/></g></svg><div class="w-txt"><b>0</b> kn wind</div><div class="w-sub"></div>`;
  const q = (s) => el.querySelector(s), boat = q('.w-boat'), boom = q('.w-boom'), b = q('.w-txt b'), sub = q('.w-sub');
  let shown = false;
  return {
    el,
    update(v, game) {
      if (!!v !== shown) { shown = !!v; el.classList.toggle('hide', !shown); }
      if (!v) return;
      const p = v.phys, W = game.sky.wind;
      boat.setAttribute('transform', `rotate(${(-wrapAngle(p.yaw - Math.atan2(-W.x, -W.z)) * 57.2958).toFixed(1)})`);
      boom.setAttribute('transform', `rotate(${(-v.sailA * 57.2958).toFixed(1)} 0 -6)`);
      boom.classList.toggle('luff', v.sailL > 0.5);
      b.textContent = Math.round(W.speed * 1.94384);
      sub.textContent = `AWA ${Math.round(Math.abs(p.awa) * 57.2958)}\u00b0   HEEL ${Math.round(Math.abs(p.roll) * 57.2958)}\u00b0${p.ease > 0.4 ? '   EASED' : ''}`;
    },
  };
}

export class Hud {
  constructor(app) {
    this.app = app;
    const g = app.game;
    this.el = h('div', { id: 'hud' });
    // top-left
    this.lvl = h('div', { class: 'hud-level' }, h('b', null, '1'));
    this.money = h('div', { class: 'hud-money' }, '$0', h('small', null, 'Cash'));
    this.tl = h('div', { class: 'hud-tl' }, h('div', { class: 'hud-chip' }, this.lvl, this.money));
    this.gainBox = h('div', { style: 'position:absolute;left:0;top:0' });
    this.tl.appendChild(this.gainBox);
    // top-right
    this.starEls = Array.from({ length: 6 }, () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'star'); s.innerHTML = STAR; return s; });
    this.stars = h('div', { class: 'stars' }, this.starEls);
    this.wantedInfo = h('div', { class: 'wanted-info' });
    this.timeEl = h('div', { class: 'hud-time' }, '09:30', h('small', null, 'Sunny'));
    this.tr = h('div', { class: 'hud-tr' }, this.timeEl, this.stars, this.wantedInfo);
    // compass
    this.compassInner = h('div', { class: 'compass-inner' });
    this.compassW = 4;
    const labels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' };
    for (let rep = -1; rep <= 1; rep++) for (let d = 0; d < 360; d += 15) {
      const x = (d + rep * 360) * this.compassW;
      this.compassInner.appendChild(h('span', { style: { left: x + 'px' }, class: labels[d] ? '' : 't' }, labels[d] || String(d)));
    }
    this.wpMark = h('span', { style: 'color:#ff4d6d;font-size:20px;top:0;display:none', text: '▼' });
    this.compassInner.appendChild(this.wpMark);
    this.compass = h('div', { class: 'compass' }, this.compassInner);
    this.objective = h('div', { class: 'objective hide' });
    // minimap
    this.mmCanvas = h('canvas', { width: 400, height: 400 });
    this.mmInfo = h('div', { class: 'minimap-info' }, 'Riverton');
    this.minimap = h('div', { class: 'minimap' }, this.mmCanvas, this.mmInfo);
    this.street = h('div', { class: 'street' }, 'Central Ave', h('small', null, 'Downtown'));
    this.bl = h('div', { class: 'hud-bl' }, h('div', null, this.street, this.minimap));
    // speedometer
    this.spCanvas = h('canvas', { width: 536, height: 400 });
    this.kmh = h('div', { class: 'kmh' }, '0'); this.unit = h('div', { class: 'unit' }, 'KM/H'); this.gear = h('div', { class: 'gear' }, 'N');
    this.speedo = h('div', { class: 'speedo' }, this.spCanvas, this.gear, this.kmh, this.unit);
    this.flags = {};
    const fl = (k, cls, ic, t) => { const f = h('div', { class: 'flag ' + cls, title: t }, ic ? icon(ic) : t); this.flags[k] = f; return f; };
    this.flagRow = h('div', { class: 'hud-flags' }, fl('lights', 'lights', 'sun', ''), fl('ind', 'ind', 'arrow', ''), fl('haz', 'haz', 'siren', ''), fl('abs', 'abs', null, 'ABS'), fl('tc', 'tc', null, 'TC'), fl('dmg', 'dmg', 'wrench', ''));
    this.nitro = bar(1, 'blue', 'nitro-bar');
    this.driftBox = h('div', { class: 'drift-box hide' }, h('div', { class: 'dscore' }, '0'), h('div', { class: 'dlabel' }, 'Drift'));
    this.windDial = makeWindDial();
    this.br = h('div', { class: 'hud-br' }, this.driftBox, this.nitro, this.windDial.el, this.speedo, this.flagRow);
    this.prompt = h('div', { class: 'prompt hide' });
    this.subtitle = h('div', { class: 'subtitle hide' });
    this.hint = h('div', { class: 'ctl-hint' });
    this.fps = h('div', { class: 'fps hide' });
    this.bubbles = h('div', { style: 'position:absolute;inset:0' });
    this.el.append(this.tl, this.tr, this.compass, this.objective, this.bl, this.br, this.prompt, this.subtitle, this.hint, this.fps, this.bubbles);
    document.getElementById('ui').appendChild(this.el);
    this.vig = h('div', { class: 'vignette-fx' }); this.flash = h('div', { class: 'flash-fx' });
    document.body.append(this.vig, this.flash);
    this.tt = 0; this.spT = 0; this.lastMoney = null; this.lastXp = null; this.driftShow = 0; this.bankT = 0;
    this.mapCanvas = null;
    this.speedoSmooth = 0; this.rpmSmooth = 0;
    this.units = 'kmh';
    this.mmZoom = 1;
    this.wpt = null;
  }

  setMapCanvas(c) { this.mapCanvas = c; }
  show(on) { this.el.classList.toggle('show', on); }

  gain(text, color) {
    const e = h('div', { class: 'hud-gain', style: color ? { color } : undefined }, text);
    this.gainBox.appendChild(e); setTimeout(() => e.remove(), 1700);
  }
  big(title, sub, cls = '') { const e = h('div', { class: 'centerbig ' + cls }, title, sub ? h('small', null, sub) : null); this.el.appendChild(e); setTimeout(() => e.remove(), 2500); }
  say(who, text, ms = 4200) { this.subtitle.innerHTML = ''; this.subtitle.append(who ? h('b', null, who) : '', text); this.subtitle.classList.remove('hide'); clearTimeout(this._sub); this._sub = setTimeout(() => this.subtitle.classList.add('hide'), ms); }
  setPrompt(key, text) { if (!text) { this.prompt.classList.add('hide'); this._pk = null; return; } const k = key + '|' + text; if (this._pk === k) return; this._pk = k; this.prompt.replaceChildren(h('span', { class: 'kbd' }, key), text); this.prompt.classList.remove('hide'); }
  damageFlash(a) { this.vig.style.boxShadow = `inset 0 0 160px 40px rgba(180,20,25,${clamp(a, 0, 0.7)})`; setTimeout(() => (this.vig.style.boxShadow = 'inset 0 0 160px 40px rgba(180,20,25,0)'), 260); }
  photoFlash() { this.flash.style.transition = 'none'; this.flash.style.opacity = '0.85'; requestAnimationFrame(() => { this.flash.style.transition = 'opacity 0.5s'; this.flash.style.opacity = '0'; }); }

  update(dt) {
    const app = this.app, g = app.game, prof = app.store.profile;
    if (!prof) return;
    this.tt += dt; this.spT += dt;
    const P = g.player, v = P.vehicle && P.state === 'driving' ? P.vehicle : null;
    this.units = prof.settings.general.units;
    // ---- top-left ----
    if (this.lastMoney !== prof.money) { this.money.firstChild.textContent = fmt.money(prof.money); if (this.lastMoney !== null && prof.money !== this.lastMoney) { const d = prof.money - this.lastMoney; this.gain((d > 0 ? '+' : '-') + fmt.money(Math.abs(d)), d > 0 ? '#7cf29c' : '#ff8a8c'); } this.lastMoney = prof.money; }
    if (this.lastXp !== prof.xp + prof.level * 1e6) {
      const need = xpToNext(prof.level);
      this.lvl.style.setProperty('--p', clamp((prof.xp / need) * 100, 0, 100));
      this.lvl.firstChild.textContent = prof.level;
      this.lastXp = prof.xp + prof.level * 1e6;
    }
    // ---- top-right ----
    const sky = g.sky;
    if (this.tt > 0.2) {
      this.tt = 0;
      this.timeEl.firstChild.textContent = fmt.clock(sky.time);
      const wl = WEATHERS[sky.weather]?.label || 'Clear'; if (this.timeEl.lastChild.textContent !== wl) this.timeEl.lastChild.textContent = wl;
      const w = g.wanted || { level: 0 };
      this.starEls.forEach((s, i) => { s.classList.toggle('on', i < w.level); s.classList.toggle('flash', w.level > 0 && w.evading && i < w.level); s.style.display = i < 5 || w.level > 5 ? '' : 'none'; });
      this.wantedInfo.textContent = w.level ? (w.evading ? 'Evading' : w.searching ? 'Searching' : 'Wanted') : '';
      this.updateObjective();
      if (prof.settings.graphics.fpsCounter) { const st = g.gov.status(); this.fps.textContent = `${st.fps} fps  ${st.ms}ms  ${st.tier} x${st.scale}  tris ${(g.renderer.info.render.triangles / 1e3) | 0}k  calls ${g.renderer.info.render.calls}`; this.fps.classList.remove('hide'); } else this.fps.classList.add('hide');
    }
    // ---- compass ----
    const cam = g.camera;
    const _f = this._f || (this._f = cam.position.clone()); cam.getWorldDirection(_f);
    this.headingRad = Math.atan2(_f.x, -_f.z);
    const heading = ((this.headingRad * 180) / Math.PI + 360) % 360;
    this.compassInner.style.transform = `translateX(${-heading * this.compassW}px)`;
    if (this.wpt) { const dx = this.wpt.x - cam.position.x, dz = this.wpt.z - cam.position.z; const b = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360; let d = ((b - heading + 540) % 360) - 180; this.wpMark.style.display = 'block'; this.wpMark.style.left = (heading + d) * this.compassW + 'px'; } else this.wpMark.style.display = 'none';
    // ---- bottom-left ----
    if (this.spT > 0.05) {
      this.spT = 0;
      this.drawMinimap(g, prof);
    }
    if (this._streetT === undefined || (this._streetT += dt) > 0.6) {
      this._streetT = 0;
      const d = g.world.districtAt(P.x, P.z), name = g.world.roads?.nearestStreetName?.(P.x, P.z) || d.short || d.name;
      if (this.street.firstChild.textContent !== name) this.street.firstChild.textContent = name;
      const sub = d.name || ''; if (this.street.lastChild.textContent !== sub) this.street.lastChild.textContent = sub;
    }
    // ---- bottom-right ----
    this.br.style.display = v ? '' : 'none';
    if (v) this.updateSpeedo(v, dt, prof);
    this.hint.style.display = prof.settings.general.hints ? '' : 'none';
    // prompts
    this.updatePrompt(g, P, v);
  }

  updateObjective() {
    const m = this.app.missions?.active;
    if (!m) { this.objective.classList.add('hide'); return; }
    this.objective.classList.remove('hide');
    this.objective.replaceChildren(h('div', { class: 'ot' }, m.title), h('div', { class: 'od' }, m.text || ''), m.progress != null ? bar(m.progress, '', 'op') : null);
  }

  updatePrompt(g, P, v) {
    if (P.busy || this.app.mode !== 'play') { this.setPrompt(null); return; }
    const ip = this.app.interiors?.prompt;
    if (ip) { this.setPrompt(ip.key, ip.text); return; }
    if (v) { this.setPrompt(null); return; }
    const cand = g.nearestVehicle(P.x, P.z, 5.2);
    const tc = g.traffic.nearestCar(P.x, P.z, 4.4);
    const key = g.input.binds.enter?.[0]?.replace('Key', '') || 'F';
    if (cand) this.setPrompt(key, `${cand.isBoat ? 'Board' : cand.isAir ? 'Fly' : 'Enter'} ${cand.def.brand} ${cand.def.name}`);
    else if (tc && tc.speed < 1.5) this.setPrompt(key, tc.parkedRef || tc.state === 'parked' ? `Take ${tc.def.brand} ${tc.def.name}` : 'Take vehicle');
    else this.setPrompt(null);
  }

  updateSpeedo(v, dt, prof) {
    const p = v.phys;
    const u = this.units;
    const sailing = !!p.sail, sp = p.speed * (sailing ? 1.94384 : u === 'mph' ? 2.23694 : 3.6);
    this.speedoSmooth += (sp - this.speedoSmooth) * Math.min(1, dt * 12);
    this.rpmSmooth += ((sailing ? p.sailPow * p.redline : p.rpm) - this.rpmSmooth) * Math.min(1, dt * (sailing ? 4 : 16));
    this.kmh.textContent = sailing ? this.speedoSmooth.toFixed(1) : Math.round(this.speedoSmooth);
    this.windDial.update(sailing ? v : null, this.app.game);
    this.unit.textContent = v.isAir ? `${u === 'mph' ? 'MPH' : 'KM/H'}  ALT ${Math.round(p.agl)}m  THR ${Math.round(p.thr * 100)}%` : sailing ? 'KNOTS' : u === 'mph' ? 'MPH' : 'KM/H';
    this.gear.textContent = sailing && !p.engineOn ? 'SAIL' : !p.engineOn ? 'OFF' : p.gear < 0 ? 'R' : p.speed < 0.3 && p.gear === 1 ? 'N' : v.isAir ? 'A' : v.isBoat ? 'F' : p.manual ? 'M' + p.gear : String(p.gear);
    this.gear.style.color = p.limiter ? '#e5383b' : '';
    const F = this.flags, L = v.lights;
    F.lights.classList.toggle('on', !!L.head); F.ind.classList.toggle('on', !!(L.indL || L.indR)); F.haz.classList.toggle('on', !!L.hazard);
    F.abs.classList.toggle('on', !!p.abs); F.tc.classList.toggle('on', !!p.tc); F.dmg.classList.toggle('on', v.damage.total > 0.25);
    this.nitro.style.display = sailing ? 'none' : '';
    this.nitro.firstChild.style.width = p.nitro * 100 + '%';
    this.nitro.style.opacity = p.nitro < 0.999 || p.nitroOn ? 1 : 0.35;
    const d = p.drift;
    if (d.active || d.chain > 0) { this.driftBox.classList.remove('hide', 'bank'); this.driftBox.firstChild.textContent = fmt.num(d.chain) + (d.mult > 1 ? ` x${d.mult.toFixed(1)}` : ''); this.driftBox.lastChild.textContent = d.active ? 'Drift' : 'Combo'; this.bankT = 0; }
    else if (d.lastBank > 0 && this.bankT < 2) { this.bankT += dt; this.driftBox.classList.remove('hide'); this.driftBox.classList.add('bank'); this.driftBox.firstChild.textContent = '+' + fmt.num(d.lastBank); this.driftBox.lastChild.textContent = 'Banked'; }
    else this.driftBox.classList.add('hide');
    this.drawSpeedo(p, u);
  }

  drawSpeedo(p, u) {
    const c = this.spCanvas, x = c.getContext('2d'), W = c.width, H = c.height;
    x.clearRect(0, 0, W, H);
    x.save(); x.scale(2, 2);
    const cx = 134, cy = 118, r = 96;
    const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22, span = a1 - a0;
    x.lineCap = 'round';
    x.lineWidth = 9; x.strokeStyle = 'rgba(255,255,255,0.1)'; x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke();
    const rl = p.redline, k = clamp(this.rpmSmooth / (rl * 1.08), 0, 1);
    const rs = (rl / (rl * 1.08));
    // redline zone
    x.strokeStyle = 'rgba(229,56,59,0.35)'; x.beginPath(); x.arc(cx, cy, r, a0 + span * rs * 0.9, a1); x.stroke();
    const grad = x.createLinearGradient(cx - r, cy, cx + r, cy); grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.7, '#dfe6ee'); grad.addColorStop(1, '#e5383b');
    x.strokeStyle = k > rs * 0.9 ? '#e5383b' : grad; x.lineWidth = 9;
    if (k > 0.005) { x.beginPath(); x.arc(cx, cy, r, a0, a0 + span * k); x.stroke(); }
    // ticks
    x.lineWidth = 2;
    for (let i = 0; i <= 10; i++) { const a = a0 + (span * i) / 10, big = i % 2 === 0; x.strokeStyle = i / 10 > rs * 0.9 ? 'rgba(229,56,59,0.9)' : 'rgba(255,255,255,0.45)'; x.beginPath(); x.moveTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); x.lineTo(cx + Math.cos(a) * (r - (big ? 22 : 18)), cy + Math.sin(a) * (r - (big ? 22 : 18))); x.stroke(); }
    // small labels (x1000 rpm)
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.font = '600 11px Barlow Condensed, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const step = rl > 9000 ? 2 : 1; if (!p.sail) for (let i = 0; i * 1000 * step <= rl * 1.08; i++) { const a = a0 + (span * (i * 1000 * step)) / (rl * 1.08); x.fillText(String(i * step), cx + Math.cos(a) * (r - 34), cy + Math.sin(a) * (r - 34)); }
    x.restore();
    void u;
  }

  drawMinimap(g, prof) {
    if (!this.mapCanvas) return;
    const c = this.mmCanvas, x = c.getContext('2d'), S = c.width;
    const P = g.player, v = P.vehicle;
    const px = v ? v.x : P.x, pz = v ? v.z : P.z;
    const rot = prof.settings.general.minimapRotate;
    const sp = v ? v.speed : 0;
    const zt = 1.15 - smoothstep(5, 45, sp) * 0.5;
    this.mmZoom += (zt - this.mmZoom) * 0.05;
    const zoom = this.mmZoom * (S / 200) * 1.0;
    const hd = this.headingRad || 0;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#0b0e12'; x.fillRect(0, 0, S, S);
    x.save();
    x.translate(S / 2, S / 2);
    if (rot) x.rotate(-hd);
    x.scale(zoom, zoom);
    const mx = (px - MAP.x0) * MAP.scale, mz = (pz - MAP.z0) * MAP.scale;
    x.translate(-mx, -mz);
    x.drawImage(this.mapCanvas, 0, 0);
    // blips
    const dot = (X, Z, col, r = 4, ring = false) => { const bx = (X - MAP.x0) * MAP.scale, bz = (Z - MAP.z0) * MAP.scale; x.fillStyle = col; x.beginPath(); x.arc(bx, bz, r / zoom * 1.4, 0, 7); x.fill(); if (ring) { x.strokeStyle = '#000'; x.lineWidth = 1.2 / zoom; x.stroke(); } };
    const poi = g.world.poi;
    dot(poi.garage.x, poi.garage.z, BLIP.garage, 4, true); dot(poi.dealer.x, poi.dealer.z, BLIP.dealer, 4, true); dot(poi.police.x, poi.police.z, BLIP.police, 4, true); dot(poi.safehouse.x, poi.safehouse.z, BLIP.home, 4, true);
    for (const b of this.app.blips?.() || []) dot(b.x, b.z, b.color || BLIP.mission, b.r || 4, true);
    if (this.wpt) dot(this.wpt.x, this.wpt.z, BLIP.waypoint, 5, true);
    for (const car of g.traffic.cars) if (car.role === 'police' || car.def.livery === 'police') dot(car.x, car.z, '#3b82f6', 3.2);
    x.restore();
    // edge fade + player arrow
    x.save(); x.translate(S / 2, S / 2);
    x.rotate(rot ? 0 : hd);
    x.fillStyle = '#fff'; x.strokeStyle = '#111'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -13); x.lineTo(9, 10); x.lineTo(0, 5); x.lineTo(-9, 10); x.closePath(); x.fill(); x.stroke();
    x.restore();
  }
}
