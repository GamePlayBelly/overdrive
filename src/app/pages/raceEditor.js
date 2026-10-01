import { h, icon, fmt, btn, toast, chip, select } from '../ui.js';
import { MAP, worldToMap, mapToWorld, BLIP } from '../../ui/mapRender.js';
import { DISTRICTS, WATER_LEVEL } from '../../data/world.js';

const MAX = 18, MIN_GAP = 40;

export const legLength = (pts, loop) => { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (loop && pts.length > 2) d += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]); return d * 1.22; };

// Map editor for custom races: click to add a checkpoint (snaps to the road), drag to move, right click to remove.
export const raceEditorPage = {
  title: 'Race Creator',
  flush: true,
  render(app, ctx) {
    const g = app.game, P = g.player, st = app.store;
    const src = ctx.opts.id ? app.profile.customRaces.find((r) => r.id === ctx.opts.id) : null;
    const race = src ? structuredClone(src) : { id: null, name: 'My race', pts: [], laps: 1, rivals: 2 };
    ctx.setSub(src ? 'Editing ' + src.name : 'New race');
    ctx.setHelp([['Click', 'Add checkpoint'], ['Drag', 'Move point'], ['Right click', 'Remove'], ['Wheel', 'Zoom']]);
    const wrap = h('div', { class: 'map-wrap', style: 'height:calc(100vh - 230px);margin:0 30px;width:auto' });
    const cv = h('canvas'); wrap.appendChild(cv);
    const first = race.pts[0];
    const view = { cx: ((first ? first[0] : P.x) - MAP.x0) * MAP.scale, cz: ((first ? first[1] : P.z) - MAP.z0) * MAP.scale, z: 0.62 };
    let W = 800, H = 500, raf = 0, dragging = false, moved = 0, last = null, dragIdx = -1, hover = -1;
    const stats = h('div', { class: 'row wrap', style: 'gap:8px' });
    const name = h('input', { class: 'txt', value: race.name, maxlength: 28, style: 'min-width:220px', on: { input: () => { race.name = name.value; } } });
    const laps = select([[1, '1 lap'], [2, '2 laps'], [3, '3 laps'], [4, '4 laps'], [5, '5 laps']], race.laps, (v) => { race.laps = +v; paintStats(); });
    const rivals = select([[0, 'Time trial'], [1, '1 rival'], [2, '2 rivals'], [3, '3 rivals'], [4, '4 rivals'], [5, '5 rivals']], race.rivals, (v) => { race.rivals = +v; });
    const problem = () => (race.pts.length < 3 ? 'Add at least 3 checkpoints' : race.pts.some((p, i) => i && Math.hypot(p[0] - race.pts[i - 1][0], p[1] - race.pts[i - 1][1]) < MIN_GAP) ? `Keep checkpoints at least ${MIN_GAP} m apart` : !race.name.trim() ? 'Give the race a name' : null);
    const paintStats = () => {
      const len = legLength(race.pts, race.laps > 1), bad = problem();
      stats.replaceChildren(...[chip(`${race.pts.length} / ${MAX} checkpoints`, race.pts.length >= 3 ? 'green' : '', 'flag'), chip(`${(len / 1000).toFixed(1)} km${race.laps > 1 ? ' per lap' : ''}`, 'blue', 'nav'), chip(`About ${fmt.time((len * race.laps) / 19)}`, '', 'clock'), bad ? chip(bad, 'red', 'lock') : null].filter(Boolean));
      saveBtn.disabled = testBtn.disabled = !!bad;
    };
    const save = () => {
      const bad = problem();
      if (bad) { toast({ title: 'Cannot save', sub: bad, kind: 'red', icon: 'x' }); return null; }
      const r = st.act({ type: 'saveRace', race: { id: race.id, name: race.name.trim(), pts: race.pts, laps: race.laps, rivals: race.rivals } });
      if (!r.ok) { toast({ title: 'Cannot save', sub: r.error, kind: 'red', icon: 'x' }); return null; }
      const id = r.grants.find((q) => q.type === 'race')?.id;
      race.id = id;
      return id;
    };
    const saveBtn = btn('Save', { kind: 'primary', sm: true, icon: 'check', on: () => { if (save()) { toast({ title: 'Race saved', sub: race.name, kind: 'green', icon: 'flag' }); ctx.menu.go('missions', { tab: 'custom' }); } } });
    const testBtn = btn('Save and race', { sm: true, icon: 'play', on: () => { const id = save(); if (id) { app.closeMenu(); app.startCustomRace(id); } } });
    const bar = h('div', { class: 'row wrap', style: 'padding:0 30px 12px;gap:10px' }, name, laps, rivals,
      btn('Undo', { sm: true, icon: 'back', on: () => { race.pts.pop(); paintStats(); } }), btn('Clear', { sm: true, icon: 'x', on: () => { race.pts.length = 0; paintStats(); } }),
      h('span', { class: 'grow' }), saveBtn, testBtn, btn('Back', { sm: true, on: () => ctx.menu.go('missions', { tab: 'custom' }) }));
    const tools = h('div', { class: 'map-tools' },
      btn('', { icon: 'plus', sm: true, on: () => { view.z = Math.min(3, view.z * 1.35); } }), btn('', { icon: 'minus', sm: true, on: () => { view.z = Math.max(0.16, view.z / 1.35); } }),
      btn('', { icon: 'nav', sm: true, title: 'Center on player', on: () => { view.cx = (P.x - MAP.x0) * MAP.scale; view.cz = (P.z - MAP.z0) * MAP.scale; } }));
    wrap.append(tools);
    const resize = () => { const r = wrap.getBoundingClientRect(); W = Math.max(300, r.width); H = Math.max(240, r.height); cv.width = W * devicePixelRatio; cv.height = H * devicePixelRatio; };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const x = cv.getContext('2d'), dpr = devicePixelRatio, s = 1 / view.z;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = '#0a0d11'; x.fillRect(0, 0, W, H);
      x.save(); x.translate(W / 2, H / 2); x.scale(view.z, view.z); x.translate(-view.cx, -view.cz);
      x.drawImage(app.mapCanvas, 0, 0);
      x.font = `700 ${Math.round(14 / view.z)}px 'Barlow Condensed', sans-serif`; x.textAlign = 'center';
      if (view.z < 1.3) for (const D of DISTRICTS) { if (!D.x0) continue; const [a, b] = worldToMap((D.x0 + D.x1) / 2, (D.z0 + D.z1) / 2); x.fillStyle = 'rgba(255,255,255,0.45)'; x.fillText(D.short.toUpperCase(), a, b); }
      const pm = race.pts.map((p) => worldToMap(p[0], p[1]));
      if (pm.length > 1) {
        x.lineJoin = 'round'; x.lineCap = 'round';
        x.strokeStyle = 'rgba(0,0,0,0.75)'; x.lineWidth = 7 * s; x.beginPath(); pm.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); if (race.laps > 1 && pm.length > 2) x.lineTo(pm[0][0], pm[0][1]); x.stroke();
        x.strokeStyle = '#ffc94a'; x.lineWidth = 3.4 * s; x.beginPath(); pm.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
        if (race.laps > 1 && pm.length > 2) { x.setLineDash([9 * s, 7 * s]); x.beginPath(); x.moveTo(pm[pm.length - 1][0], pm[pm.length - 1][1]); x.lineTo(pm[0][0], pm[0][1]); x.stroke(); x.setLineDash([]); }
        for (let i = 1; i < pm.length; i++) { const [a0, b0] = pm[i - 1], [a1, b1] = pm[i], am = (a0 + a1) / 2, bm = (b0 + b1) / 2, an = Math.atan2(b1 - b0, a1 - a0); x.save(); x.translate(am, bm); x.rotate(an); x.fillStyle = '#ffc94a'; x.strokeStyle = '#000'; x.lineWidth = 1.2 * s; x.beginPath(); x.moveTo(6 * s, 0); x.lineTo(-4 * s, 5 * s); x.lineTo(-4 * s, -5 * s); x.closePath(); x.fill(); x.stroke(); x.restore(); }
      }
      x.textBaseline = 'middle'; x.font = `700 ${Math.round(12 * s)}px Inter, sans-serif`;
      pm.forEach(([a, b], i) => { x.fillStyle = i === 0 ? '#34c07a' : '#ffc94a'; x.beginPath(); x.arc(a, b, (i === hover || i === dragIdx ? 11 : 9) * s, 0, 7); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 2 * s; x.stroke(); x.fillStyle = '#000'; x.fillText(i === 0 ? 'S' : String(i + 1), a, b + 0.5 * s); });
      const pv = g.player.vehicle || g.player; const [pa, pb] = worldToMap(pv.x, pv.z);
      x.save(); x.translate(pa, pb); x.rotate(-(pv.yaw ?? 0) + Math.PI); x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2 * s; x.beginPath(); x.moveTo(0, -12 * s); x.lineTo(8 * s, 9 * s); x.lineTo(0, 4 * s); x.lineTo(-8 * s, 9 * s); x.closePath(); x.fill(); x.stroke(); x.restore();
      x.restore();
    };
    const toWorld = (ex, ey) => { const r = cv.getBoundingClientRect(), px = ex - r.left, py = ey - r.top; return mapToWorld((px - W / 2) / view.z + view.cx, (py - H / 2) / view.z + view.cz); };
    const pickIdx = (ex, ey) => { const [wx, wz] = toWorld(ex, ey), rad = 13 / view.z / MAP.scale; let best = -1, bd = rad; race.pts.forEach((p, i) => { const d = Math.hypot(p[0] - wx, p[1] - wz); if (d < bd) { bd = d; best = i; } }); return best; };
    const snap = (wx, wz) => {
      if (g.world.terrain.height(wx, wz) < WATER_LEVEL + 0.5) return null;
      const n = g.world.roads.nearestLane(wx, wz, 0, 0, null, 26);
      return n ? [Math.round(n.x), Math.round(n.z)] : [Math.round(wx), Math.round(wz)];
    };
    cv.addEventListener('pointerdown', (e) => { if (e.button === 2) return; dragging = true; moved = 0; last = [e.clientX, e.clientY]; dragIdx = pickIdx(e.clientX, e.clientY); wrap.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (dragging) {
        const dx = e.clientX - last[0], dy = e.clientY - last[1]; moved += Math.abs(dx) + Math.abs(dy); last = [e.clientX, e.clientY];
        if (dragIdx >= 0 && moved > 4) { const [wx, wz] = toWorld(e.clientX, e.clientY), q = snap(wx, wz); if (q) { race.pts[dragIdx] = q; paintStats(); } }
        else if (dragIdx < 0) { view.cx -= dx / view.z; view.cz -= dy / view.z; }
      } else hover = pickIdx(e.clientX, e.clientY);
    });
    cv.addEventListener('pointerup', (e) => {
      const was = dragIdx; dragging = false; dragIdx = -1; wrap.classList.remove('drag');
      if (moved < 5 && was < 0 && e.button === 0) {
        if (race.pts.length >= MAX) { toast({ title: 'Checkpoint limit reached', sub: `${MAX} is the maximum`, icon: 'flag', ms: 1600 }); return; }
        const [wx, wz] = toWorld(e.clientX, e.clientY), q = snap(wx, wz);
        if (!q) { toast({ title: 'Checkpoints must be on land', kind: 'red', icon: 'x', ms: 1600 }); return; }
        race.pts.push(q); paintStats();
      }
    });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); const i = pickIdx(e.clientX, e.clientY); if (i >= 0) { race.pts.splice(i, 1); paintStats(); } });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const k = e.deltaY < 0 ? 1.18 : 1 / 1.18; view.z = Math.max(0.16, Math.min(3, view.z * k)); }, { passive: false });
    const el = h('div', null, h('div', { style: 'padding:6px 30px 10px' }, stats), bar, wrap);
    paintStats();
    requestAnimationFrame(() => { resize(); draw(); });
    addEventListener('resize', resize);
    return { el, dispose() { cancelAnimationFrame(raf); removeEventListener('resize', resize); } };
  },
};
void icon; void BLIP;
