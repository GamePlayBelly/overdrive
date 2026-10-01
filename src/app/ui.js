// Small DOM toolkit: element builder, icons, form controls, modal, toasts.
export const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  car: '<path d="M4.5 15.5L6 10.5A2 2 0 0 1 7.9 9h8.2a2 2 0 0 1 1.9 1.5l1.5 5"/><path d="M3 15.5h18V19H3z"/><circle cx="7.5" cy="19" r="1.6"/><circle cx="16.5" cy="19" r="1.6"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.5-.5-2.4z"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14a5 5 0 0 1 5 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0V4z"/><path d="M8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 14v4M8 21h8M10 18h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  house: '<path d="M4 20V10l8-6 8 6v10z"/><path d="M9 20v-6h6v6"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  play: '<path d="M7 4l13 8-13 8z"/>', pause: '<path d="M8 4v16M16 4v16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.6-.8-1.6-1.2-2.6-1.2-1.6 0-2.7.9-2.7 2 0 1.3 1.2 1.7 2.8 2 1.6.3 2.7.8 2.7 2s-1.1 2-2.8 2c-1.1 0-2.1-.4-2.8-1.2M12 6v2M12 16v2"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.5-3h5L16 7"/><circle cx="12" cy="13.5" r="3.5"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', back: '<path d="M19 12H5M11 6l-6 6 6 6"/>', chevron: '<path d="M9 5l7 7-7 7"/>', down: '<path d="M6 9l6 6 6-6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>', upload: '<path d="M12 16V5M7 9l5-5 5 5M4 20h16"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>', nav: '<path d="M12 3l7 17-7-4-7 4 7-17z"/>', flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-6"/><circle cx="12" cy="17" r="1"/>', key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.6-2.5H17a4 4 0 0 0 4-4 9 9 0 0 0-9-9.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  shirt: '<path d="M8 4L3 7l2 4 3-1v10h8V10l3 1 2-4-5-3a4 4 0 0 1-8 0z"/>', zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>', cloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9H7z"/>', moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/>',
  siren: '<path d="M6 19v-6a6 6 0 0 1 12 0v6"/><path d="M4 19h16M12 3v2M3 8l1.5 1M21 8l-1.5 1"/>', fuel: '<path d="M5 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15M4 20h12M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M8 7h4"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>', sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/>', bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>', anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 11H5M19 11h-3"/>',
  boat: '<path d="M3 15h18l-2 5H5l-2-5zM12 3v10M12 4l6 8h-6"/>', tree: '<path d="M12 3l6 8h-3l4 6H5l4-6H6l6-8zM12 17v4"/>', building: '<rect x="5" y="3" width="10" height="18"/><path d="M15 9h4v12h-4M8 7h4M8 11h4M8 15h4"/>', wave: '<path d="M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11L21 7H6"/>', tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.3"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
};

