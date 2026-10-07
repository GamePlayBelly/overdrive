import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { makeCloudNoise } from './textures.js';
import { applyNight, applyWetness } from './materials.js';

export const WEATHERS = {
  sunny: { label: 'Sunny', cloud: 0.12, dark: 0.0, rain: 0, fog: 0.00055, wind: 0.25, sun: 1, lightning: 0 },
  cloudy: { label: 'Cloudy', cloud: 0.5, dark: 0.15, rain: 0, fog: 0.0007, wind: 0.45, sun: 0.8, lightning: 0 },
  overcast: { label: 'Overcast', cloud: 0.92, dark: 0.45, rain: 0, fog: 0.001, wind: 0.5, sun: 0.35, lightning: 0 },
  lightRain: { label: 'Light rain', cloud: 0.95, dark: 0.55, rain: 0.35, fog: 0.0016, wind: 0.6, sun: 0.28, lightning: 0 },
  heavyRain: { label: 'Heavy rain', cloud: 1, dark: 0.75, rain: 1, fog: 0.0032, wind: 0.95, sun: 0.18, lightning: 0 },
  fog: { label: 'Fog', cloud: 0.8, dark: 0.3, rain: 0, fog: 0.0085, wind: 0.1, sun: 0.4, lightning: 0 },
  storm: { label: 'Storm', cloud: 1, dark: 0.9, rain: 0.9, fog: 0.0028, wind: 1.3, sun: 0.1, lightning: 1 },
  calm: { label: 'Calm', cloud: 0.08, dark: 0, rain: 0, fog: 0.0005, wind: 0.06, sun: 1, lightning: 0 },
  breezy: { label: 'Breezy', cloud: 0.3, dark: 0.05, rain: 0, fog: 0.0006, wind: 0.55, sun: 0.95, lightning: 0 },
  windy: { label: 'Windy', cloud: 0.55, dark: 0.2, rain: 0, fog: 0.0007, wind: 0.85, sun: 0.7, lightning: 0 },
  roughSea: { label: 'Rough sea', cloud: 0.7, dark: 0.35, rain: 0, fog: 0.0011, wind: 1.05, sun: 0.5, lightning: 0 },
  thunderstorm: { label: 'Thunderstorm', cloud: 1, dark: 0.8, rain: 0.8, fog: 0.0024, wind: 1.0, sun: 0.14, lightning: 1 },
  gale: { label: 'Gale', cloud: 1, dark: 0.92, rain: 1, fog: 0.0036, wind: 1.6, sun: 0.08, lightning: 0.6 },
};
const NEXT = {
  sunny: [['sunny', 3], ['cloudy', 3], ['calm', 1], ['breezy', 2]], cloudy: [['sunny', 2], ['overcast', 2], ['cloudy', 1], ['breezy', 1]],
  overcast: [['cloudy', 2], ['lightRain', 2], ['fog', 1], ['windy', 1]], lightRain: [['overcast', 2], ['heavyRain', 1.5], ['lightRain', 1]],
  heavyRain: [['lightRain', 2], ['storm', 1], ['thunderstorm', 1]], storm: [['heavyRain', 2], ['overcast', 1], ['gale', 0.5]], fog: [['cloudy', 2], ['overcast', 1], ['calm', 1]],
  calm: [['sunny', 2], ['breezy', 1], ['cloudy', 1], ['fog', 0.5]], breezy: [['sunny', 2], ['windy', 2], ['cloudy', 2]], windy: [['breezy', 2], ['roughSea', 1.5], ['cloudy', 1], ['overcast', 1]],
  roughSea: [['windy', 2], ['heavyRain', 1], ['overcast', 1], ['thunderstorm', 0.5]], thunderstorm: [['heavyRain', 2], ['lightRain', 1], ['overcast', 1]], gale: [['storm', 2], ['heavyRain', 1]],
};

