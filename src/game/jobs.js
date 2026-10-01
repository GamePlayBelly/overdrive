import { SIDE_JOBS } from '../data/missions.js';
import { LEAGUE } from '../data/meta.js';
import { RIVALS } from '../data/npcs.js';
import { clamp, lerp } from '../core/math.js';

const CARS = ['arc', 'gts', 'meridian', 'civa', 'thunder', 'lumo'];
const COLORS = ['#b3151b', '#1d4f91', '#e6c229', '#2e8b57', '#f2f2f0', '#101010', '#e8641c'];

// Procedural side jobs built from random road nodes near the player. Each returns a mission-shaped definition.
export function buildJob(run, id) {
  const base = SIDE_JOBS.find((j) => j.id === id);
  if (!base) return null;
  const g = run.g, R = g.world.roads, P = g.player;
  const o = P.vehicle || P, rnd = () => run.rngf();
  const node = (minD, maxD, from = o) => {
    for (let k = 0; k < 120; k++) {
      const n = R.nodes[Math.floor(rnd() * R.nodes.length)];
      const d = Math.hypot(n.x - from.x, n.z - from.z);
      if (d >= minD && d <= maxD && Math.abs(n.y - g.world.terrain.height(n.x, n.z)) < 3) return n;
    }
    return R.nodes[Math.floor(rnd() * R.nodes.length)];
  };
  const pt = (n) => ({ x: n.x, z: n.z });
  const pay = (dist, mul = 1) => (t, lim = 0) => {
    const k = clamp(dist / 2200, 0, 1), bonus = lim ? clamp(1.35 - t / lim, 0.85, 1.35) : 1;
    const money = Math.round(lerp(base.pay[0], base.pay[1], k) * bonus * mul);
    return { money, xp: Math.round(money * 0.55), rep: Math.round(money * 0.06) };
  };
  const tag = Math.floor(rnd() * 9000 + 1000);
  if (id === 'job_delivery') {
    const a = node(120, 650), b = node(900, 2100, a), dist = Math.hypot(a.x - b.x, a.z - b.z), limit = Math.ceil(dist / 9.5 + 40);
    const p = pay(dist);
    return { id: id + '_' + tag, title: base.title, type: base.type, giver: base.giver, delivery: true, steps: [
      { t: 'goto', to: pt(a), r: 10, stop: true, text: 'Pick up the package' },
      { t: 'pickup', text: 'Loading the package…', dur: 2 },
      { t: 'deliver', to: pt(b), r: 9, limit, fragile: 0.45, text: 'Deliver the package' },
    ], pay: (t) => p(t, limit) };
  }
  if (id === 'job_taxi') {
    const a = node(100, 500), b = node(500, 1500, a), dist = Math.hypot(a.x - b.x, a.z - b.z), limit = Math.ceil(dist / 8.5 + 45);
    const p = pay(dist, 0.8);
    return { id: id + '_' + tag, title: base.title, type: base.type, giver: base.giver, steps: [
      { t: 'goto', to: pt(a), r: 9, stop: true, text: 'Pick up the passenger' },
      { t: 'pickup', text: 'The passenger gets in…', dur: 3 },
      { t: 'deliver', to: pt(b), r: 9, limit, fragile: 0.22, text: 'Drive the passenger — smoothly' },
    ], pay: (t) => p(t, limit) };
  }
  if (id === 'job_race' || id === 'job_trial') {
    const race = id === 'job_race', pts = [];
    let cur = node(120, 380);
    const n = race ? 4 : 5;
    for (let k = 0; k < n; k++) { pts.push([cur.x, cur.z]); cur = node(180, race ? 420 : 560, cur); }
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    const limit = Math.ceil(len / 17 + 20), p = pay(len, race ? 1 : 0.85);
    const step = race
      ? { t: 'checkpoints', race: true, pts, text: 'Win the street race', rivals: [{ id: 'local', name: 'Local racer', model: CARS[Math.floor(rnd() * CARS.length)], color: COLORS[Math.floor(rnd() * COLORS.length)], skill: 0.62 + rnd() * 0.18 }] }
      : { t: 'checkpoints', timetrial: true, pts, limit, text: 'Beat the target time' };
    return { id: id + '_' + tag, title: base.title, type: base.type, giver: base.giver, steps: [step], fail: race ? { race: 'You lost the race.' } : undefined, pay: (t) => p(race ? t : t, race ? 0 : limit) };
  }
  return null;
}

export function buildCustomRace(run, r) {
  const pts = r.pts.map(([x, z]) => ({ x, z }));
  const rivals = Array.from({ length: r.rivals || 0 }, (_, i) => { const m = RIVALS[i % RIVALS.length] || {}; return { id: m.id, name: m.name, model: m.car || 'arc', color: m.color, skill: m.skill }; });
  const a = pts[0], b = pts[1], d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  let sx = a.x - ((b.x - a.x) / d) * 24, sz = a.z - ((b.z - a.z) / d) * 24;
  const n = run.g.world.roads.nearestLane(sx, sz, 0, 0, null, 25);
  if (n) { sx = n.x; sz = n.z; }
  return { id: 'c_' + r.id, rawId: r.id, title: r.name, type: 'Racing', giver: 'dex', start: { x: sx, z: sz }, startYaw: Math.atan2(a.x - sx, a.z - sz), steps: [{ t: 'checkpoints', race: rivals.length > 0, laps: r.laps || 1, pts, rivals, text: r.name }] };
}

export function buildLeagueRace(run, raceId) {
  for (const tier of LEAGUE) {
    const r = tier.races.find((q) => q.id === raceId);
    if (!r) continue;
    const rivals = r.rivals.map((id) => { const m = RIVALS.find((q) => q.id === id) || {}; return { id, name: m.name, model: m.car || 'arc', color: m.color, skill: m.skill }; });
    return { id: r.id, title: r.name, type: 'Racing', giver: 'dex', steps: [{ t: 'checkpoints', race: true, laps: r.laps || 1, pts: r.pts, rivals, text: r.name }], purse: 3500 + tier.level * 260, xp: 1600 + tier.level * 70 };
  }
  return null;
}
