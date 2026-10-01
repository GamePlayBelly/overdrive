import { launch } from './harness.mjs';
// Drives the player's car along the road graph route to each new region with a pure-pursuit controller and reports problems.
const TARGETS = JSON.parse(process.env.TARGETS || '[["alder",-55,-560,-40,-1610],["dry",1000,55,2740,150],["marin",-960,-420,-1870,-420]]');
const { page, close, logs } = await launch({ width: 800, height: 450 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
for (const [name, fx, fz, tx, tz] of TARGETS) {
  const r = await page.evaluate(async ({ fx, fz, tx, tz }) => {
    window.__pauseLoop = true;
    const g = window.__game, v = g.player.vehicle, W = g.world, R = W.roads; const process_dbg = false;
    g.traffic.update = () => {}; g.peds.update = () => {}; g.police.update = () => {};
    g.sky.time = 12; g.sky.timeScale = 0; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
    const from = R.nearestNode(fx, fz), to = R.nearestNode(tx, tz);
    v.repair?.(); v.disabled = false; v.damage.total = 0;
    const path = R.route(from.id, to.id);
    if (!path) return { error: 'no route' };
    const pts = R.routePoints(path, 3.1);
    v.place(pts[2].x, W.groundY(pts[2].x, pts[2].z, 60), pts[2].z, Math.atan2(pts[8].x - pts[2].x, pts[8].z - pts[2].z));
    const dbg = []; let idx = 0, t = 0, stuck = 0, maxDev = 0, minSpeed = 99, crashes = 0, lastX = v.x, lastZ = v.z, dist = 0, offroad = 0, maxAir = 0, maxPitch = 0;
    v.damage.total = 0;
    const input = g.input;
    while (idx < pts.length - 3 && t < 900) {
      const px = v.x, pz = v.z, yaw = v.yaw;
      // nearest path point ahead
      let best = idx, bd = 1e9;
      for (let i = Math.max(0, idx - 3); i < Math.min(pts.length, idx + 40); i++) { const d = Math.hypot(pts[i].x - px, pts[i].z - pz); if (d < bd) { bd = d; best = i; } }
      idx = best;
      maxDev = Math.max(maxDev, bd);
      let tgt = idx; let acc = 0;
      while (tgt < pts.length - 1 && acc < 14 + v.speed * 0.5) { acc += Math.hypot(pts[tgt + 1].x - pts[tgt].x, pts[tgt + 1].z - pts[tgt].z); tgt++; }
      const dx = pts[tgt].x - px, dz = pts[tgt].z - pz;
      const want = Math.atan2(dx, dz);
      let err = want - yaw; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
      // curvature ahead sets the speed
      let curv = 0; for (let i = idx; i < Math.min(pts.length - 2, idx + 24); i += 3) { const a1 = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z), a2 = Math.atan2(pts[i + 3 > pts.length - 1 ? pts.length - 1 : i + 3].x - pts[i + 1].x, pts[i + 3 > pts.length - 1 ? pts.length - 1 : i + 3].z - pts[i + 1].z); let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; curv = Math.max(curv, Math.abs(da)); }
      const vt = Math.max(6, 24 - curv * 44);
      v.input.steer = Math.max(-1, Math.min(1, -err * 1.6));
      v.input.throttle = v.speed < vt ? 0.9 : 0; v.input.brake = v.speed > vt + 3 ? 0.6 : 0;
      const ctl = g.controlVehicle; g.controlVehicle = () => {};
      g.update(1 / 60); g.controlVehicle = ctl; t += 1 / 60;
      if (process_dbg && Math.round(t * 60) % 20 === 0) { if (dbg.length > 14) dbg.shift(); dbg.push([+t.toFixed(1), +v.speed.toFixed(1), Math.round(v.x), Math.round(v.z), +v.y.toFixed(1), v.phys.gear, +v.input.steer.toFixed(2), +v.input.throttle.toFixed(1), +err.toFixed(2), idx, v.phys.onGround ?? '', 'dev', +bd.toFixed(1), 'pitch', +(v.phys.pitch || 0).toFixed(2)].join(' ')); }
      dist += Math.hypot(v.x - lastX, v.z - lastZ); lastX = v.x; lastZ = v.z;
      minSpeed = Math.min(minSpeed, v.speed);
      if (v.speed < 0.6) stuck++; else stuck = Math.max(0, stuck - 2);
      if (stuck > 240) return { dbg, error: 'stuck', at: [Math.round(v.x), Math.round(v.z)], idx, of: pts.length, t: Math.round(t) };
      const gh = W.groundY(v.x, v.z, v.y + 2);
      if (v.y - gh > 1.5) maxAir = Math.max(maxAir, v.y - gh);
      if (!R.onRoad(v.x, v.z, v.y)) offroad++;
      maxPitch = Math.max(maxPitch, Math.abs(v.phys.pitch || 0));
    }
    return { ok: idx >= pts.length - 3, t: Math.round(t), dist: Math.round(dist), maxDev: +maxDev.toFixed(1), offroadSec: +(offroad / 60).toFixed(1), maxAir: +maxAir.toFixed(1), dmg: +v.damage.total.toFixed(2), end: [Math.round(v.x), Math.round(v.z), +v.y.toFixed(1)], routeLen: Math.round(path.reduce((s, p) => s + R.edges[p.edge].pl.len, 0)) };
  }, { fx, fz, tx, tz });
  console.log(name, JSON.stringify(r));
}
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 4).join('\n') || 'none');
await close(); process.exit(0);
