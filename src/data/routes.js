// Outer regions of Riverton County: Calder Highlands (north), Sierra Pass and Mesa County (east), Isla Marin and the Bayline Bridge (west).
// Units: meters. Corridor control points are [x, z, y?]; y is only given where a height must be pinned.

export const WORLD = { x0: -3200, z0: -2600, x1: 3600, z1: 2800 };

// Isla Marin: elliptical island in the western sea; the bridge lands on its east shore
export const ISLE = { x: -2250, z: -420, rx: 700, rz: 800, peak: { x: -2440, z: -660, h: 70, r: 230 } };

// round the corners of a polyline with true circular arcs of radius r (hairpins included)
function rounded(pts, r = 26) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], V = pts[i], B = pts[i + 1];
    const la = Math.hypot(V[0] - A[0], V[1] - A[1]), lb = Math.hypot(B[0] - V[0], B[1] - V[1]);
    const u1 = [(V[0] - A[0]) / la, (V[1] - A[1]) / la], u2 = [(B[0] - V[0]) / lb, (B[1] - V[1]) / lb];
    const cross = u1[0] * u2[1] - u1[1] * u2[0], dot = u1[0] * u2[0] + u1[1] * u2[1];
    const th = Math.atan2(Math.abs(cross), dot);          // turn angle
    if (th < 0.02) { out.push(V); continue; }
    let R = r;
    const t0 = R * Math.tan(th / 2), tmax = 0.46 * Math.min(la, lb);
    if (t0 > tmax) R = tmax / Math.tan(th / 2);
    const t = R * Math.tan(th / 2), sg = Math.sign(cross) || 1;
    const E = [V[0] - u1[0] * t, V[1] - u1[1] * t];
    const n1 = [-u1[1] * sg, u1[0] * sg];               // toward the inside of the turn
    const Cc = [E[0] + n1[0] * R, E[1] + n1[1] * R];
    const a0 = Math.atan2(E[1] - Cc[1], E[0] - Cc[0]);
    const steps = Math.max(3, Math.ceil(th / (Math.PI / 14)));
    for (let k = 0; k <= steps; k++) { const a = a0 + sg * th * (k / steps); out.push([Cc[0] + Math.cos(a) * R, Cc[1] + Math.sin(a) * R]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// island coast loop at a fixed fraction of the island radius
function isleLoop(a0, a1, n, k = 0.46) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    out.push([Math.round(ISLE.x + Math.cos(a) * ISLE.rx * k), Math.round(ISLE.z + Math.sin(a) * ISLE.rz * k)]);
  }
  return out;
}

// pad heights for the three towns (the road profiles are pinned to them)
export const TOWN_Y = { alder: 232, dry: 172, marin: 4.5 };

// Route 12: switchbacks from the Ridge Road junction at Central Avenue up to Alder Peak
const R12 = rounded([[-55, -560], [-30, -640], [430, -790], [-390, -975], [430, -1160], [-390, -1345], [390, -1520], [-40, -1610]], 28);
// Route 40: east out of Harbor Boulevard, up the Sierra wall and across the mesa to Dry Springs, then on to the overlook
const R40A = rounded([[1000, 55], [1250, 75], [1560, 0], [1900, -190], [1560, -360], [2000, -520], [2320, -330], [2560, 20], [2740, 150]], 32);
const R40B = [[3060, 150], [3300, 135], [3470, 80]];
// Isla Marin coast road
const LOOP = [[-2070, -600], ...isleLoop(-52, -308, 12).slice(1, -1), [-2070, -240]];

export const CORRIDOR_SPECS = [
  { id: 'route12', name: 'Route 12', cls: 'rural', raw: true, ctrl: R12.map((p, i) => (i === R12.length - 1 ? [p[0], p[1], TOWN_Y.alder] : p)), smooth: 240, maxGrade: 0.072, core: 10, reach: 170 },
  { id: 'route40a', name: 'Route 40', cls: 'rural', raw: true, ctrl: R40A.map((p, i) => (i === R40A.length - 1 ? [p[0], p[1], TOWN_Y.dry] : p)), smooth: 260, maxGrade: 0.075, core: 10, reach: 170 },
  { id: 'route40b', name: 'Route 40', cls: 'rural', ctrl: R40B.map((p, i) => (i === 0 ? [p[0], p[1], TOWN_Y.dry] : p)), smooth: 200, maxGrade: 0.07, core: 10, reach: 140 },
  // bridge: explicit profile, no terrain carving (it flies over the bay)
  { id: 'bridge', name: 'Bayline Bridge', cls: 'freeway', structure: true, carve: false, explicit: true, ctrl: [[-960, -420], [-1870, -420]], profile: (s, L) => { const peak = 22 * ease((s - 30) / 400); return peak + (4.5 - peak) * ease((s - (L - 230)) / 220); }, core: 12, reach: 60 },
  { id: 'marin', name: 'Marin Coast Road', cls: 'rural', ctrl: LOOP.map((p, i) => (i === 0 || i === LOOP.length - 1 ? [p[0], p[1], TOWN_Y.marin] : p)), smooth: 120, maxGrade: 0.06, minY: 3.2, core: 9, reach: 90 },
];

