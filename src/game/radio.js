// Car radio: five stations of generative music scheduled on the audio clock, plus a talk station that reads live bulletins.
const MIDI = (n) => 440 * Math.pow(2, (n - 69) / 12);
const pick = (a, r) => a[Math.floor(r() * a.length)];
const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const MINOR = [0, 2, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11], PENT = [0, 3, 5, 7, 10], MPENT = [0, 2, 4, 7, 9];
const deg = (scale, d) => { const n = scale.length; return scale[((d % n) + n) % n] + 12 * Math.floor(d / n); };

export const STATIONS = [
  { id: 'fm', name: 'Riverton FM 98.7', genre: 'Synth pop', bpm: 112, swing: 0, root: 57, scale: MINOR, prog: [[0, 5, 2, 6], [0, 3, 5, 4], [5, 6, 0, 0]], style: 'pop' },
  { id: 'ug', name: 'Underground 93.5', genre: 'Drum & bass', bpm: 172, swing: 0, root: 50, scale: MINOR, prog: [[0, 0, 5, 6], [0, 2, 5, 3]], style: 'dnb' },
  { id: 'jz', name: 'Velvet 101.3', genre: 'Smooth jazz', bpm: 94, swing: 0.3, root: 60, scale: MAJOR, prog: [[1, 4, 0, 5]], style: 'jazz' },
  { id: 'co', name: 'Country Road 88.1', genre: 'Country', bpm: 106, swing: 0.08, root: 55, scale: MAJOR, prog: [[0, 3, 4, 0], [0, 4, 3, 0]], style: 'country' },
  { id: 'tk', name: 'Riverton Talk 1010', genre: 'News & weather', bpm: 80, swing: 0, root: 52, scale: MAJOR, prog: [[0, 3, 4, 3]], style: 'talk' },
];

export class Radio {
  constructor(game) {
    this.g = game; this.stations = STATIONS; this.index = 0; this.on = false;
    this.step = 0; this.nextT = 0; this.vol = 0; this.r = rng(99); this.src = null; this.talkT = 6; this.bar = 0; this.lead = [];
  }

  get station() { return this.stations[this.index]; }

  ready() { const A = this.g.audio; return A && A.ready && A.ctx; }

  toggle() { if (this.on) this.off(); else this.set(this.index); }
  next() { this.set((this.index + 1) % this.stations.length); }

