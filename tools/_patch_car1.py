p = 'src/vehicles/carModel.js'
s = open(p, encoding='utf8').read()

i_wheels = s.index('// ---------------- wheels (canonical radius 1')
i_out0 = s.index('// Top-down silhouette of the body as a convex ring')
i_out1 = s.index('// ------------------------------------------------------------------\nexport function buildCar')
outline = s[i_out0:i_out1]

head = """import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { smoothstep, clamp, lerp } from '../core/math.js';
import { convexHull } from '../world/collision.js';
import { carLayout, profile, buildShell, wheelPositions } from './carShell.js';

export { carLayout };

// Procedural car builder. Car-local frame: +z forward, +y up, +x = driver's LEFT. Ground at y=0.
const C = (h) => new THREE.Color(h);

"""
build = """// ------------------------------------------------------------------
export function buildCar(def, opts = {}) {
  const b = def.body;
  if (b.style === 'bus') return buildBus(def, opts);
  if (b.style === 'truck') return buildTruck(def, opts);
  if (b.style === 'bike') return buildBike(def, opts);
  return buildShell(def, opts);
}

"""
new = head + outline + build + s[i_wheels:]
# the old helper defined here is now imported
new = new.replace("""function wheelPositions(b) {
  const { zF, zR } = carLayout(b);
  const x = b.trk / 2;
  return [
    { x, z: zF, front: true, left: true }, { x: -x, z: zF, front: true, left: false },
    { x, z: zR, front: false, left: true }, { x: -x, z: zR, front: false, left: false },
  ];
}
""", '')
open(p, 'w', encoding='utf8').write(new)
print(len(s), len(new))
