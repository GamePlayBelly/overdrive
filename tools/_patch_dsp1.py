def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('src/audio/engineDSP.js', [
 ("export const STRIDE = 14;", "export const STRIDE = 22;"),
 ("whine: 12, whineHz: 13 };", "whine: 12, whineHz: 13, exh: 14, intake: 15, shift: 16, brk: 17, trans: 18, room: 19, vol: 20, shiftGain: 21 };"),
 ("  return [[74 * pit, 16, 0.9],", "  if (kind === 4) return [[105 * pit, 7, 0.55], [360 * pit, 4.6, 0.85], [1250 * pit, 2.6, 0.75 * (0.4 + load)], [3500, 1.3, 0.45 * (0.3 + load)]];\n  return [[74 * pit, 16, 0.9],"),
 ("    this.popT = 0; this.limT = 0; this.cylN = 0;", "    this.popT = 0; this.limT = 0; this.cylN = 0;\n    this.n2 = 0; this.n3 = 0; this.spool = 0; this.blowT = 0; this.prevLoad = 0; this.prevShift = 0; this.boom = 0; this.eb = 0; this.shAmp = 1;"),
 # per-render smoothing of new params
 ("    cur[P.whine] += (tgt[P.whine] - cur[P.whine]) * blend; cur[P.whineHz] += (tgt[P.whineHz] - cur[P.whineHz]) * blend;",
  "    cur[P.whine] += (tgt[P.whine] - cur[P.whine]) * blend; cur[P.whineHz] += (tgt[P.whineHz] - cur[P.whineHz]) * blend;\n    for (const k of [P.exh, P.intake, P.brk, P.trans, P.room, P.vol]) cur[k] += (tgt[k] - cur[k]) * blend;\n    cur[P.shift] = tgt[P.shift]; cur[P.shiftGain] = tgt[P.shiftGain];"),
 ("    const cut = cur[P.cut] > 0.5, decel = load < 0.1 && rpm1 > 2200, rough = cur[P.rough];",
  """    const cut = cur[P.cut] > 0.5, decel = load < 0.1 && rpm1 > 2200, rough = cur[P.rough];
    const exh = cur[P.exh] || 0, intake = cur[P.intake] || 0, brk = cur[P.brk], trans = cur[P.trans], room = cur[P.room], vol = cur[P.vol] || 1;
    const shiftNow = cur[P.shift], shGain = cur[P.shiftGain] || 1, bike = kind === 4;
    // end of a gear change under power: a short crack from the exhaust; blow-off when the throttle is lifted on a turbo
    if (this.prevShift > 0.5 && shiftNow < 0.5 && load > 0.35 && (rough > 0.15 || bike || kind === 3)) this.spawn(cur, 1.7 * shGain);
    this.prevShift = shiftNow;
    if (this.prevLoad > 0.6 && load < 0.2 && turbo > 0.25) this.blowT = Math.round(sr * 0.35);
    this.prevLoad = load;
    const shDip = 1 - 0.7 * shiftNow * shGain;
    const ebK = (decel ? 1 : 0) * (0.3 + 0.7 * Math.min(1, rpm1 / 5000));
    this.eb += (ebK - this.eb) * 0.0008 * 128;
    const ebv = Math.min(1, this.eb);"""),
 ("      let out = 0;\n      for (let c = 0; c < COMP; c++) {\n        const y = a1[c] * y1[c] + a2[c] * y2[c];\n        y2[c] = y1[c]; y1[c] = y;\n        out += y;\n      }\n      out *= 0.5;\n      const nz = this.r() * 2 - 1;\n      this.n1 += (nz - this.n1) * nlp;\n      out += this.n1 * noiseA * 2.4;",
  """      let out = 0;
      for (let c = 0; c < COMP; c++) {
        const y = a1[c] * y1[c] + a2[c] * y2[c];
        y2[c] = y1[c]; y1[c] = y;
        // 0-1 body and exhaust, 2 mid bark, 3 top edge: the exhaust level and engine braking reshape them
        out += c < 2 ? y * (0.55 + 0.45 * exh) * (1 + 0.25 * ebv) : y * (c === 2 ? 1 - 0.4 * ebv : 1 - 0.65 * ebv);
      }
      out *= 0.5 * shDip;
      const nz = this.r() * 2 - 1;
      this.n1 += (nz - this.n1) * nlp;
      out += this.n1 * noiseA * 2.4;
      // intake roar: band-limited noise that opens with throttle and revs
      if (intake > 0.02 && load > 0.05) {
        this.n2 += (nz - this.n2) * 0.18; this.n3 += (this.n2 - this.n3) * 0.18;
        out += (this.n2 - this.n3) * intake * (bike ? 0.34 : 0.2) * load * load * (0.25 + rnorm) * shDip;
      }
      if (room > 0.01) { this.boom += (out - this.boom) * 0.012; out += this.boom * room * 2.2; }"""),
 ("      if (whine > 0.002) { this.whine += whineW; if (this.whine > 6.2832) this.whine -= 6.2832; out += Math.sin(this.whine) * whine * 0.04; }",
  "      if (whine > 0.002) { this.whine += whineW; if (this.whine > 6.2832) this.whine -= 6.2832; out += (Math.sin(this.whine) + (bike ? 0.5 * Math.sin(this.whine * 2.01) : 0)) * whine * 0.04 * (0.4 + 0.6 * trans); }"),
 ("      if (turbo > 0.01) { this.turboPh += (Math.PI * 2 * (1800 + turbo * 5200)) / sr; if (this.turboPh > 6.2832) this.turboPh -= 6.2832; out += Math.sin(this.turboPh) * turbo * 0.02 * (0.3 + load); }",
  """      this.spool += ((turbo > 0.01 ? turbo * (0.25 + 0.75 * load) : 0) - this.spool) * (turbo * load > this.spool ? 0.00012 : 0.00028);
      if (this.spool > 0.01) { this.turboPh += (Math.PI * 2 * (1500 + this.spool * 6500)) / sr; if (this.turboPh > 6.2832) this.turboPh -= 6.2832; out += (Math.sin(this.turboPh) + 0.3 * Math.sin(this.turboPh * 2)) * this.spool * 0.02 * (0.3 + load); }
      if (this.blowT > 0) { this.blowT--; out += (nz - this.n1) * 0.1 * turbo * Math.min(1, this.blowT / (sr * 0.1)) * Math.exp(-(sr * 0.35 - this.blowT) / (sr * 0.12)); }"""),
 ("      const g = gain0 + (gain1 - gain0) * t;", "      const g = (gain0 + (gain1 - gain0) * t) * vol;"),
])
print('ok')