  set(i) {
    const A = this.g.audio;
    if (!this.ready()) return;
    this.stop(true);
    this.index = i; this.on = true;
    const ctx = A.ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(A.bus.music);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 12000; this.lp.connect(this.out);
    this.fx = ctx.createGain(); this.fx.connect(this.lp);
    const d = ctx.createDelay(1); d.delayTime.value = 60 / this.station.bpm * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.3; const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2600;
    const wet = ctx.createGain(); wet.gain.value = this.station.style === 'jazz' ? 0.3 : 0.22;
    this.fx.connect(d); d.connect(dl); dl.connect(fb); fb.connect(d); dl.connect(wet); wet.connect(this.lp);
    if (!this.noise) { const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), a = n.getChannelData(0); for (let k = 0; k < a.length; k++) a[k] = Math.random() * 2 - 1; this.noise = n; }
    this.r = rng(1000 + i * 77 + Math.floor(Math.random() * 999));
    this.step = 0; this.bar = 0; this.nextT = ctx.currentTime + 0.12; this.lead = []; this.talkT = 3;
    this.src = this.g.player.vehicle || null;
    this.g.emit('hud:toast', { text: `${this.station.name} - ${this.station.genre}` });
    this.g.audio.ui('tickHi');
  }

  off() { this.stop(false); this.on = false; }

  stop(quick) {
    const A = this.g.audio;
    if (this.out && A?.ctx) { const o = this.out, t = A.ctx.currentTime; o.gain.cancelScheduledValues(t); o.gain.setTargetAtTime(0, t, quick ? 0.02 : 0.08); setTimeout(() => { try { o.disconnect(); } catch { /* gone */ } }, 600); }
    this.out = null;
    if (typeof speechSynthesis !== 'undefined') try { speechSynthesis.cancel(); } catch { /* no speech */ }
  }

  // ------------------------------------------------------------------ voices
  env(g, t, a, d, vol) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  osc(type, f, t, dur, vol, o = {}) {
    const ctx = this.g.audio.ctx, s = ctx.createOscillator(), g = ctx.createGain();
    s.type = type; s.frequency.setValueAtTime(o.from || f, t); if (o.from) s.frequency.exponentialRampToValueAtTime(f, t + (o.glide || 0.05));
    if (o.detune) s.detune.value = o.detune;
    let n = s; if (o.lp) { const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.setValueAtTime(o.lp, t); if (o.lpTo) l.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur); l.Q.value = o.q || 0.7; n.connect(l); n = l; }
    n.connect(g); g.connect(o.dry ? this.lp : this.fx);
    const a = o.a ?? 0.008;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + Math.max(a, dur - (o.r ?? 0.05))); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + (o.r ?? 0.05));
    s.start(t); s.stop(t + dur + (o.r ?? 0.05) + 0.05);
  }

  noiseHit(t, dur, f, vol, type = 'bandpass', q = 0.8) {
    const ctx = this.g.audio.ctx, s = ctx.createBufferSource(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    s.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    s.connect(fl); fl.connect(g); g.connect(this.lp);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  kick(t, v = 1) { this.osc('sine', 46, t, 0.22, 0.95 * v, { from: 150, glide: 0.09, r: 0.02, a: 0.002, dry: true }); this.noiseHit(t, 0.02, 3000, 0.25 * v, 'highpass'); }
  snare(t, v = 1) { this.noiseHit(t, 0.17, 1900, 0.55 * v); this.osc('triangle', 180, t, 0.09, 0.4 * v, { from: 260, glide: 0.04, dry: true }); }
  clap(t, v = 1) { for (let k = 0; k < 3; k++) this.noiseHit(t + k * 0.011, 0.07, 1500, 0.3 * v, 'bandpass', 1.2); this.noiseHit(t + 0.03, 0.2, 1400, 0.2 * v, 'bandpass', 1); }
  hat(t, open = false, v = 1) { this.noiseHit(t, open ? 0.22 : 0.045, 8000, (open ? 0.22 : 0.16) * v, 'highpass', 0.5); }
  brush(t, v = 1) { this.noiseHit(t, 0.12, 5200, 0.12 * v, 'bandpass', 0.6); }

  rhodes(f, t, dur, vol) {
    const ctx = this.g.audio.ctx, c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.type = 'sine'; m.type = 'sine'; c.frequency.value = f; m.frequency.value = f * 7;
    mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.5);
    m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(this.fx);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    c.start(t); m.start(t); c.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
  }

  pluck(f, t, vol, o = {}) { this.osc('sawtooth', f, t, o.dur || 0.28, vol, { lp: 2600, lpTo: 500, a: 0.004, r: 0.05, q: 1.2 }); this.osc('triangle', f * 2, t, 0.12, vol * 0.3, { a: 0.003 }); }

  // ------------------------------------------------------------------ sequencer
  update(dt) {
    const A = this.g.audio, P = this.g.player;
    if (!this.on || !this.ready() || !this.out) return;
    const ctx = A.ctx, v = P.vehicle;
    // loudness: full in the car, fading out with distance once you step away
    let tv = 1;
    if (!v) { const s = this.src; const d = s ? Math.hypot(s.x - P.x, s.z - P.z) : 99; tv = Math.max(0, 1 - d / 22) * 0.55; if (d > 45) { this.off(); return; } }
    else this.src = v;
    const interior = v && this.g.rig.mode === 'cockpit';
    this.vol += (tv - this.vol) * Math.min(1, dt * 4);
    this.out.gain.setTargetAtTime(this.vol * 0.5, ctx.currentTime, 0.05);
    this.lp.frequency.setTargetAtTime(interior ? 5200 : v ? 9000 : 3200, ctx.currentTime, 0.1);
    if (this.station.style === 'talk') return this.talk(dt);
    const S = this.station, sixteenth = 60 / S.bpm / 4;
    while (this.nextT < ctx.currentTime + 0.3) {
      const swing = this.step % 2 ? S.swing * sixteenth : 0;
      this.play(this.step, this.nextT + swing, sixteenth);
      this.nextT += sixteenth; this.step++;
      if (this.step % 16 === 0) this.bar++;
    }
  }

  chordAt(bar) { const S = this.station, prog = S.prog[Math.floor(bar / 8) % S.prog.length]; return prog[bar % prog.length]; }

  play(step, t, sx) {
    const S = this.station, r = this.r, s = step % 16, bar = this.bar, d = this.chordAt(bar);
    const root = S.root + deg(S.scale, d), tri = [0, 2, 4].map((k) => S.root + deg(S.scale, d + k));
    const fill = (bar % 4 === 3) && s >= 12;
    switch (S.style) {
      case 'pop': {
        if (s % 4 === 0) this.kick(t);
        if (s === 4 || s === 12) { this.clap(t); this.snare(t, 0.35); }
        if (s % 4 === 2) this.hat(t, true, 0.8); else if (s % 2 === 0) this.hat(t, false, 0.5);
        if (fill && s % 2 === 1) this.snare(t, 0.3);
        if (s % 2 === 0) this.osc('sawtooth', MIDI(root - 24 + (s % 8 === 6 ? 12 : 0)), t, sx * 1.7, 0.36, { lp: 520, lpTo: 260, q: 2, dry: true });
        if (s === 0) for (const n of tri) { this.osc('sawtooth', MIDI(n), t, sx * 15, 0.055, { lp: 1700, a: 0.12, r: 0.5, detune: -7 }); this.osc('sawtooth', MIDI(n), t, sx * 15, 0.055, { lp: 1700, a: 0.12, r: 0.5, detune: 8 }); }
        if (bar % 8 >= 2) { const a = [0, 1, 2, 1][Math.floor(s / 2) % 4]; if (s % 2 === 0 || s % 4 === 3) this.osc('square', MIDI(tri[a % 3] + 12 + (s % 8 > 4 ? 12 : 0)), t, sx * 0.9, 0.06, { lp: 3400, a: 0.004 }); }
        break;
      }
      case 'dnb': {
        if (s === 0 || s === 10 || (s === 7 && bar % 2)) this.kick(t, 0.9);
        if (s === 4 || s === 12) this.snare(t, 1);
        if (s === 15 && bar % 4 === 3) this.snare(t, 0.5);
        if (s % 2 === 0) this.hat(t, s % 8 === 6, 0.7); else if (r() < 0.25) this.hat(t, false, 0.3);
        if (s % 8 === 0) { const f = MIDI(root - 24); this.osc('sine', f, t, sx * 7, 0.6, { a: 0.02, r: 0.12, dry: true }); this.osc('sawtooth', f * 2, t, sx * 7, 0.12, { lp: 360, lpTo: 900, a: 0.02, r: 0.1, detune: 9 }); this.osc('sawtooth', f * 2, t, sx * 7, 0.12, { lp: 360, lpTo: 900, a: 0.02, r: 0.1, detune: -9 }); }
        if (s === 0 && bar % 2 === 0) for (const n of tri) this.osc('triangle', MIDI(n + 12), t, sx * 30, 0.05, { a: 0.4, r: 1, lp: 2200 });
        if (bar % 8 >= 4 && (s === 3 || s === 6 || s === 11 || s === 14)) this.osc('square', MIDI(root + 12 + pick([0, 3, 7, 10], r)), t, sx * 1.4, 0.05, { lp: 2800, a: 0.003 });
        break;
      }
      case 'jazz': {
        if (s % 4 === 0) this.brush(t, 0.8);
        if (s === 6 || s === 14) this.brush(t, 0.7);
        if (s % 8 === 0) this.noiseHit(t, 0.06, 9000, 0.05, 'highpass');
        if (s % 4 === 0) { const w = [0, 2, 4, 2][(s / 4) % 4]; this.osc('sine', MIDI(S.root + deg(S.scale, d + w) - 12), t, sx * 3.6, 0.42, { lp: 500, a: 0.01, r: 0.06, dry: true }); }
        if (s === 0 || s === 6 || s === 10) for (const n of [0, 2, 4, 6]) this.rhodes(MIDI(S.root + deg(S.scale, d + n)), t, sx * 5, 0.06);
        if (s % 2 === 0 && r() < 0.42 && bar % 4 >= 1) { const n = S.root + 12 + deg(PENT, Math.floor(r() * 7) - 1) + (d % 2 ? 2 : 0); this.osc('triangle', MIDI(n), t, sx * (2 + Math.floor(r() * 3)), 0.12, { lp: 2800, a: 0.01, r: 0.12 }); }
        break;
      }
      case 'country': {
        if (s === 0 || s === 8) this.osc('sine', MIDI(root - 12 + (s === 8 ? 7 : 0)), t, sx * 3, 0.5, { lp: 600, a: 0.006, r: 0.05, dry: true });
        if (s === 4 || s === 12) { this.brush(t, 1.4); }
        if (s === 2 || s === 6 || s === 10 || s === 14) for (let k = 0; k < 4; k++) this.pluck(MIDI(tri[k % 3] + (k > 2 ? 12 : 0)), t + k * 0.012, 0.055);
        if (s === 0) this.kick(t, 0.5);
        if (bar % 8 >= 2 && (s % 4 === 0 || s === 3 || s === 7 || s === 11)) { const n = S.root + 12 + deg(MPENT, Math.floor(r() * 5) + (d > 2 ? 2 : 0)); this.osc('square', MIDI(n), t, sx * 1.6, 0.05, { from: MIDI(n - 1), glide: 0.06, lp: 2400, a: 0.004, r: 0.08 }); }
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------------ talk station
  talk(dt) {
    this.talkT -= dt;
    const A = this.g.audio, ctx = A.ctx, S = this.station;
    if (this.nextT < ctx.currentTime + 0.3) {
      // a quiet news bed: slow pad chords
      const t = this.nextT, d = S.prog[0][this.bar % 4], n = [0, 2, 4].map((k) => S.root + deg(S.scale, d + k));
      for (const q of n) this.osc('triangle', MIDI(q), t, 3.6, 0.03, { a: 0.8, r: 1.4, lp: 1400 });
      this.nextT += 4; this.bar++;
    }
    if (this.talkT <= 0) { this.talkT = 14 + this.r() * 10; this.bulletin(); }
  }

  bulletin() {
    const g = this.g, sky = g.sky, P = g.police;
    const hr = Math.floor(sky.time), mn = Math.floor((sky.time % 1) * 60);
    const w = { sunny: 'clear skies', cloudy: 'cloudy skies', overcast: 'an overcast sky', lightRain: 'light rain', heavyRain: 'heavy rain', fog: 'dense fog', storm: 'thunderstorms', calm: 'calm and clear skies', breezy: 'a fresh breeze', windy: 'strong winds', roughSea: 'rough seas', thunderstorm: 'thunderstorms', gale: 'gale force winds' }[sky.weather] || 'fair weather';
    const sw = g.world.sea?.waves, sea = sw ? `Marine forecast: waves of ${sw.hs.toFixed(1)} metres, wind ${Math.round(sw.U)} metres per second.` : '';
    const lines = [
      `This is Riverton Talk. It is ${hr} ${mn < 10 ? 'oh ' : ''}${mn}. Expect ${w} across the county.`,
      P && P.level > 0 ? 'Police report an active pursuit in the county. Drivers are advised to stay clear of emergency vehicles.' : 'Traffic is moving normally downtown. Check Central Avenue for lane closures near the park.',
      'Marlow Bay reports a busy afternoon at the marina. Boaters are reminded to keep a slow wake inside the harbor.',
      sea || 'Calm seas reported along the coast.',
      'The Riverton Motor Club announces this weekend\'s car meet. Doors open at dusk.',
      'Road crews are resurfacing Ridge Road overnight. Expect delays in both directions.',
      'Stone Recovery has issued a statement denying any wrongdoing. No further comment was made.',
    ];
    const text = pick(lines, this.r);
    this.g.emit('hud:toast', { text: 'Riverton Talk: ' + text.slice(0, 60) + '...' });
    if (typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined') {
      try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; u.pitch = 0.9; u.volume = Math.min(1, this.vol * 0.9); speechSynthesis.speak(u); } catch { /* speech unavailable */ }
    }
  }
}
