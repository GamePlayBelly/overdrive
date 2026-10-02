import { WATER_LEVEL } from '../data/world.js';
import { clamp } from '../core/math.js';

// Wind-blown spray off the crests around the camera: grows with the mean wind, so it is absent in a calm and heavy in a gale.
export class SeaFx {
  constructor(game) { this.g = game; this.acc = 0; this.on = true; }

  update(dt) {
    const g = this.g, sea = g.world.sea, W = sea.waves, cam = g.camera.position;
    if (!this.on || sea.under || sea.quality < 1 || !sea.rings[0].m.visible || W.U < 8.5) return;
    const k = clamp((W.U - 8.5) / 9, 0, 1);
    this.acc += dt * (14 + 150 * k) * (g.gov?.tier >= 2 ? 1 : 0.6);
    const n = Math.min(40, Math.floor(this.acc)); this.acc -= n;
    const dx = Math.cos(W.dirW), dz = Math.sin(W.dirW), thr = WATER_LEVEL + W.hs * 0.42, pt = g.fx.pt;
    for (let i = 0; i < n; i++) {
      const r = 6 + Math.random() * 70, a = Math.random() * 6.283, x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
      if (sea.depthAt(x, z) < 0.5) continue;
      const y = sea.waveAt(x, z);
      if (y < thr) continue;
      const s = W.U * (0.35 + Math.random() * 0.25);
      pt.emit({ x, y: y + 0.1, z, vx: dx * s + (Math.random() - 0.5), vy: 0.6 + Math.random() * 1.6 * k, vz: dz * s + (Math.random() - 0.5), life: 0.9 + Math.random() * 0.9, s0: 0.25, s1: 1.1 + Math.random() * 1.2 * k, c0: [0.95, 0.97, 1, 0.16 + 0.14 * k], c1: [0.9, 0.95, 1, 0], drag: 0.5, grav: 1.2, kind: 0 });
    }
  }
}
