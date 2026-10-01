p = 'src/world/terrain.js'
s = open(p, encoding='utf8').read()


def rep(a, b, cnt=1):
    global s
    assert a in s, a[:90]
    s = s.replace(a, b, cnt)


rep("""import { smoothstep, clamp, segClosest } from '../core/math.js';
import { BAY_X, WATER_LEVEL } from '../data/world.js';
""", """import { smoothstep, clamp, segClosest, lerp } from '../core/math.js';
import { BAY_X, WATER_LEVEL } from '../data/world.js';
import { WORLD, ISLE } from '../data/routes.js';
import { carveCorridors } from './corridors.js';
""")

# ---- constructor
rep("""    this.x0 = -2000; this.z0 = -2000; this.res = 4;
    this.nx = 1001; this.nz = 1176;""", """    this.x0 = WORLD.x0; this.z0 = WORLD.z0; this.res = 4;
    this.nx = Math.round((WORLD.x1 - WORLD.x0) / this.res) + 1; this.nz = Math.round((WORLD.z1 - WORLD.z0) / this.res) + 1;""")
rep("""    // restore exact values near the bay edge where the shoreline is sharp
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = this.x0 + i * this.res; if (x > BAY_X - 12 && x < BAY_X + 34) H[j * nx + i] = this.base(x, this.z0 + j * this.res); }
    this.sres = 2;
    this.snx = 2000; this.snz = 2350;
    this.surf = new Uint8Array(this.snx * this.snz);
    this.initSurface();""", """    // restore exact values near the bay edge where the shoreline is sharp
    const ib0 = Math.max(0, Math.floor((BAY_X - 12 - this.x0) / this.res)), ib1 = Math.min(nx - 1, Math.ceil((BAY_X + 34 - this.x0) / this.res));
    for (let j = 0; j < nz; j++) for (let i = ib0; i <= ib1; i++) H[j * nx + i] = this.base(this.x0 + i * this.res, this.z0 + j * this.res);
    this.sres = 2;
    this.snx = (nx - 1) * 2; this.snz = (nz - 1) * 2;
    this.surf = new Uint8Array(this.snx * this.snz);
    this.initSurface();""")

# ---- base -> natural + corridor carving
i0 = s.index("  base(x, z) {\n    let h = 0;")
i1 = s.index("  idx(i, j) {")
old_base = s[i0:i1]
new_base = """  base(x, z) { return carveCorridors(naturalHeight(x, z), x, z); }

"""
s = s[:i0] + new_base + s[i1:]

# natural height as a module function placed before the class
nat = old_base.replace("  base(x, z) {\n    let h = 0;", "export function naturalHeight(x, z) {\n  let h = 0;")
# dedent two spaces for the function body
lines = nat.rstrip().split('\n')
out = [lines[0], lines[1]]
for ln in lines[2:]:
    out.append(ln[2:] if ln.startswith('  ') else ln)
nat = '\n'.join(out) + '\n'
nat = nat.replace("smoothstep(1500, 2100, x) * (120 + 130 * ridged(x / 700, z / 700 + 7, 4))", "smoothstep(1450, 2550, x) * (120 + 130 * ridged(x / 700, z / 700 + 7, 4))")
nat = nat.replace("    h = h * (1 - shore) + (WATER_LEVEL - 3 - 9 * smoothstep(BAY_X, BAY_X - 400, x)) * shore;\n  }\n  return h;\n}", "    h = h * (1 - shore) + (WATER_LEVEL - 3 - 9 * smoothstep(BAY_X, BAY_X - 400, x)) * shore;\n  }\n  return withIsle(h, x, z);\n}")
assert 'withIsle(h, x, z)' in nat, 'isle hook'
isle = """
// Isla Marin: a beach ring, hills inside and a peak, rising out of the western sea floor
function withIsle(h, x, z) {
  if (x > BAY_X - 500 || x < ISLE.x - ISLE.rx * 1.6) return h;
  const dx = (x - ISLE.x) / ISLE.rx, dz = (z - ISLE.z) / ISLE.rz;
  const r = Math.hypot(dx, dz) + noise2(x / 210, z / 210) * 0.14 + noise2(x / 90, z / 90) * 0.05;
  const k = 1 - smoothstep(1.05, 1.4, r);
  if (k <= 0) return h;
  let ih;
  if (r < 0.56) { const t = 1 - smoothstep(0, 0.56, r); ih = 2.6 + 58 * Math.pow(t, 1.5) * (0.55 + 0.45 * (fbm(x / 260 + 3, z / 260, 3) * 0.5 + 0.5)); }
  else ih = 2.6 - 5.8 * smoothstep(0.56, 0.84, r) - 7 * smoothstep(0.84, 1.1, r);
  const pk = ISLE.peak, pd = Math.hypot(x - pk.x, z - pk.z) / pk.r;
  ih += pk.h * Math.exp(-pd * pd * 2.2) * (1 - smoothstep(0.7, 1.0, r));
  return lerp(h, ih, k);
}

"""
s = s.replace("export class Terrain {", nat + isle + "export class Terrain {", 1)

# ---- surface raster from the heightfield
i0 = s.index("  initSurface() {")
i1 = s.index("  surfAt(x, z) {")
s = s[:i0] + """  initSurface() {
    const { snx, snz, nx, h } = this;
    for (let j = 0; j < snz; j++) {
      const z = this.z0 + j * this.sres, hj = (j >> 1) * nx;
      const row = j * snx;
      for (let i = 0; i < snx; i++) {
        const x = this.x0 + i * this.sres, hh = h[hj + (i >> 1)];
        let v = SURF.GRASS;
        if (hh < WATER_LEVEL - 0.1 || (x < BAY_X && x > BAY_X - 1 && z < 2362)) v = SURF.WATER;
        else if (z > 2295 && z <= 2362 && x > -1000 && x < 1000) v = SURF.SAND;
        else if (hh < WATER_LEVEL + 1.3 && (x < BAY_X + 40 || z > 2200)) v = SURF.SAND;
        this.surf[row + i] = v;
      }
    }
  }
""" + s[i1:]
open(p, 'w', encoding='utf8').write(s)
print('ok')