function ease(t) { t = Math.max(0, Math.min(1, t)); return 0.7 * t + 0.3 * t * t * (3 - 2 * t); }

// ---- town street grids (merged into STREETS / DISTRICTS by data/world.js)
function gridStreets(xs, zs, names, cls = 'local', main = {}) {
  const out = [], zlo = zs[0], zhi = zs[zs.length - 1], xlo = xs[0], xhi = xs[xs.length - 1];
  xs.forEach((x, i) => out.push({ axis: 'z', c: x, name: names.z[i], segs: [[zlo, zhi, main.z?.[i] || cls]] }));
  zs.forEach((z, i) => out.push({ axis: 'x', c: z, name: names.x[i], segs: [[xlo, xhi, main.x?.[i] || cls]] }));
  return out;
}

export const ALDER = { xs: [-120, -40, 40, 120], zs: [-1880, -1790, -1700, -1610] };
export const DRY = { xs: [2740, 2820, 2900, 2980, 3060], zs: [50, 150, 250] };
export const MARIN = { xs: [-2070, -1970, -1870], zs: [-600, -510, -420, -330, -240] };

export const TOWN_STREETS = [
  ...gridStreets(ALDER.xs, ALDER.zs, { z: ['Larch Lane', 'Summit Road', 'Fir Lane', 'Spruce Lane'], x: ['Ridge Row', 'Chalet Street', 'Market Street', 'Lodge Road'] }, 'local'),
  ...gridStreets(DRY.xs, DRY.zs, { z: ['Cactus Street', 'Adobe Street', 'Mesa Street', 'Canyon Street', 'Sunset Street'], x: ['Tumbleweed Road', 'Route 40 Main Street', 'Sagebrush Road'] }, 'local', { x: [null, 'arterial', null] }),
  ...gridStreets(MARIN.xs, MARIN.zs, { z: ['Coral Way', 'Palm Walk', 'Bayline Drive'], x: ['Pelican Row', 'Tern Street', 'Harbor Walk', 'Gull Street', 'Dune Row'] }, 'local', { z: [null, null, 'avenue'], x: [null, null, 'avenue', null, null] }),
];

const dist = (G, pad, style, id, name, short, color, extra = {}) => ({ id, name, short, x0: G.xs[0] - pad, x1: G.xs[G.xs.length - 1] + pad, z0: G.zs[0] - pad, z1: G.zs[G.zs.length - 1] + pad, xs: G.xs, zs: G.zs, style, color, ...extra });
export const TOWN_DISTRICTS = [
  dist(ALDER, 6, 'alpine', 'alder', 'Alder Peak', 'Alder Peak', '#9fb6c9', { sidewalk: 1.8, verge: 2.4, elev: TOWN_Y.alder }),
  dist(DRY, 6, 'desert', 'dry', 'Dry Springs', 'Dry Springs', '#c9a46a', { sidewalk: 1.8, verge: 2.4, elev: TOWN_Y.dry }),
  dist(MARIN, 6, 'isle', 'marin', 'Marin Village', 'Marin Village', '#58c0c4', { sidewalk: 3.2, elev: TOWN_Y.marin }),
];

// broad regions (name only) for the HUD and the map
export const REGION_DISTRICTS = [
  { id: 'highlands', name: 'Calder Highlands', short: 'Highlands', x0: -3000, x1: 3600, z0: -2600, z1: -900, style: 'alpine', color: '#9fb6c9' },
  { id: 'mesa', name: 'Mesa County', short: 'Mesa County', x0: 1600, x1: 3600, z0: -900, z1: 1800, style: 'desert', color: '#c9a46a' },
  { id: 'isle', name: 'Isla Marin', short: 'Isla Marin', x0: -3200, x1: -1500, z0: -1500, z1: 700, style: 'isle', color: '#58c0c4' },
];

// flat building pads (x0, x1, z0, z1, y, blend distance)
export const PADS = [
  { x0: -200, x1: 200, z0: -1930, z1: -1570, y: TOWN_Y.alder, fall: 70 },
  { x0: 2690, x1: 3110, z0: 10, z1: 290, y: TOWN_Y.dry, fall: 70 },
  { x0: -2130, x1: -1810, z0: -660, z1: -180, y: TOWN_Y.marin, fall: 45 },
];

// boats on moorings in the deep channel east of Marin Island: [x, z, boat id]
export const MOORINGS = [[-1556, -330, 'sloop'], [-1538, -296, 'dinghy'], [-1558, -262, 'cruiser'], [-1520, -342, 'rib'], [-1522, -250, 'sloop']];
export const BRIDGE = { x0: -960, x1: -1870, z: -420, towers: [-1380, -1650], deck: 22, h: 76 };
