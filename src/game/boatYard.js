import { VEHICLE_BY_ID } from '../data/vehicles.js';
import { RNG } from '../core/rng.js';
import { MOORINGS } from '../data/routes.js';

// Boats tied up at Marlow Marina and the Riverton small craft docks. Anyone can take one; they return to their berth when abandoned.
const MARINA = ['jetski', 'rib', 'sport', 'sloop', null, 'yacht', 'fisher', 'dinghy', null, 'sport'];
const HARBOR = ['rib', 'jetski', 'fisher', 'dinghy', null, null];
// boats on the Marin moorings ride head to wind

export class BoatYard {
  constructor(game) { this.g = game; this.slots = []; this.t = 0; }

  init() {
    const W = this.g.world, rng = new RNG('boats');
    const add = (site, berth, id, yaw) => {
      const def = VEHICLE_BY_ID[id];
      const pos = site === 'marina'
        ? { x: berth.fx + berth.dir * (1.1 + 0.55 + def.body.W / 2), z: berth.z - def.body.L * 0.12 }
        : { x: berth.x - def.body.L * 0.1, z: berth.z };
      const color = def.colors[Math.floor(rng.f() * def.colors.length)];
      const v = this.g.spawnVehicle(id, pos.x, pos.z, yaw, { color }, { kind: 'civilian' });
      v.moor = { x: pos.x, z: pos.z, yaw };
      v.berth = { site, x: pos.x, z: pos.z, yaw };
      this.slots.push({ v, id, pos, yaw });
    };
    if (W.marina) W.marina.berths.forEach((b, i) => { if (MARINA[i]) add('marina', b, MARINA[i], 0); });
    if (W.harborDocks) W.harborDocks.berths.forEach((b, i) => { if (HARBOR[i]) add('harbor', b, HARBOR[i], b.yaw); });
    for (const [x, z, id] of MOORINGS) {
      const def = VEHICLE_BY_ID[id], yaw = Math.PI * 0.6;
      const v = this.g.spawnVehicle(id, x, z, yaw, { color: def.colors[Math.floor(rng.f() * def.colors.length)] }, { kind: 'civilian' });
      v.moor = { x, z, yaw }; v.berth = { site: 'mooring', x, z, yaw };
      this.slots.push({ v, id, pos: { x, z }, yaw, mooring: true, half: def.body.L / 2 + 1 });
    }
  }

  // a spot for a boat the player owns: any free berth at the marina
  freeBerth(def) {
    const W = this.g.world;
    const taken = (p) => this.g.vehicles.some((v) => v.isBoat && Math.hypot(v.x - p.x, v.z - p.z) < 6);
    for (const b of W.marina?.berths || []) {
      const p = { x: b.fx + b.dir * (1.1 + 0.55 + def.body.W / 2), z: b.z - def.body.L * 0.12 };
      if (!taken(p)) return { ...p, yaw: 0 };
    }
    for (const b of W.harborDocks?.berths || []) { const p = { x: b.x - def.body.L * 0.1, z: b.z }; if (!taken(p)) return { ...p, yaw: b.yaw }; }
    return null;
  }

  update(dt) {
    this.t += dt;
    const g = this.g, P = g.player, cam = g.camera.position;
    const W = g.sky?.wind, into = W ? Math.atan2(-W.x, -W.z) : 0;
    for (const s of this.slots) if (s.mooring && s.v.moor) { const m = s.v.moor; m.yaw = into; m.x = s.pos.x - Math.sin(into) * s.half; m.z = s.pos.z - Math.cos(into) * s.half; }
    // hide boats that are far from the camera to save draw calls
    if (this.t > 0.5) {
      this.t = 0;
      for (const s of this.slots) {
        const v = s.v; if (!v) continue;
        const far = (v.x - cam.x) ** 2 + (v.z - cam.z) ** 2 > 420 * 420;
        if (v !== P.vehicle) v.group.visible = !far;
        if (v.driver || !v.berth) continue;
        const dB = Math.hypot(v.x - s.pos.x, v.z - s.pos.z), dP = Math.hypot(P.x - s.pos.x, P.z - s.pos.z), dV = Math.hypot(P.x - v.x, P.z - v.z);
        if ((dB > 45 || v.sunk || v.disabled) && dP > 140 && dV > 140) {
          v.repair(); v.place(s.pos.x, 0, s.pos.z, s.yaw); v.moor = { x: s.pos.x, z: s.pos.z, yaw: s.yaw };
        }
      }
    }
  }
}
