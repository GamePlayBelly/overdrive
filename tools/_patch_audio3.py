def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('src/audio/audio.js', [
 ("this.uwK = 0; this.slapT = 1;", "this.uwK = 0; this.reverbK = 0; this.slapT = 1;"),
 ("      for (const k of ['engine', 'sfx', 'voice', 'amb', 'music', 'ui', 'tires']) { const g = ctx.createGain(); g.connect(comp); this.bus[k] = g; }",
  """      for (const k of ['engine', 'sfx', 'voice', 'amb', 'music', 'ui', 'tires']) { const g = ctx.createGain(); g.connect(comp); this.bus[k] = g; }
      // shared room reverb: tunnels, garages and city canyons feed it, open roads barely do
      this.rev = ctx.createConvolver(); this.rev.buffer = impulse(ctx, 2.6);
      this.revIn = ctx.createGain(); this.revIn.gain.value = 0; this.revOut = ctx.createGain(); this.revOut.gain.value = 0.9;
      this.revIn.connect(this.rev); this.rev.connect(this.revOut); this.revOut.connect(comp);
      for (const k of ['engine', 'sfx', 'tires']) this.bus[k].connect(this.revIn);"""),
 ("export class AudioSystem {", """function impulse(ctx, secs) {
  const n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n; lp += ((Math.random() * 2 - 1) - lp) * (0.55 - 0.45 * t); d[i] = lp * Math.pow(1 - t, 3.2) * (i < 300 ? i / 300 : 1); } }
  return b;
}

export class AudioSystem {"""),
 ("turbo: (ph.tune?.turbo ? clamp(nearLoad * ph.rpm / ph.redline, 0, 1) * (ph.tune.turbo / 3) : 0) + ph.boost * 0.7,", "turbo: (ph.tune?.turbo ? clamp(nearLoad * ph.rpm / ph.redline, 0, 1) * (ph.tune.turbo / 3) : 0) + (pvp?.turbo ? pvp.turbo * 0.8 : 0) + ph.boost * 0.7,"),
 # layers
 ("this.L.under = { out: mkLayer(this.bus.amb) };", "this.L.under = { out: mkLayer(this.bus.amb) }; this.L.spray = { out: mkLayer(this.bus.tires) };"),
 ("    L.under.lp = bq('lowpass', 180);", "    L.spray.hp = bq('highpass', 2200); L.spray.lp = bq('lowpass', 9000); L.spray.src = chain(Lp.white, L.spray.out, [L.spray.hp, L.spray.lp]);\n    L.under.lp = bq('lowpass', 180);"),
 ("for (const k of ['wind', 'road', 'squeal', 'grit', 'wake']) set(L2[k].out, 0, 0.1); }", "for (const k of ['wind', 'road', 'squeal', 'grit', 'wake', 'spray']) set(L2[k].out, 0, 0.1); }"),
 # tires block
 ("      const interiorK = interior ? 0.55 : 1;", "      const prof = pv.isBoat || pv.isAir ? null : engineProfile(pv.def), tireV = prof?.tire ?? 1, windV = prof?.wind ?? 1, wet = sky.wetness || 0;\n      const interiorK = interior && !prof?.bike ? 0.55 : 1;"),
 ("      set(L2.wind.out, wind * 0.65 * interiorK * (this.zone.rain > 0.5 ? 1.1 : 1));", "      set(L2.wind.out, wind * 0.65 * windV * interiorK * (this.zone.rain > 0.5 ? 1.1 : 1));"),
 ("      else set(L2.road.out, roadK * (asph ? 0.3 : 0.5) * interiorK); if (!boat) L2.road.lp.frequency.setTargetAtTime(asph ? 260 + sp * 14 : 420 + sp * 30, t, 0.1);",
  "      else set(L2.road.out, roadK * (asph ? 0.3 + 0.3 * wet : 0.5) * tireV * interiorK); if (!boat) L2.road.lp.frequency.setTargetAtTime(asph ? 260 + sp * 14 + wet * 650 : ph.surfR === 3 || ph.surfR === 4 ? 700 + sp * 40 : 420 + sp * 30, t, 0.1);\n      set(L2.spray.out, boat || !asph ? 0 : wet * clamp(sp / 30, 0, 1) * 0.3 * tireV * interiorK, 0.12);"),
 ("      set(L2.squeal.out, sqOn * sqOn * 0.5 * (interior ? 0.6 : 1), 0.04);", "      set(L2.squeal.out, sqOn * sqOn * 0.5 * tireV * (1 - 0.3 * wet) * (interior && !prof?.bike ? 0.6 : 1), 0.04);"),
 ("      set(L2.grit.out, gr * 0.6 * interiorK, 0.08);", "      set(L2.grit.out, gr * 0.6 * tireV * interiorK, 0.08);"),
 # NPC: behind attenuation, braking, shifts, profile
 ("        put(c.def, { rpm: fr.rpm * dop, load, gain: g, pan, lp: clamp(1 - d / 160, 0.12, 0.85) * (interior ? 0.55 : 1), whine: 0 });",
  "        const behind = clamp(-(dx * _f.x + dz * _f.z), 0, 1), gearCh = prev.gear !== undefined && fr.gear !== prev.gear; prev.gear = fr.gear; if (gearCh) prev.sh = 0.18; prev.sh = Math.max(0, (prev.sh || 0) - dt);\n        put(c.def, { rpm: fr.rpm * dop, load, gain: g, pan, lp: clamp(1 - d / 160, 0.12, 0.85) * (1 - 0.35 * behind) * (interior ? 0.55 : 1), whine: 0, brk: acc < -1.5 && c.speed > 4 ? 1 : 0, shift: prev.sh > 0 ? 1 : 0, exh: d < 40 ? 1 : 0.7, turbo: c.def.sound?.turbo ? 0.3 * load : 0 });"),
 # environment reverb
 ("    // sea state one-shots", """    // acoustic environment: roofed spaces ring, canyons a little, open ground hardly at all; it eases in and out
    {
      const roof = w.decks ? w.decks.at(px, pz, cam.position.y + 20) : null, covered = roof !== null && roof > cam.position.y + 2.5;
      const tgt = clamp((covered ? 0.75 : built ? (d === 'cbd' ? 0.16 : 0.09) : 0.03) + rainI * 0.04 + (interior ? 0.1 : 0), 0, 1) * (1 - uwK);
      this.reverbK += (tgt - this.reverbK) * (1 - Math.exp(-dt * (covered ? 2.5 : 1.0)));
      this.revIn.gain.setTargetAtTime(this.reverbK * 0.8, t, 0.15);
      this.covered = covered;
    }
    // sea state one-shots"""),
])
print('ok')