export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic ' + cls);
  s.innerHTML = ICONS[name] || ICONS.star;
  return s;
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'cls') el.className = v;
    else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const e in v) el.addEventListener(e, v[e]);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'ref') v.el = el;
    else if (k in el && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const $ = (s, r = document) => r.querySelector(s);

export const fmt = {
  money: (n) => '$' + Math.round(n).toLocaleString('en-US'),
  num: (n) => Math.round(n).toLocaleString('en-US'),
  time(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; },
  hours(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; },
  dist(m, units = 'kmh') { return units === 'mph' ? (m / 1609.34).toFixed(1) + ' mi' : (m / 1000).toFixed(1) + ' km'; },
  speed(ms, units = 'kmh') { return Math.round(ms * (units === 'mph' ? 2.23694 : 3.6)); },
  clock(h) { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return `${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`; },
  ago(t) { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; },
};

// ---- controls ----
export const btn = (label, o = {}) => h('button', { class: 'btn ' + (o.kind || '') + (o.sm ? ' sm' : '') + (o.lg ? ' lg' : '') + (o.cls ? ' ' + o.cls : ''), disabled: o.disabled, title: o.title, on: o.on ? { click: o.on } : undefined }, o.icon ? icon(o.icon) : null, label != null && label !== '' ? h('span', null, label) : null);
export function toggle(value, onChange) {
  const b = h('button', { class: 'toggle' + (value ? ' on' : ''), type: 'button', role: 'switch' });
  b.addEventListener('click', () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); onChange(v); });
  return b;
}
export function slider(min, max, step, value, onChange, fmtFn) {
  const val = h('span', { class: 'val' }, fmtFn ? fmtFn(value) : String(value));
  const s = h('input', { class: 'slider', type: 'range', min, max, step, value });
  const paint = () => s.style.setProperty('--p', ((s.value - min) / (max - min)) * 100 + '%');
  paint();
  s.addEventListener('input', () => { paint(); val.textContent = fmtFn ? fmtFn(+s.value) : s.value; onChange(+s.value); });
  return h('div', { class: 'row' }, s, val);
}
export function select(options, value, onChange) {
  const s = h('select', { class: 'sel' }, options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: v === value }, l); }));
  s.addEventListener('change', () => onChange(s.value));
  return s;
}
export function seg(options, value, onChange) {
  const root = h('div', { class: 'seg' });
  for (const o of options) {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    const b = h('button', { class: v === value ? 'on' : '', type: 'button' }, l);
    b.addEventListener('click', () => { for (const c of root.children) c.classList.remove('on'); b.classList.add('on'); onChange(v); });
    root.appendChild(b);
  }
  return root;
}
export const bar = (p, kind = '', cls = '') => h('div', { class: 'bar ' + kind + ' ' + cls }, h('i', { style: { width: Math.max(0, Math.min(100, p * 100)) + '%' } }));
export const chip = (text, kind = '', ic) => h('span', { class: 'chip ' + kind }, ic ? icon(ic) : null, text);
export const kv = (k, v) => h('div', { class: 'kv' }, h('span', null, k), h('b', null, v));
export const stat = (label, v, max = 10, kind = '') => h('div', { class: 'stat' }, h('span', null, label), bar(v / max, kind), h('b', null, v.toFixed(1)));
export const sect = (title, sub, ...right) => h('div', { class: 'sect' }, h('h2', null, title), sub ? h('small', null, sub) : null, h('span', { class: 'grow' }), right);
export function tabs(items, active, onChange) {
  const root = h('div', { class: 'tabs' });
  for (const [id, label] of items) {
    const b = h('button', { class: 'tab' + (id === active ? ' on' : '') }, label);
    b.addEventListener('click', () => { for (const c of root.children) c.classList.remove('on'); b.classList.add('on'); onChange(id); });
    root.appendChild(b);
  }
  return root;
}

// ---- modal / toast ----
export function modal({ title, body, actions = [], onClose, wide }) {
  const back = h('div', { class: 'modal-back' });
  const close = () => { back.remove(); onClose?.(); };
  const box = h('div', { class: 'modal', style: wide ? { width: 'min(820px, 94vw)' } : undefined }, title ? h('h2', null, title) : null, body,
    actions.length ? h('div', { class: 'actions' }, actions.map((a) => btn(a.label, { kind: a.kind, on: () => { if (a.on?.() !== false) close(); } }))) : null);
  back.appendChild(box);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.body.appendChild(back);
  return { close, box };
}
export const confirm = (title, msg, okLabel = 'Confirm') => new Promise((res) => modal({ title, body: h('p', { class: 'muted' }, msg), actions: [{ label: 'Cancel', on: () => res(false) }, { label: okLabel, kind: 'primary', on: () => res(true) }], onClose: () => res(false) }));

let toastRoot = null;
export function toast({ title, sub, kind = '', icon: ic, ms = 3800 }) {
  if (!toastRoot) { toastRoot = h('div', { id: 'toasts' }); document.body.appendChild(toastRoot); }
  const t = h('div', { class: 'toast ' + kind }, ic ? icon(ic) : null, h('div', null, h('div', { class: 'tt' }, title), sub ? h('div', { class: 'ts' }, sub) : null));
  toastRoot.appendChild(t);
  while (toastRoot.children.length > 5) toastRoot.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 380); }, ms);
  return t;
}

export function animateNumber(el, to, ms = 700, format = fmt.num) {
  const from = +el.dataset.v || 0;
  el.dataset.v = to;
  const t0 = performance.now();
  const f = (now) => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = format(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}

// global button ripple + hover / click sounds
export function installGlobalFx(getAudio) {
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('.btn'); if (!b) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
    const s = h('span', { class: 'ripple', style: { width: d + 'px', height: d + 'px', left: e.clientX - r.left - d / 2 + 'px', top: e.clientY - r.top - d / 2 + 'px' } });
    b.appendChild(s); setTimeout(() => s.remove(), 600);
  });
  document.addEventListener('click', (e) => { const t = e.target.closest?.('.btn,.rail-item,.home-item,.tab,.opt,.item,.seg button,.toggle,.swatch'); if (t) getAudio()?.ui?.(t.classList.contains('tab') || t.closest('.seg') ? 'tab' : 'click'); }, true);
  let lastHover = null;
  document.addEventListener('pointerover', (e) => { const t = e.target.closest?.('.btn,.rail-item,.home-item,.item'); if (t && t !== lastHover) { lastHover = t; getAudio()?.ui?.('hover'); } }, true);
}
