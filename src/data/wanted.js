// Wanted system tuning. Everything the police and the coast guard read lives here.
export const WANTED = {
  // stars come down step by step while nobody can see the player, and the pursuit ends when the escape meter fills
  stepDown: true,
  road: { units: [0, 1, 2, 4, 5, 6, 8], speed: [0, 26, 36, 42, 46, 52, 58] },
  // crime -> level it raises the wanted level to once witnessed
  crimes: {
    speeding: 1, redlight: 1, hitCar: 1, hitPed: 2, carjack: 1, assault: 1, hitPolice: 2, ramPolice: 3, sidewalk: 1, prop: 0, evade: 2, trespass: 1,
    boatTheft: 1, boatHijack: 2, boatRam: 1, boatSink: 2, harborSpeed: 1, ramCoastGuard: 3, hitSwimmer: 2,
  },
  // severity points each crime adds to the running total that decides ignored minor offences
  severity: { boatTheft: 1.5, boatHijack: 2, boatRam: 1.5, boatSink: 2.5, harborSpeed: 0.5, ramCoastGuard: 3, hitSwimmer: 2.5 },
  sea: {
    units: [0, 1, 2, 3, 4, 5, 6],        // coast guard boats per star
    heli: [0, 0, 0, 0, 1, 1, 2],         // helicopters over water per star
    speed: [0, 17, 21, 25, 28, 31, 34],  // top speed in m/s, reduced by the sea
    reinforce: 3,                         // seconds between reinforcements
    detect: { visual: 300, radar: 650, night: 0.55, rain: 0.6, fog: 0.35, swell: 0.25 },
    escape: { base: 14, perLevel: 8 },   // seconds out of sight
    search: { startR: 70, growth: 14, max: 650 },
    flank: 42, block: 130,
    station: [350, 3500],                // distance range of the station a reinforcement leaves from
  },
  // no-wake zone around marinas and docks
  harbor: { radius: 160, limit: 8 },
};
