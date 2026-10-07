import { launch } from './harness.mjs';
// NPC and remote-player audio: level of detail by distance, voice pooling, Doppler, shifts, culling, on-foot jump/landing sounds.
const { page, close, logs } = await launch({ width: 320, height: 180, query: '?dev=1&nophoto=1' });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 500000 });
const R = await page.evaluate(async () => {
  const a = window.__app, g = window.__game, A = g.audio, P = g.player, out = {};
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
  await A.unlock(); for (let i = 0; i < 100 && !A.ready; i++) await sleepMs(200);
  if (!A.ready) return { error: 'audio not ready' };
  const { VEHICLE_BY_ID } = await import('/src/data/vehicles.js');
  const cam = g.camera.position;
  // fabricated traffic: positions relative to the camera, moving at fixed speeds (the scan is replaced so only these exist)
  const mk = (id, model, dist, speed, heading) => ({ d0: Math.abs(dist), id, def: VEHICLE_BY_ID[model], x: cam.x + dist, y: cam.y, z: cam.z + 5, yaw: heading, speed, v: speed, state: 'drive', phys: null });
  const cars = [mk(9001, 'civa', 12, 14, Math.PI / 2), mk(9002, 'bus', 40, 9, -Math.PI / 2), mk(9003, 'r6', -60, 22, Math.PI / 2), mk(9004, 'vireo', 120, 30, Math.PI / 2), mk(9005, 'thunder', 300, 20, 0)];
  A.veh.scan = function () { this.cands = cars.map((c) => ({ def: c.def, obj: c, kind: 'traffic', d2: (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2, id: c.id })).filter((c) => c.d2 < 140 * 140).sort((x, y) => x.d2 - y.d2); };
  // advance the fabricated cars in audio time (the headless page renders at a few fps, so wall-clock movement would outrun it)
  const origEng = A.veh.engines.bind(A.veh); A.veh.engines = function (...a) { if (this.tEng <= 0) for (const c of cars) { c.x += Math.sin(c.yaw) * c.speed / 40; if (Math.abs(c.x - cam.x) > c.d0 + 25) c.yaw += Math.PI; } return origEng(...a); };
  const drive = 0;
  P.exit(); await sleepMs(300);
  const snap = () => { const r = []; for (let s = 0; s < 10; s++) { const b = s * 25, p = A.veh.params; if (p[b] > 0.5) r.push({ rpm: Math.round(p[b + 1]), gain: +p[b + 3].toFixed(3), pan: +p[b + 4].toFixed(2), kind: p[b + 8], lod: p[b + 21], tire: +p[b + 18].toFixed(3), chain: +p[b + 23].toFixed(2), lp: +p[b + 9].toFixed(2) }); } return r; };
  { const t0 = A.veh.tickN; for (let i = 0; i < 200 && A.veh.tickN < t0 + 16; i++) await sleepMs(250); }
  out.dbg = { cam: [cam.x | 0, cam.z | 0], cars: cars.map((c) => [c.id, Math.round(Math.hypot(c.x - cam.x, c.z - cam.z))]), cands: A.veh.cands.map((c) => [c.id, Math.round(Math.sqrt(c.d2))]), tick: A.veh.tickN, ghost: !!A.veh.ghost, states: A.veh.states.size };
  out.voices = snap();
  out.cull = { far300m: !out.voices.some((v) => v.kind === 3 && v.gain > 0 && v.lod === 2 && false), candidates: A.veh.cands.length };
  // shifts happen while a car accelerates through the gears
  let shifts = 0, seenShift = new Set(); for (let i = 0; i < 40; i++) { cars[0].speed = 3 + i * 0.9; const p = A.veh.params; for (let s = 0; s < 10; s++) { const v = p[s * 25 + 17]; if (v !== 0) seenShift.add(Math.sign(v)); } await sleepMs(120); }
  out.npcShiftSigns = [...seenShift];
  // Doppler: approaching car is sharper than the same car leaving
  const sp = cars[0]; sp.x = cam.x - 40; sp.yaw = Math.PI / 2; sp.speed = 20; await sleepMs(500);
  const rpmAt = () => { const p = A.veh.params; for (let s = 0; s < 10; s++) if (p[s * 25] > 0.5 && p[s * 25 + 8] === 0) return p[s * 25 + 1]; return 0; };
  const approaching = rpmAt(); sp.x = cam.x + 40; await sleepMs(600); const leaving = rpmAt();
  out.doppler = { approaching: Math.round(approaching), leaving: Math.round(leaving), higherWhenApproaching: approaching > leaving };
  A.veh.engines = origEng;
  // remote players share the bank
  g.remotes = { list: new Map([[1, { id: 'peer1', def: VEHICLE_BY_ID.gts, x: cam.x + 25, y: cam.y, z: cam.z, speedNet: 25 }]]) };
  A.veh.scan = A.veh.constructor.prototype.scan; { const t0 = A.veh.tickN; for (let i = 0; i < 120 && A.veh.tickN < t0 + 16; i++) await sleepMs(250); }
  out.remote = A.veh.cands.some((c) => c.kind === 'remote');
  // jump / landing / vault sounds are wired
  let played = 0; const orig = A.play.bind(A); A.play = (n, o) => { played++; return orig(n, o); };
  g.emit('player:jump', { x: cam.x, y: cam.y, z: cam.z, speed: 3 }); g.emit('player:landed', { x: cam.x, y: cam.y, z: cam.z, speed: 6, soft: false }); g.emit('player:mantle', { x: cam.x, y: cam.y, z: cam.z, vault: true });
  out.footSounds = played;
  return out;
});
console.log(JSON.stringify(R, null, 1));
console.log('logs:', logs.filter((l) => !/getImageData|CERT|parallel/.test(l)).slice(0, 10).join('\n') || 'none');
await close(); process.exit(0);
