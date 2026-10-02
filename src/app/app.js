import * as THREE from 'three';
import { Loading } from './loading.js';
import { Hud } from './hud.js';
import { Menu } from './menu.js';
import { Home } from './home.js';
import { Stage } from './stage.js';
import { Phone } from './phone.js';
import { registerPages } from './pages/index.js';
import { renderMapCanvas } from '../ui/mapRender.js';
import { h, toast, icon, fmt, modal, installGlobalFx } from './ui.js';
import { SPAWNS } from '../data/world.js';
import { VEHICLE_BY_ID } from '../data/vehicles.js';
import { ACHIEVEMENTS } from '../data/meta.js';
import { ALL_ITEMS } from '../data/items.js';
import { findVehicle } from '../game/economy.js';
import { Store } from '../game/store.js';
import { NetClient } from '../net/client.js';
import { Missions } from '../game/missions.js';
import { Extras } from '../game/extras.js';
import { AuctionHouse } from '../game/auction.js';
import { Replay } from '../game/replay.js';
import { CarMeet } from '../game/carMeet.js';
import { Interiors } from './interiors.js';
import { buildReplayUI } from './replayUi.js';
import { RemotePlayers } from '../net/remote.js';
import { Assets } from '../core/assets.js';
import { clamp } from '../core/math.js';

const HOME_HOUR = 17.55;

