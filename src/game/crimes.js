import { SURF } from '../world/terrain.js';

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
    game.on('vehicle:crash', (e) => {
      if (!me(e.v)) return;
      if (e.other && e.other.kind === 'police') P().crime(game.police.level ? 'ramPolice' : 'hitPolice', e.x, e.z, 2);
      else if (e.kind === 'prop' && e.impact > 6) P().crime('prop', e.x, e.z, 1);
    });
  }

  update(dt) {
    const g = this.g, P = g.player, v = P.vehicle;
    this.cool -= dt;
    if (!v || P.state !== 'driving' || v.isBoat || v.isAir || !g.police.enabled) { this.speedT = 0; return; }
    const R = g.world.roads, n = R.nearest(v.x, v.z, v.y, 10);
    if (n && v.speed > n.e.speed * 1.45 + 5) this.speedT += dt; else this.speedT = Math.max(0, this.speedT - dt);
    if (this.speedT > 2.5 && this.cool <= 0) { this.cool = 7; this.speedT = 0; g.police.crime('speeding', v.x, v.z, 0.5); }
    const p = v.phys;
    this.sideT = (p.surfR === SURF.CONCRETE && !n && v.speed > 8) ? this.sideT + dt : Math.max(0, this.sideT - dt);
    if (this.sideT > 2 && this.cool <= 0) { this.cool = 7; this.sideT = 0; g.police.crime('sidewalk', v.x, v.z, 0.5); }
  }
}
