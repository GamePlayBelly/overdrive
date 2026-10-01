import { h, icon, fmt, btn, bar, tabs, toast, sect, chip } from '../ui.js';
import { stageLayout } from './creator.js';
import { thumbEl } from './common.js';
import { PLAYER_VEHICLES, CLASSES, vehicleStats } from '../../data/vehicles.js';
import { capacity } from '../../game/economy.js';

// Dealership: browse every vehicle, compare, preview in the studio and buy.
export const vehiclesPage = {
  title: 'Vehicles',
  stage: true,
  render(app, ctx) {
    const st = app.store, stage = app.stage;
    let cls = 'All', sel = PLAYER_VEHICLES.find((v) => v.id === ctx.opts.model) || PLAYER_VEHICLES[0], color = sel.colors[0];
    ctx.setHelp([['Drag', 'Rotate'], ['Wheel', 'Zoom']]);
    ctx.setSub('Westwind Motors');
    stage.frame(-1.5); stage.auto = 0.2;
    const P = () => st.profile;
    const content = h('div'), buy = h('div', { class: 'preview-tools' });
    app.menu.el.appendChild(buy);
    const preview = () => { const yaw = stage.tYaw; stage.showCar(sel, { color, finish: 'metallic' }, { open: [] }); stage.tYaw = stage.yaw = yaw; };
    const draw = () => {
      const owned = P().garage.vehicles.filter((v) => v.model === sel.id).length;
      const list = PLAYER_VEHICLES.filter((v) => cls === 'All' || v.cls === cls);
      const stt = vehicleStats(sel);
      const early = P().level < sel.level, locked = early && sel.level - P().level > 12, cost = early ? Math.round(sel.price * 1.6) : sel.price;
      content.replaceChildren(
        tabs([['All', 'All'], ...CLASSES.filter((c) => PLAYER_VEHICLES.some((v) => v.cls === c)).map((c) => [c, c])], cls, (c) => { cls = c; draw(); }),
        h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;max-height:34vh;overflow-y:auto;padding:2px' }, list.map((v, i) => h('div', { class: 'item' + (v === sel ? ' sel' : '') + (P().level < v.level ? ' locked' : ''), style: `padding:8px;gap:4px;cursor:pointer;animation-delay:${i * 0.02}s`, on: { click: () => { sel = v; color = v.colors[0]; preview(); draw(); } } },
          thumbEl(v, v.colors[0], 68), h('div', { class: 'bold sm' }, `${v.brand} ${v.name}`), h('div', { class: 'row', style: 'gap:6px' }, h('span', { class: 'dim', style: 'font-size:11px' }, v.cls), h('span', { class: 'gold sm end' }, P().level < v.level ? `Lv ${v.level}` : fmt.money(v.price)))))),
        h('div', { class: 'card flat', style: 'margin-top:14px' },
          h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold', style: 'font-size:1.25em' }, `${sel.brand} ${sel.name}`), h('div', { class: 'dim sm' }, sel.perf.sail ? `${sel.cls}  -  ${sel.perf.sail.area} m\u00b2 sail  -  ${sel.perf.kw ? sel.perf.kw + ' kW auxiliary' : 'no engine'}  -  ${sel.perf.mass} kg` : `${sel.cls}  -  ${sel.perf.drive}  -  ${sel.perf.kw} kW  -  ${sel.perf.nm} Nm  -  ${sel.perf.mass} kg`)), chip(`Rating ${stt.rating}`, 'blue', 'gauge'), owned ? chip(`Owned x${owned}`, 'green', 'check') : null),
          h('div', { class: 'col', style: 'margin-top:12px;gap:6px' }, ['speed', 'accel', 'handling', 'braking'].map((k) => h('div', { class: 'stat' }, h('span', null, k[0].toUpperCase() + k.slice(1)), bar(stt[k] / 10, k === 'braking' ? 'gold' : 'blue'), h('b', null, stt[k].toFixed(1))))),
          h('div', { class: 'dim sm', style: 'margin:14px 0 6px' }, 'Color'),
          h('div', { class: 'row wrap', style: 'gap:8px' }, sel.colors.map((c) => h('button', { class: 'swatch' + (c === color ? ' on' : ''), style: { background: c }, on: { click: () => { color = c; preview(); draw(); } } })))));
      buy.replaceChildren(
        h('div', { class: 'pill' }, locked ? [icon('lock'), `Needs level ${sel.level - 12}`] : [icon('coin'), fmt.money(cost) + (early ? ' (early access x1.6)' : '')]),
        btn(locked ? 'Locked' : sel.price === 0 ? 'Owned' : 'Buy', { kind: 'primary', icon: 'cart', disabled: locked || (sel.price === 0 && owned > 0) || P().money < cost || P().garage.vehicles.length >= capacity(P()), on: () => {
          const r = st.act({ type: 'buyVehicle', model: sel.id, color });
          if (r.ok) { app.game.audio.ui('buy'); toast({ title: `${sel.brand} ${sel.name} purchased`, sub: 'Added to your garage', kind: 'green', icon: 'car' }); draw(); } else toast({ title: 'Cannot buy', sub: r.error, icon: 'x' });
        } }));
    };
    preview(); draw();
    return { el: stageLayout(content), stage: 'car', dispose() { buy.remove(); stage.frame(0); stage.auto = 0.22; void sect; } };
  },
};
