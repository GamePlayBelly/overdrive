import { AIBoat } from '../vehicles/aiBoat.js';
import { VEHICLE_BY_ID } from '../data/vehicles.js';
import { WATER_LEVEL } from '../data/world.js';

// Ambient boats on the bay and the harbor patrol that answers a wanted player who takes to the water.
const KINDS = ['rib', 'sport', 'jetski', 'fisher', 'yacht', 'rib', 'jetski', 'sloop', 'sloop', 'dinghy', 'cruiser'];

export class SeaTraffic {
  constructor(game) { this.g = game; this.boats = []; this.t = 1; this.enabled = true; this.max = 5; this.pt = 0; }

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
    const g = this.g;
    for (const b of this.boats) b.ai.update(dt);
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 2;
    const P = g.player, w = P.vehicle || P, seaD = g.sea ? g.sea.distanceToSea(w.x, w.z) : 1e9;
    const onWater = (P.vehicle && P.vehicle.isBoat) || P.state === 'swim';
    // cull
    for (const b of [...this.boats]) {
      const d = Math.hypot(b.v.x - w.x, b.v.z - w.z);
      if (b.v.driver || g.player.vehicle === b.v) continue;
      if (d > 720 || b.v.sunk || (b.patrol && g.police.level === 0 && g.time - b.born > 25 && d > 120)) this.remove(b);
      else if (!b.patrol && (b.ai.arrived || !b.ai.goal)) { const q = this.pickWater(b.v.x, b.v.z, 260, 800, 4); if (q) b.ai.goto(q.x, q.z); }
    }
    // ambient boats while the player is near the coast
    const amb = this.boats.filter((b) => !b.patrol).length;
    if (seaD < 380 && amb < this.max) {
      const q = this.pickWater(w.x, w.z, 260, 560, 4.5);
      if (q && Math.hypot(q.x - w.x, q.z - w.z) > 200) {
        const kind = KINDS[Math.floor(Math.random() * KINDS.length)], def = VEHICLE_BY_ID[kind], v = this.spawn(kind, q.x, q.z, Math.random() * 6.283, { color: def.colors[Math.floor(Math.random() * def.colors.length)] });
        const goal = this.pickWater(q.x, q.z, 300, 800, 4);
        if (goal) this.boats.find((b) => b.v === v).ai.goto(goal.x, goal.z);
      }
    }
    // harbor patrol
    const want = g.police.level >= 2 && (onWater || (seaD < 60 && g.police.level >= 3)) ? Math.min(3, Math.floor(g.police.level / 2) + 1) : 0;
    const have = this.boats.filter((b) => b.patrol).length;
    if (have < want) {
      const q = this.pickWater(w.x, w.z, 180, 320, 3.5);
      if (q) { const v = this.spawn('patrol', q.x, q.z, Math.atan2(w.x - q.x, w.z - q.z), { kind: 'police', patrol: true, speed: 22, aggr: 0.8 }); v.lights.bar = true; v.lights.siren = true; g.police.radio('Harbor patrol responding.'); }
    }
    const T = g.police.target;
    for (const b of this.boats) if (b.patrol) b.ai.chase({ x: T.x, z: T.z, vx: T.vx, vz: T.vz });
  }
}
