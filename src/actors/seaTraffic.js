import { AIBoat } from '../vehicles/aiBoat.js';
import { VEHICLE_BY_ID } from '../data/vehicles.js';
import { WATER_LEVEL } from '../data/world.js';
import { BoatTraffic } from './boatTraffic.js';

// Harbor patrol that answers a wanted player who takes to the water; ambient traffic lives in BoatTraffic (this.pop).

export class SeaTraffic {
  constructor(game) { this.g = game; this.boats = []; this.t = 1; this.enabled = true; this.pt = 0; this.pop = new BoatTraffic(game); }

  deep(x, z, need = 4) { return WATER_LEVEL - this.g.world.terrain.height(x, z) > need; }

  pickWater(cx, cz, rmin, rmax, need = 4) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * 6.283, r = rmin + Math.random() * (rmax - rmin), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (this.deep(x, z, need)) return { x, z };
    }
    return null;
  }

  spawn(kind, x, z, yaw, o = {}) {
    const g = this.g, v = g.spawnVehicle(kind, x, z, yaw, o.color ? { color: o.color } : {}, { kind: o.kind || 'civilian' });
    const ai = new AIBoat(g, v, { maxSpeed: o.speed ?? v.phys.vmax * (0.4 + Math.random() * 0.25), aggr: o.aggr ?? 0.4 });
    v.moor = null;
    this.boats.push({ v, ai, patrol: !!o.patrol, born: g.time });
    return v;
  }

  remove(b) { const i = this.boats.indexOf(b); if (i >= 0) this.boats.splice(i, 1); if (this.g.player.vehicle !== b.v) this.g.removeVehicle(b.v); }

  update(dt) {
    if (!this.enabled) return;
    this.pop.update(dt);
    for (const b of this.boats) b.ai.update(dt);
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 2;
    const g = this.g, P = g.player, w = P.vehicle || P;
    for (const b of [...this.boats]) {
      const d = Math.hypot(b.v.x - w.x, b.v.z - w.z);
      if (b.v.driver || g.player.vehicle === b.v) continue;
      if (d > 720 || b.v.sunk) this.remove(b);
    }
  }
}
