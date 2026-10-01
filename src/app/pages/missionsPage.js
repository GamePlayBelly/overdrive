import { h, icon, fmt, btn, tabs, toast, chip, bar, sect, confirm } from '../ui.js';
import { legLength } from './raceEditor.js';
import { MISSIONS, CHAPTERS, SIDE_JOBS } from '../../data/missions.js';
import { NPCS, RIVALS } from '../../data/npcs.js';
import { LEAGUE } from '../../data/meta.js';
import { rankFor } from '../../data/progression.js';

export const missionState = (p, m) => {
  if (p.missions.done[m.id]) return 'done';
  if (p.level < (m.level || 1)) return 'level';
  if (!(m.requires || []).every((r) => p.missions.done[r])) return 'locked';
  return 'open';
};

function routeThumb(pts) {
  const w = 240, hh = 110, c = document.createElement('canvas'); c.width = w * 2; c.height = hh * 2; c.style.cssText = 'width:100%;height:100%';
  const x = c.getContext('2d'); x.scale(2, 2);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const s = Math.min((w - 28) / Math.max(1, x1 - x0), (hh - 28) / Math.max(1, z1 - z0)), ox = (w - (x1 - x0) * s) / 2, oz = (hh - (z1 - z0) * s) / 2;
  const X = (v) => ox + (v - x0) * s, Z = (v) => oz + (v - z0) * s;
  x.strokeStyle = '#000'; x.lineWidth = 6; x.lineJoin = 'round'; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(X(p[0]), Z(p[1])) : x.moveTo(X(p[0]), Z(p[1])))); x.stroke();
  x.strokeStyle = '#ffc94a'; x.lineWidth = 3; x.stroke();
  pts.forEach((p, i) => { x.fillStyle = i === 0 ? '#34c07a' : '#ffc94a'; x.beginPath(); x.arc(X(p[0]), Z(p[1]), i === 0 ? 5 : 3.2, 0, 7); x.fill(); });
  return c;
}