// Application shell: boot, title screen, gameplay, menus, phone, photo mode, settings.
export class App {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.store = new Store();
    this.mode = 'boot';
    this.stageOn = false;
    this.homeT = 0; this.shot = -1;
    this.saveT = 0;
    this.blipFns = [];
    this.wpt = null;
    game.app = this;
    this.net = new NetClient(this);
    this.toast = toast;
    this.store.net = this.net;
    this.units = 'kmh';
    this.fadeEl = h('div', { style: 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity 0.45s;z-index:15' });
    document.body.appendChild(this.fadeEl);
  }

  get profile() { return this.store.profile; }
  blips() { const o = []; for (const f of this.blipFns) o.push(...f()); return o; }

  // ------------------------------------------------------------------ boot
  async boot() {
    const root = document.getElementById('boot');
    installGlobalFx(() => this.game.audio);
    this.game.audio.init();
    const loading = (this.loading = new Loading(root));
    this.store.load();
    if (this.profile) this.applySettings(true);
    else this.game.gfx = { preset: 'auto' };
    await Assets.init();
    await this.game.init((p, msg) => loading.setProgress(p * 0.92, msg));
    loading.setProgress(0.94, 'Drawing the map');
    await new Promise((r) => setTimeout(r, 30));
    this.mapCanvas = renderMapCanvas(this.game.world);
    loading.setProgress(0.97, 'Preparing the interface');
    this.stage = new Stage(this.game);
    this.hud = new Hud(this);
    this.hud.setMapCanvas(this.mapCanvas);
    this.missions = new Missions(this);
    this.extras = new Extras(this);
    this.remote = new RemotePlayers(this);
    this.auction = new AuctionHouse(this);
    this.replay = new Replay(this.game);
    this.meet = new CarMeet(this);
    this.interiors = new Interiors(this);
    this.blipFns.push(() => this.extras.blips());
    this.blipFns.push(() => this.meet.blips());
    this.blipFns.push(() => this.game.maritime.blips());
    this.menu = new Menu(this);
    registerPages(this.menu);
    this.home = new Home(this);
    this.phone = new Phone(this);
    this.bindEvents();
    this.applySettings();
    // world dressing for the title screen
    this.setupWorldState();
    loading.setProgress(1, 'Ready');
    const q = new URLSearchParams(location.search);
    if (q.has('dev')) { await this.devStart(q); return; }
    await loading.whenReady('Press any key to continue');
    await this.game.audio.unlock().catch((e) => console.warn(e));
    this.game.audio.setVolumes(this.profile?.settings.audio || {});
    this.game.audio.setVolumes(this.profile?.settings.audio || {});
    this.game.audio.ui('confirm');
    await loading.dispose();
    this.showHome();
    window.__app = this;
  }

  // test entry: no title screen, drive immediately (used by the automated tools)
  async devStart(q) {
    const g = this.game;
    if (!this.profile) this.store.create('Dev');
    this.applySettings();
    this.loading.root.style.display = 'none';
    this.mode = 'play';
    g.sky.lockWeather = null; g.sky.timeScale = 1;
    g.input.enabled = true;
    if (!this.extras.built) { this.extras.built = true; this.extras.build(); }
    const v = this.hero;
    g.player.hidden = false;
    g.player.enter(v);
    g.rig.snapBehind();
    this.hud.show(q.has('hud'));
    if (q.has('home')) { this.showHome(); }
    window.__app = this;
  }

  // ------------------------------------------------------------------ world state
  heroSpec() {
    const p = this.profile;
    const land = p ? p.garage.vehicles.filter((x) => !VEHICLE_BY_ID[x.model]?.boat) : [];
    const sel = p ? findVehicle(p, p.garage.selected) : null;
    const pv = p ? (sel && !VEHICLE_BY_ID[sel.model]?.boat ? sel : land[0]) : null;
    return pv ? { model: pv.model, custom: { ...pv.custom, perf: pv.perf }, uid: pv.uid, damage: pv.damage } : { model: 'civa', custom: { color: '#7a1f23' }, uid: null, damage: 0 };
  }

  // boats bought in the shop wait at a free berth of the marina
  spawnOwnedBoats() {
    const g = this.game, p = this.profile;
    if (!p || !g.yard) return;
    for (const v of [...g.vehicles]) if ((v.isBoat || v.isAir) && v.owned && v.uid && v !== g.player.vehicle && !p.garage.vehicles.some((x) => x.uid === v.uid)) g.removeVehicle(v);
    for (const pv of p.garage.vehicles) {
      const def = VEHICLE_BY_ID[pv.model];
      if (def?.air && !g.vehicles.some((v) => v.uid === pv.uid)) {
        const sp = g.airfield?.freeSpot(def);
        if (sp) { const v = g.spawnVehicle(pv.model, sp[0], sp[1], def.air === 'heli' ? 0 : Math.PI / 2, { ...pv.custom, perf: pv.perf }, { owned: true, uid: pv.uid }); if (pv.damage > 0) v.damage.total = pv.damage; }
        continue;
      }
      if (!def?.boat || g.vehicles.some((v) => v.uid === pv.uid)) continue;
      const b = g.yard.freeBerth(def);
      if (!b) continue;
      const v = g.spawnVehicle(pv.model, b.x, b.z, b.yaw, { ...pv.custom, perf: pv.perf }, { owned: true, uid: pv.uid });
      v.moor = { x: b.x, z: b.z, yaw: b.yaw };
      v.berth = { site: 'owned', x: b.x, z: b.z, yaw: b.yaw };
      if (pv.damage > 0) v.damage.total = pv.damage;
    }
  }

  spawnHero(x, z, yaw) {
    const g = this.game, s = this.heroSpec();
    if (this.hero) g.removeVehicle(this.hero);
    const v = g.spawnVehicle(s.model, x, z, yaw, s.custom, { hero: true, owned: true, uid: s.uid });
    if (s.damage > 0) v.damage.total = s.damage;
    v.input = { throttle: 0, brake: 0.6, steer: 0, hand: true, boost: false };
    this.hero = v;
    return v;
  }

  setupWorldState() {
    const g = this.game, poi = g.world.poi;
    g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
    g.sky.time = HOME_HOUR; g.sky.timeScale = 0.03;
    const gx = poi.garage.x, gz = poi.garage.z;
    this.spawnHero(gx + 5, gz + 1.5, Math.PI / 2 + 0.25);
    g.player.place(gx + 2.5, gz - 3, 0.6);
    g.player.hidden = true; g.player.rig.root.visible = false;
    g.traffic.density = 0.8;
  }

  startMission(id) { return this.missions.startStory(id); }
  startJob(id) { return this.missions.startJob(id); }
  startLeagueRace(id) { return this.missions.startLeague(id); }
  startCustomRace(id) { return this.missions.startCustom(id); }
  missionStartPoint(m) { return this.missions.startPoint(m); }

  setWaypoint(pt) { this.wpt = pt; if (this.hud) this.hud.wpt = pt; }

  async fastTravel(x, z, yaw = 0, exact = false) {
    const g = this.game;
    if (this.mode === 'menu-play') this.closeMenu();
    await Loading.curtain(true);
    const R = g.world.roads, n = exact ? null : R.nearestLane(x, z, 0, 0, null, 60);
    let px = x, pz = z, py = yaw;
    if (n) { const pt = n.lane.pl.at(n.s); px = pt.x; pz = pt.z; py = Math.atan2(pt.dx, pt.dz); }
    const v = this.hero;
    v.place(px, g.world.groundY(px, pz, 80), pz, py);
    if (g.player.vehicle === v) { g.rig.snapBehind(); }
    else { const s = Math.sin(py), c = Math.cos(py); g.player.place(px + c * 3.2, pz - s * 3.2, py); g.rig.footYaw = py; }
    await new Promise((r) => setTimeout(r, 250));
    await Loading.curtain(false);
  }

  callVehicle() {
    const g = this.game, P = g.player, p = this.profile;
    if (p.money < 250) { toast({ title: 'Not enough cash', sub: 'Delivery costs $250', kind: '', icon: 'lock' }); return; }
    this.store.act({ type: 'fine', amount: 250, reason: 'Vehicle delivery' });
    const R = g.world.roads, n = R.nearestLane(P.x + Math.sin(g.rig.footYaw) * 10, P.z + Math.cos(g.rig.footYaw) * 10, 0, 0, null, 60);
    let x = P.x + 6, z = P.z, yaw = 0;
    if (n) { const pt = n.lane.pl.at(n.s); x = pt.x; z = pt.z; yaw = Math.atan2(pt.dx, pt.dz); }
    if (g.player.vehicle) return;
    this.spawnHero(x, z, yaw);
    toast({ title: 'Your car has arrived', sub: 'Nora dropped it nearby', kind: 'green', icon: 'car' });
    this.setWaypoint({ x, z });
  }

  repairCurrent() {
    const g = this.game, v = g.player.vehicle || this.hero, pv = this.profile.garage.vehicles.find((x) => x.uid === v?.uid);
    if (!v) return;
    const cost = pv ? Math.round((v.damage.total || 0) * 1200 + 100) : 0;
    if (this.profile.money < cost) { toast({ title: 'Not enough cash', sub: `Repair costs ${fmt.money(cost)}`, icon: 'lock' }); return; }
    if (cost) this.store.act({ type: 'fine', amount: cost, reason: 'Repairs' });
    v.repair();
    if (pv) this.store.act({ type: 'setDamage', uid: pv.uid, damage: 0, km: 0 });
    toast({ title: 'Vehicle repaired', sub: cost ? fmt.money(cost) : 'Free', kind: 'green', icon: 'wrench' });
  }

  // ------------------------------------------------------------------ settings
  applySettings(early = false) {
    const p = this.profile; if (!p) return;
    const S = p.settings, g = this.game;
    g.gfx = S.graphics;
    this.units = S.general.units;
    document.documentElement.style.setProperty('--scale', S.access.textScale);
    document.documentElement.classList.toggle('high-contrast', !!S.access.highContrast);
    document.documentElement.classList.toggle('reduce-motion', !!S.access.reduceMotion);
    if (early) return;
    g.gov.setSettings(S.graphics);
    g.audio.setVolumes(S.audio);
    g.input.setBinds(S.controls.binds || {});
    g.input.mouseSens = S.controls.mouseSens; g.input.invertY = S.controls.invertY; g.input.steerSens = S.controls.steerSens; g.input.deadzone = S.controls.deadzone;
    g.rig.baseFov = S.graphics.fov; g.rig.shakeEnabled = !!S.access.cameraShake && !S.access.reduceMotion; g.rig.fovEffects = !S.access.reduceMotion;
    g.sky.timeScale = this.mode === 'play' || this.mode === 'menu-play' ? S.general.timeScale : 0.03;
    this.hud?.el && (this.hud.el.style.filter = '');
    document.body.classList.remove('cb-deutan', 'cb-protan', 'cb-tritan');
    if (S.access.colorblind && S.access.colorblind !== 'none') document.body.classList.add('cb-' + S.access.colorblind);
    for (const v of g.vehicles) v.phys.tc = S.controls.tc;
    const assist = { off: 0.0, standard: 0.6, high: 0.95 }[S.controls.assist] ?? 0.6;
    for (const v of g.vehicles) v.phys.assist = assist;
    this.assist = assist;
  }

  // ------------------------------------------------------------------ events
  bindEvents() {
    const g = this.game;
    this.store.on((grants, action) => this.onGrants(grants, action));
    addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && this.mode === 'play' && !this.replayBusy) this.openMenu('home'); });
    addEventListener('resize', () => { g.resize(innerWidth, innerHeight); this.stage?.resize(); });
    g.on('vehicle:crash', (e) => { if (e.v === g.player.vehicle && e.impact > 6) { this.hud.damageFlash(e.impact / 30); this.store.profile && this.store.act({ type: 'stat', key: 'crashes', amount: 1 }); } });
    g.on('vehicle:landing', (e) => { if (e.v === g.player.vehicle) { this.store.act({ type: 'stat', key: 'airTime', amount: e.air }); this.store.act({ type: 'stat', key: 'bestAir', amount: e.air, mode: 'max' }); if (e.air > 0.9) this.hud.gain(`Air time ${e.air.toFixed(1)}s`, '#8fb8ff'); if (e.hard) g.rig.addShake(Math.min(0.8, e.speed / 14)); } });
    g.on('hud:big', (e) => this.hud.big(e.text, e.sub, e.kind));
    g.on('hud:gain', (e) => this.hud.gain(e.text, e.color));
    g.on('hud:toast', (e) => toast({ title: e.text }));
    g.on('toast', (e) => toast({ title: e.text }));
    g.on('police:radio', (e) => this.hud.say('Dispatch', e.text, 3800));
    g.on('marine:radio', (e) => this.hud.say(e.who || 'Coast Guard', e.text, 4200));
    g.on('police:level', (e) => { if (e.level > e.prev) { this.hud.gain(`Wanted level ${e.level}`, '#ff6b6b'); g.audio.ui('error'); } });
    g.on('police:clear', (e) => {
      if (e.level && e.reason === 'escape') {
        const v = g.player.vehicle;
        this.store.act({ type: 'pursuitEnd', result: 'escape', level: e.level, bounty: e.bounty, time: e.time, damage: v ? v.damage.total : 0 });
        this.hud.big('ESCAPED', 'The police lost you', 'green');
      }
    });
    g.on('police:ticket', (e) => { this.store.act({ type: 'pursuitEnd', result: 'ticket', level: 1, fine: e.fine }); this.hud.big('PULLED OVER', `Citation $${e.fine}`, ''); });
    g.on('police:arrest', (e) => this.onArrest(e));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.openMenu('home'); });
  }

  onGrants(grants, action) {
    if (!this.hud) return;
    for (const gr of grants) {
      if (gr.type === 'xp') this.hud.gain(`+${fmt.num(gr.amount)} XP`, '#8fb8ff');
      else if (gr.type === 'rep') this.hud.gain(`${gr.amount > 0 ? '+' : ''}${gr.amount} REP`, gr.amount > 0 ? '#ffb4b6' : '#ff5a5f');
      else if (gr.type === 'level') { this.game.audio.ui('levelup'); this.showLevelUp(gr); }
      else if (gr.type === 'rank') toast({ title: 'New reputation rank', sub: gr.rank, kind: 'gold', icon: 'star' });
      else if (gr.type === 'achievement') { this.game.audio.ui('unlock'); toast({ title: 'Achievement unlocked', sub: gr.name, kind: 'gold', icon: 'award' }); }
      else if (gr.type === 'item') toast({ title: 'Item unlocked', sub: ALL_ITEMS[gr.id]?.name || gr.id, kind: 'green', icon: 'bag' });
      else if (gr.type === 'vehicle') toast({ title: 'Vehicle added to garage', sub: VEHICLE_BY_ID[gr.model]?.name || gr.model, kind: 'green', icon: 'car' });
      else if (gr.type === 'title') toast({ title: 'New title', sub: gr.title, kind: 'blue', icon: 'user' });
      else if (gr.type === 'tokens') toast({ title: `+${gr.amount} tokens`, kind: 'gold', icon: 'bolt' });
    }
    if (grants.some((x) => x.type === 'vehicle') || action?.type === 'sellVehicle' || action?.type === 'auctionSell') setTimeout(() => this.spawnOwnedBoats(), 50);
    this.menu?.updateChips();
  }

  async onArrest(e) {
    const g = this.game, P = g.player;
    if (this.mode !== 'play') return;
    this.store.act({ type: 'pursuitEnd', result: 'arrest', level: e.level, bounty: e.bounty });
    this.hud.big('BUSTED', 'You were arrested', 'red');
    g.audio.ui('error');
    g.lock = true;
    await new Promise((r) => setTimeout(r, 1900));
    await Loading.curtain(true);
    g.lock = false;
    const poi = g.world.poi.police, d = poi.door || poi;
    for (const u of [...g.police.units]) g.police.removeUnit(u);
    const v = this.hero;
    if (P.vehicle && P.vehicle !== v) { P.exit(); }
    if (P.vehicle === v) P.exit();
    P.place(d.x, d.z - 1.5, Math.PI);
    g.rig.footYaw = Math.PI; g.rig.settle = 0.01;
    g.sky.time = (g.sky.time + 3) % 24;
    await new Promise((r) => setTimeout(r, 400));
    await Loading.curtain(false);
    this.hud.say('', 'Your vehicle was impounded and released after you paid the fine.', 4200);
  }

  showLevelUp(lv) {
    const R = lv.rewards || {};
    const parts = [];
    if (lv.money) parts.push(h('div', { class: 'kv' }, h('span', null, 'Cash'), h('b', null, fmt.money(lv.money))));
    for (const v of R.vehicles || []) parts.push(h('div', { class: 'kv' }, h('span', null, 'Vehicle unlocked'), h('b', null, VEHICLE_BY_ID[v]?.name || v)));
    for (const i of R.items || []) parts.push(h('div', { class: 'kv' }, h('span', null, 'Item unlocked'), h('b', null, ALL_ITEMS[i]?.name || i)));
    if (R.title) parts.push(h('div', { class: 'kv' }, h('span', null, 'Title'), h('b', null, R.title)));
    if (R.emote) parts.push(h('div', { class: 'kv' }, h('span', null, 'Emote'), h('b', null, R.emote)));
    this.hud.big(`Level ${lv.level}`, 'Level up', 'green');
    setTimeout(() => modal({ title: `Level ${lv.level}`, body: h('div', null, h('p', { class: 'muted' }, 'You reached a new level in Riverton.'), parts), actions: [{ label: 'Nice', kind: 'primary' }] }), 900);
  }

  onKey(e) {
    if (this.mode === 'replay') { this.replayUI?.key(e); return; }
    if (e.repeat) return;
    if (e.code === 'Escape') {
      if (document.querySelector('.modal-back')) return;
      if (this.mode === 'boot') return;
      if (this.mode === 'photo') { this.exitPhoto(); return; }
      if (this.phone?.open) { this.phone.hide(); return; }
      if (this.mode === 'menu-play' || this.mode === 'menu-home') { this.closeMenu(); return; }
      if (this.mode === 'play') { this.openMenu('home'); return; }
    }
    if (this.mode === 'play' && !this.game.player.busy) {
      const I = this.game.input;
      if (I.binds.map.includes(e.code)) { this.openMenu('world'); e.preventDefault(); }
      else if (I.binds.phone.includes(e.code)) { this.phone.toggle(); e.preventDefault(); }
      else if (I.binds.photo.includes(e.code) || I.binds.photoMode.includes(e.code)) { this.enterPhoto(); e.preventDefault(); }
      else if (I.binds.replay?.includes(e.code)) { this.startReplay(); e.preventDefault(); }
    } else if (this.mode === 'play' && this.phone?.open && (this.game.input.binds.phone.includes(e.code))) { this.phone.hide(); e.preventDefault(); }
  }

  // ------------------------------------------------------------------ home
  showHome() {
    this.mode = 'home';
    this.game.input.enabled = false;
    this.game.input.pressed.clear(); this.game.input.down.clear();
    this.hud.show(false);
    this.home.show();
    this.game.sky.timeScale = 0.03;
    this.game.pipeline.setDepth(true);
    this.homeT = 0; this.shot = -1; this.game.rig.cine = null;
    this.game.player.hidden = true;
    this.updateHome(0);
  }

  hideHomeFx() { this.game.pipeline.setDepth(false); this.game.pipeline.fx.dof = 0; this.game.rig.cine = null; }

  homeShots() {
    const g = this.game, poi = g.world.poi, car = this.hero;
    const ground = (x, z) => g.world.groundY(x, z, 60);
    const at = (x, y, z) => new THREE.Vector3(x, Math.max(y, ground(x, z) + 0.6), z);
    const cx = car.x, cz = car.z, cy = car.y;
    return [
      { dur: 17, fov: 40, dof: 0.3, from: (t) => { const a = 3.9 + t * 0.06; return at(cx + Math.cos(a) * 7.2, cy + 1.5 + t * 0.03, cz + Math.sin(a) * 7.2); }, target: () => new THREE.Vector3(cx, cy + 0.75, cz), focus: 7.2 },
      { dur: 14, fov: 36, dof: 0.35, from: (t) => at(cx - 3.2 + t * 0.12, cy + 0.55, cz + 4.6 - t * 0.05), target: () => new THREE.Vector3(cx + 0.6, cy + 0.6, cz), focus: 5 },
      { dur: 16, fov: 45, dof: 0.2, from: (t) => at(-8 + t * 1.6, 34, 130 - t * 1.4), target: (t) => new THREE.Vector3(30 + t * 0.7, 32, -120), focus: 200 },
      { dur: 14, fov: 42, dof: 0.35, from: (t) => at(-940 - t * 0.6, 9 + t * 0.15, 60 - t * 1.5), target: () => new THREE.Vector3(-1090, 6, -80), focus: 130 },
      { dur: 15, fov: 38, dof: 0.3, from: (t) => { const a = 1.2 - t * 0.05; return at(cx + Math.cos(a) * 9, cy + 2.6, cz + Math.sin(a) * 9); }, target: () => new THREE.Vector3(cx, cy + 0.9, cz), focus: 9 },
    ];
  }

  updateHome(dt) {
    const g = this.game, rig = g.rig;
    this.homeT += dt;
    if (!this._shots) this._shots = this.homeShots();
    const sh = this._shots;
    let idx = this.shot;
    if (idx < 0 || this.homeT > sh[idx].dur) {
      idx = idx < 0 ? 0 : (idx + 1) % sh.length;
      if (this.shot >= 0) { this.fadeEl.style.opacity = '1'; }
      this.shot = idx; this.homeT = 0;
      const s = sh[idx];
      const start = () => {
        rig.cine = { t: 0, from: (t) => s.from(t), target: (t) => s.target(t), fov: s.fov, snap: 40, dur: 0 };
        rig.pos.copy(s.from(0)); rig.look.copy(s.target(0));
        g.pipeline.fx.dof = s.dof; g.pipeline.fx.focus.set(s.focus, 2.2);
        this.fadeEl.style.opacity = '0';
      };
      if (this.shot > 0 || idx > 0) setTimeout(start, 450); else start();
    }
    const s = sh[idx];
    if (rig.cine) { g.pipeline.fx.focus.x += (s.focus - g.pipeline.fx.focus.x) * Math.min(1, dt * 2); }
  }

  playFromHome() {
    if (!this.profile) { this.openMenu('creator'); return; }
    this.startPlay();
  }

  async startPlay({ fresh = true } = {}) {
    const g = this.game, p = this.profile;
    await Loading.curtain(true);
    this.home.hide();
    this.hideHomeFx();
    this._shots = null;
    this.mode = 'play';
    g.input.enabled = true; g.input.pressed.clear(); g.input.down.clear();
    const sp = SPAWNS.find((s) => s.id === p.world.spawn) || SPAWNS[0];
    const last = p.world.last;
    if (fresh) {
      const gx = last ? last.x : sp.x, gz = last ? last.z : sp.z, yaw = last ? last.yaw : sp.heading;
      const v = this.spawnHero(gx + Math.sin(yaw) * 0, gz, yaw);
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
      g.player.hidden = false; g.player.state = 'foot'; g.player.vehicle = null; g.player.seq = null;
      g.player.place(v.group.position.x + c * 3.0 + s * 1.2, v.group.position.z - s * 3.0 + c * 1.2, v.yaw + Math.PI * 0.9);
      g.player.rig.root.visible = true;
      g.rig.snapBehind(); g.rig.footYaw = g.player.yaw; g.rig.settle = 0.01;
      g.sky.time = p.world.time; g.sky.lockWeather = null; g.sky.setWeather(p.world.weather || 'sunny', true);
    }
    this.spawnOwnedBoats();
    if (!this.extras.built) { this.extras.built = true; this.extras.build(); }
    g.sky.timeScale = p.settings.general.timeScale;
    g.traffic.density = 1;
    this.applySettings();
    this.hud.show(true);
    await new Promise((r) => setTimeout(r, 120));
    await Loading.curtain(false);
    g.audio.ui('confirm');
    this.hud.big('Riverton', p.world.day > 1 ? `Day ${p.world.day}` : 'Welcome back');
  }

  saveWorld() {
    const g = this.game, p = this.profile; if (!p) return;
    const pos = this.interiors?.inside && this.interiors.ret ? this.interiors.ret : (g.player.vehicle || g.player);
    this.store.patch((pr) => { pr.world.time = g.sky.time; pr.world.weather = g.sky.weather; pr.world.last = { x: pos.x, z: pos.z, yaw: pos.yaw || 0 }; pr.world.day = g.sky.day || pr.world.day; });
    const v = g.player.vehicle;
    if (v && v.uid) this.store.act({ type: 'setDamage', uid: v.uid, damage: v.damage.total, km: 0 });
  }

  async quitToHome() {
    await Loading.curtain(true);
    this.saveWorld();
    this.menu.hide(); this.phone.hide?.(true);
    this.hud.show(false);
    const g = this.game;
    if (g.player.vehicle) g.player.exit();
    this.meet?.teardown();
    this.setupWorldState();
    this.showHome();
    await Loading.curtain(false);
  }

  // ------------------------------------------------------------------ menu
  openMenu(page = 'home') {
    const wasPlay = this.mode === 'play';
    if (this.mode === 'photo') this.exitPhoto();
    if (this.mode === 'play' || this.mode === 'home' || this.mode === 'menu-home' || this.mode === 'menu-play') {
      this.mode = wasPlay || this.mode === 'menu-play' ? 'menu-play' : 'menu-home';
      this.game.input.enabled = false; this.game.input.pressed.clear(); this.game.input.down.clear();
      document.exitPointerLock?.();
      if (this.mode === 'menu-home') this.home.hide();
      this.hud.show(false);
      this.phone.hide?.(true);
      this.menu.show(page);
      this.game.audio.ui('open');
    }
  }

  closeMenu() {
    if (!this.menu.open) return;
    this.menu.hide();
    this.stageOn = false;
    this.game.audio.ui('close');
    if (this.mode === 'menu-play') {
      this.mode = 'play'; this.game.input.enabled = true; this.game.input.pressed.clear(); this.game.input.down.clear(); this.hud.show(true);
      // vehicle customization may have changed the selected car
      this.refreshHero();
    } else if (this.mode === 'menu-home') { this.mode = 'home'; this.refreshHero(); this.home.show(); }
  }

  refreshHero() {
    const g = this.game, p = this.profile, v = this.hero;
    if (!p || !v || g.player.vehicle === v && g.player.state !== 'driving') return;
    const s = this.heroSpec();
    const key = JSON.stringify([s.model, s.custom]);
    if (this._heroKey === undefined) this._heroKey = key;
    if (this._heroKey === key) { if (v.phys) v.phys.retune(s.custom.perf || {}); return; }
    this._heroKey = key;
    const inCar = g.player.vehicle === v;
    const x = v.x, z = v.z, yaw = v.yaw;
    if (inCar) g.player.exit();
    const nv = this.spawnHero(x, z, yaw);
    if (inCar) { g.player.enter(nv); g.rig.snapBehind(); }
    this._shots = null;
  }

  setStageMode(on) { this.stageOn = on; if (on) { this.stage.resize(); } }

  openPhone() { this.closeMenuQuiet(); this.phone.show(); }
  closeMenuQuiet() { if (this.mode === 'menu-play') { this.menu.hide(); this.mode = 'play'; this.game.input.enabled = true; this.hud.show(true); } }

  // ------------------------------------------------------------------ photo mode
  enterPhoto() {
    if (this.mode !== 'play') return;
    this.mode = 'photo'; this.hud.show(false); this.phone.hide?.(true);
    this.photo = { yaw: 0, pitch: 0, roll: 0, fov: this.game.camera.fov, dof: 0, focus: 8, sat: 1, contrast: 1, vig: 0.3, filter: 'none', freeze: true, pos: this.game.camera.position.clone(), yawCam: null };
    const cam = this.game.camera, e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    this.photo.yaw = e.y; this.photo.pitch = e.x;
    this.game.input.enabled = false;
    this.photoEl = h('div', { class: 'photo-frame' });
    this.photoUI = this.buildPhotoUI();
    document.body.append(this.photoEl, this.photoUI);
    this.game.pipeline.setDepth(true);
    this.game.rig.cine = { t: 0, from: () => this.photo.pos, target: () => new THREE.Vector3(), fov: 60, snap: 1000, dur: 0, photo: true };
  }

  buildPhotoUI() {
    const P = this.photo, g = this.game;
    const row = (label, min, max, step, key, fmtf = (v) => v.toFixed(2)) => { const s = h('input', { class: 'slider', type: 'range', min, max, step, value: P[key] }); const v = h('span', { class: 'val' }, fmtf(P[key])); s.style.setProperty('--p', ((P[key] - min) / (max - min)) * 100 + '%'); s.addEventListener('input', () => { P[key] = +s.value; v.textContent = fmtf(P[key]); s.style.setProperty('--p', ((P[key] - min) / (max - min)) * 100 + '%'); }); return h('div', { class: 'setting', style: 'padding:6px 0' }, h('div', { class: 'lbl' }, label), s, v); };
    const box = h('div', { class: 'card', style: 'position:fixed;left:22px;top:11vh;width:320px;z-index:26;max-height:74vh;overflow:auto' },
      h('h3', null, 'Photo mode'),
      row('Field of view', 20, 100, 1, 'fov', (v) => v + '°'), row('Roll', -0.6, 0.6, 0.01, 'roll'), row('Depth of field', 0, 1, 0.01, 'dof'), row('Focus distance', 1, 120, 0.5, 'focus', (v) => v + ' m'),
      row('Saturation', 0, 1.8, 0.02, 'sat'), row('Contrast', 0.7, 1.5, 0.02, 'contrast'), row('Vignette', 0, 0.9, 0.02, 'vig'),
      h('div', { class: 'setting', style: 'padding:6px 0' }, h('div', { class: 'lbl' }, 'Filter'), (() => { const s = h('select', { class: 'sel', style: 'min-width:120px' }, ['none', 'warm', 'cool', 'mono', 'noir', 'vivid'].map((f) => h('option', { value: f }, f))); s.addEventListener('change', () => (P.filter = s.value)); return s; })()),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn primary grow', on: { click: () => this.takePhoto() } }, icon('camera'), 'Take photo'), h('button', { class: 'btn', on: { click: () => this.exitPhoto() } }, 'Exit')),
      h('div', { class: 'dim sm', style: 'margin-top:8px' }, 'Mouse: look  -  WASD: move  -  Q/E: down/up  -  Shift: fast  -  Enter: photo'));
    void g;
    return box;
  }

  photoFrame(dt) {
    const g = this.game, P = this.photo, I = g.input, cam = g.camera;
    const dx = I.mouse.dx, dy = I.mouse.dy;
    I.mouse.dx = I.mouse.dy = 0;
    if (I.mouse.down) { P.yaw -= dx * 0.003; P.pitch = clamp(P.pitch - dy * 0.003, -1.4, 1.4); }
    const k = (this._pk ||= new Set());
    const held = (c) => I.down.has(c);
    const sp = (held('ShiftLeft') ? 26 : 7) * dt;
    const fw = new THREE.Vector3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
    const rt = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    if (held('KeyW')) P.pos.addScaledVector(fw, sp); if (held('KeyS')) P.pos.addScaledVector(fw, -sp);
    if (held('KeyA')) P.pos.addScaledVector(rt, -sp); if (held('KeyD')) P.pos.addScaledVector(rt, sp);
    if (held('KeyE')) P.pos.y += sp; if (held('KeyQ')) P.pos.y -= sp;
    P.pos.y = Math.max(P.pos.y, g.world.groundY(P.pos.x, P.pos.z, P.pos.y + 3) + 0.3);
    cam.position.copy(P.pos);
    cam.rotation.order = 'YXZ'; cam.rotation.set(P.pitch, P.yaw, P.roll);
    if (Math.abs(cam.fov - P.fov) > 0.01) { cam.fov = P.fov; cam.updateProjectionMatrix(); }
    const fx = g.pipeline.fx;
    fx.dof = P.dof; fx.focus.set(P.focus, 2.5); fx.sat = P.sat; fx.contrast = P.contrast; fx.vig = P.vig;
    const F = { none: [1, 1, 1, 0, 0, 0], warm: [1.08, 1, 0.9, 0.02, 0, -0.02], cool: [0.92, 1, 1.08, -0.02, 0, 0.02], mono: [1, 1, 1, 0, 0, 0], noir: [1, 1, 1, 0, 0, 0], vivid: [1, 1, 1, 0, 0, 0] }[P.filter] || [1, 1, 1, 0, 0, 0];
    fx.tint.set(F[0], F[1], F[2]); fx.lift.set(F[3], F[4], F[5]);
    if (P.filter === 'mono' || P.filter === 'noir') fx.sat = 0; if (P.filter === 'noir') fx.contrast = 1.3; if (P.filter === 'vivid') fx.sat = Math.max(P.sat, 1.4);
    void k;
  }

  takePhoto() {
    const g = this.game;
    g.render(1 / 60);
    this.hud.photoFlash();
    g.audio.play('tickHi', { bus: 'ui', vol: 0.6 });
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    c.getContext('2d').drawImage(g.canvas, 0, 0, 320, 180);
    const url = c.toDataURL('image/jpeg', 0.7);
    this.store.patch((p) => { p.photos.unshift({ t: Date.now(), url }); p.photos.length = Math.min(p.photos.length, 24); });
    this.store.act({ type: 'stat', key: 'photos', amount: 1 });
    g.emit('photo:taken', {});
    toast({ title: 'Photo saved', sub: 'Find it in Profile - Photos', kind: 'blue', icon: 'camera' });
  }

  exitPhoto() {
    this.photoEl?.remove(); this.photoUI?.remove();
    const fx = this.game.pipeline.fx;
    Object.assign(fx, { dof: 0, sat: 1.06, contrast: 1.04, vig: 0.32 }); fx.tint.set(1, 1, 1); fx.lift.set(0, 0, 0);
    this.game.pipeline.setDepth(false);
    this.game.rig.cine = null; this.game.camera.fov = 62; this.game.camera.updateProjectionMatrix();
    this.mode = 'play'; this.game.input.enabled = true; this.hud.show(true);
    this.game.rig.baseFov = this.profile.settings.graphics.fov;
  }

  // ------------------------------------------------------------------ replay
  async startReplay() {
    const g = this.game, R = this.replay;
    if (this.mode !== 'play' || this.replayBusy) return;
    if (!R.ready()) { toast({ title: 'Nothing to replay yet', sub: 'Drive for a few seconds first', icon: 'clock' }); return; }
    this.replayBusy = true;
    g.input.enabled = false;
    await Loading.curtain(true);
    this.mode = 'replay'; this.hud.show(false); this.phone.hide?.(true);
    g.input.pressed.clear(); g.input.down.clear();
    R.start();
    this.replayUI = buildReplayUI(this, R);
    document.body.appendChild(this.replayUI.el);
    await Loading.curtain(false);
    this.replayBusy = false;
  }

  async exitReplay() {
    if (this.mode !== 'replay' || this.replayBusy) return;
    this.replayBusy = true;
    await Loading.curtain(true);
    this.replayUI?.el.remove(); this.replayUI = null;
    this.replay.stop();
    this.mode = 'play'; this.game.input.enabled = true; this.game.input.pressed.clear(); this.game.input.down.clear(); this.hud.show(true);
    await Loading.curtain(false);
    this.replayBusy = false;
  }

  // ------------------------------------------------------------------ frame
  tick(dt) {
    const g = this.game;
    g.gov.frame(dt);
    this.auction?.update(dt);
    switch (this.mode) {
      case 'home': {
        this.updateHome(dt);
        g.update(dt);
        g.render(dt);
        break;
      }
      case 'play': {
        this.saveT += dt;
        if (this.saveT > 25) { this.saveT = 0; this.saveWorld(); }
        this.store.tick();
        this.net.tick(dt, g);
        const act = g.input.hit('interact');
        g.update(dt);
        this.replay.record(dt);
        this.missions.update(dt);
        this.extras.update(dt); this.extras.updateEvents(dt);
        this.meet.update(dt);
        this.interiors.update(dt, act);
        this.remote.update(dt);
        this.hud.update(dt);
        this.checkAmbient(dt);
        g.render(dt);
        break;
      }
      case 'replay': {
        this.replay.frame(dt);
        this.replayUI?.update();
        g.render(dt);
        break;
      }
      case 'photo': {
        this.photoFrame(dt);
        g.audio.update(g, 0);
        g.render(dt);
        break;
      }
      case 'menu-play': case 'menu-home': {
        if (this.stageOn) { this.stage.update(dt); this.stage.render(dt); }
        else if (this.mode === 'menu-home') { this.updateHome(dt); g.update(dt); g.render(dt); }
        else if (this._menuFrames === undefined || this._menuFrames < 3) { g.render(dt); this._menuFrames = (this._menuFrames || 0) + 1; }
        break;
      }
      default: break;
    }
    if (this.mode !== 'menu-play') this._menuFrames = 0;
  }

  // small ambient gameplay hooks (districts, distance stats)
  checkAmbient(dt) {
    const g = this.game, P = g.player, v = P.vehicle;
    this._ambT = (this._ambT || 0) + dt;
    if (v) { this._km = (this._km || 0) + v.speed * dt; if (this._km > 50) { this.store.act({ type: 'stat', key: 'distance', amount: this._km }); if (g.sky.night > 0.5) this.store.act({ type: 'stat', key: 'nightDistance', amount: this._km }); this._km = 0; } this.store.act && v.phys.speed > 1 && (this._top = Math.max(this._top || 0, v.kmh)); }
    if (this._ambT > 4) {
      this._ambT = 0;
      if (this._top) { this.store.act({ type: 'stat', key: 'topSpeed', amount: this._top, mode: 'max' }); this._top = 0; }
      const d = g.world.districtAt(P.x, P.z).id;
      this._visited = this._visited || new Set();
      if (!this._visited.has(d)) { this._visited.add(d); this.store.act({ type: 'stat', key: 'districtVisits', amount: 1 }); }
      const dr = v?.phys.drift; if (dr && dr.banked > 0) { this.store.act({ type: 'stat', key: 'drift', amount: dr.banked }); this.store.act({ type: 'stat', key: 'bestDrift', amount: dr.banked, mode: 'max' }); dr.banked = 0; }
    }
    void ACHIEVEMENTS;
  }
}
