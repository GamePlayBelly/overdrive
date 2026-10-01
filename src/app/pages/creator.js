import { h, icon, btn, slider, toast } from '../ui.js';
import { HAIR_STYLES, FACIAL, SKIN_TONES, HAIR_COLORS, EYE_COLORS, CLOTHING, OUTFITS, ALL_ITEMS, DEFAULT_INVENTORY } from '../../data/items.js';
import { newProfile, owns } from '../../game/economy.js';
import { ARCHETYPES, BASE_LOOK } from '../../data/avatars.js';

export const stageLayout = (left, bottom) => h('div', { class: 'split', style: 'height:100%' }, h('div', { class: 'side-panel' }, left), h('div', { 'data-stage-drag': '1', style: 'height:calc(100vh - 230px);min-height:360px;cursor:grab;position:relative' }, bottom));

const CATS = [['top', 'Top'], ['jacket', 'Jacket'], ['pants', 'Pants'], ['shoes', 'Shoes'], ['hat', 'Hat'], ['glasses', 'Glasses'], ['watch', 'Watch'], ['chain', 'Chain'], ['bag', 'Bag']];
const rnd = (a) => a[(Math.random() * a.length) | 0];

export const creatorPage = {
  title: 'Character',
  stage: true,
  render(app, ctx) {
    const isNew = !app.profile;
    const base = isNew ? newProfile('Driver') : app.profile;
    let look, equipped;
    if (app._avDraft && app._keepDraft) { look = app._avDraft.look; equipped = app._avDraft.equipped; } else { look = JSON.parse(JSON.stringify(base.avatar)); equipped = { ...base.avatar.equipped }; }
    app._keepDraft = false; app._avDraft = { look, equipped };
    const inv = isNew ? DEFAULT_INVENTORY : base.inventory;
    ctx.setSub(isNew ? 'Design your driver' : 'Edit appearance');
    ctx.setHelp([['Drag', 'Rotate'], ['Wheel', 'Zoom']]);
    const stage = app.stage;
    let timer = null;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { const keep = stage.tYaw; stage.showAvatar(look); stage.tYaw = keep; stage.yaw = keep; }, 30); };
    stage.showAvatar(look); stage.frame(-2); stage.auto = 0.15;
    const nameIn = h('input', { class: 'txt', value: look.name || 'Driver', maxlength: 20, style: 'width:100%' });
    nameIn.addEventListener('input', () => { look.name = nameIn.value; });
    const sw = (colors, get, set) => h('div', { class: 'row wrap', style: 'gap:8px' }, colors.map((c) => { const b = h('button', { class: 'swatch' + (get() === c ? ' on' : ''), style: { background: c }, on: { click: () => { set(c); for (const s of b.parentNode.children) s.classList.remove('on'); b.classList.add('on'); refresh(); } } }); return b; }));
    const opts = (list, get, set, label = (x) => x) => { const box = h('div', { class: 'opt-grid' }); for (const o of list) { const b = h('button', { class: 'opt' + (get() === o ? ' on' : ''), on: { click: () => { set(o); for (const s of box.children) s.classList.remove('on'); b.classList.add('on'); refresh(); } } }, label(o)); box.appendChild(b); } return box; };
    const secH = (t) => h('div', { class: 'sect', style: 'margin:14px 0 8px' }, h('h2', { style: 'font-size:17px' }, t));
    const clothing = h('div');
    const drawClothing = () => {
      clothing.replaceChildren();
      for (const [cat, label] of CATS) {
        const items = CLOTHING.filter((i) => i.cat === cat && (inv.includes(i.id) || i.source === 'default'));
        if (items.length < 2) continue;
        clothing.appendChild(secH(label));
        const box = h('div', { class: 'opt-grid' });
        for (const it of items) {
          const b = h('button', { class: 'opt' + (equipped[cat] === it.id ? ' on' : ''), on: { click: () => {
            equipped[cat] = it.id;
            if (['top', 'jacket', 'pants', 'shoes', 'hat'].includes(cat)) look[cat] = { ...it.props }; else look[cat] = it.props.value;
            for (const s of box.children) s.classList.remove('on'); b.classList.add('on'); refresh();
          } } }, it.name.replace(/ — .*/, '').slice(0, 22) + (it.props.color && it.name.includes('—') ? ' ' + it.name.split('— ')[1] : ''));
          box.appendChild(b);
        }
        clothing.appendChild(box);
      }
    };
    drawClothing();
    const apply = (a) => { Object.assign(look, JSON.parse(JSON.stringify(BASE_LOOK)), JSON.parse(JSON.stringify(a.look))); look.face = look.face || { jaw: 0.5, nose: 0.5, brow: 0.5 }; app._keepDraft = true; ctx.refresh(); app.stage.showAvatar(look); };
    const arche = h('div', { class: 'arch-grid' }, ARCHETYPES.map((a, i) => h('button', { class: 'arch', style: { animationDelay: i * 0.04 + 's' }, on: { click: () => apply(a) } }, h('b', null, a.name), h('small', null, a.blurb))));
    const left = h('div', null,
      secH('Characters'), arche,
      h('div', { class: 'card' }, h('h3', null, 'Name'), nameIn),
      secH('Body'),
      h('div', { class: 'setting', style: 'padding:6px 0' }, h('div', { class: 'lbl' }, 'Height'), slider(1.55, 2.0, 0.01, look.height, (v) => { look.height = v; refresh(); }, (v) => v.toFixed(2) + ' m')),
      h('div', { class: 'setting', style: 'padding:6px 0' }, h('div', { class: 'lbl' }, 'Build'), slider(0.1, 0.9, 0.01, look.build, (v) => { look.build = v; refresh(); }, (v) => Math.round(v * 100) + '%')),
      secH('Species'), opts(['human', 'elf', 'android', 'cyber', 'alien', 'fox', 'cat', 'skull'], () => look.species || 'human', (o) => { look.species = o; }),
      secH('Skin tone'), sw(SKIN_TONES, () => look.skin, (c) => { look.skin = c; }),
      secH('Face'),
      ...['jaw', 'nose', 'brow'].map((k) => h('div', { class: 'setting', style: 'padding:4px 0' }, h('div', { class: 'lbl' }, k[0].toUpperCase() + k.slice(1)), slider(0, 1, 0.02, look.face[k], (v) => { look.face[k] = v; refresh(); }, (v) => Math.round(v * 100) + '%'))),
      secH('Eyes'), sw(EYE_COLORS, () => look.eyes, (c) => { look.eyes = c; }),
      secH('Hair'), opts(HAIR_STYLES, () => look.hair.style, (o) => { look.hair.style = o; }), h('div', { style: 'height:8px' }), sw(HAIR_COLORS, () => look.hair.color, (c) => { look.hair.color = c; }),
      secH('Facial hair'), opts(FACIAL, () => look.facial, (o) => { look.facial = o; }),
      clothing,
      h('div', { style: 'height:16px' }));
    const randomize = () => {
      look.skin = rnd(SKIN_TONES); look.hair = { style: rnd(HAIR_STYLES), color: rnd(HAIR_COLORS) }; look.facial = Math.random() < 0.4 ? rnd(FACIAL) : 'none'; look.eyes = rnd(EYE_COLORS);
      look.height = 1.6 + Math.random() * 0.34; look.build = 0.2 + Math.random() * 0.6; look.face = { jaw: Math.random(), nose: Math.random(), brow: Math.random() };
      for (const [cat] of CATS) { const items = CLOTHING.filter((i) => i.cat === cat && (inv.includes(i.id) || i.source === 'default')); if (items.length) { const it = rnd(items); equipped[cat] = it.id; if (['top', 'jacket', 'pants', 'shoes', 'hat'].includes(cat)) look[cat] = { ...it.props }; else look[cat] = it.props.value; } }
      app._keepDraft = true; ctx.refresh(); app.stage.showAvatar(look);
    };
    const confirm = () => {
      const name = (nameIn.value || 'Driver').trim().slice(0, 20) || 'Driver';
      if (isNew) {
        app.store.create(name);
        app.applySettings();
      }
      app.store.act({ type: 'avatar', changes: { name, height: look.height, build: look.build, skin: look.skin, eyes: look.eyes, face: look.face, hair: look.hair, facial: look.facial, species: look.species, acc: look.acc, top: look.top, jacket: look.jacket, pants: look.pants, shoes: look.shoes, hat: look.hat, glasses: look.glasses } });
      for (const [cat] of CATS) if (equipped[cat] && equipped[cat] !== app.profile.avatar.equipped[cat] && owns(app.profile, equipped[cat])) app.store.act({ type: 'equip', id: equipped[cat] });
      app.game.player.setLook(app.profile.avatar);
      toast({ title: isNew ? `Welcome, ${name}` : 'Appearance saved', kind: 'green', icon: 'check' });
      if (isNew) { app.closeMenu(); app.startPlay(); }
      else ctx.menu.go('profile');
    };
    const bar = h('div', { class: 'preview-tools' },
      btn('Randomize', { icon: 'refresh', on: randomize }), btn('Wave', { icon: 'user', on: () => stage.playEmote('wave') }), btn('Dance', { icon: 'music', on: () => stage.playEmote('dance') }),
      btn(isNew ? 'Start game' : 'Save changes', { kind: 'primary', icon: 'check', on: confirm }));
    app.menu.el.appendChild(bar);
    return { el: stageLayout(left), stage: 'avatar', dispose() { clearTimeout(timer); bar.remove(); stage.auto = 0.22; stage.frame(0); } };
  },
};
void icon; void OUTFITS; void ALL_ITEMS;
