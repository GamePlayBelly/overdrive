import { newProfile, migrate, apply, refreshChallenges, checkAchievements } from './economy.js';

const KEY = 'realworld.riverton.profile';
const SLOTS_KEY = 'realworld.riverton.slots';

// Profile store: local persistence + optional authoritative server sync
export class Store {
  constructor() {
    this.profile = null;
    this.listeners = new Set();
    this.net = null;
    this.dirty = false;
    this.lastSave = 0;
  }

  load() {
    let p = null;
    try { const raw = localStorage.getItem(KEY); if (raw) p = JSON.parse(raw); } catch { p = null; }
    this.profile = p ? migrate(p) : null;
    return !!this.profile;
  }

  create(name) {
    this.profile = newProfile(name);
    this.save(true);
    this.emit([]);
    return this.profile;
  }

  save(force = false) {
    if (!this.profile) return;
    const now = Date.now();
    if (!force && now - this.lastSave < 1500) { this.dirty = true; return; }
    try { localStorage.setItem(KEY, JSON.stringify(this.profile)); this.lastSave = now; this.dirty = false; } catch (e) { console.warn('save failed', e); }
  }

  tick() { if (this.dirty && Date.now() - this.lastSave > 1500) this.save(true); }

  // apply an action locally (and on the server when online)
  act(action) {
    const res = apply(this.profile, action);
    if (res.ok) {
      this.save();
      this.emit(res.grants, action);
      if (this.net?.connected) this.net.sendAction(action);
    }
    return res;
  }

  // non-economy profile fields (settings, world state, avatar look)
  patch(fn) {
    fn(this.profile);
    this.profile.updated = Date.now();
    this.save();
    this.emit([], { type: 'patch' });
  }

  replace(p) {
    const local = this.profile;
    this.profile = migrate(p);
    if (local) { this.profile.settings = local.settings; this.profile.world = local.world; }
    this.save(true);
    this.emit([], { type: 'sync' });
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(grants, action) { for (const f of this.listeners) f(grants, action); }

  exportJSON() { return JSON.stringify(this.profile, null, 1); }
  importJSON(text) {
    const p = JSON.parse(text);
    if (!p || !p.garage || !p.stats) throw new Error('Not a Real World save file');
    this.profile = migrate(p);
    this.save(true);
    this.emit([], { type: 'import' });
  }
  reset() { localStorage.removeItem(KEY); this.profile = null; }

  // manual backup slots
  slots() { try { return JSON.parse(localStorage.getItem(SLOTS_KEY) || '[]'); } catch { return []; } }
  saveSlot(i) {
    const s = this.slots();
    s[i] = { t: Date.now(), level: this.profile.level, name: this.profile.name, money: this.profile.money, data: this.profile };
    localStorage.setItem(SLOTS_KEY, JSON.stringify(s));
  }
  loadSlot(i) {
    const s = this.slots()[i];
    if (!s) return false;
    this.profile = migrate(structuredClone(s.data));
    this.save(true);
    this.emit([], { type: 'import' });
    return true;
  }

  refresh() { refreshChallenges(this.profile); checkAchievements(this.profile); }
}
