import { h, icon, fmt, btn, toast, chip } from '../ui.js';
import { MAP, worldToMap, mapToWorld, BLIP } from '../../ui/mapRender.js';
import { DISTRICTS, SPAWNS } from '../../data/world.js';
import { COLLECTIBLES, HIDDEN_LOCATIONS } from '../../data/meta.js';

const LEGEND = [['garage', 'Garage', BLIP.garage], ['dealer', 'Dealership', BLIP.dealer], ['police', 'Police', BLIP.police], ['home', 'Safehouse', BLIP.home], ['mission', 'Mission', BLIP.mission], ['collect', 'Collectible', BLIP.collect], ['waypoint', 'Waypoint', BLIP.waypoint]];

export const worldPage = {
  title: 'World Map',
  flush: true,
  render(app, ctx) {
    const g = app.game, P = g.player;
    ctx.setSub('Riverton County');
    ctx.setHelp([['Drag', 'Pan'], ['Wheel', 'Zoom'], ['Click', 'Set waypoint']]);
    const wrap = h('div', { class: 'map-wrap', style: 'height:calc(100vh - 150px);margin:10px 30px;width:auto' });
    const cv = h('canvas'); wrap.appendChild(cv);
    const view = { cx: (P.x - MAP.x0) * MAP.scale, cz: (P.z - MAP.z0) * MAP.scale, z: 0.62, target: null };
    let W = 800, H = 500, raf = 0, dragging = false, moved = 0, last = null, sel = null, hover = null;
    const info = h('div', { class: 'map-info hide' });
    const tools = h('div', { class: 'map-tools' },
      btn('', { icon: 'plus', sm: true, on: () => { view.z = Math.min(3, view.z * 1.35); } }), btn('', { icon: 'minus', sm: true, on: () => { view.z = Math.max(0.16, view.z / 1.35); } }),
      btn('', { icon: 'nav', sm: true, title: 'Center on player', on: () => { view.cx = (P.x - MAP.x0) * MAP.scale; view.cz = (P.z - MAP.z0) * MAP.scale; } }));
    const legend = h('div', { class: 'map-legend' }, LEGEND.map(([, n, c]) => h('span', null, h('i', { style: { background: c } }), n)));
    wrap.append(tools, legend, info);
    const points = () => {
      const poi = g.world.poi, out = [];
      for (const [k, v] of Object.entries(poi)) out.push({ id: k, x: v.x, z: v.z, name: v.name, color: v.icon === 'garage' ? BLIP.garage : v.icon === 'dealer' ? BLIP.dealer : v.icon === 'police' ? BLIP.police : v.icon === 'home' ? BLIP.home : v.icon === 'meet' ? BLIP.event : '#8fd3ff', r: 6 });
      for (const b of app.blips()) out.push({ ...b, id: b.id || 'b', r: 6 });
      for (const u of g.police.units) out.push({ id: 'cop' + u.id, x: u.v.x, z: u.v.z, name: 'Police unit', color: '#3b82f6', r: 5 });
      for (const c of g.traffic.cars) if (c.role === 'police' || c.def.livery === 'police') out.push({ id: 'pc' + c.id, x: c.x, z: c.z, name: 'Police car', color: '#60a5fa', r: 4 });
      for (const c of COLLECTIBLES) if (app.profile.collectibles.includes(c.id) === false && app.profile.discovered.includes('seen_' + c.id)) out.push({ id: c.id, x: c.x, z: c.z, name: c.name, color: BLIP.collect, r: 5 });
      for (const hl of HIDDEN_LOCATIONS) if (app.profile.discovered.includes(hl.id)) out.push({ id: hl.id, x: hl.x, z: hl.z, name: hl.name, color: '#c77dff', r: 5 });
      return out;
    };
    const resize = () => { const r = wrap.getBoundingClientRect(); W = Math.max(300, r.width); H = Math.max(240, r.height); cv.width = W * devicePixelRatio; cv.height = H * devicePixelRatio; };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const x = cv.getContext('2d'), dpr = devicePixelRatio;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = '#0a0d11'; x.fillRect(0, 0, W, H);
      x.save(); x.translate(W / 2, H / 2); x.scale(view.z, view.z); x.translate(-view.cx, -view.cz);
      x.drawImage(app.mapCanvas, 0, 0);
      x.font = `700 ${Math.round(14 / view.z)}px 'Barlow Condensed', sans-serif`; x.textAlign = 'center';
      if (view.z < 1.3) for (const D of DISTRICTS) { if (!D.x0) continue; const [a, b] = worldToMap((D.x0 + D.x1) / 2, (D.z0 + D.z1) / 2); x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillText(D.short.toUpperCase(), a, b); }
      const pts = points();
      const s = 1 / view.z;
      for (const p of pts) { const [a, b] = worldToMap(p.x, p.z); x.fillStyle = p.color; x.beginPath(); x.arc(a, b, p.r * s, 0, 7); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1.5 * s; x.stroke(); if (hover === p || sel === p) { x.strokeStyle = '#fff'; x.lineWidth = 2 * s; x.beginPath(); x.arc(a, b, (p.r + 4) * s, 0, 7); x.stroke(); } }
      if (app.wpt) { const [a, b] = worldToMap(app.wpt.x, app.wpt.z); x.fillStyle = BLIP.waypoint; x.beginPath(); x.moveTo(a, b); x.lineTo(a - 7 * s, b - 18 * s); x.lineTo(a + 7 * s, b - 18 * s); x.closePath(); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1.5 * s; x.stroke(); }
      const pv = g.player.vehicle || g.player; const [pa, pb] = worldToMap(pv.x, pv.z);
      x.save(); x.translate(pa, pb); x.rotate(-(pv.yaw ?? 0) + Math.PI); x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2 * s; x.beginPath(); x.moveTo(0, -12 * s); x.lineTo(8 * s, 9 * s); x.lineTo(0, 4 * s); x.lineTo(-8 * s, 9 * s); x.closePath(); x.fill(); x.stroke(); x.restore();
      x.restore();
    };
    const toWorld = (ex, ey) => { const r = cv.getBoundingClientRect(); const px = ex - r.left, py = ey - r.top; return mapToWorld((px - W / 2) / view.z + view.cx, (py - H / 2) / view.z + view.cz); };
    const pick = (ex, ey) => { const [wx, wz] = toWorld(ex, ey); let best = null, bd = (14 / view.z / MAP.scale); for (const p of points()) { const d = Math.hypot(p.x - wx, p.z - wz); if (d < bd) { bd = d; best = p; } } return best; };
    const showInfo = (p) => {
      sel = p;
      if (!p) { info.classList.add('hide'); return; }
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      info.classList.remove('hide'); info.replaceChildren(h('div', { class: 'bold' }, p.name || 'Location'), h('div', { class: 'dim sm', style: 'margin:2px 0 10px' }, `${fmt.dist(d, app.units)} away`),
        h('div', { class: 'row' }, btn('Set waypoint', { sm: true, kind: 'primary', on: () => { app.setWaypoint({ x: p.x, z: p.z }); toast({ title: 'Waypoint set', sub: p.name, kind: 'blue', icon: 'flag', ms: 1800 }); } }), (p.id === 'garage' || p.id === 'safehouse') ? btn('Travel', { sm: true, on: () => app.fastTravel(p.x, p.z, p.heading || 0) }) : null));
    };
    cv.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; last = [e.clientX, e.clientY]; wrap.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (dragging) { const dx = e.clientX - last[0], dy = e.clientY - last[1]; moved += Math.abs(dx) + Math.abs(dy); view.cx -= dx / view.z; view.cz -= dy / view.z; last = [e.clientX, e.clientY]; } else hover = pick(e.clientX, e.clientY); });
    cv.addEventListener('pointerup', (e) => { dragging = false; wrap.classList.remove('drag'); if (moved < 5) { const p = pick(e.clientX, e.clientY); if (p) showInfo(p); else { const [wx, wz] = toWorld(e.clientX, e.clientY); app.setWaypoint({ x: wx, z: wz }); showInfo({ id: 'wp', x: wx, z: wz, name: 'Waypoint' }); } } });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const k = e.deltaY < 0 ? 1.18 : 1 / 1.18; view.z = Math.max(0.16, Math.min(3, view.z * k)); }, { passive: false });
    const travel = h('div', { class: 'row wrap', style: 'padding:0 30px' }, h('span', { class: 'dim sm' }, 'Fast travel'), SPAWNS.map((s) => btn(s.label.split('—')[0].trim(), { sm: true, on: () => app.fastTravel(s.x, s.z, s.heading) })), h('span', { class: 'end' }), chip('Set a waypoint to get a GPS route', '', 'nav'));
    const el = h('div', null, travel, wrap);
    requestAnimationFrame(() => { resize(); draw(); });
    addEventListener('resize', resize);
    return { el, dispose() { cancelAnimationFrame(raf); removeEventListener('resize', resize); } };
  },
};
void icon;
