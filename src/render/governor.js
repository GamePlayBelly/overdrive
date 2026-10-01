import { clamp } from '../core/math.js';

// Quality tiers. Scale = internal render resolution; the governor moves it continuously and shifts tiers when it saturates.
export const TIERS = [
  { name: 'low', ao: false, samples: 0, bloom: false, shadowSize: 1024, shadowDist: 46, lod: 0.62, veg: 0.5, props: 0.7, traffic: 0.55, peds: 0.55, grass: 0.35, water: 0, smin: 0.5, smax: 0.85 },
  { name: 'medium', ao: true, samples: 0, bloom: false, shadowSize: 1024, shadowDist: 72, lod: 0.85, veg: 0.78, props: 0.9, traffic: 0.8, peds: 0.8, grass: 0.65, water: 1, smin: 0.55, smax: 1.0 },
  { name: 'high', ao: true, samples: 4, bloom: true, shadowSize: 2048, shadowDist: 100, lod: 1.0, veg: 1, props: 1, traffic: 1, peds: 1, grass: 1, water: 2, smin: 0.65, smax: 1.0 },
  { name: 'ultra', ao: true, samples: 4, bloom: true, shadowSize: 2048, shadowDist: 140, lod: 1.2, veg: 1.2, props: 1.15, traffic: 1.15, peds: 1.15, grass: 1.25, water: 2, smin: 0.8, smax: 1.0 },
];
export const PRESET_INDEX = { low: 0, medium: 1, high: 2, ultra: 3 };

function detectTier(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/RTX|RX 6|RX 7|RX 9|GTX 16|GTX 10[6-8]0|Radeon RX|Arc|Apple M|Quadro/i.test(name)) return 2;
    if (/NVIDIA|GeForce|Radeon|AMD/i.test(name)) return 1;
    if (/Intel/i.test(name)) return 1;
  } catch { /* fall through */ }
  return 1;
}

export class Governor {
  constructor(game) {
    this.game = game;
    this.mode = 'auto';
    this.tier = detectTier(game.renderer);
    this.scale = TIERS[this.tier].smax * 0.8;
    this.gfx = {};
    this.ema = 16.7;
    this.evalT = 0; this.bad = 0; this.good = 0; this.cool = 2; this.lock = 0; this.probe = null;
    this.targetFps = 60;
    this.refreshSamples = [];
    this.enabled = true;
    this.last = null;
  }

  // gfx: profile.settings.graphics
  setSettings(gfx) {
    this.gfx = gfx || {};
    const p = this.gfx.preset || 'auto';
    this.mode = p === 'auto' ? 'auto' : 'fixed';
    if (this.mode === 'fixed') this.tier = PRESET_INDEX[p] ?? 1;
    else if (this.mode === 'auto' && this.tier === undefined) this.tier = 1;
    this.scale = this.mode === 'fixed' ? clamp(this.gfx.resolution ?? TIERS[this.tier].smax, 0.4, 1.25) : clamp(this.scale, TIERS[this.tier].smin, TIERS[this.tier].smax);
    this.apply(true);
  }

