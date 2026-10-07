import { launch, sleep } from './harness.mjs';
// Vehicle audio: drives a car and a bike with real input, reads the engine parameters the audio system derives from the physics and
// measures the actual output of the AudioContext (rms and spectral centroid) per situation. Also checks NPC voices, camera modes,
// rain/wet layers, surfaces and the acoustic environment.
const { page, close, logs } = await launch({ width: 640, height: 360, query: '?dev=1' });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 500000 });
const R = await page.evaluate(async () => {
  const a = window.__app, g = window.__game, A = g.audio, I = g.input, P = g.player, out = {};
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
  await A.unlock(); for (let i = 0; i < 100 && !A.ready; i++) await sleepMs(200);
  out.ctx = A.ctx.state; out.ready = A.ready; out.worklet = !!A.bankNode; out.env = A.env?.preset;
  if (!A.ready || !A.bankNode) return out;
  g.traffic.update = g.traffic.update; // keep traffic alive for the NPC check
  const an = A.ctx.createAnalyser(); an.fftSize = 2048; A.master.connect(an);
  const buf = new Float32Array(an.fftSize), fb = new Uint8Array(an.frequencyBinCount);
  const measure = () => { an.getFloatTimeDomainData(buf); let e = 0; for (const v of buf) e += v * v; an.getByteFrequencyData(fb); let sw = 0, w = 0; for (let i = 0; i < fb.length; i++) { sw += i * fb[i]; w += fb[i]; } return { rms: +Math.sqrt(e / buf.length).toFixed(4), cent: w ? Math.round((sw / w) * A.ctx.sampleRate / an.fftSize) : 0 }; };
  const avg = async (n = 6, gap = 120) => { let r = 0, c = 0; for (let i = 0; i < n; i++) { const m = measure(); r += m.rms; c += m.cent; await sleepMs(gap); } return { rms: +(r / n).toFixed(4), cent: Math.round(c / n) }; };
  const key = (k, d) => { if (d) { I.down.add(k); I.pressed.add(k); } else I.down.delete(k); };
  const pos = (v, x, z) => { v.place(x, g.world.groundY(x, z, 80), z, 0.4); };
  // ---- car ----
  const v = P.vehicle; pos(v, 880, 1500); await sleepMs(1500);
  const car = {};
  car.type = A.veh.info.type; car.idle = { ...A.veh.info, ...(await avg()) };
  key('KeyW', true); await sleepMs(2500); car.accel = { ...A.veh.info, ...(await avg()) };
  const rpms = []; for (let i = 0; i < 40; i++) { rpms.push(A.veh.info.rpm); await sleepMs(150); } car.rpmTrace = rpms.filter((_, i) => i % 3 === 0);
  key('KeyW', false); await sleepMs(900); car.lift = { ...A.veh.info, ...(await avg()) };
  out.car = car;
  // camera modes: interior is quieter and duller than outside
  const modes = {};
  key('KeyW', true);
  for (const m of ['chase', 'cockpit', 'hood', 'bumper']) { g.rig.mode = m; await sleepMs(1200); modes[m] = { ...(await avg()), view: Object.fromEntries(Object.entries(A.veh.view).map(([k, x]) => [k, +x.toFixed(2)])) }; }
  key('KeyW', false); g.rig.mode = 'chase';
  out.modes = modes;
  // surfaces + rain
  const L = A.L, val = (n) => +L[n].out.gain.value.toFixed(3);
  key('KeyW', true); await sleepMs(2000);
  out.dry = { road: val('road'), spray: val('spray'), roof: val('roof'), rain: val('rain') };
  g.sky.lockWeather = 'heavyRain'; g.sky.setWeather('heavyRain', true); g.sky.wetness = 1; await sleepMs(4000);
  out.wet = { road: val('road'), spray: val('spray'), roof: val('roof'), rain: val('rain'), zoneRain: +A.zone.rain.toFixed(2), env: A.env.preset };
  g.rig.mode = 'cockpit'; await sleepMs(2500); out.wetCockpit = { roof: val('roof'), rain: val('rain') }; g.rig.mode = 'chase';
  g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true); g.sky.wetness = 0;
  key('KeyW', false);
  // ---- NPC traffic ----
  pos(v, 40, -60); await sleepMs(3000);
  const act = []; for (let s = 0; s < 10; s++) { const b = s * 25; if (A.veh.params[b] > 0.5) act.push(A.veh.params[b + 21]); }
  out.npcVoices = { active: act.length, lods: act, cands: A.veh.cands.length };
  // ---- bike ----
  const bike = g.spawnVehicle('r6', v.x + 4, v.z, 0.4, {}, { kind: 'parked' });
  P.exit(); await sleepMs(500); P.enter(bike); await sleepMs(1500);
  const b = {}; b.type = A.veh.info.type; b.idle = { ...A.veh.info, ...(await avg()) };
  key('KeyW', true); await sleepMs(3000); b.accel = { ...A.veh.info, ...(await avg()) };
  g.rig.mode = 'cockpit'; await sleepMs(1500); b.cockpit = { ...(await avg()), view: { lp: +A.veh.view.lp.toFixed(2), cabin: +A.veh.view.cabin.toFixed(2) } }; g.rig.mode = 'chase';
  key('KeyW', false); await sleepMs(900); b.lift = { ...A.veh.info, ...(await avg()) };
  const ba = A.veh.params; b.chain = ba[23];
  out.bike = b;
  // ---- environment: force each preset and make sure the graph accepts it ----
  const presets = {}; for (const n of ['open', 'forest', 'city', 'industrial', 'mountain', 'garage', 'tunnel', 'room']) { A.env.setPreset(n, false); await sleepMs(300); presets[n] = A.env.preset; }
  out.presets = Object.keys(presets).length;
  A.env.setPreset('open');
  return out;
});
console.log(JSON.stringify(R, null, 1));
console.log('logs:', logs.filter((l) => !/getImageData|CERT|parallel/.test(l)).slice(0, 10).join('\n') || 'none');
await close(); process.exit(0);
