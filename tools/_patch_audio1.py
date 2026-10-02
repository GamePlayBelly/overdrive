def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('src/audio/synth.js', [
 ("export function renderWaveLoop(sr, seed = 3) {", """export function renderThunder(sr, seed = 1) {
  const r = rng(seed), n = Math.floor(sr * 4.8), out = new Float32Array(n);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, w = r() * 2 - 1;
    a += (w - a) * 0.05; b += (a - b) * 0.04;
    const env = Math.exp(-t * 0.75) * (1 + 0.6 * Math.sin(t * 5.3 + seed)) * Math.min(1, t / 0.04);
    out[i] = (b * 11 + (t < 0.22 ? w * Math.exp(-t * 26) * 0.55 : 0)) * env;
  }
  return normalize(out, 0.9);
}
export function renderBell(sr, seed = 1) {
  const n = Math.floor(sr * 2.2), out = new Float32Array(n);
  for (const [f, d, g] of [[523, 1.1, 1], [1244, 0.7, 0.55], [1978, 0.45, 0.35], [2790, 0.3, 0.2]]) for (let i = 0; i < n; i++) { const t = i / sr; out[i] += Math.sin(6.2832 * f * t * (1 + 0.001 * seed)) * Math.exp(-t / d) * g; }
  return normalize(out, 0.5);
}
export function renderSquelch(sr) {
  const r = rng(11), n = Math.floor(sr * 0.2), out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; lp += ((r() * 2 - 1) - lp) * 0.5; out[i] = (lp * 0.5 + Math.sin(6.2832 * 1450 * t) * 0.3 * (t < 0.07 ? 1 : 0)) * (t < 0.012 ? t / 0.012 : 1) * Math.exp(-t * 14); }
  return normalize(out, 0.5);
}
export function renderBubble(sr, seed = 1) {
  const r = rng(seed), n = Math.floor(sr * 0.09), out = new Float32Array(n), f0 = 380 + r() * 500;
  let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; ph += (6.2832 * f0 * (1 + t * 14)) / sr; out[i] = Math.sin(ph) * Math.exp(-t * 55); }
  return normalize(out, 0.5);
}
export function renderWaveLoop(sr, seed = 3) {"""),
 ("  yield ['boatHorn', 'put', [renderBoatHorn(sr)]];", "  yield ['boatHorn', 'put', [renderBoatHorn(sr)]];\n  yield ['foghorn', 'put', [renderHornTone(sr, { f: 98, dur: 2.6 })]];\n  yield many('thunder', [1, 2, 3].map((s) => renderThunder(sr, s)));\n  yield many('bell', [1, 2].map((s) => renderBell(sr, s)));\n  yield ['squelch', 'put', [renderSquelch(sr)]];\n  yield many('bubble', [1, 2, 3, 4].map((s) => renderBubble(sr, s)));"),
])

