def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:70])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('src/data/items.js', [
    ("export const HAIR_STYLES = ['buzz', 'short', 'medium', 'slick', 'curly', 'afro', 'long', 'ponytail', 'bun', 'mohawk', 'none'];", "export const HAIR_STYLES = ['buzz', 'short', 'tousled', 'medium', 'slick', 'curly', 'afro', 'long', 'wavy', 'bob', 'spiky', 'ponytail', 'bun', 'mohawk', 'none'];"),
    ("export const HAIR_COLORS = ['#1c1510', '#2b1e16', '#4a3222', '#6b4a2e', '#8a6a44', '#b89a6a', '#d8c090', '#a33a24', '#9a9a9a', '#e0e0e0'];", "export const HAIR_COLORS = ['#1c1510', '#2b1e16', '#4a3222', '#6b4a2e', '#8a5a2e', '#b89a6a', '#d8c090', '#ffd84a', '#a33a24', '#9a9a9a', '#e0e0e0', '#ff7aa8', '#8a4fd8', '#3b6bff', '#4fd66b'];"),
])
patch('src/game/economy.js', [
    ("        const allowed = ['height', 'build', 'skin', 'eyes', 'face', 'hair', 'facial', 'name'];\n        for (const k of allowed) if (a.changes[k] !== undefined) p.avatar[k] = a.changes[k];",
     """        const allowed = ['height', 'build', 'skin', 'eyes', 'face', 'hair', 'facial', 'name'], hex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
        for (const k of allowed) if (a.changes[k] !== undefined) p.avatar[k] = a.changes[k];
        const ch = a.changes;
        if (['human', 'android', 'alien', 'fox', 'cat', 'skull', 'elf', 'cyber'].includes(ch.species)) p.avatar.species = ch.species;
        if (Array.isArray(ch.acc)) p.avatar.acc = ch.acc.filter((x) => ['vr', 'vest', 'catEars', 'headphones', 'flowers', 'hood', 'cyber', 'choker'].includes(x)).slice(0, 3);
        for (const k of ['top', 'jacket', 'pants', 'shoes', 'hat']) if (ch[k] && typeof ch[k].type === 'string' && hex(ch[k].color)) p.avatar[k] = { type: ch[k].type.slice(0, 16), color: ch[k].color, ...(hex(ch[k].band) ? { band: ch[k].band } : {}) };
        if (typeof ch.glasses === 'string') p.avatar.glasses = ch.glasses.slice(0, 12);"""),
])
patch('src/app/pages/creator.js', [
    ("import { newProfile, owns } from '../../game/economy.js';", "import { newProfile, owns } from '../../game/economy.js';\nimport { ARCHETYPES, BASE_LOOK } from '../../data/avatars.js';"),
    ("    const look = JSON.parse(JSON.stringify(base.avatar));\n    const equipped = { ...base.avatar.equipped };",
     "    let look, equipped;\n    if (app._avDraft && app._keepDraft) { look = app._avDraft.look; equipped = app._avDraft.equipped; } else { look = JSON.parse(JSON.stringify(base.avatar)); equipped = { ...base.avatar.equipped }; }\n    app._keepDraft = false; app._avDraft = { look, equipped };"),
    ("      secH('Species'), opts(['human', 'android', 'alien', 'fox', 'cat', 'skull'], () => look.species || 'human', (o) => { look.species = o; }),",
     "      secH('Species'), opts(['human', 'elf', 'android', 'cyber', 'alien', 'fox', 'cat', 'skull'], () => look.species || 'human', (o) => { look.species = o; }),"),
    ("    const left = h('div', null,\n      h('div', { class: 'card' }, h('h3', null, 'Name'), nameIn),",
     """    const apply = (a) => { Object.assign(look, JSON.parse(JSON.stringify(BASE_LOOK)), JSON.parse(JSON.stringify(a.look))); look.face = look.face || { jaw: 0.5, nose: 0.5, brow: 0.5 }; app._keepDraft = true; ctx.refresh(); app.stage.showAvatar(look); };
    const arche = h('div', { class: 'arch-grid' }, ARCHETYPES.map((a, i) => h('button', { class: 'arch', style: { animationDelay: i * 0.04 + 's' }, on: { click: () => apply(a) } }, h('b', null, a.name), h('small', null, a.blurb))));
    const left = h('div', null,
      secH('Characters'), arche,
      h('div', { class: 'card' }, h('h3', null, 'Name'), nameIn),"""),
    ("      ctx.refresh(); app.stage.showAvatar(look);\n    };\n    const confirm", "      app._keepDraft = true; ctx.refresh(); app.stage.showAvatar(look);\n    };\n    const confirm"),
    ("changes: { name, height: look.height, build: look.build, skin: look.skin, eyes: look.eyes, face: look.face, hair: look.hair, facial: look.facial } });",
     "changes: { name, height: look.height, build: look.build, skin: look.skin, eyes: look.eyes, face: look.face, hair: look.hair, facial: look.facial, species: look.species, acc: look.acc, top: look.top, jacket: look.jacket, pants: look.pants, shoes: look.shoes, hat: look.hat, glasses: look.glasses } });"),
])
open('css/pass.css', 'a', encoding='utf8').write('''
.arch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; margin-bottom: 10px; }
.arch { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 9px 11px; border-radius: 10px; border: 1px solid var(--line2); background: linear-gradient(160deg, #1c2029, #12151b); color: var(--text); cursor: pointer; animation: spIn 0.5s var(--ease) both; transition: transform 0.15s, border-color 0.15s, box-shadow 0.2s; }
.arch:hover { transform: translateY(-3px); border-color: #ffb02e; box-shadow: 0 6px 18px #ffb02e33; }
.arch b { font-family: var(--cond); letter-spacing: 0.1em; text-transform: uppercase; font-size: 14px; }
.arch small { color: var(--dim); font-size: 11px; line-height: 1.25; }
''')
