import { h, icon, fmt, btn, bar, tabs, toast, confirm, sect, slider } from '../ui.js';
import { stageLayout } from './creator.js';
import { thumbEl, itemState } from './common.js';
import { VEHICLE_BY_ID, vehicleStats } from '../../data/vehicles.js';
import { COSMETICS, PAINT_FINISHES, PAINT_SWATCHES, ALL_ITEMS } from '../../data/items.js';
import { PERF_PARTS, PART_LEVELS, GARAGE_TIERS } from '../../data/progression.js';
import { customizeCost, findVehicle, vehicleValue, repairCost, capacity } from '../../game/economy.js';
import { randomPlate } from '../../vehicles/carMesh.js';

export const garagePage = {
  title: 'Garage',
  stage: true,
  render(app, ctx) {
    const st = app.store, stage = app.stage;
    let uid = ctx.opts.uid || st.profile.garage.selected;
    let tab = ctx.opts.tab || 'paint';
    let pending = {};
    let open = { L: false, hood: false, trunk: false };
    const P = () => st.profile;
    const V = () => findVehicle(P(), uid) || P().garage.vehicles[0];
    const def = () => VEHICLE_BY_ID[V().model];
    ctx.setSub(`${P().garage.vehicles.length} / ${capacity(P())} vehicles  -  ${GARAGE_TIERS[P().garage.tier].name}`);
    ctx.setHelp([['Drag', 'Rotate'], ['Wheel', 'Zoom']]);
    stage.frame(-1.5); stage.auto = 0.18;

    const rebuild = (keepView = true) => {
      const v = V(), yaw = stage.tYaw, pitch = stage.tPitch, dist = stage.tDist;
      stage.showCar(def(), { ...v.custom, ...pending, perf: v.perf }, { open: Object.keys(open).filter((k) => open[k]), lights: true });
      if (keepView) { stage.tYaw = stage.yaw = yaw; stage.tPitch = stage.pitch = pitch; stage.tDist = stage.dist = dist; }
      for (const k of ['L', 'hood', 'trunk']) stage.panelT[k] = open[k] ? 1 : 0;
    };
    const cur = (k) => (k in pending ? pending[k] : V().custom[k]);
    const setPending = (k, val) => { if (JSON.stringify(V().custom[k]) === JSON.stringify(val)) delete pending[k]; else pending[k] = val; rebuild(); draw(); };

    const content = h('div');
    const costBar = h('div', { class: 'preview-tools' });
    app.menu.el.appendChild(costBar);

    const drawCost = () => {
      costBar.replaceChildren();
      const v = V();
      const cost = Object.keys(pending).length ? customizeCost(P(), v, pending) : { total: 0, lines: [] };
      if (Object.keys(pending).length) {
        costBar.append(
          h('div', { class: 'pill' }, cost.error ? h('span', { class: 'red' }, cost.error) : h('span', null, `Changes: ${fmt.money(cost.total)}`)),
          btn('Discard', { on: () => { pending = {}; rebuild(); draw(); } }),
          btn(`Apply  ${fmt.money(cost.total || 0)}`, { kind: 'primary', icon: 'check', disabled: !!cost.error, on: () => {
            const r = st.act({ type: 'customize', uid, changes: pending });
            if (r.ok) { toast({ title: 'Customization applied', sub: fmt.money(cost.total), kind: 'green', icon: 'wrench' }); pending = {}; app.game.audio.ui('buy'); rebuild(); draw(); } else toast({ title: 'Cannot apply', sub: r.error, icon: 'x' });
          } }));
      }
      costBar.append(
        btn(open.L ? 'Close door' : 'Open door', { on: () => { open.L = !open.L; stage.setPanel('L', open.L ? 1 : 0); draw(); } }),
        btn(open.hood ? 'Close hood' : 'Hood', { on: () => { open.hood = !open.hood; stage.setPanel('hood', open.hood ? 1 : 0); draw(); } }),
        btn(open.trunk ? 'Close trunk' : 'Trunk', { on: () => { open.trunk = !open.trunk; stage.setPanel('trunk', open.trunk ? 1 : 0); draw(); } }));
    };

    // ---- helpers ----
    const partGrid = (slot, none = 'Stock') => {
      const items = COSMETICS.filter((c) => c.slot === slot);
      const box = h('div', { class: 'opt-grid', style: 'gap:8px' });
      const val = cur(slot);
      const mk = (label, sub, on, active, locked) => h('button', { class: 'opt' + (active ? ' on' : ''), style: locked ? 'opacity:0.55' : '', on: { click: on } }, h('div', { style: 'text-align:left' }, h('div', null, label), sub ? h('div', { class: 'dim', style: 'font-size:11px;margin-top:1px' }, sub) : null));
      box.appendChild(mk(none, 'Free', () => setPending(slot, null), val == null || val === 'none'));
      for (const it of items) { const s = itemState(P(), it); box.appendChild(mk(it.name, s.state === 'owned' || it.source === 'default' || it.source === 'shop' ? fmt.money(it.price) : s.text, () => { if (s.state === 'locked') { toast({ title: it.name, sub: s.text, icon: 'lock' }); return; } setPending(slot, it.value); }, val === it.value, s.state === 'locked')); }
      return box;
    };
    const colorRow = (key, colors) => h('div', { class: 'row wrap', style: 'gap:8px' }, colors.map((c) => h('button', { class: 'swatch' + (cur(key) === c ? ' on' : ''), style: { background: c }, on: { click: () => setPending(key, c) } })),
      h('input', { type: 'color', value: cur(key) || '#ffffff', style: 'width:34px;height:28px;border:0;background:none;padding:0', on: { change: (e) => setPending(key, e.target.value) } }));

    const panels = {
      paint: () => {
        const v = V(), d = def();
        return h('div', null,
          sect('Color', '$300'), colorRow('color', [...PAINT_SWATCHES, ...d.colors]),
          sect('Finish'),
          h('div', { class: 'opt-grid' }, PAINT_FINISHES.map((f) => { const locked = f.unlock && !P().inventory.includes(f.unlock); return h('button', { class: 'opt' + (cur('finish') === f.id ? ' on' : ''), style: locked ? 'opacity:0.55' : '', on: { click: () => { if (locked) { toast({ title: f.name, sub: 'Unlocked by leveling up', icon: 'lock' }); return; } setPending('finish', f.id); } } }, `${f.name}  ${fmt.money(f.price)}`); })),
          sect('Livery'), partGrid('decal', 'None'),
          cur('decal') ? h('div', null, h('div', { class: 'dim sm', style: 'margin:10px 0 6px' }, 'Livery color'), colorRow('decalColor', ['#f2f2f0', '#111111', '#e5383b', '#1d4f91', '#e6c229', '#2e8b57', '#6b3fa0', '#d3431f'])) : null,
          cur('decal') === 'number' || cur('decal') === 'rally' ? h('div', { class: 'row', style: 'margin-top:10px' }, h('span', { class: 'dim sm' }, 'Race number'), h('input', { class: 'txt', value: cur('number') || '27', maxlength: 3, style: 'min-width:0;width:70px', on: { change: (e) => setPending('number', e.target.value) } })) : null,
          void v);
      },
      wheels: () => h('div', null,
        sect('Rims'), partGrid('rims', 'Stock'),
        sect('Rim color'), h('div', { class: 'opt-grid' }, ['#c9ccd0', '#1b1c1e', '#c9a23a', '#e5383b', '#1d4f91'].map((c) => h('button', { class: 'swatch' + (cur('rimColor') === c ? ' on' : ''), style: { background: c }, on: { click: () => setPending('rimColor', c) } }))),
        sect('Wheel size', '$800'), h('div', { class: 'setting', style: 'padding:6px 0' }, h('div', { class: 'lbl' }, 'Diameter'), slider(0.9, 1.25, 0.01, cur('wheelScale') || 1, (x) => { pending.wheelScale = x; if (Math.abs(x - 1) < 0.005) delete pending.wheelScale; rebuild(); drawCost(); }, (x) => Math.round(x * 100) + '%'))),
      body: () => h('div', null, sect('Front'), h('div', { class: 'dim sm', style: 'margin-bottom:6px' }, 'Bumpers'), partGrid('bumper'), h('div', { class: 'dim sm', style: 'margin:12px 0 6px' }, 'Hood'), partGrid('hood'),
        sect('Rear'), h('div', { class: 'dim sm', style: 'margin-bottom:6px' }, 'Spoiler'), partGrid('spoiler', 'None'), h('div', { class: 'dim sm', style: 'margin:12px 0 6px' }, 'Exhaust'), partGrid('exhaust'),
        sect('Glass and trim'), h('div', { class: 'dim sm', style: 'margin-bottom:6px' }, 'Window tint'), partGrid('tint'), h('div', { class: 'dim sm', style: 'margin:12px 0 6px' }, 'Mirrors'), partGrid('mirrorColor')),
      parts: () => {
        const v = V(), d = def();
        const before = vehicleStats(d, v.perf), box = h('div');
        box.appendChild(sect('Performance', `Rating ${before.rating}`));
        box.appendChild(h('div', { class: 'card flat col' }, ['speed', 'accel', 'handling', 'braking'].map((k) => h('div', { class: 'stat' }, h('span', null, k[0].toUpperCase() + k.slice(1)), bar(before[k] / 10, 'blue'), h('b', null, before[k].toFixed(1))))));
        for (const [key, part] of Object.entries(PERF_PARTS)) {
          const tier = v.perf[key] || 0, next = tier + 1;
          const price = next <= 5 ? Math.round(part.prices[next] * (d.price > 80000 ? 1.6 : 1)) : 0;
          const lvl = PART_LEVELS[next] || 0;
          box.appendChild(h('div', { class: 'card flat', style: 'margin-top:10px' },
            h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, part.name), h('div', { class: 'dim sm' }, part.desc)), h('div', { class: 'row', style: 'gap:4px' }, [1, 2, 3, 4, 5].map((i) => h('span', { style: `width:14px;height:6px;border-radius:3px;background:${i <= tier ? 'var(--red)' : '#2c333b'}` })))),
            next <= 5 ? h('div', { class: 'row', style: 'margin-top:10px' }, h('span', { class: 'dim sm' }, P().level < lvl ? `Requires level ${lvl}` : `Tier ${next}`), btn(fmt.money(price), { sm: true, kind: 'primary', disabled: P().level < lvl, cls: 'end', on: () => { const r = st.act({ type: 'buyPart', uid, part: key, tier: next }); if (r.ok) { app.game.audio.ui('buy'); toast({ title: `${part.name} tier ${next}`, kind: 'green', icon: 'wrench' }); draw(); } else toast({ title: 'Cannot install', sub: r.error, icon: 'x' }); } })) : h('div', { class: 'green sm', style: 'margin-top:8px' }, 'Fully upgraded')));
        }
        return box;
      },
      details: () => {
        const v = V(), d = def();
        const plate = h('input', { class: 'txt', value: cur('plate') || 'NEW 2RVT', maxlength: 8, style: 'text-transform:uppercase;letter-spacing:2px;min-width:0;width:140px' });
        plate.addEventListener('change', () => setPending('plate', plate.value.toUpperCase()));
        const name = h('input', { class: 'txt', value: v.name || '', placeholder: `${d.brand} ${d.name}`, maxlength: 24, style: 'min-width:0;width:220px' });
        name.addEventListener('change', () => { st.act({ type: 'renameVehicle', uid, name: name.value }); draw(); });
        return h('div', null,
          sect('Identity'), h('div', { class: 'setting' }, h('div', { class: 'lbl' }, 'Nickname'), name), h('div', { class: 'setting' }, h('div', { class: 'lbl' }, 'License plate', h('small', null, '$150')), h('div', { class: 'row' }, plate, btn('Random', { sm: true, on: () => setPending('plate', randomPlate()) }))),
          h('div', { class: 'setting' }, h('div', { class: 'lbl' }, 'Favorite'), h('button', { class: 'toggle' + (v.favorite ? ' on' : ''), on: { click: () => { st.act({ type: 'favoriteVehicle', uid }); draw(); } } })),
          sect('Condition'),
          h('div', { class: 'card flat' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, `Damage ${(v.damage * 100) | 0}%`), h('div', { class: 'dim sm' }, `${fmt.dist(v.odometer || 0, app.units)} on the clock`)), btn(v.damage > 0 ? `Repair ${fmt.money(repairCost(v))}` : 'No damage', { sm: true, disabled: !(v.damage > 0), on: () => { const r = st.act({ type: 'repairVehicle', uid }); if (r.ok) { toast({ title: 'Repaired', kind: 'green', icon: 'wrench' }); draw(); } else toast({ title: 'Cannot repair', sub: r.error, icon: 'x' }); } }))),
          sect('Vehicle value'), h('div', { class: 'card flat' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, fmt.money(vehicleValue(v))), h('div', { class: 'dim sm' }, 'Selling returns 60% of value')), btn('Sell', { sm: true, on: async () => { if (P().garage.vehicles.length <= 1) { toast({ title: 'Keep at least one vehicle', icon: 'lock' }); return; } if (await confirm('Sell vehicle', `Sell the ${d.name} for ${fmt.money(vehicleValue(v) * 0.6)}?`, 'Sell')) { const r = st.act({ type: 'sellVehicle', uid }); if (r.ok) { uid = P().garage.selected; pending = {}; rebuild(false); draw(); } else toast({ title: 'Cannot sell', sub: r.error, icon: 'x' }); } } }))),
          sect('Garage'), h('div', { class: 'card flat' }, GARAGE_TIERS[P().garage.tier + 1] ? h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, GARAGE_TIERS[P().garage.tier + 1].name), h('div', { class: 'dim sm' }, `${GARAGE_TIERS[P().garage.tier + 1].capacity} vehicles  -  level ${GARAGE_TIERS[P().garage.tier + 1].level}`)), btn(fmt.money(GARAGE_TIERS[P().garage.tier + 1].price), { sm: true, kind: 'primary', on: () => { const r = st.act({ type: 'upgradeGarage' }); if (r.ok) { toast({ title: 'Garage upgraded', kind: 'green', icon: 'house' }); draw(); } else toast({ title: 'Cannot upgrade', sub: r.error, icon: 'x' }); } })) : h('div', { class: 'green' }, 'Garage fully upgraded')));
      },
    };

    const carousel = h('div', { class: 'row', style: 'gap:10px;overflow-x:auto;padding:4px 0 10px' });
    const draw = () => {
      const v = V();
      ctx.setSub(`${P().garage.vehicles.length} / ${capacity(P())} vehicles  -  ${GARAGE_TIERS[P().garage.tier].name}`);
      carousel.replaceChildren(...P().garage.vehicles.map((x) => {
        const d = VEHICLE_BY_ID[x.model];
        const sel = x.uid === uid;
        return h('div', { class: 'item' + (sel ? ' sel' : ''), style: 'min-width:140px;padding:8px;gap:4px;cursor:pointer;flex:none', on: { click: () => { if (uid === x.uid) return; uid = x.uid; pending = {}; rebuild(false); draw(); } } },
          thumbEl(d, x.custom.color, 62), h('div', { class: 'bold sm' }, x.name || d.name), h('div', { class: 'row', style: 'gap:6px' }, h('span', { class: 'dim', style: 'font-size:11px' }, d.cls), x.uid === P().garage.selected ? h('span', { class: 'chip green', style: 'padding:0 6px;font-size:10px' }, 'active') : null));
      }));
      const tb = tabs([['paint', 'Paint'], ['wheels', 'Wheels'], ['body', 'Body'], ['parts', 'Performance'], ['details', 'Details']], tab, (t) => { tab = t; draw(); });
      const top = h('div', { class: 'row', style: 'margin-bottom:8px' }, h('div', { class: 'grow' }, h('div', { class: 'bold', style: 'font-size:1.2em' }, `${def().brand} ${def().name}`), h('div', { class: 'dim sm' }, def().perf.sail ? `${def().cls}  -  ${def().perf.sail.area} m\u00b2 sail` : `${def().cls}  -  ${def().perf.drive}  -  ${def().perf.kw} kW`)),
        v.uid === P().garage.selected ? null : btn('Drive this', { sm: true, kind: 'primary', on: () => { st.act({ type: 'selectVehicle', uid }); app.game.audio.ui('confirm'); draw(); } }));
      content.replaceChildren(top, carousel, tb, panels[tab]());
      drawCost();
    };
    rebuild(false); draw();
    return { el: stageLayout(content), stage: 'car', dispose() { costBar.remove(); stage.frame(0); stage.auto = 0.22; void ALL_ITEMS; void icon; } };
  },
};
