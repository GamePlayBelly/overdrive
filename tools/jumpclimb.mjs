import { launch, sleep } from './harness.mjs';
// On foot: Space jumps, next to a low wall it vaults, next to a tall one it climbs, and you can stand on top.
const { page, close, logs } = await launch({ width: 800, height: 450 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 400000 });
const r = await page.evaluate(async () => {
  const a = window.__app, g = window.__game, P = g.player, I = g.input, out = {};
  g.traffic.update = () => {}; g.peds.update = () => {};
  P.exit(); for (let i = 0; i < 90; i++) g.update(1 / 60);
  const key = (k, down) => { if (down) { I.down.add(k); I.pressed.add(k); } else I.down.delete(k); };
  const step = (n) => { for (let i = 0; i < n; i++) { g.update(1 / 60); I.pressed.clear(); } };
  // a flat patch so heights can be compared directly
  let x0 = 880, z0 = 1500, best = 1e9;
  const H = (x, z) => g.world.groundY(x, z, 80);
  for (let dx = -300; dx <= 300; dx += 20) for (let dz = -300; dz <= 300; dz += 20) { const x = 880 + dx, z = 1500 + dz; let sp = 0; for (const [ax, az] of [[0, 8], [0, -8], [8, 0], [-8, 0], [0, 0]]) sp = Math.max(sp, Math.abs(H(x + ax, z + az) - H(x, z))); if (sp < best && g.world.districtAt(x, z).id) { best = sp; x0 = x; z0 = z; } }
  out.flat = { x0, z0, slope: +best.toFixed(3) };
  P.place(x0, z0, 0); P.y = g.world.groundY(x0, z0, 60); step(60);
  out.state = P.state; out.ground0 = +P.y.toFixed(2);
  // 1. plain jump
  const y0 = P.y; let maxY = y0;
  key('Space', true); step(1); key('Space', false);
  for (let i = 0; i < 70; i++) { step(1); maxY = Math.max(maxY, P.y); }
  out.jumpHeight = +(maxY - y0).toFixed(2); out.landed = P.onGround;
  // 2. low wall (1.0 m) straight ahead (yaw 0 faces +z)
  const gy = P.y;
  const mk = (h, dz, th) => g.world.colliders.box(P.x, P.z + dz, 3, th, 0, gy - 0.5, gy + h, { kind: 'wall' });
  const w1 = mk(1.0, 1.1, 0.25);
  P.place(x0, z0, 0); P.y = gy; step(30);
  key('KeyW', true); step(15);
  key('Space', true); step(1); key('Space', false);
  let seq = false; for (let i = 0; i < 120; i++) { step(1); if (P.seq) seq = P.seq.kind + (P.seq.vault ? ':vault' : ':climb'); else if (seq) break; }
  key('KeyW', false); step(10);
  out.vault = { seq, z: +(P.z - z0).toFixed(2), y: +(P.y - gy).toFixed(2), state: P.state };
  g.world.colliders.remove(w1);
  // 3. tall wall (1.8 m, thick box) -> climb and stand on top
  const w2 = g.world.colliders.box(x0, z0 + 3.2, 3, 1.2, 0, gy - 0.5, gy + 1.8, { kind: 'wall' });
  P.place(x0, z0, 0); P.y = gy; step(30);
  key('KeyW', true); step(30);
  key('Space', true); step(1); key('Space', false);
  seq = false; for (let i = 0; i < 160; i++) { step(1); if (P.seq) seq = P.seq.kind + (P.seq.vault ? ':vault' : ':climb'); else if (seq) break; }
  key('KeyW', false); step(30);
  out.climb = { seq, z: +(P.z - z0).toFixed(2), y: +(P.y - gy).toFixed(2), state: P.state, onGround: P.onGround };
  // standing on top is stable and walking off drops you back to the ground
  key('KeyW', true); step(90); key('KeyW', false); step(40);
  out.afterWalkOff = { z: +(P.z - z0).toFixed(2), y: +(P.y - gy).toFixed(2) };
  // 4. wall too tall (3.5 m) stays solid
  g.world.colliders.remove(w2);
  const w3 = g.world.colliders.box(x0, z0 + 1.1, 3, 0.4, 0, gy - 0.5, gy + 3.5, { kind: 'wall' });
  P.place(x0, z0, 0); P.y = gy; step(30);
  key('KeyW', true); step(20); key('Space', true); step(1); key('Space', false); step(80); key('KeyW', false);
  out.tooTall = { z: +(P.z - z0).toFixed(2), y: +(P.y - gy).toFixed(2), seq: !!P.seq };
  return out;
});
console.log(JSON.stringify(r, null, 1));
console.log('logs:', logs.filter((l) => !/getImageData|CERT|parallel/.test(l)).slice(0, 8).join('\n') || 'none');
await close(); process.exit(0);
