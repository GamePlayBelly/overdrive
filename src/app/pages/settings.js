import { h, icon, toggle, slider, select, seg, tabs, btn, toast, confirm, modal, fmt } from '../ui.js';
import { DEFAULT_BINDS, ACTION_LABELS } from '../../core/input.js';
import { GROUPS } from './bindGroups.js';

const keyLabel = (c) => c.replace('Key', '').replace('Digit', '').replace('Arrow', '↑↓←→'.includes('') ? '' : '').replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift').replace('Escape', 'Esc').replace('Space', 'Space').replace('Enter', 'Enter');

export const settingsPage = {
  title: 'Settings',
  render(app, ctx) {
    const root = h('div');
    ctx.setSub('Changes are saved automatically');
    ctx.setHelp([['Esc', 'Close']]);
    let tab = ctx.opts.tab || 'general';
    const body = h('div');
    const S = () => app.profile.settings;
    const set = (sec, k, v, apply = true) => { app.store.patch((p) => { p.settings[sec][k] = v; }); if (apply) app.applySettings(); };
    const row = (label, control, sub) => h('div', { class: 'setting' }, h('div', { class: 'lbl' }, label, sub ? h('small', null, sub) : null), control);

    const panels = {
      general: () => [
        row('Units', seg([['kmh', 'km/h'], ['mph', 'mph']], S().general.units, (v) => set('general', 'units', v))),
        row('Game speed of time', slider(0.25, 6, 0.25, S().general.timeScale, (v) => set('general', 'timeScale', v), (v) => `${v}x`), 'How fast the day passes (1x = 24 real minutes per day)'),
        row('Rotate minimap', toggle(S().general.minimapRotate, (v) => set('general', 'minimapRotate', v, false))),
        row('On-screen hints', toggle(S().general.hints, (v) => set('general', 'hints', v, false))),
        row('Autosave', toggle(S().general.autosave, (v) => set('general', 'autosave', v, false))),
        row('Speedometer', seg([['digital', 'Digital'], ['minimal', 'Minimal']], S().general.speedo, (v) => set('general', 'speedo', v, false))),
        row('Language', select([['en', 'English']], 'en', () => {})),
      ],
      graphics: () => {
        const G = S().graphics;
        return [
          row('Quality preset', select([['auto', 'Auto (recommended)'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], G.preset, (v) => { set('graphics', 'preset', v); show(); }), 'Auto adjusts resolution and detail continuously to hold 60 fps'),
          G.preset !== 'auto' ? row('Render resolution', slider(0.5, 1.25, 0.05, G.resolution, (v) => set('graphics', 'resolution', v), (v) => Math.round(v * 100) + '%')) : null,
          row('Shadows', seg([['off', 'Off'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']], G.shadows, (v) => set('graphics', 'shadows', v))),
          row('Draw distance', slider(0.6, 1.6, 0.05, G.drawDistance, (v) => set('graphics', 'drawDistance', v), (v) => v.toFixed(2) + 'x'), 'World detail, LOD and culling distance'),
          row('Vegetation and grass', slider(0.3, 1.5, 0.05, G.vegetation, (v) => set('graphics', 'vegetation', v), (v) => Math.round(v * 100) + '%')),
          row('3D grass', toggle(G.grass !== false, (v) => set('graphics', 'grass', v)), 'Turn off for extra frame rate on weaker GPUs'),
          row('Boat wakes and foam trails', toggle(G.wakes !== false, (v) => set('graphics', 'wakes', v))),
          row('Traffic density', slider(0.2, 1.5, 0.05, G.traffic, (v) => set('graphics', 'traffic', v), (v) => Math.round(v * 100) + '%')),
          row('Pedestrian density', slider(0.2, 1.5, 0.05, G.peds, (v) => set('graphics', 'peds', v), (v) => Math.round(v * 100) + '%')),
          row('Bloom (fixed presets)', toggle(G.bloom, (v) => set('graphics', 'bloom', v))),
          row('Field of view', slider(50, 100, 1, G.fov, (v) => set('graphics', 'fov', v), (v) => v + '°')),
          row('FPS counter and stats', toggle(G.fpsCounter, (v) => set('graphics', 'fpsCounter', v, false))),
        ];
      },
      audio: () => [
        ...[['master', 'Master volume'], ['engine', 'Engines'], ['effects', 'Effects'], ['ambience', 'Ambience'], ['voice', 'Voices'], ['music', 'Music'], ['radio', 'Radio']].map(([k, l]) => row(l, slider(0, 1, 0.05, S().audio[k], (v) => { set('audio', k, v); app.game.audio.setVolumes({ [k]: v }); if (k === 'effects') app.game.audio.ui('confirm'); }, (v) => Math.round(v * 100) + '%'))),
      ],
      controls: () => {
        const C = S().controls;
        const list = h('div');
        const draw = () => {
          list.replaceChildren();
          for (const [gname, acts] of GROUPS) {
            list.appendChild(h('div', { class: 'sect', style: 'margin:16px 0 4px' }, h('h2', { style: 'font-size:17px' }, gname)));
            for (const a of acts) {
              const keys = (app.game.input.binds[a] || []);
              const cell = h('div', { class: 'row', style: 'gap:6px' }, keys.map((k) => h('span', { class: 'kbd' }, keyLabel(k))), keys.length ? null : h('span', { class: 'dim sm' }, 'unbound'));
              const b = h('button', { class: 'btn sm', on: { click: () => {
                b.textContent = 'Press a key…'; app.game.input.capture = (code) => {
                  if (code === 'Escape') { draw(); return; }
                  const binds = { ...(C.binds || {}) };
                  const cur = { ...app.game.input.binds };
                  for (const k of Object.keys(cur)) if (k !== a && cur[k].includes(code) && k !== 'jump' && a !== 'jump' && !(a === 'handbrake' && k === 'jump') && !(a === 'jump' && k === 'handbrake') && !(a === 'indicatorR' && k === 'interact') && !(a === 'interact' && k === 'indicatorR')) binds[k] = cur[k].filter((c) => c !== code);
                  binds[a] = [code];
                  app.store.patch((p) => { p.settings.controls.binds = binds; }); app.applySettings(); draw();
                };
              } } }, 'Rebind');
              list.appendChild(h('div', { class: 'setting', style: 'padding:7px 4px' }, h('div', { class: 'lbl' }, ACTION_LABELS[a] || a), cell, b));
            }
          }
        };
        draw();
        return [
          row('Driving assists', seg([['off', 'Off'], ['standard', 'Standard'], ['high', 'High']], C.assist, (v) => set('controls', 'assist', v)), 'Stability and drift assistance'),
          row('Traction control', toggle(C.tc, (v) => set('controls', 'tc', v))),
          row('Steering sensitivity', slider(0.5, 1.6, 0.05, C.steerSens, (v) => set('controls', 'steerSens', v), (v) => v.toFixed(2))),
          row('Mouse sensitivity', slider(0.3, 3, 0.05, C.mouseSens, (v) => set('controls', 'mouseSens', v), (v) => v.toFixed(2))),
          row('Invert camera Y', toggle(C.invertY, (v) => set('controls', 'invertY', v))),
          row('Gamepad dead zone', slider(0.05, 0.4, 0.01, C.deadzone, (v) => set('controls', 'deadzone', v), (v) => v.toFixed(2))),
          list,
          h('div', { style: 'margin-top:14px' }, btn('Reset to defaults', { on: () => { app.store.patch((p) => { p.settings.controls.binds = {}; }); app.applySettings(); toast({ title: 'Controls reset', kind: 'green', icon: 'check' }); show(); } })),
        ];
      },
      access: () => {
        const A = S().access;
        return [
          row('Subtitles', toggle(A.subtitles, (v) => set('access', 'subtitles', v, false))),
          row('Text size', slider(0.85, 1.4, 0.05, A.textScale, (v) => set('access', 'textScale', v), (v) => Math.round(v * 100) + '%')),
          row('Color-blind mode', select([['none', 'Off'], ['deutan', 'Deuteranopia'], ['protan', 'Protanopia'], ['tritan', 'Tritanopia']], A.colorblind, (v) => set('access', 'colorblind', v))),
          row('High contrast UI', toggle(A.highContrast, (v) => set('access', 'highContrast', v))),
          row('Reduce motion', toggle(A.reduceMotion, (v) => set('access', 'reduceMotion', v)), 'Disables camera effects and UI animation'),
          row('Camera shake', toggle(A.cameraShake, (v) => set('access', 'cameraShake', v))),
          row('Visual sound cues', toggle(A.visualAudio, (v) => set('access', 'visualAudio', v, false))),
        ];
      },
      privacy: () => [
        row('Appear online', toggle(S().privacy.online, (v) => set('privacy', 'online', v, false))),
        row('Allow friend requests', toggle(S().privacy.friendRequests, (v) => set('privacy', 'friendRequests', v, false))),
        row('Show me on leaderboards', toggle(S().privacy.leaderboards, (v) => set('privacy', 'leaderboards', v, false))),
        row('Allow crew invites', toggle(S().privacy.crewInvites, (v) => set('privacy', 'crewInvites', v, false))),
      ],
      account: () => {
        const p = app.profile;
        const nameIn = h('input', { class: 'txt', value: p.name, maxlength: 20 });
        const slots = app.store.slots();
        return [
          row('Driver name', h('div', { class: 'row' }, nameIn, btn('Save', { sm: true, on: () => { if (nameIn.value.trim()) { app.store.act({ type: 'avatar', changes: { name: nameIn.value.trim() } }); toast({ title: 'Name updated', kind: 'green', icon: 'check' }); } } }))),
          row('Profile ID', h('span', { class: 'dim' }, p.id)),
          row('Export save file', btn('Download', { icon: 'download', sm: true, on: () => { const a = h('a', { href: URL.createObjectURL(new Blob([app.store.exportJSON()], { type: 'application/json' })), download: `realworld-${p.name}.json` }); a.click(); } })),
          row('Import save file', (() => { const f = h('input', { type: 'file', accept: '.json', style: 'display:none' }); f.addEventListener('change', async () => { try { app.store.importJSON(await f.files[0].text()); app.applySettings(); toast({ title: 'Save imported', kind: 'green', icon: 'check' }); show(); } catch (e) { toast({ title: 'Import failed', sub: e.message, icon: 'x' }); } }); return h('div', null, f, btn('Choose file', { icon: 'upload', sm: true, on: () => f.click() })); })()),
          h('div', { class: 'sect' }, h('h2', null, 'Backup slots')),
          ...[0, 1, 2].map((i) => row(`Slot ${i + 1}`, h('div', { class: 'row' }, h('span', { class: 'dim sm' }, slots[i] ? `${slots[i].name}  -  Lv ${slots[i].level}  -  ${fmt.ago(slots[i].t)}` : 'Empty'), btn('Save', { sm: true, on: () => { app.store.saveSlot(i); show(); } }), slots[i] ? btn('Load', { sm: true, on: async () => { if (await confirm('Load backup', 'Replace current progress with this backup?', 'Load')) { app.store.loadSlot(i); app.applySettings(); show(); } } }) : null))),
          h('div', { class: 'sect' }, h('h2', null, 'Danger zone')),
          row('Reset all progress', btn('Reset', { kind: 'primary', sm: true, on: async () => { if (await confirm('Reset progress', 'This permanently deletes your profile, vehicles and progress.', 'Delete everything')) { app.store.reset(); location.reload(); } } })),
        ];
      },
    };
    const show = () => { body.replaceChildren(...(panels[tab]() || []).filter(Boolean)); };
    root.append(tabs([['general', 'General'], ['graphics', 'Graphics'], ['audio', 'Audio'], ['controls', 'Controls'], ['access', 'Accessibility'], ['privacy', 'Privacy'], ['account', 'Account']], tab, (t) => { tab = t; show(); }), body);
    show();
    return { el: root, dispose() { app.game.input.capture = null; } };
  },
};
void icon; void modal; void DEFAULT_BINDS;