  apply(force = false) {
    const g = this.game, T = TIERS[this.tier], S = this.gfx;
    const q = { dpr: T.name === 'ultra' ? 1.5 : T.name === 'high' ? 1.25 : 1, scale: this.scale, samples: T.samples, bloom: S.bloom !== undefined && this.mode === 'fixed' ? !!S.bloom : T.bloom, fxaa: T.samples === 0, ao: T.ao && S.ao !== false };
    const key = JSON.stringify([q.scale.toFixed(2), q.samples, q.bloom, q.ao, this.tier, S.shadows, S.drawDistance, S.vegetation, S.grass, S.wakes, S.traffic, S.peds, S.reflections]);
    if (!force && key === this.last) return;
    this.last = key;
    g.pipeline.setQuality(q);
    const shadowMul = S.shadows === 'off' ? 0 : 1;
    const sz = S.shadows === 'high' ? 2048 : S.shadows === 'low' ? 1024 : T.shadowSize;
    if (g.sky) {
      g.sky.setShadowQuality?.(sz, T.shadowDist * (S.drawDistance ?? 1) ** 0.5, shadowMul > 0);
    }
    const dd = clamp(S.drawDistance ?? 1, 0.5, 1.6);
    if (g.world) {
      g.world.lodScale = T.lod * dd;
      g.world.store.quality = clamp(T.lod * dd, 0.5, 1.4);
      g.world.veg.lodScale = T.veg * dd * (S.vegetation ?? 1);
      if (g.world.props) g.world.props.lodScale = T.props * dd;
    }
    if (g.traffic) g.traffic.density = T.traffic * (S.traffic ?? 1);
    if (g.peds) g.peds.density = T.peds * (S.peds ?? 1);
    if (g.grass) g.grass.setQuality?.(S.grass === false ? 0 : T.grass * (S.vegetation ?? 1));
    if (g.sea) g.sea.setQuality?.(T.water);
    if (g.wake) g.wake.enabled = T.water >= 1 && S.wakes !== false;
    if (g.camera && S.fov) { g.rig.baseFov = S.fov; }
  }

  // rawDt: seconds between consecutive animation frames
  frame(rawDt) {
    if (!this.enabled || !(rawDt > 0) || rawDt > 0.5) return;
    const ms = rawDt * 1000;
    this.ema += (Math.min(ms, 120) - this.ema) * 0.06;
    if (this.refreshSamples.length < 150) { this.refreshSamples.push(ms); if (this.refreshSamples.length === 150) { const s = [...this.refreshSamples].sort((a, b) => a - b), hz = 1000 / s[15]; this.targetFps = hz >= 54 ? 60 : hz >= 46 ? Math.round(hz) : 60; } }
    if (this.mode !== 'auto') return;
    // pinned to a 30 fps cadence even at the lowest settings: the display (or power mode) is capped, so stop chasing 60
    if (this.tier === 0 && this.scale <= TIERS[0].smin + 0.001 && this.ema > 29 && this.ema < 38) { this.floorT = (this.floorT || 0) + rawDt; if (this.floorT > 8 && this.targetFps > 30) { this.targetFps = 30; this.bad = 0; this.good = 0; } } else this.floorT = 0;
    this.evalT += rawDt; this.cool -= rawDt; this.lock -= rawDt;
    if (this.probe) { this.probe.t -= rawDt; }
    if (this.evalT < 0.5) return;
    this.evalT = 0;
    const target = 1000 / this.targetFps;
    const T = TIERS[this.tier];
    const bad = this.ema > target * 1.14, good = this.ema < target * 1.07;
    if (bad) { this.bad++; this.good = 0; } else if (good) { this.good++; this.bad = 0; } else { this.bad = 0; this.good = Math.max(0, this.good - 1); }
    if (this.bad >= 2 && this.cool <= 0) {
      if (this.probe && this.probe.t > 0) { this.scale = this.probe.from; this.lock = 40; this.probe = null; }
      else if (this.scale > T.smin + 0.001) this.scale = Math.max(T.smin, this.scale - clamp((this.ema / target - 1) * 0.45, 0.04, 0.22));
      else if (this.tier > 0) { this.tier--; this.scale = TIERS[this.tier].smax * 0.85; this.lock = 30; }
      this.cool = 0.9; this.bad = 0;
      this.apply();
    } else if (this.good >= 10 && this.cool <= 0 && this.lock <= 0) {
      if (this.scale < T.smax - 0.001) { this.probe = { from: this.scale, t: 4 }; this.scale = Math.min(T.smax, this.scale + 0.05); }
      else if (this.tier < 3) { this.probe = { from: this.scale, t: 5, tier: this.tier }; this.tier++; this.scale = TIERS[this.tier].smin + 0.1; }
      this.cool = 2.5; this.good = 0;
      this.apply();
    }
    if (this.probe && this.probe.t <= 0) this.probe = null;
  }

  status() { const T = TIERS[this.tier]; return { tier: T.name, scale: +this.scale.toFixed(2), ms: +this.ema.toFixed(1), fps: Math.round(1000 / this.ema), mode: this.mode }; }
}