patch('src/audio/audio.js', [
 ("    this.stepT = 0; this.gullT = 4; this.birdT = 2; this.siren = new Map();", "    this.stepT = 0; this.gullT = 4; this.birdT = 2; this.siren = new Map(); this.uwK = 0; this.slapT = 1; this.bellT = 3; this.fogT = 12; this.bubT = 1;"),
 ("      comp.connect(this.master); this.master.connect(ctx.destination);", "      // everything passes a lowpass that closes under water\n      this.uw = ctx.createBiquadFilter(); this.uw.type = 'lowpass'; this.uw.frequency.value = 20000; this.uw.Q.value = 0.7;\n      comp.connect(this.uw); this.uw.connect(this.master); this.master.connect(ctx.destination);"),
 ("  toBuffer(arr, sr = this.ctx.sampleRate)", "  // k 0..1: how far under the surface the listener is\n  setUnderwater(k) {\n    this.uwK = k;\n    if (!this.ctx || !this.uw) return;\n    const f = Math.exp(Math.log(20000) + (Math.log(380) - Math.log(20000)) * k);\n    this.uw.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.06);\n  }\n\n  toBuffer(arr, sr = this.ctx.sampleRate)"),
 ("    this.L.hornG = mkLayer(this.bus.sfx);", "    this.L.gale = { out: mkLayer(this.bus.amb) }; this.L.swell = { out: mkLayer(this.bus.amb) }; this.L.surf = { out: mkLayer(this.bus.amb) }; this.L.wake = { out: mkLayer(this.bus.tires) }; this.L.under = { out: mkLayer(this.bus.amb) };\n    this.L.hornG = mkLayer(this.bus.sfx);"),
 ("    L.night.src = chain(this.buf.cricket, L.night.out);", """    L.night.src = chain(this.buf.cricket, L.night.out);
    L.gale.hp = bq('highpass', 120); L.gale.lp = bq('lowpass', 900); L.gale.src = chain(Lp.wind, L.gale.out, [L.gale.hp, L.gale.lp]);
    L.swell.lp = bq('lowpass', 150); L.swell.src = chain(Lp.pink, L.swell.out, [L.swell.lp]);
    L.surf.hp = bq('highpass', 500); L.surf.lp = bq('lowpass', 5200); L.surf.src = chain(Lp.waves, L.surf.out, [L.surf.hp, L.surf.lp]);
    L.wake.hp = bq('highpass', 1800); L.wake.lp = bq('lowpass', 7000); L.wake.src = chain(Lp.white, L.wake.out, [L.wake.hp, L.wake.lp]);
    L.under.lp = bq('lowpass', 180); L.under.src = chain(Lp.pink, L.under.out, [L.under.lp]);"""),
 ("    } else { for (const k of ['wind', 'road', 'squeal', 'grit']) set(L2[k].out, 0, 0.1); }", "    } else { for (const k of ['wind', 'road', 'squeal', 'grit', 'wake']) set(L2[k].out, 0, 0.1); }"),
 ("      const sq = boat ? 0 : clamp(Math.max(ph.skidF * 0.6, ph.skidR), 0, 1) * (ph.onGround ? 1 : 0);", "      set(L2.wake.out, boat ? clamp(sp / 24, 0, 1) * (0.1 + 0.5 * ph.planing) * interiorK * (ph.wetN > 0 ? 1 : 0) : 0, 0.15); if (boat) L2.wake.hp.frequency.setTargetAtTime(1200 + sp * 60, t, 0.2);\n      const sq = boat ? 0 : clamp(Math.max(ph.skidF * 0.6, ph.skidR), 0, 1) * (ph.onGround ? 1 : 0);"),
 ("    set(L2.sea.out, Z.sea * 0.55 * inside, 0.5);", """    const wv = game.world.sea?.waves, U = sky.wind?.speed || 0, hs = wv ? wv.hs : 0, rough = clamp(hs / 4, 0, 1), uwK = this.uwK;
    set(L2.sea.out, Z.sea * (0.3 + 0.7 * rough) * 0.55 * inside * (1 - 0.7 * uwK), 0.5);
    set(L2.swell.out, Z.sea * Math.pow(rough, 1.2) * 0.5 * inside * (1 - 0.5 * uwK), 0.6);
    set(L2.surf.out, clamp(1 - seaD / 90, 0, 1) * (0.15 + 0.85 * rough) * 0.45 * inside * (1 - uwK), 0.5);
    set(L2.gale.out, Math.pow(clamp((U - 4) / 16, 0, 1), 1.3) * 0.5 * inside * (1 - uwK), 0.5); L2.gale.lp.frequency.setTargetAtTime(500 + U * 60 + Math.sin(t * 0.7) * 120, t, 0.3);
    set(L2.under.out, uwK * 0.3, 0.2);"""),
 ("    set(L2.rain.out, Z.rain * 0.5 * (interior ? 0.7 : 1), 0.4);", "    set(L2.rain.out, Z.rain * 0.5 * (interior ? 0.7 : 1) * (1 - uwK), 0.4);"),
 ("    // on-foot steps\n", """    // sea state one-shots: thunder, hull slaps, buoy bells, fog horns, bubbles under water
    for (const e of sky.events) if (e.type === 'thunder') this.play('thunder', { vol: 0.8, delay: e.delay, bus: 'sfx' });
    sky.events.length = 0;
    this.slapT -= dt; this.bellT -= dt; this.fogT -= dt; this.bubT -= dt;
    if (pv && pv.isBoat && this.slapT <= 0 && pv.phys.speed > 4 && hs > 0.7 && pv.phys.wetN > 0) { this.slapT = 0.5 + Math.random() * 1.2 / (0.5 + hs); this.play('splash', { vol: 0.1 + 0.06 * hs, rate: 0.9 + Math.random() * 0.4, pos: { x: pv.x + Math.sin(pv.yaw) * pv.def.body.L * 0.3, y: pv.y, z: pv.z + Math.cos(pv.yaw) * pv.def.body.L * 0.3 }, refDist: 4 }); }
    if (this.bellT <= 0) { this.bellT = 3 + Math.random() * 5; if (Z.sea > 0.4 && hs > 1.4 && !uwK) { const a = Math.random() * 6.283, r = 120 + Math.random() * 220; this.play('bell', { vol: 0.2 * Math.min(1, hs / 3), rate: 0.95 + Math.random() * 0.1, pos: { x: px + Math.cos(a) * r, y: 2, z: pz + Math.sin(a) * r }, refDist: 40 }); } }
    if (this.fogT <= 0) { this.fogT = 20 + Math.random() * 12; if (Z.sea > 0.3 && sky.w.fog > 0.004 && !uwK) { const a = Math.random() * 6.283, r = 300 + Math.random() * 500; this.play('foghorn', { vol: 0.5, pos: { x: px + Math.cos(a) * r, y: 6, z: pz + Math.sin(a) * r }, refDist: 90 }); } }
    if (this.bubT <= 0) { this.bubT = 0.7 + Math.random() * 1.8; if (uwK > 0.5) this.play('bubble', { vol: 0.3, rate: 0.8 + Math.random() * 0.8, bus: 'sfx' }); }
    // on-foot steps
"""),
])

patch('src/game/audioHooks.js', [
 ("  g.on('player:splash', (e) => A.splash({ x: e.x, y: e.y, z: e.z }, e.speed > 4));", "  g.on('player:splash', (e) => A.splash({ x: e.x, y: e.y, z: e.z }, e.speed > 4));\n  g.on('player:wade', (e) => A.play('splash', { vol: 0.1 + 0.03 * e.speed, rate: 1.3 + Math.random() * 0.4, pos: { x: e.x, y: e.y, z: e.z }, refDist: 3 }));\n  g.on('police:radio', () => A.play('squelch', { vol: 0.25, bus: 'ui' }));\n  g.on('marine:radio', () => A.play('squelch', { vol: 0.25, bus: 'ui' }));"),
])
print('ok')
