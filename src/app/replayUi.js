import { h, icon, fmt, seg, select, btn } from './ui.js';
import { SHOTS } from '../game/replay.js';

const SPEEDS = [0.25, 0.5, 1, 2];

// Transport bar and letterbox for replay mode; keys are routed in from the app.
export function buildReplayUI(app, R) {
  let drag = false, shown = 'pause';
  const play = btn('', { icon: 'pause', title: 'Play / pause (Space)', on: () => toggle() });
  const back = btn('', { icon: 'back', title: 'Back 5 s', on: () => R.seek(R.t - 5) });
  const fwd = btn('', { icon: 'arrow', title: 'Forward 5 s', on: () => R.seek(R.t + 5) });
  const time = h('span', { class: 'replay-time' }, '0:00 / 0:00');
  const slider = h('input', { class: 'slider', type: 'range', min: 0, max: 1000, value: 0, style: 'flex:1' });
  slider.addEventListener('pointerdown', () => { drag = true; });
  addEventListener('pointerup', () => { drag = false; });
  slider.addEventListener('input', () => { R.seek((slider.value / 1000) * R.length); paint(); });
  const speed = seg(SPEEDS.map((s) => [s, s + 'x']), 1, (s) => { R.speed = +s; });
  const shot = select(SHOTS, 'auto', (v) => { R.shot = v; R.C.key = ''; });
  const barsBtn = btn('Bars', { sm: true, on: () => { R.bars = !R.bars; el.classList.toggle('nobars', !R.bars); } });
  const name = `${R.v.def.brand} ${R.v.def.name}`;
  const el = h('div', { class: 'replay-ui' },
    h('div', { class: 'bar-top' }, h('div', { class: 'replay-tag' }, h('i'), 'REPLAY'), h('span', { class: 'dim' }, name), h('span', { class: 'grow' }), h('span', { class: 'replay-keys' }, 'Space pause  -  Left/Right seek  -  Up/Down speed  -  1-9 camera  -  B bars  -  Esc exit')),
    h('div', { class: 'bar-bot' },
      h('div', { class: 'replay-row' }, back, play, fwd, slider, time),
      h('div', { class: 'replay-row', style: 'justify-content:space-between' }, h('div', { class: 'row', style: 'gap:10px' }, speed, shot), h('div', { class: 'row', style: 'gap:8px' }, barsBtn, btn('Exit', { kind: 'primary', sm: true, icon: 'x', on: () => app.exitReplay() })))));

  function paint() {
    const len = R.length;
    if (!drag) slider.value = len ? Math.round((R.t / len) * 1000) : 0;
    slider.style.setProperty('--p', slider.value / 10 + '%');
    time.textContent = `${fmt.time(R.t)} / ${fmt.time(len)}`;
    const want = R.paused ? 'play' : 'pause';
    if (shown !== want) { play.firstChild.replaceWith(icon(want)); shown = want; }
  }
  function toggle() { R.paused = !R.paused; paint(); }

  const key = (e) => {
    const c = e.code;
    if (c === 'Escape' || c === 'Enter') { app.exitReplay(); return; }
    if (c === 'Space') toggle();
    else if (c === 'ArrowLeft') R.seek(R.t - 2);
    else if (c === 'ArrowRight') R.seek(R.t + 2);
    else if (c === 'ArrowUp' || c === 'ArrowDown') {
      const i = clampI(SPEEDS.indexOf(R.speed) + (c === 'ArrowUp' ? 1 : -1), 0, SPEEDS.length - 1);
      R.speed = SPEEDS[i]; [...speed.children].forEach((b, k) => b.classList.toggle('on', k === i));
    } else if (c === 'KeyB') { R.bars = !R.bars; el.classList.toggle('nobars', !R.bars); }
    else if (/^Digit[1-9]$/.test(c)) { const s = SHOTS[+c.slice(5) - 1]; if (s) { R.shot = s[0]; R.C.key = ''; shot.value = s[0]; } }
    else return;
    e.preventDefault();
  };
  paint();
  return { el, update: paint, key };
}

const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);
