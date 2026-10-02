import { WATER_LEVEL } from '../data/world.js';

// Shared by the terrain shader and the seabed props: what the bed looks like under water (red absorbed first, caustics from the
// moving surface, wet sand above the waterline). The sea updates these uniforms every frame.
export const WATER_FX = { uWY: { value: WATER_LEVEL }, uWT: { value: 0 }, uWSun: { value: 1 }, uWTurb: { value: 0.3 }, uWUnder: { value: 0 } };

export const WATER_FX_GLSL = `
uniform float uWY; uniform float uWT; uniform float uWSun; uniform float uWTurb; uniform float uWUnder;
float wfxCaustic(vec2 uv, float t) {
  vec2 p = mod(uv * 0.42, 6.28318530718) - 250.0;
  vec2 i = p; float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
vec3 wfxApply(vec3 c, vec3 wp, float vd) {
  float h = wp.y - uWY;
  if (h >= 0.0) return c * (1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.75, h)));
  float d = -h;
  vec3 ab = exp(-vec3(0.42, 0.13, 0.08) * d * (1.0 + uWTurb * 2.2) * (1.0 - 0.8 * uWUnder));
  float near = 1.0 - smoothstep(60.0, 220.0, vd);
  float cau = 0.0;
  if (near > 0.01) cau = wfxCaustic(wp.xz, uWT) * exp(-d * 0.3) * uWSun * near;
  return c * ab * (1.0 + cau * 2.6) * (0.78 + 0.22 * (1.0 - smoothstep(0.0, 1.0, d)));
}`;
