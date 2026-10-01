import * as THREE from 'three';
import { Game } from './game/game.js';
import { App } from './app/app.js';

// soft shadows: five probe taps first, the full 16-tap kernel only where the probes disagree (shadow edges); most pixels are uniformly lit or shaded
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace(/#elif defined\( SHADOWMAP_TYPE_PCF_SOFT \)[\s\S]*?#elif defined\( SHADOWMAP_TYPE_VSM \)/, `#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv0 = shadowCoord.xy;
			float s0 = texture2DCompare( shadowMap, uv0, shadowCoord.z );
			float s1 = texture2DCompare( shadowMap, uv0 + vec2( -2.0 * dx, -2.0 * dy ), shadowCoord.z );
			float s2 = texture2DCompare( shadowMap, uv0 + vec2( 2.0 * dx, -2.0 * dy ), shadowCoord.z );
			float s3 = texture2DCompare( shadowMap, uv0 + vec2( -2.0 * dx, 2.0 * dy ), shadowCoord.z );
			float s4 = texture2DCompare( shadowMap, uv0 + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z );
			if ( s0 == s1 && s0 == s2 && s0 == s3 && s0 == s4 ) {
				shadow = s0;
			} else {
				vec2 f = fract( uv0 * shadowMapSize + 0.5 );
				vec2 uv = uv0 - f * texelSize;
				shadow = (
					texture2DCompare( shadowMap, uv, shadowCoord.z ) +
					texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
					texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
					texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
					mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ), texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ), f.x ) +
					mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ), texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ), f.x ) +
					mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ), texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ), f.y ) +
					mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ), texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ), f.y ) +
					mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ), texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ), f.x ),
						 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ), texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ), f.x ), f.y )
				) * ( 1.0 / 9.0 );
			}
		#elif defined( SHADOWMAP_TYPE_VSM )`);

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const game = new Game(renderer, canvas);
window.__game = game; window.__THREE = THREE;
game.resize(innerWidth, innerHeight);
const app = new App(game, canvas);
window.__app = app;

let last = performance.now(), running = false;
function loop(now) {
  requestAnimationFrame(loop);
  if (window.__pauseLoop) { last = now; return; }
  const raw = (now - last) / 1000;
  last = now;
  if (!running) return;
  const dt = Math.min(0.05, raw);
  const t0 = performance.now();
  app.tick(dt, raw);
  const t1 = performance.now();
  window.__ft = window.__ft || { u: 0, r: 0 }; window.__ft.u += ((t1 - t0) - window.__ft.u) * 0.05;
}
requestAnimationFrame(loop);

app.boot().then(() => { running = true; }).catch((e) => {
  console.error(e);
  const m = document.querySelector('.boot-status .msg'); if (m) m.textContent = 'Error: ' + e.message;
});
// devStart returns before boot resolves in some paths; keep the loop running for tests
setTimeout(() => { if (new URLSearchParams(location.search).has('dev')) running = true; }, 0);

window.__shot = async (name = 'shot') => {
  game.render();
  const url = canvas.toDataURL('image/jpeg', 0.85);
  await fetch('/api/debug/shot?name=' + name, { method: 'POST', body: url });
  return name;
};
window.__sim = (sec, inp = {}) => {
  const v = game.player.vehicle;
  const n = Math.round(sec * 60);
  for (let i = 0; i < n; i++) {
    if (v) Object.assign(v.input, { throttle: 0, brake: 0, steer: 0, hand: false, boost: false }, typeof inp === 'function' ? inp(i / 60) : inp);
    const ctl = game.controlVehicle;
    game.controlVehicle = () => {};
    game.update(1 / 60);
    game.controlVehicle = ctl;
  }
  return v ? { kmh: +v.kmh.toFixed(1), gear: v.phys.gear, x: +v.x.toFixed(1), z: +v.z.toFixed(1), yaw: +v.yaw.toFixed(2), dmg: +v.damage.total.toFixed(2) } : null;
};
