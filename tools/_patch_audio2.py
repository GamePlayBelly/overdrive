def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('src/audio/engineDSP.js', [
 ("this.eb += (ebK - this.eb) * 0.0008 * 128;", "this.eb += (ebK - this.eb) * 0.02;"),
 ("this.cur[v][P.load] = t[P.load]; }", "this.cur[v][P.load] = t[P.load]; for (const k of [P.exh, P.intake, P.brk, P.trans, P.room, P.vol]) this.cur[v][k] = t[k]; }"),
 ("    for (const c of this.cur) { c[P.cyl] = 4; c[P.pitch] = 1; c[P.rpm] = 800; c[P.lp] = 1; }", "    for (const c of this.cur) { c[P.cyl] = 4; c[P.pitch] = 1; c[P.rpm] = 800; c[P.lp] = 1; c[P.exh] = 1; c[P.intake] = 1; c[P.vol] = 1; }"),
])

patch('src/audio/audio.js', [
 ("import { STRIDE, P } from './engineDSP.js';", "import { STRIDE, P } from './engineDSP.js';\nimport { engineProfile } from './engineProfile.js';"),
 ("  const st = def.body.style;\n  if (st === 'bike') return 2;\n  if (st === 'bus' || st === 'truck' || st === 'van') return 1;\n  return (def.sound?.cyl || 4) >= 8 ? 3 : 0;", "  return engineProfile(def).kind;"),
 # engine put: new slots
 ("        A[b + P.pitch] = def.sound?.pitch || 1; A[b + P.kind] = engineKind(def); A[b + P.lp] = o.lp; A[b + P.turbo] = o.turbo || 0; A[b + P.cut] = o.cut || 0; A[b + P.whine] = o.whine || 0; A[b + P.whineHz] = o.whineHz || 0;",
  "        A[b + P.pitch] = def.sound?.pitch || 1; A[b + P.kind] = engineKind(def); A[b + P.lp] = o.lp; A[b + P.turbo] = o.turbo || 0; A[b + P.cut] = o.cut || 0; A[b + P.whine] = o.whine || 0; A[b + P.whineHz] = o.whineHz || 0;\n        const pr = def.air || def.boat ? null : engineProfile(def);\n        A[b + P.exh] = (pr ? pr.exhaust : 1) * (o.exh ?? 1); A[b + P.intake] = pr ? pr.intake : 1; A[b + P.brk] = o.brk || 0; A[b + P.trans] = pr ? pr.trans : 1; A[b + P.room] = o.room || 0; A[b + P.vol] = (pr ? pr.engine : 1); A[b + P.shift] = o.shift || 0; A[b + P.shiftGain] = pr ? pr.shift : 1;"),
 ("        const gain = (interior ? 0.62 : semi ? 0.75 : 0.9) * run * (ph.engineOn ? 1 : 0);", "        const pvp = pv.isBoat || pv.isAir ? null : engineProfile(pv.def), exposed = !!pvp?.bike;\n        const gain = (interior && !exposed ? 0.62 : semi && !exposed ? 0.75 : 0.9) * run * (ph.engineOn ? 1 : 0);\n        const brakeOn = ph.thrIn < 0.05 && ph.rpm > 2000 && ph.gear > 0;"),
 ("whine: 0.25 * nearLoad * (ph.gear <= 3 ? 1 : 0.5), whineHz: ph.speed * 24 + 120 });", "whine: 0.25 * nearLoad * (ph.gear <= 3 ? 1 : 0.5), whineHz: ph.speed * 24 + 120, brk: brakeOn ? 1 : 0, room: interior && !exposed ? 0.5 + 0.3 * this.reverbK : 0, shift: ph.shiftT > 0 ? 1 : 0, exh: interior && !exposed ? 0.5 : 1 });"),
 ("put(pv.def, { rpm: Math.max(ph.rpm, ph.engineOn ? pv.def.perf.redline * 0.1 : 0), load: nearLoad, gain, pan: 0, lp: interior ? 0.34 : semi ? 0.55 : 1,", "put(pv.def, { rpm: Math.max(ph.rpm, ph.engineOn ? pv.def.perf.redline * 0.1 : 0), load: nearLoad, gain, pan: 0, lp: exposed ? 1 : interior ? 0.34 : semi ? 0.55 : 1,"),
])
print('ok')
