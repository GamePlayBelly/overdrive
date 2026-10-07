import { SURF } from '../world/terrain.js';
import { WANTED } from '../data/wanted.js';

// District heat: crimes make a district more alert, it cools off slowly.
export class Heat {
  constructor(game) { this.g = game; this.m = new Map(); }
  get(id) { return this.m.get(id) || 0; }
  add(id, v) { this.m.set(id, Math.min(100, this.get(id) + v)); }
  nearby(P) { return this.get(this.g.world.districtAt(P.x, P.z).id); }
  update(dt) { for (const [k, v] of this.m) { const n = v - dt * 0.35; if (n <= 0) this.m.delete(k); else this.m.set(k, n); } }
}

// Turns what the player does into crimes for the police system.
export class CrimeWatch {
  constructor(game) {
    this.g = game; this.speedT = 0; this.cool = 0; this.sideT = 0;
    const P = () => game.police, me = (v) => v && v === game.player.vehicle;
    game.on('ped:hit', (e) => { if (me(e.v)) P().crime('hitPed', e.x, e.z, e.fatal ? 3 : 2); });
    game.on('traffic:hit', (e) => { if (!me(e.by)) return; const cop = e.car.role === 'police'; P().crime(cop ? 'hitPolice' : 'hitCar', e.x, e.z, cop ? 2 : 1); });
    game.on('player:carjack', (e) => P().crime('carjack', e.car.x, e.car.z, 2));
    // boats: taking one that is not yours is a crime when somebody is around to see it
    const watched = (x, z) => game.peds.list.some((p) => Math.hypot(p.x - x, p.z - z) < 60) || P().cg.witness(x, z) || P().witnessedBy(x, z);
    game.on('player:entered', (e) => { const v = e.v; if (v?.isBoat && !v.owned && !v.cg && !v.stolen) { v.stolen = true; if (watched(v.x, v.z)) P().crime('boatTheft', v.x, v.z, 2); } });
    game.on('boat:hijack', (e) => { e.v.stolen = true; P().crime('boatHijack', e.v.x, e.v.z, 2); });
    this.rammed = new Map();
    game.on('vehicle:crash', (e) => {
      if (!me(e.v)) return;
      if (e.other && e.other.kind === 'police') P().crime(game.police.level ? 'ramPolice' : 'hitPolice', e.x, e.z, 2);
      else if (e.other?.isBoat && e.other !== e.v && e.impact > 4 && e.v.phys.speed > 5) { if (e.other.cg) P().crime('ramCoastGuard', e.x, e.z, 3); else { P().crime('boatRam', e.x, e.z, 1.5); this.rammed.set(e.other, game.time); } }
      else if (e.kind === 'prop' && e.impact > 6) P().crime('prop', e.x, e.z, 1);
    });
  }

  update(dt) {
    const g = this.g, P = g.player, v = P.vehicle;
    this.cool -= dt;
    for (const [b, t] of this.rammed) { if (b.sunk) { g.police.crime('boatSink', b.x, b.z, 2.5); this.rammed.delete(b); } else if (g.time - t > 20 || !g.vehicles.includes(b)) this.rammed.delete(b); }
    if (v && v.isBoat && P.state === 'driving' && g.police.enabled) {
      // no-wake zone around the docks
      const pop = g.seaTraffic?.pop, H = WANTED.harbor;
      let near = false; if (pop) for (const q of pop.ports) if (Math.hypot(q.x - v.x, q.z - v.z) < H.radius) { near = true; break; }
      this.harborT = near && v.speed > H.limit ? (this.harborT || 0) + dt : Math.max(0, (this.harborT || 0) - dt);
      if (this.harborT > 3 && this.cool <= 0) { this.cool = 12; this.harborT = 0; g.police.crime('harborSpeed', v.x, v.z, 0.5); }
      this.speedT = 0; return;
    }
    if (!v || P.state !== 'driving' || v.isBoat || v.isAir || !g.police.enabled) { this.speedT = 0; return; }
    const R = g.world.roads, n = R.nearest(v.x, v.z, v.y, 10);
    if (n && v.speed > n.e.speed * 1.45 + 5) this.speedT += dt; else this.speedT = Math.max(0, this.speedT - dt);
    if (this.speedT > 2.5 && this.cool <= 0) { this.cool = 7; this.speedT = 0; g.police.crime('speeding', v.x, v.z, 0.5); }
    const p = v.phys;
    this.sideT = (p.surfR === SURF.CONCRETE && !n && v.speed > 8) ? this.sideT + dt : Math.max(0, this.sideT - dt);
    if (this.sideT > 2 && this.cool <= 0) { this.cool = 7; this.sideT = 0; g.police.crime('sidewalk', v.x, v.z, 0.5); }
  }
}