const col = (r, g, b) => new THREE.Color(r, g, b);
const NIGHT_AMB = new THREE.Color(0.17, 0.26, 0.52), NIGHT_GND = new THREE.Color(0.05, 0.055, 0.075);
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Vector3(), _k = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3();
// palette keyed by sun elevation (sin)
const KEYS = [
  { e: -0.35, zen: col(0.003, 0.005, 0.014), hor: col(0.028, 0.03, 0.045), sun: col(0.05, 0.07, 0.12), hemi: 0.3, sunI: 0 },
  { e: -0.12, zen: col(0.008, 0.012, 0.04), hor: col(0.08, 0.07, 0.09), sun: col(0.3, 0.2, 0.25), hemi: 0.35, sunI: 0 },
  { e: -0.02, zen: col(0.04, 0.06, 0.16), hor: col(0.55, 0.3, 0.2), sun: col(1.2, 0.45, 0.2), hemi: 0.55, sunI: 0 },
  { e: 0.06, zen: col(0.12, 0.2, 0.42), hor: col(0.95, 0.58, 0.34), sun: col(1.4, 0.72, 0.38), hemi: 0.85, sunI: 1.6 },
  { e: 0.2, zen: col(0.16, 0.3, 0.62), hor: col(0.7, 0.72, 0.78), sun: col(1.25, 1.02, 0.82), hemi: 1.1, sunI: 2.7 },
  { e: 0.55, zen: col(0.13, 0.31, 0.7), hor: col(0.58, 0.7, 0.84), sun: col(1.2, 1.12, 1.0), hemi: 1.25, sunI: 3.3 },
  { e: 1.0, zen: col(0.11, 0.29, 0.7), hor: col(0.55, 0.68, 0.85), sun: col(1.2, 1.14, 1.04), hemi: 1.3, sunI: 3.4 },
];

