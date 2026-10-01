import { PLAYER_VEHICLES, vehicleStats } from '../data/vehicles.js';
import { Markers } from './markers.js';
import { findVehicle } from './economy.js';

const RING = 10, BAY = 3.6, N = 8, VOTERS = 10;
const OPEN_FROM = 17.5, OPEN_TO = 4;
const POOL = ['Sports', 'Supercar', 'Muscle', 'Coupe', 'Sports', 'Sedan', 'SUV', 'Pickup', 'Off-road', 'Compact', 'Supercar'];
const OWNERS = ['student', 'shop', 'office', 'tourist', 'delivery', 'worker', 'student', 'office'];
const ANIM = ['idle', 'phone', 'lean', 'idle'];
const CLASSES = ['Compact', 'Sedan', 'Coupe', 'Sports', 'Supercar', 'Muscle', 'SUV', 'Pickup', 'Off-road'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Evening car meet at the Motor Club lot: show cars and their owners appear, park in the bay and the crowd votes on your car.
export class CarMeet {
  constructor(app) {
    this.app = app; this.g = app.game;
    this.state = 'closed'; this.cars = []; this.peds = []; this.marker = null;
    this.markers = new Markers(this.g);
    this.hold = 0; this.t = 0; this.revealed = 0; this.votes = 0; this.chance = []; this.checkT = 0; this.told = false; this.C = null; this.leave = false;
  }

  get open() { const t = this.g.sky.time; return t >= OPEN_FROM || t < OPEN_TO; }

  blips() { return this.state !== 'closed' || (this.open && this.C) ? [{ x: this.C.x, z: this.C.z, color: '#ffb02e', r: 5 }] : []; }

  update(dt) {
    const g = this.g, poi = g.world.poi.meet;
    if (!poi?.lot) return;
    const C = (this.C ||= { x: poi.lot.x0 + 55, z: poi.lot.z0 + 17 }), P = g.player, w = P.vehicle || P;
    const d = Math.hypot(w.x - C.x, w.z - C.z);
    this.markers.update(dt, g.camera.position);
    if (this.state === 'closed') { if (this.open && d < 170 && !g.mission) this.setup(w); return; }
    if (!this.open || d > 280) { this.teardown(); return; }
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 2; this.keepPeds(d); }
    if (d < 45 && !this.told && this.state === 'open') { this.told = true; this.app.hud.say('Ines', 'Park in the glowing bay and let the crowd vote on your car.', 5200); }
    if (this.state === 'open') this.watchBay(dt, w);
    else if (this.state === 'judging') this.judge(dt, w);
  }

  setup(w) {
    const g = this.g, C = this.C, gap = Math.atan2(w.z - C.z, w.x - C.x);
    const classes = POOL.slice().sort(() => Math.random() - 0.5);
    const used = new Set();
    for (let i = 0, k = 0; i < N + 2 && this.cars.length < N; i++) {
      const a = (i / (N + 2)) * Math.PI * 2 + 0.3;
      if (Math.abs(((a - gap + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.5) continue;
      const cls = classes[k++ % classes.length], cands = PLAYER_VEHICLES.filter((v) => v.cls === cls && !v.boat && !used.has(v.id));
      if (!cands.length) continue;
      const def = pick(cands); used.add(def.id);
      const x = C.x + Math.cos(a) * RING, z = C.z + Math.sin(a) * RING, yaw = Math.atan2(C.x - x, C.z - z);
      const e = { x, y: (g.world.poi.meet.y || 0) + 0.02, z, rot: yaw, model: def.id, def, color: pick(def.colors), showcar: true };
      g.world.parked.push(e);
      this.cars.push(e);
      const side = Math.random() < 0.5 ? 1 : -1, ox = x + Math.cos(yaw) * side * 2.6 - Math.sin(yaw) * 1.4, oz = z - Math.sin(yaw) * side * 2.6 - Math.cos(yaw) * 1.4;
      const o = g.peds.spawnStatic(ox, oz, Math.atan2(x - ox, z - oz), pick(OWNERS), pick(ANIM));
      o.yOff = g.world.poi.meet.y || 0; this.peds.push(o);
    }
    g.traffic.lastParkPos.set(1e9, 0, 1e9);
    this.marker = this.markers.add({ x: C.x, z: C.z, r: BAY, color: '#ffb02e', beam: false });
    this.marker.grp.position.y = (g.world.poi.meet.y || 0) + 0.18;
    this.state = 'open'; this.hold = 0; this.told = false;
  }

  teardown() {
    const g = this.g;
    const P = g.world.parked;
    for (let i = P.length - 1; i >= 0; i--) if (P[i].showcar) P.splice(i, 1);
    g.traffic.lastParkPos.set(1e9, 0, 1e9);
    this.cars = [];
    for (const p of this.peds) { const i = g.peds.list.indexOf(p); if (i >= 0) g.peds.list.splice(i, 1); }
    this.peds = [];
    if (this.marker) { this.markers.remove(this.marker); this.marker = null; }
    this.state = 'closed';
  }

  keepPeds(d) {
    const g = this.g;
    if (d > 130) return;
    this.cars.forEach((e, i) => {
      const p = this.peds[i];
      if (p && !g.peds.list.includes(p) && !p.gone) g.peds.list.push(p);
    });
  }

  watchBay(dt, w) {
    const P = this.g.player, v = P.vehicle;
    if (!v || P.state !== 'driving') { this.hold = 0; return; }
    const d = Math.hypot(v.x - this.C.x, v.z - this.C.z);
    if (this.leave) { if (d > BAY + 6) this.leave = false; this.hold = 0; return; }
    if (d < BAY && v.speed < 0.9) { this.hold += dt; if (this.hold > 1.3) this.startJudging(v); } else this.hold = 0;
    void w;
  }

  score(v) {
    const p = this.app.profile, pv = findVehicle(p, v.uid), def = v.def;
    if (!pv) return { s: 0.22, owned: false };
    const rating = clamp(vehicleStats(def, pv.perf).rating / 560, 0, 1);
    const up = clamp(Object.values(pv.perf || {}).reduce((a, b) => a + b, 0) / 14, 0, 1);
    const c = pv.custom || {};
    const cust = clamp(((c.finish && c.finish !== 'metallic' ? 1 : 0) + (c.decal && c.decal !== 'none' ? 1 : 0) + (c.number ? 0.5 : 0) + (c.rimColor ? 0.5 : 0) + (c.wheelScale && c.wheelScale !== 1 ? 0.5 : 0)) / 3, 0, 1);
    const clean = 1 - v.dirt * 0.7;
    let s = 0.1 + rating * 0.34 + up * 0.22 + cust * 0.16 + clean * 0.08 + (1 - clamp(v.damage.total * 2, 0, 1)) * 0.12;
    if (v.lights.head) s += 0.03;
    if (v.doorTarget?.hood) s += 0.04;
    return { s: clamp(s, 0, 1), owned: true };
  }

  startJudging(v) {
    const { s, owned } = this.score(v);
    const likes = [...CLASSES].sort(() => Math.random() - 0.5).slice(0, 2);
    this.chance = Array.from({ length: VOTERS }, () => clamp(s + (likes.includes(v.def.cls) ? 0.14 : -0.05) + (Math.random() - 0.5) * 0.24, 0.03, 0.97));
    this.state = 'judging'; this.t = 0; this.revealed = 0; this.votes = 0; this.car = v; this.owned = owned;
    this.app.hud.big('On display', owned ? 'Hold still - the crowd is voting' : 'A borrowed car will not impress anyone', '');
  }

  judge(dt, w) {
    const v = this.car, g = this.g;
    if (g.player.vehicle !== v || Math.hypot(v.x - this.C.x, v.z - this.C.z) > BAY + 1.5 || v.speed > 2.5) { this.state = 'open'; this.hold = 0; this.app.hud.say('Ines', 'Stay in the bay until the vote is finished.', 3200); return; }
    this.t += dt;
    const due = Math.floor(this.t / 1.3);
    while (this.revealed < due && this.revealed < VOTERS) {
      const yes = Math.random() < this.chance[this.revealed++];
      if (yes) { this.votes++; this.app.hud.gain(`+1 vote  ${this.votes}/${VOTERS}`, '#ffd27a'); g.audio.play?.('tickHi', { bus: 'ui', vol: 0.5 }); }
    }
    if (this.revealed >= VOTERS && this.t > VOTERS * 1.3 + 0.6) this.finish();
    void w;
  }

  finish() {
    const r = this.app.store.act({ type: 'meetResult', votes: this.votes, day: this.g.sky.day });
    const m = r.grants?.find((x) => x.type === 'meet');
    const sub = m?.repeat ? 'Rewards are paid once per day' : this.votes >= 8 ? 'The crowd loved it' : this.votes >= 5 ? 'Respectable' : 'Needs more polish';
    this.app.hud.big(`${this.votes} / ${VOTERS} votes`, sub, this.votes >= 5 ? 'green' : '');
    this.g.audio.ui(this.votes >= 5 ? 'unlock' : 'click');
    this.state = 'done'; this.t = 0;
    setTimeout(() => { if (this.state === 'done') { this.state = 'open'; this.hold = 0; this.leave = true; } }, 6000);
  }
}
