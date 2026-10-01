// Aircraft parked at Riverton Airfield and a place for the ones the player owns.
export class Airfield {
  constructor(game) { this.g = game; this.used = new Set(); this.parked = []; }

  init() {
    const A = this.g.world.airfield;
    if (!A) return;
    const put = (id, spot, yaw = Math.PI / 2) => { const v = this.g.spawnVehicle(id, spot[0], spot[1], yaw, { color: undefined }, { kind: 'parked' }); v.phys.engineOn = false; this.used.add(spot.join(',')); this.parked.push(v); return v; };
    put('skylark', A.spots.plane[0]);
    put('skylark', A.spots.plane[1]).group.visible = true;
    put('stratus', A.spots.jet[0]);
    put('swift', A.spots.heli[0], 0);
  }

  freeSpot(def) {
    const A = this.g.world.airfield;
    if (!A) return null;
    const list = def.air === 'heli' ? A.spots.heli : def.air === 'jet' ? [...A.spots.jet, ...A.spots.plane] : A.spots.plane;
    for (const s of list) {
      if (!this.g.vehicles.some((v) => Math.hypot(v.x - s[0], v.z - s[1]) < 9)) return s;
    }
    return list[list.length - 1];
  }
}
