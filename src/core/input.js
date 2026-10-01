// Keyboard / mouse / gamepad with remappable actions.
export const DEFAULT_BINDS = {
  throttle: ['KeyW'],
  brake: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  handbrake: ['Space'],
  enter: ['KeyF', 'Enter'],
  camera: ['KeyC'],
  lookBack: ['KeyB'],
  horn: ['KeyH'],
  lights: ['KeyL'],
  siren: ['KeyG'],
  map: ['KeyM'],
  phone: ['KeyP', 'Tab'],
  pause: ['Escape'],
  reset: ['KeyR'],
  photo: ["F2"],
  interact: ['KeyE'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  indicatorL: ['KeyQ'],
  indicatorR: ['KeyE'],
  emote: ['KeyX'],
  replay: ['F3'],
  surrender: ['KeyK'],
  nitro: ['ShiftLeft', 'ShiftRight'],
  engine: ['KeyI'],
  hazard: ['KeyV'],
  highbeam: ['KeyJ'],
  radio: ['KeyT'],
  radioNext: ['KeyY'],
  cruise: ['KeyO'],
  gearUp: ['Period'],
  gearDown: ['Comma'],
  gearbox: ['KeyU'],
  doors: ['KeyZ'],
  photoMode: ['KeyN'],
};

export const ACTION_LABELS = {
  throttle: 'Accelerate / Walk forward', brake: 'Brake / Reverse', left: 'Steer left', right: 'Steer right', handbrake: 'Handbrake', enter: 'Enter / Exit vehicle',
  camera: 'Change camera', lookBack: 'Look back', horn: 'Horn', lights: 'Headlights', siren: 'Siren (police vehicles)', map: 'World map', phone: 'Phone', pause: 'Pause',
  reset: 'Reset vehicle', photo: 'Photo mode', interact: 'Interact', sprint: 'Sprint', jump: 'Jump', indicatorL: 'Left indicator', indicatorR: 'Right indicator', emote: 'Emote wheel', replay: 'Replay', surrender: 'Pull over / Surrender',
  nitro: 'Nitro', engine: 'Engine on / off', hazard: 'Hazard lights', highbeam: 'High beams', radio: 'Radio on / off', radioNext: 'Next station', cruise: 'Cruise control', gearUp: 'Shift up (manual)', gearDown: 'Shift down (manual)', gearbox: 'Automatic / manual', doors: 'Open doors / trunk', photoMode: 'Photo mode',
};

export class Input {
  constructor(el) {
    this.el = el;
    this.binds = structuredClone(DEFAULT_BINDS);
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, down: false, wheel: 0, locked: false };
    this.enabled = true;
    this.textFocus = false;
    this.pad = null;
    this.padPrev = [];
    this.deadzone = 0.15;
    this.steerSens = 1;
    this.invertY = false;
    this.mouseSens = 1;
    this.capture = null;
    addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); this.capture(e.code); this.capture = null; return; }
      if (isTyping(e)) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F2', 'F3'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => { this.down.delete(e.code); });
    addEventListener('blur', () => { this.down.clear(); });
    el.addEventListener('mousedown', (e) => { if (e.button === 0 || e.button === 2) this.mouse.down = true; if (e.button === 0) this.mouse.clicked = true; if (this.enabled && !document.pointerLockElement && el.requestPointerLock) { try { el.requestPointerLock(); } catch { /* ignore */ } } });
    addEventListener('mouseup', () => (this.mouse.down = false));
    addEventListener('mousemove', (e) => {
      if (this.mouse.down || document.pointerLockElement === this.el) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    el.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('gamepadconnected', (e) => { this.pad = e.gamepad.index; });
  }

  setBinds(b) { this.binds = { ...structuredClone(DEFAULT_BINDS), ...b }; }

  held(action) {
    if (!this.enabled) return false;
    const keys = this.binds[action] || [];
    for (const k of keys) if (this.down.has(k)) return true;
    return this.padHeld(action);
  }
  hit(action) {
    if (!this.enabled) return false;
    const keys = this.binds[action] || [];
    for (const k of keys) if (this.pressed.has(k)) return true;
    return this.padHit(action);
  }

  // analog axes combining keys and gamepad
  axis(neg, pos) {
    let v = (this.held(pos) ? 1 : 0) - (this.held(neg) ? 1 : 0);
    const gp = this.gp();
    if (gp && neg === 'left') { const a = gp.axes[0] || 0; if (Math.abs(a) > this.deadzone) v = Math.sign(a) * ((Math.abs(a) - this.deadzone) / (1 - this.deadzone)); }
    return v;
  }
  trigger(action) {
    const gp = this.gp();
    if (gp) {
      const idx = action === 'throttle' ? 7 : action === 'brake' ? 6 : -1;
      if (idx >= 0 && gp.buttons[idx] && gp.buttons[idx].value > 0.05) return gp.buttons[idx].value;
    }
    return this.held(action) ? 1 : 0;
  }
  lookAxes() {
    const gp = this.gp();
    const kx = (this.down.has('ArrowRight') ? 1 : 0) - (this.down.has('ArrowLeft') ? 1 : 0), ky = (this.down.has('ArrowDown') ? 1 : 0) - (this.down.has('ArrowUp') ? 1 : 0);
    if (!gp) return [kx, ky];
    const x = Math.abs(gp.axes[2] || 0) > this.deadzone ? gp.axes[2] : 0, y = Math.abs(gp.axes[3] || 0) > this.deadzone ? gp.axes[3] : 0;
    return [x || kx, y || ky];
  }

  gp() {
    if (this.pad == null) return null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return pads[this.pad] || null;
  }
  static PAD = { handbrake: 0, enter: 3, camera: 2, horn: 10, lookBack: 1, map: 8, pause: 9, phone: 12, reset: 13, sprint: 0, jump: 1, interact: 2, surrender: 14 };
  padHeld(action) { const gp = this.gp(); const b = Input.PAD[action]; return !!(gp && b != null && gp.buttons[b]?.pressed); }
  padHit(action) { const gp = this.gp(); const b = Input.PAD[action]; return !!(gp && b != null && gp.buttons[b]?.pressed && !this.padPrev[b]); }

  endFrame() {
    this.pressed.clear(); this.mouse.clicked = false;
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    const gp = this.gp();
    if (gp) this.padPrev = gp.buttons.map((b) => b.pressed);
  }

  keyName(code) {
    return code.replace('Key', '').replace('Digit', '').replace('Arrow', '↑→↓←'.includes('') ? '' : '').replace('Left', ' L').replace('Right', ' R');
  }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