function paletteAt(e) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].e < e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((e - a.e) / (b.e - a.e), 0, 1);
  return {
    zen: a.zen.clone().lerp(b.zen, t), hor: a.hor.clone().lerp(b.hor, t), sun: a.sun.clone().lerp(b.sun, t),
    hemi: lerp(a.hemi, b.hemi, t), sunI: lerp(a.sunI, b.sunI, t),
  };
}

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
uniform vec3 sunDir, moonDir, zenith, horizon, sunCol;
uniform float cloud, cloudDark, time, stars, flash, glow;
uniform sampler2D cloudTex;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float e = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(e, 0.0, 1.0), 0.42));
  if (e < 0.0) col = horizon * mix(1.0, 0.55, clamp(-e * 5.0, 0.0, 1.0));
  float sd = max(dot(d, sunDir), 0.0);
  float clr = 1.0 - cloud * 0.75;
  col += sunCol * (pow(sd, 6.0) * 0.28 + pow(sd, 48.0) * 0.5) * clr;
  col += sunCol * smoothstep(0.99955, 0.9998, sd) * 18.0 * (1.0 - cloud) * step(0.0, sunDir.y + 0.02);
  float md = max(dot(d, moonDir), 0.0);
  col += vec3(0.8, 0.85, 0.95) * smoothstep(0.99965, 0.9999, md) * 2.5 * stars * (1.0 - cloud);
  col += vec3(0.05, 0.06, 0.09) * pow(md, 30.0) * stars;
  col += vec3(0.09, 0.06, 0.035) * glow * pow(1.0 - clamp(e, 0.0, 1.0), 6.0);
  if (stars > 0.0 && e > 0.0) {
    vec3 p = floor(d * 380.0);
    float h = fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float tw = 0.6 + 0.4 * sin(time * 3.0 + h * 50.0);
    col += vec3(step(0.9978, h)) * stars * tw * (1.0 - cloud) * smoothstep(0.0, 0.2, e);
  }
  if (e > 0.0) {
    vec2 uv = d.xz / (e + 0.1) * 0.22 + vec2(time * 0.0035, time * 0.0012);
    float n = texture2D(cloudTex, uv).r * 0.55 + texture2D(cloudTex, uv * 2.1 + 0.37).r * 0.3 + texture2D(cloudTex, uv * 4.7 + 0.71).r * 0.15;
    float c = smoothstep(1.02 - cloud * 0.95, 1.18 - cloud * 0.55, n + cloud * 0.25);
    c *= smoothstep(0.0, 0.15, e);
    vec3 lit = mix(vec3(1.0, 1.0, 1.0) * (sunCol.g * 0.55 + 0.08), vec3(0.32, 0.33, 0.36) * (sunCol.g * 0.4 + 0.03), cloudDark);
    lit += sunCol * pow(sd, 3.0) * 0.35 * (1.0 - cloudDark);
    lit = max(lit, horizon * 0.6);
    col = mix(col, lit, c * 0.96);
  }
  col += vec3(0.8, 0.85, 1.0) * flash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const RAIN_VS = `
attribute float tip;
uniform vec3 cam; uniform float time, len, speed; uniform vec2 wind; uniform float box;
varying float vA;
void main(){
  vec3 p = position * box;
  vec3 off = vec3(wind.x * time, -speed * time, wind.y * time);
  vec3 w = cam + (fract((p + off - cam) / box) - 0.5) * box;
  vec3 dir = normalize(vec3(wind.x, -speed, wind.y));
  w -= dir * len * tip;
  vA = 1.0 - tip * 0.9;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const RAIN_FS = `uniform float opacity; uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color, opacity * vA); }`;

export class Sky {
  constructor(renderer, scene, world) {
    this.renderer = renderer;
    this.scene = scene;
    this.world = world;
    this.M = world.M;
    this.time = 9.5;
    this.timeScale = 1;
    this.day = 1;
    this.weather = 'sunny';
    this.lockWeather = null;
    this.w = { ...WEATHERS.sunny }; this.wb = { ...WEATHERS.sunny };
    this.squall = null; this.windTarget = 0.9;
    this.wind = { x: 0, z: 0, speed: 4.5, mean: 4.5, dir: 0.9, base: 0.9, t: 0 };
    this.wetness = 0;
    this.nextWeatherIn = 25;
    this.flash = 0;
    this.nextFlash = 10;
    this.events = [];

    this.uniforms = {
      sunDir: { value: new THREE.Vector3() }, moonDir: { value: new THREE.Vector3() }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunCol: { value: new THREE.Color() }, cloud: { value: 0.1 }, cloudDark: { value: 0 }, time: { value: 0 }, stars: { value: 0 }, flash: { value: 0 }, glow: { value: 0 },
      cloudTex: { value: makeCloudNoise() },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false }));
    this.dome.scale.setScalar(9000);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = 1000;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.shadowSize = 1024; this.shadowDist = 72;
    this.sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4238, 1.1);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xa0b0c0, 0.0006);

    // environment probe
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.dome.material);
    this.envDome.scale.setScalar(100);
    this.envScene.add(this.envDome);
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a3a38 }));
    gnd.position.y = -3;
    this.envGround = gnd;
    this.envScene.add(gnd);
    this.envRT = null;
    this.envAge = 999;

    // rain
    const N = 14000;
    const pos = new Float32Array(N * 6), tip = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      tip[i * 2] = 0; tip[i * 2 + 1] = 1;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
    this.rainU = { cam: { value: new THREE.Vector3() }, time: { value: 0 }, len: { value: 0.9 }, speed: { value: 17 }, wind: { value: new THREE.Vector2(2, 1) }, box: { value: 48 }, opacity: { value: 0.35 }, color: { value: new THREE.Color(0.7, 0.75, 0.8) } };
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({ vertexShader: RAIN_VS, fragmentShader: RAIN_FS, uniforms: this.rainU, transparent: true, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.renderOrder = 6;
    this.rain.visible = false;
    scene.add(this.rain);
    this.rainCount = N;

    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
    this.update(0, new THREE.Vector3());
  }

  setWeather(k, instant = false) {
    this.weather = k;
    if (instant) { Object.assign(this.wb, WEATHERS[k]); Object.assign(this.w, WEATHERS[k]); }
    this.windTarget = 0.9 + (Math.random() - 0.5) * 2.4;
    this.nextWeatherIn = 140 + Math.random() * 280;
    this.envAge = 999;
    this.events.push({ type: 'weather', weather: k });
  }

  get hour() { return this.time; }
  get isNight() { return this.night > 0.5; }

  sunDirection(h, out) {
    const t = (h - 6) / 12;
    const az = t * Math.PI;
    const el = Math.sin(t * Math.PI) * (62 * Math.PI / 180) - 0.05;
    out.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el) * 0.8 + 0.2).normalize();
    return out;
  }

  update(dt, focus, camera) {
    const gameMin = dt * this.timeScale;
    this.time += gameMin / 60;
    if (this.time >= 24) { this.time -= 24; this.day++; }
    // weather state machine (in game minutes)
    if (!this.lockWeather) {
      this.nextWeatherIn -= gameMin;
      if (this.nextWeatherIn <= 0) {
        const opts = NEXT[this.weather];
        let tot = opts.reduce((s, o) => s + o[1], 0), r = Math.random() * tot;
        let pick = opts[0][0];
        for (const [k, w] of opts) { r -= w; if (r <= 0) { pick = k; break; } }
        this.setWeather(pick);
      }
    } else if (this.weather !== this.lockWeather) this.setWeather(this.lockWeather);
    const target = WEATHERS[this.weather];
    const k = 1 - Math.exp(-dt * 0.03 * Math.max(0.5, this.timeScale));
    // a local squall pulls the weather around the camera toward a thunderstorm
    let sq = 0;
    if (this.squall) { const S = this.squall, c = camera ? camera.position : focus; if (c) sq = 1 - smoothstep(0.35 * S.r, S.r, Math.hypot(c.x - S.x, c.z - S.z)); }
    for (const key of ['cloud', 'dark', 'rain', 'fog', 'wind', 'sun', 'lightning']) {
      this.wb[key] += (target[key] - this.wb[key]) * k;
      this.w[key] = sq > 0.001 ? this.wb[key] + (Math.max(WEATHERS.thunderstorm[key], key === 'sun' ? 0 : this.wb[key]) - this.wb[key]) * sq * (this.squall.k || 1) : this.wb[key];
      if (key === 'sun' && sq > 0.001) this.w.sun = this.wb.sun + (Math.min(WEATHERS.thunderstorm.sun, this.wb.sun) - this.wb.sun) * sq;
    }
    // true wind (m/s, blowing toward x,z): strength from the weather, a slow veer and gusts
    const WD = this.wind;
    WD.t += dt;
    const wdiff = ((this.windTarget - WD.base + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    WD.base += wdiff * (1 - Math.exp(-dt / 90));
    WD.dir = WD.base + 0.12 * Math.sin(WD.t * 0.011);
    WD.mean = 1.6 + this.w.wind * 11.5;
    WD.speed = WD.mean * (1 + 0.2 * Math.sin(WD.t * 0.41) * Math.sin(WD.t * 0.23 + 1.3) + 0.1 * Math.sin(WD.t * 1.7));
    WD.x = Math.cos(WD.dir) * WD.speed; WD.z = Math.sin(WD.dir) * WD.speed;
    this.wetness = clamp(this.wetness + (this.w.rain > 0.05 ? dt * 0.02 * (0.5 + this.w.rain) : -dt * 0.004 * this.timeScale), 0, 1);

    const U = this.uniforms;
    const sd = this.sunDirection(this.time, U.sunDir.value);
    U.moonDir.value.set(-sd.x, Math.max(0.25, -sd.y), -sd.z * 0.6 + 0.3).normalize();
    const pal = paletteAt(sd.y);
    const grey = new THREE.Color(0.5, 0.52, 0.55).multiplyScalar(0.25 + pal.hemi * 0.55);
    const ov = this.w.cloud * 0.85 * (0.4 + this.w.dark * 0.6);
    U.zenith.value.copy(pal.zen).lerp(grey, ov);
    U.horizon.value.copy(pal.hor).lerp(grey.clone().multiplyScalar(1.15), ov);
    if (this.w.fog > 0.004) U.horizon.value.lerp(grey.clone().multiplyScalar(1.3), 0.6);
    U.sunCol.value.copy(pal.sun);
    U.cloud.value = this.w.cloud; U.cloudDark.value = this.w.dark;
    U.time.value += dt * (0.4 + this.w.wind);
    this.night = smoothstep(0.02, -0.12, sd.y);
    U.stars.value = smoothstep(-0.05, -0.2, sd.y);
    U.glow.value = this.night;

    // lightning
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.w.lightning > 0.5) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.flash = 1.2; this.nextFlash = 6 + Math.random() * 18;
        this.events.push({ type: 'thunder', delay: 0.6 + Math.random() * 2.5 });
        setTimeout(() => (this.flash = 0.9), 140);
      }
    }
    U.flash.value = this.flash * 0.35;

    // lights
    const sunUp = sd.y > -0.02;
    const L = this.sun;
    if (sunUp) {
      L.color.copy(pal.sun).multiplyScalar(1 / Math.max(pal.sun.r, pal.sun.g, pal.sun.b));
      L.intensity = pal.sunI * this.w.sun * smoothstep(-0.02, 0.06, sd.y);
    } else {
      L.color.set(0x9fb4e0);
      L.intensity = 0.5 * (1 - this.w.cloud * 0.7);
    }
    const ld = sunUp ? sd : U.moonDir.value;
    if (camera) this.fitShadow(camera, ld);
    this.hemi.intensity = pal.hemi * (1 - this.w.cloud * 0.25) * lerp(0.62, 3.8, this.night) + this.flash * 2.5;
    this.hemi.color.copy(U.zenith.value).lerp(new THREE.Color(1, 1, 1), 0.45).lerp(NIGHT_AMB, this.night * 0.9);
    this.hemi.groundColor.set(0x5a5248).lerp(NIGHT_GND, this.night);
    const fogCol = U.horizon.value.clone().lerp(U.zenith.value, 0.25);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.density = this.w.fog * (1 + this.night * 0.3);
    this.renderer.toneMappingExposure = lerp(1.0, 1.55, this.night) * (1 + (1 - this.w.sun) * 0.12);

    applyNight(this.M, smoothstep(0.12, -0.05, sd.y));
    if (this.world.uNight) this.world.uNight.value = smoothstep(0.12, -0.05, sd.y);
    applyWetness(this.M, this.wetness);
    this.world.veg?.tick(dt, this.w.wind);
    if (this.beaconMat) this.beaconMat.color.setScalar(0).setRGB((Math.sin(performance.now() / 350) > 0.2 ? 3 : 0.2) * this.night, 0.05 * this.night, 0);

    // rain
    const rainAmt = this.w.rain;
    this.rain.visible = rainAmt > 0.02;
    if (this.rain.visible && camera) {
      this.rainU.cam.value.copy(camera.position);
      this.rainU.time.value += dt;
      this.rainU.opacity.value = 0.12 + rainAmt * 0.3;
      this.rainU.wind.value.set(this.w.wind * 4, this.w.wind * 1.6);
      this.rain.geometry.setDrawRange(0, Math.floor(this.rainCount * 2 * clamp(rainAmt, 0.1, 1)));
      const lum = 0.25 + (1 - this.night) * 0.55;
      this.rainU.color.value.setRGB(lum, lum * 1.03, lum * 1.08);
    }

    // environment map
    this.envAge += gameMin;
    if (this.envAge > 12) this.refreshEnv();
    this.dome.position.copy(camera ? camera.position : focus || new THREE.Vector3());
  }

  setShadowQuality(size, dist, on = true) {
    const sh = this.sun.shadow;
    if (size !== this.shadowSize) { this.shadowSize = size; sh.mapSize.set(size, size); if (sh.map) { sh.map.dispose(); sh.map = null; } }
    this.shadowDist = dist;
    if (this.sun.castShadow !== on) { this.sun.castShadow = on; }
  }

  // shadow frustum fitted to the visible slice of the camera frustum (view-dependent), texel-snapped to avoid shimmering
  fitShadow(camera, ld) {
    const L = this.sun, sc = L.shadow.camera, D = this.shadowDist;
    const fov = THREE.MathUtils.degToRad(camera.fov) / 2, asp = camera.aspect;
    camera.getWorldDirection(_f);
    _r.set(-_f.z, 0, _f.x).normalize();
    _u.crossVectors(_r, _f).normalize();
    const nearD = 2, farD = D;
    // bounding sphere of the frustum slice
    const hN = Math.tan(fov) * nearD, hF = Math.tan(fov) * farD;
    const ctrD = (nearD + farD) / 2;
    _c.copy(camera.position).addScaledVector(_f, ctrD);
    let rad = 0;
    for (const [d, h] of [[nearD, hN], [farD, hF]]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      _k.copy(camera.position).addScaledVector(_f, d).addScaledVector(_r, sx * h * asp).addScaledVector(_u, sy * h);
      rad = Math.max(rad, _k.distanceTo(_c));
    }
    rad = Math.ceil(rad / 2) * 2;
    // light basis
    _z.copy(ld).normalize();
    _x.set(0, 1, 0);
    if (Math.abs(_z.y) > 0.98) _x.set(0, 0, 1);
    _x.cross(_z).normalize(); _y.crossVectors(_z, _x);
    const texel = (rad * 2) / this.shadowSize;
    const cx = Math.round(_c.dot(_x) / texel) * texel, cy = Math.round(_c.dot(_y) / texel) * texel, cz = _c.dot(_z);
    _k.set(0, 0, 0).addScaledVector(_x, cx).addScaledVector(_y, cy).addScaledVector(_z, cz);
    L.target.position.copy(_k);
    L.position.copy(_k).addScaledVector(_z, 700);
    L.target.updateMatrixWorld();
    sc.left = -rad; sc.right = rad; sc.top = rad; sc.bottom = -rad; sc.near = 1; sc.far = 700 + rad * 1.5;
    sc.updateProjectionMatrix();
  }

  refreshEnv() {
    this.envAge = 0;
    this.envGround.material.color.copy(this.uniforms.horizon.value).multiplyScalar(0.35);
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 500);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }

  timeString() {
    const h = Math.floor(this.time), m = Math.floor((this.time - h) * 60);
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
  }
}
