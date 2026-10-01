import * as THREE from 'three';

// A small pool of real point lights that follows the street lamps nearest to the camera at night, so lamps light cars, walls and wet asphalt
// with proper falloff. Lamps outside the pool keep their soft ground decal; the decal of a lit lamp fades out as its light fades in.
export class NightLights {
  constructor(scene, props, n = 8) {
    this.props = props;
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const L = new THREE.PointLight(0xffc986, 0, 44, 2);
      L.castShadow = false;
      scene.add(L);
      this.slots.push({ L, lamp: null, k: 0 });
    }
    this._best = [];
  }

  update(dt, cam, night) {
    const slots = this.slots, pools = this.props.pools;
    if (night < 0.02 || !pools?.length) {
      for (const s of slots) { s.L.intensity = 0; if (s.lamp) { s.lamp.fade = 1; s.lamp = null; } s.k = 0; }
      return;
    }
    // nearest lamps to the camera
    const best = this._best; best.length = 0;
    const R2 = 70 * 70;
    for (const p of pools) {
      if (p.inst.hidden) continue;
      const dx = p.x - cam.x, dz = p.z - cam.z, d2 = dx * dx + dz * dz;
      if (d2 > R2) continue;
      if (best.length < slots.length) { best.push({ p, d2 }); continue; }
      let wi = 0;
      for (let i = 1; i < best.length; i++) if (best[i].d2 > best[wi].d2) wi = i;
      if (d2 < best[wi].d2) best[wi] = { p, d2 };
    }
    const want = new Set(best.map((b) => b.p));
    // keep lamps that are still wanted, free the rest
    for (const s of slots) if (s.lamp && !want.has(s.lamp)) { s.k -= dt * 7; if (s.k <= 0) { s.k = 0; s.lamp.fade = 1; s.lamp = null; } else s.lamp.fade = 1 - s.k; }
    const have = new Set(slots.filter((s) => s.lamp).map((s) => s.lamp));
    for (const b of best) {
      if (have.has(b.p)) continue;
      const free = slots.find((s) => !s.lamp);
      if (!free) break;
      free.lamp = b.p; free.k = 0; have.add(b.p);
    }
    for (const s of slots) {
      if (!s.lamp) { s.L.intensity = 0; continue; }
      if (want.has(s.lamp)) s.k = Math.min(1, s.k + dt * 4);
      s.L.position.set(s.lamp.x, s.lamp.hy - 0.35, s.lamp.z);
      s.L.intensity = 300 * night * s.k;
      s.lamp.fade = 1 - s.k;
    }
  }
}