export const missionsPage = {
  title: 'Missions',
  render(app, ctx) {
    const p = app.profile;
    let tab = ctx.opts.tab || 'story', sel = ctx.opts.id ? MISSIONS.find((m) => m.id === ctx.opts.id) : MISSIONS.find((m) => missionState(p, m) === 'open') || MISSIONS[0];
    ctx.setSub(`${Object.keys(p.missions.done).length} / ${MISSIONS.length} story missions completed`);
    ctx.setHelp([['Esc', 'Close']]);
    const root = h('div'), body = h('div');
    const npc = (k) => NPCS[k]?.name || k;
    const draw = () => {
      body.replaceChildren();
      if (tab === 'story') {
        const list = h('div', { class: 'col', style: 'gap:8px' });
        CHAPTERS.forEach((c, ci) => {
          list.appendChild(h('div', { class: 'sect', style: 'margin:14px 0 4px' }, h('h2', { style: 'font-size:17px' }, `Chapter ${ci + 1}`), h('small', null, c)));
          for (const m of MISSIONS.filter((x) => x.ch === ci)) {
            const s = missionState(p, m);
            list.appendChild(h('div', { class: 'item' + (sel === m ? ' sel' : '') + (s === 'locked' || s === 'level' ? ' locked' : ''), style: 'flex-direction:row;align-items:center;padding:10px 12px;cursor:pointer', on: { click: () => { sel = m; draw(); } } },
              h('div', { style: `width:34px;height:34px;border-radius:8px;display:grid;place-items:center;background:${s === 'done' ? 'rgba(52,192,122,0.16)' : s === 'open' ? 'var(--red-soft)' : '#20252b'};color:${s === 'done' ? 'var(--green)' : s === 'open' ? '#ff8a8c' : 'var(--dim)'}` }, icon(s === 'done' ? 'check' : s === 'open' ? 'target' : 'lock')),
              h('div', { class: 'grow' }, h('div', { class: 'bold' }, m.title), h('div', { class: 'dim sm' }, `${m.type}  -  ${npc(m.giver)}`)), s === 'level' ? chip(`Lv ${m.level}`, '', 'lock') : s === 'done' ? chip('Done', 'green') : chip(fmt.money(m.rewards.money), 'gold')));
          }
        });
        const m = sel, s = missionState(p, m);
        const detail = h('div', { class: 'card', style: 'position:sticky;top:0;align-self:start' },
          h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'cond', style: 'color:var(--red);font-size:13px' }, `${m.type}  -  ${npc(m.giver)}`), h('h2', { style: 'margin:2px 0 0;font-family:var(--cond);font-size:28px;letter-spacing:0.06em;text-transform:uppercase' }, m.title)), s === 'done' ? chip('Completed', 'green', 'check') : null),
          h('div', { class: 'col', style: 'margin:14px 0;gap:8px' }, m.intro.map(([who, line]) => h('div', { class: 'msg-bubble', style: 'max-width:100%;background:#1c2128' }, h('b', { style: `color:${NPCS[who]?.color || '#fff'};margin-right:6px` }, npc(who)), line))),
          h('div', { class: 'sect', style: 'margin:10px 0 6px' }, h('h2', { style: 'font-size:15px' }, 'Objectives')),
          h('div', { class: 'col', style: 'gap:4px' }, m.steps.map((st, i) => h('div', { class: 'row sm', style: 'gap:8px' }, h('span', { class: 'dim' }, i + 1 + '.'), h('span', null, st.text || st.t)))),
          h('div', { class: 'row wrap', style: 'margin:14px 0' }, chip(fmt.money(m.rewards.money), 'gold', 'coin'), chip(`${fmt.num(m.rewards.xp)} XP`, 'blue', 'zap'), chip(`${fmt.num(m.rewards.rep)} rep`, 'red', 'star'), m.rewards.title ? chip(m.rewards.title, '', 'user') : null, p.missions.best[m.id] ? chip(`Best ${fmt.time(p.missions.best[m.id])}`, 'green', 'clock') : null),
          h('div', { class: 'row' }, btn(s === 'done' ? 'Replay' : 'Start mission', { kind: 'primary', icon: 'play', disabled: s === 'locked' || s === 'level', on: () => { app.closeMenu(); app.startMission?.(m.id); } }), btn('Set waypoint', { icon: 'flag', on: () => { app.setWaypoint(app.missionStartPoint?.(m) || null); toast({ title: 'Waypoint set', sub: m.title, kind: 'blue', icon: 'flag' }); } })),
          s === 'level' ? h('div', { class: 'dim sm', style: 'margin-top:10px' }, `Reach level ${m.level} to unlock.`) : s === 'locked' ? h('div', { class: 'dim sm', style: 'margin-top:10px' }, 'Complete the previous mission first.') : null);
        body.appendChild(h('div', { class: 'grid', style: 'grid-template-columns:minmax(300px,1fr) minmax(360px,1.1fr);gap:22px' }, list, detail));
      } else if (tab === 'jobs') {
        body.appendChild(h('div', { class: 'grid g-auto-l' }, SIDE_JOBS.map((j, i) => h('div', { class: 'item', style: `animation-delay:${i * 0.05}s` }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, j.title), h('div', { class: 'dim sm' }, `${j.type}  -  ${npc(j.giver)}`)), chip(`${fmt.money(j.pay[0])}-${fmt.money(j.pay[1])}`, 'gold')), h('div', { class: 'muted sm' }, j.desc), btn('Start job', { kind: 'primary', sm: true, icon: 'play', on: () => { app.closeMenu(); app.startJob?.(j.id); } })))));
      } else if (tab === 'custom') {
        const races = p.customRaces;
        body.appendChild(h('div', { class: 'row', style: 'margin:6px 0 14px' }, h('div', { class: 'grow dim sm' }, 'Design your own circuits on the map, then race them. Checkpoints snap to the road.'), btn('New race', { kind: 'primary', icon: 'plus', disabled: races.length >= 12, on: () => ctx.menu.go('raceEditor') })));
        body.appendChild(races.length ? h('div', { class: 'grid g-auto-l' }, races.map((r, i) => {
          const len = legLength(r.pts, r.laps > 1), best = p.records['c_' + r.id];
          return h('div', { class: 'item', style: `animation-delay:${i * 0.04}s;gap:8px;cursor:default` },
            h('div', { style: 'height:96px;background:#0e1216;border-radius:8px;overflow:hidden' }, routeThumb(r.pts)),
            h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, r.name), h('div', { class: 'dim sm' }, `${r.pts.length} checkpoints  -  ${(len / 1000).toFixed(1)} km  -  ${r.laps} lap${r.laps > 1 ? 's' : ''}`)), chip(r.rivals ? `${r.rivals} rival${r.rivals > 1 ? 's' : ''}` : 'Time trial', r.rivals ? 'red' : 'blue')),
            best ? h('div', { class: 'dim sm' }, `Best ${fmt.time(best)}`) : null,
            h('div', { class: 'row', style: 'gap:6px' }, btn('Race', { kind: 'primary', sm: true, icon: 'flag', on: () => { app.closeMenu(); app.startCustomRace?.(r.id); } }), btn('Edit', { sm: true, on: () => ctx.menu.go('raceEditor', { id: r.id }) }),
              btn('', { sm: true, icon: 'x', title: 'Delete', on: async () => { if (await confirm('Delete race', `Delete "${r.name}"?`, 'Delete')) { app.store.act({ type: 'deleteRace', id: r.id }); draw(); } } })));
        })) : h('div', { class: 'empty' }, 'No custom races yet. Create your first circuit on the map.'));
      } else {
        const rank = p.league.rank;
        body.appendChild(h('div', { class: 'card' }, h('div', { class: 'row' }, icon('trophy'), h('div', { class: 'grow' }, h('div', { class: 'bold' }, 'Underground League'), h('div', { class: 'dim sm' }, rank ? `Current rank: ${rank}` : 'Complete "Underground: Bronze" to join the league')), chip(rankFor(p.rep).name, 'red'))));
        for (const tier of LEAGUE) body.appendChild(h('div', null, sect(tier.rank, `Level ${tier.level}`), h('div', { class: 'grid g-auto-l' }, tier.races.map((r) => h('div', { class: 'item' + (p.level < tier.level ? ' locked' : '') }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'bold' }, r.name), h('div', { class: 'dim sm' }, `${r.laps || 1} lap(s)  -  vs ${r.rivals.map((id) => RIVALS.find((x) => x.id === id)?.name.split(' ')[0]).join(', ')}`)), p.league.done[r.id] ? chip('Won', 'green', 'check') : null), p.records[r.id] ? h('div', { class: 'dim sm' }, `Best ${fmt.time(p.records[r.id])}`) : null, btn(p.level < tier.level ? `Level ${tier.level}` : 'Race', { kind: 'primary', sm: true, icon: 'flag', disabled: p.level < tier.level, on: () => { app.closeMenu(); app.startLeagueRace?.(r.id); } }))))));
      }
    };
    if (app.missions?.run) root.append(h('div', { class: 'card', style: 'margin-bottom:14px;border-color:var(--red)' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'cond', style: 'color:var(--red);font-size:13px' }, 'In progress'), h('div', { class: 'bold' }, app.missions.run.def.title)), btn('Cancel mission', { icon: 'lock', on: () => { app.missions.cancel(); app.closeMenu(); } }))));
    root.append(tabs([['story', 'Story'], ['jobs', 'Jobs'], ['league', 'League'], ['custom', 'Custom']], tab, (t) => { tab = t; draw(); }), body);
    draw();
    return { el: root };
  },
};
void bar;
