import { h } from './ui.js';

const TIPS = [
  ['Handbrake', 'Hold SPACE while steering at speed to throw the car into a drift. Release to straighten out.'],
  ['Wanted level', 'Police remember you. Break line of sight, hide, and lie low to lose heat; heat fades slowly.'],
  ['Camera', 'Press C to cycle chase, far, hood, cockpit and bumper cameras. B looks behind you.'],
  ['Weather', 'Rain lowers grip and visibility. Braking distances double on wet asphalt.'],
  ['Garage', 'Upgrade engine, tires, brakes, suspension and transmission at Nora\'s Garage.'],
  ['On foot', 'Walk up to a vehicle and press F. The door opens, you step in, and the engine fires.'],
  ['Nitro', 'Hold SHIFT with the throttle down for a burst of speed. It recharges while you drive.'],
  ['Landings', 'Ramps and hills will get you airborne. Level the car before touchdown for a clean landing.'],
  ['The sea', 'Boats and speedboats are moored at the harbor and along the coast. Take one out and feel the swell.'],
  ['Photo mode', 'Press F2 for photo mode: freeze the world, tilt the camera, adjust depth of field.'],
  ['Traffic', 'Traffic obeys signals and yields to sirens. Cut a red light and cross traffic will not stop for you.'],
  ['Progress', 'Missions, races and challenges earn XP and reputation. Reputation opens the Underground league.'],
];
const STEPS = {
  Materials: 'Preparing materials', Terrain: 'Shaping terrain', 'Road network': 'Laying the road network', 'City blocks': 'Zoning city blocks', Buildings: 'Raising buildings',
  'Street furniture': 'Placing street furniture', Vegetation: 'Planting forests and grass', Meshes: 'Baking meshes', Signals: 'Wiring traffic signals', Ready: 'Ready',
};

export class Loading {
  constructor(root) {
    this.root = root;
    this.p = 0; this.shown = 0; this.tip = 0; this.ready = false;
    this.canvas = h('canvas');
    this.pct = h('b', null, '0%');
    this.msg = h('span', { class: 'msg' }, 'Starting');
    this.fill = h('i');
    this.tipLabel = h('div', { class: 'tip-label' }, TIPS[0][0]);
    this.tipText = h('div', { class: 'tip-text' }, TIPS[0][1]);
    this.title = h('div', { class: 'boot-title' }, 'Overdrive', h('small', null, 'Riverton County'));
    this.go = h('div', { class: 'boot-go' }, h('button', null, 'Press any key to continue'));
    root.append(this.canvas, h('div', { class: 'boot-shade' }), this.title,
      h('div', { class: 'boot-tip' }, this.tipLabel, this.tipText), this.go,
      h('div', { class: 'boot-bottom' }, h('div', { class: 'boot-status' }, this.msg, this.pct), h('div', { class: 'boot-bar' }, this.fill)));
    this.startWorker();
    this.tipTimer = setInterval(() => this.nextTip(), 7000);
    this.dockTimer = setTimeout(() => root.classList.add('docked'), 3600);
    this.tickId = requestAnimationFrame(() => this.tick());
    this._key = (e) => { if (this.ready && !e.repeat && this.onContinue) this.onContinue(); };
    this._move = (e) => this.post({ type: 'mouse', x: e.clientX / innerWidth, y: e.clientY / innerHeight });
    addEventListener('keydown', this._key); addEventListener('pointermove', this._move);
    this.go.firstChild.addEventListener('click', () => this.onContinue?.());
  }

  startWorker() {
    try {
      this.worker = new Worker(new URL('../../w/src/app/loadingWorker3d.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => { if (e.data?.type === 'log') console.warn('loader:', e.data.text); };
      this.worker.onerror = (e) => console.warn('loader worker error:', e.message);
      const off = this.canvas.transferControlToOffscreen();
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      this.worker.postMessage({ type: 'init', canvas: off, w: innerWidth, h: innerHeight, dpr, car: new URLSearchParams(location.search).get('loadcar') || '', debug: new URLSearchParams(location.search).has('loadfps') }, [off]);
      this.resize = () => this.worker?.postMessage({ type: 'resize', w: innerWidth, h: innerHeight, dpr });
      addEventListener('resize', this.resize);
    } catch (e) { console.warn('loading worker unavailable', e); this.worker = null; this.root.style.background = 'radial-gradient(ellipse at 50% 40%, #1a1f26, #06080b 70%)'; }
  }
  post(m) { this.worker?.postMessage(m); }

  nextTip() {
    this.tip = (this.tip + 1) % TIPS.length;
    this.tipText.classList.add('swap');
    setTimeout(() => { this.tipLabel.textContent = TIPS[this.tip][0]; this.tipText.textContent = TIPS[this.tip][1]; this.tipText.classList.remove('swap'); }, 600);
  }

  setProgress(p, step) {
    this.p = Math.max(this.p, p);
    const txt = STEPS[step] || step;
    if (txt && this.msg.textContent !== txt) { const m = this.msg.cloneNode(); m.textContent = txt; this.msg.replaceWith(m); this.msg = m; }
    this.post({ type: 'progress', p: this.p });
  }

  tick() {
    this.shown += (this.p - this.shown) * 0.12;
    this.fill.style.transform = `scaleX(${this.shown})`;
    this.pct.textContent = Math.round(this.shown * 100) + '%';
    this.tickId = requestAnimationFrame(() => this.tick());
  }

  // world is built; wait for a key / click (also unlocks audio)
  whenReady(label = 'Press any key to continue') {
    this.ready = true;
    this.go.firstChild.textContent = label;
    this.go.classList.add('show');
    this.post({ type: 'done' });
    return new Promise((res) => { this.onContinue = () => { this.onContinue = null; res(); }; });
  }

  async dispose() {
    this.root.classList.add('gone');
    clearInterval(this.tipTimer); clearTimeout(this.dockTimer);
    await new Promise((r) => setTimeout(r, 1000));
    cancelAnimationFrame(this.tickId);
    removeEventListener('keydown', this._key); removeEventListener('pointermove', this._move);
    if (this.resize) removeEventListener('resize', this.resize);
    this.post({ type: 'stop' }); this.worker?.terminate();
    this.root.replaceChildren();
    this.root.classList.remove('gone');
    this.root.style.display = 'none';
  }

  // reuse for in-game transitions (fast travel etc.)
  static curtain(on) {
    let c = document.getElementById('curtain');
    if (!c) { c = h('div', { id: 'curtain' }, h('i', { class: 'l' }), h('i', { class: 'r' }), h('div', { class: 'logo' }, 'Overdrive')); document.body.appendChild(c); }
    requestAnimationFrame(() => c.classList.toggle('on', on));
    return new Promise((r) => setTimeout(r, on ? 620 : 560));
  }
}
