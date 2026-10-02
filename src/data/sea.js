// Sea state tuning. Heights in metres, wavelengths in metres, taus in seconds.
export const SEA = {
  // significant wave height from the mean wind U (m/s): Hs = base + perU2 * U^2, capped
  hs: { base: 0.22, perU2: 0.0148, max: 5.2 },
  // peak wavelength of the wind sea
  lambda: { perU2: 0.62, min: 22, max: 125 },
  tau: { windUp: 35, windDown: 90, slow: 300, lambda: 60, dir: 70, swellUp: 150, swellDown: 700, swellDir: 600 },
  swell: { base: 0.2, frac: 0.4, offset: 0.7 },
  // Gerstner steepness: calm seas are rounded, rough seas peaked; sum(q k a) is kept below maxSteep
  q: { calm: 0.5, rough: 0.82 },
  maxSteep: 0.85,
  // Beaufort-like thresholds on the mean wind, for HUD and AI
  beaufort: [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7],
};

export function beaufort(U) { let n = 0; for (const t of SEA.beaufort) { if (U >= t) n++; else break; } return n; }

// Boat traffic. cruise: share of vmax (sail boats ignore it); storm: significant wave height (m) above which the craft runs for port;
// role picks the behaviour: run between harbours, play (erratic loops), fish (slow trawl and long stops), cruise (long legs and anchoring), sail.
export const TRAFFIC = {
  count: 34, near: 300, far: 360, proxy: 1700, poolCap: 3, maxReal: 10,
  kinds: {
    rib: { w: 2, cruise: 0.5, storm: 2.0, role: 'run' },
    jetski: { w: 2, cruise: 0.62, storm: 1.2, role: 'play' },
    sport: { w: 2, cruise: 0.5, storm: 2.5, role: 'run' },
    fisher: { w: 3, cruise: 0.85, storm: 4.0, role: 'fish' },
    yacht: { w: 1.2, cruise: 0.55, storm: 4.5, role: 'cruise' },
    dinghy: { w: 1, cruise: 1, storm: 1.0, role: 'sail' },
    sloop: { w: 3, cruise: 1, storm: 3.2, role: 'sail' },
    cruiser: { w: 1.4, cruise: 1, storm: 4.2, role: 'sail' },
    patrol: { w: 0, cruise: 0.5, storm: 3.4, role: 'run' },
  },
};

// Marine life. size: body length in metres; n: school size range; depth: metres below the surface; rel: where in the water column it likes to be;
// habitat 'rock' keeps it near reef and boulders; flee: distance at which a swimmer or a fast boat scares it; curious: 0..1 appetite for approaching a still diver.
export const FAUNA = {
  sardine: { geo: 'fish', w: 0.13, h: 0.2, tail: 0.18, dorsal: 0.1, size: 0.17, n: [36, 84], speed: 1.9, depth: [0.7, 6], rel: 'top', flee: 8, col: [[0.72, 0.8, 0.88], [0.82, 0.86, 0.9]], weight: 4 },
  damsel: { geo: 'fish', w: 0.2, h: 0.42, tail: 0.2, dorsal: 0.2, size: 0.11, n: [6, 14], speed: 0.7, depth: [1, 6], rel: 'bed', habitat: 'rock', flee: 3, col: [[0.1, 0.35, 0.95], [0.98, 0.58, 0.1], [0.95, 0.85, 0.2]], weight: 3 },
  bream: { geo: 'fish', w: 0.18, h: 0.34, tail: 0.22, dorsal: 0.16, size: 0.34, n: [4, 9], speed: 1.1, depth: [1.5, 9], rel: 'mid', flee: 6, curious: 0.5, col: [[0.66, 0.63, 0.56], [0.86, 0.72, 0.46]], weight: 3 },
  mackerel: { geo: 'fish', w: 0.14, h: 0.2, tail: 0.2, dorsal: 0.09, size: 0.4, n: [14, 30], speed: 2.7, depth: [2, 10], rel: 'mid', flee: 9, col: [[0.24, 0.5, 0.55], [0.3, 0.46, 0.6]], weight: 2 },
  grouper: { geo: 'fish', w: 0.26, h: 0.34, tail: 0.2, dorsal: 0.14, size: 0.95, n: [1, 2], speed: 0.5, depth: [3, 13], rel: 'bed', habitat: 'rock', flee: 4, curious: 1, col: [[0.45, 0.34, 0.25], [0.55, 0.38, 0.28]], weight: 1.5 },
  tuna: { geo: 'fish', w: 0.2, h: 0.26, tail: 0.28, dorsal: 0.11, size: 1.4, n: [3, 6], speed: 3.6, depth: [6, 14], rel: 'mid', flee: 14, hunts: 'sardine', col: [[0.15, 0.25, 0.42]], weight: 1 },
  ray: { geo: 'ray', size: 1.1, n: [1, 1], speed: 0.8, depth: [1.5, 9], rel: 'bed', flee: 5, col: [[0.5, 0.45, 0.4], [0.42, 0.4, 0.38]], weight: 1 },
  dolphin: { geo: 'fish', w: 0.2, h: 0.24, tail: 0.3, dorsal: 0.14, size: 2.2, n: [4, 4], speed: 5, depth: [2, 14], rel: 'top', flee: 0, col: [[0.42, 0.47, 0.52]], weight: 0 },
  jelly: { geo: 'jelly', size: 0.3, n: [3, 8], speed: 0.25, depth: [1, 8], rel: 'mid', flee: 0, col: [[0.9, 0.7, 0.95], [0.75, 0.85, 1]], weight: 1.2 },
};

// Seabed set dressing placed deterministically per 8 m cell: reef, boulders, weed, wrecks and rubbish.
export const SEABED = { cell: 8, radius: 64, wrecks: 5 };
