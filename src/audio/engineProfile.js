// Per-vehicle engine sound profile, derived from the data every vehicle already has (def.sound: cyl, pitch, rough; def.perf; def.body.style).
// Any field can be overridden in a vehicle's `sound` block: type, diesel, turbo, engine, exhaust, intake, trans, tire, wind, shift, idle.
const cache = new Map();

const TYPES = { 3: 'i3', 4: 'i4', 6: 'v6', 8: 'v8', 10: 'v10', 12: 'v12' };

export function engineProfile(def) {
  let p = cache.get(def.id);
  if (p) return p;
  const s = def.sound || {}, st = def.body?.style, perf = def.perf || {};
  const bike = st === 'bike', heavy = st === 'bus' || st === 'truck';
  const diesel = s.diesel ?? (heavy || st === 'van');
  const cyl = s.cyl || 4, hp = (perf.kw || 80) / Math.max(1, (perf.mass || 1200) / 1000);
  const high = !bike && !diesel && (hp > 190 || (perf.redline || 6500) >= 7600);
  p = {
    type: s.type || (bike ? 'bike' + cyl : diesel ? 'diesel' + cyl : TYPES[cyl] || 'i4'),
    bike, diesel, high,
    // DSP character: 0 petrol, 1 diesel / heavy, 3 big V, 4 motorcycle
    kind: bike ? 4 : diesel ? 1 : cyl >= 8 ? 3 : 0,
    idle: s.idle ?? (bike ? 1250 : diesel ? 700 : 820),
    turbo: s.turbo ?? (diesel && !heavy ? 0.6 : 0),
    engine: s.engine ?? 1,
    exhaust: s.exhaust ?? (bike ? 1.1 : cyl >= 8 ? 1.2 : high ? 1.1 : diesel ? 0.9 : 0.9),
    intake: s.intake ?? (bike ? 1.5 : high ? 1.25 : diesel ? 0.6 : 0.85),
    trans: s.trans ?? (bike ? 0.9 : diesel ? 0.8 : high ? 1.1 : 0.6),
    tire: s.tire ?? (bike ? 0.7 : heavy ? 1.1 : 1),
    wind: s.wind ?? (bike ? 1.5 : 1),
    shift: s.shift ?? (bike ? 0.9 : high ? 1.2 : heavy ? 0.5 : 0.8),
  };
  cache.set(def.id, p);
  return p;
}
