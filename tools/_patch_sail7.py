def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/app/hud.js', [
    ("import { clamp, lerp, smoothstep } from '../core/math.js';", "import { clamp, lerp, smoothstep, wrapAngle } from '../core/math.js';"),
    ("    this.br = h('div', { class: 'hud-br' }, this.driftBox, this.nitro, this.speedo, this.flagRow);",
     "    this.windDial = makeWindDial();\n    this.br = h('div', { class: 'hud-br' }, this.driftBox, this.nitro, this.windDial.el, this.speedo, this.flagRow);"),
    ("    const sp = p.speed * (u === 'mph' ? 2.23694 : 3.6);\n    this.speedoSmooth += (sp - this.speedoSmooth) * Math.min(1, dt * 12);\n    this.rpmSmooth += (p.rpm - this.rpmSmooth) * Math.min(1, dt * 16);\n    this.kmh.textContent = Math.round(this.speedoSmooth);",
     "    const sailing = !!p.sail, sp = p.speed * (sailing ? 1.94384 : u === 'mph' ? 2.23694 : 3.6);\n    this.speedoSmooth += (sp - this.speedoSmooth) * Math.min(1, dt * 12);\n    this.rpmSmooth += ((sailing ? p.sailPow * p.redline : p.rpm) - this.rpmSmooth) * Math.min(1, dt * (sailing ? 4 : 16));\n    this.kmh.textContent = sailing ? this.speedoSmooth.toFixed(1) : Math.round(this.speedoSmooth);\n    this.windDial.update(sailing ? v : null, this.app.game);"),
    ("u === 'mph' ? 'MPH' : 'KM/H';\n    this.gear.textContent = !p.engineOn ? 'OFF' :",
     "sailing ? 'KNOTS' : u === 'mph' ? 'MPH' : 'KM/H';\n    this.gear.textContent = sailing && !p.engineOn ? 'SAIL' : !p.engineOn ? 'OFF' :"),
    ("    const step = rl > 9000 ? 2 : 1; for (let i = 0; i * 1000 * step <= rl * 1.08; i++)", "    const step = rl > 9000 ? 2 : 1; if (!p.sail) for (let i = 0; i * 1000 * step <= rl * 1.08; i++)"),
    ("export class Hud {", """// sailing dial: bow up, true wind as an arrow on the rim, the no-go sector, the boom, wind speed and heel
function makeWindDial() {
  const NS = 'http://www.w3.org/2000/svg', el = document.createElement('div');
  el.className = 'wind-box hide';
  const wedge = (a) => `M0,0 L${(50 * Math.sin(-a)).toFixed(2)},${(-50 * Math.cos(a)).toFixed(2)} A50,50 0 0 1 ${(50 * Math.sin(a)).toFixed(2)},${(-50 * Math.cos(a)).toFixed(2)} Z`;
  let ticks = '';
  for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6, r0 = i % 3 ? 47 : 43; ticks += `<line x1="${(r0 * Math.sin(a)).toFixed(1)}" y1="${(-r0 * Math.cos(a)).toFixed(1)}" x2="${(51 * Math.sin(a)).toFixed(1)}" y2="${(-51 * Math.cos(a)).toFixed(1)}"/>`; }
  el.innerHTML = `<svg viewBox="-60 -60 120 120"><circle class="w-ring" r="52"/><g class="w-ticks">${ticks}</g><path class="w-nogo" d="${wedge(0.66)}"/>
    <path class="w-hull" d="M0,-26 C10,-14 11,10 7,24 L-7,24 C-11,10 -10,-14 0,-26Z"/><line class="w-boom" x1="0" y1="-6" x2="0" y2="26"/>
    <g class="w-arrow"><path d="M0,-40 L7,-56 L-7,-56 Z"/></g></svg><div class="w-txt"><b>0</b> kn wind</div><div class="w-sub"></div>`;
  const q = (s) => el.querySelector(s), nogo = q('.w-nogo'), boom = q('.w-boom'), arrow = q('.w-arrow'), b = q('.w-txt b'), sub = q('.w-sub');
  let shown = false;
  return {
    el,
    update(v, game) {
      if (!!v !== shown) { shown = !!v; el.classList.toggle('hide', !shown); }
      if (!v) return;
      const p = v.phys, W = game.sky.wind;
      const deg = -wrapAngle(Math.atan2(-W.x, -W.z) - p.yaw) * 57.2958;
      nogo.setAttribute('transform', `rotate(${deg.toFixed(1)})`); arrow.setAttribute('transform', `rotate(${deg.toFixed(1)})`);
      boom.setAttribute('transform', `rotate(${(-v.sailA * 57.2958).toFixed(1)} 0 -6)`);
      boom.classList.toggle('luff', v.sailL > 0.5);
      b.textContent = Math.round(W.speed * 1.94384);
      sub.textContent = `AWA ${Math.round(Math.abs(p.awa) * 57.2958)}\\u00b0   HEEL ${Math.round(Math.abs(p.roll) * 57.2958)}\\u00b0${p.ease > 0.4 ? '   EASED' : ''}`;
    },
  };
}

export class Hud {"""),
])
patch('css/ui.css', [
    (".nitro-bar { width: 200px; height: 6px; }", """.wind-box { text-align: right; color: #fff; font-family: var(--cond); text-shadow: 0 2px 8px #000; } .wind-box.hide { display: none; }
.wind-box svg { width: 124px; height: 124px; display: block; margin-left: auto; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.55)); }
.wind-box .w-ring { fill: rgba(8, 12, 18, 0.38); stroke: rgba(255, 255, 255, 0.35); stroke-width: 1.2; } .wind-box .w-ticks line { stroke: rgba(255, 255, 255, 0.5); stroke-width: 1.2; }
.wind-box .w-nogo { fill: rgba(229, 56, 59, 0.26); } .wind-box .w-hull { fill: rgba(255, 255, 255, 0.82); } .wind-box .w-boom { stroke: #7cc4ff; stroke-width: 3; stroke-linecap: round; } .wind-box .w-boom.luff { stroke: #ffb347; }
.wind-box .w-arrow path { fill: #7cc4ff; } .wind-box .w-txt { font-size: 14px; letter-spacing: 0.06em; opacity: 0.92; } .wind-box .w-txt b { font-size: 28px; font-weight: 800; margin-right: 4px; } .wind-box .w-sub { font-size: 12px; opacity: 0.7; letter-spacing: 0.08em; }
.nitro-bar { width: 200px; height: 6px; }"""),
])
patch('src/game/game.js', [
    ("    if (I.hit('engine')) { p.engineOn = !p.engineOn; if (p.engineOn) this.audio.engineStart(v); }",
     "    if (I.hit('engine')) { p.engineOn = !p.engineOn; if (p.sail) p.motorT = p.engineOn ? 25 : 0; if (p.engineOn) this.audio.engineStart(v); }"),
])
patch('src/game/camera.js', [
    ("        const dist = (L * (boat ? 0.95 : 1.05) + 3.2 + Math.min(speed, 60) * 0.035) * far;\n        const hgt = (boat ? H * 0.55 + 1.5 : H * 0.95 + 0.9) * far + this.pitchOff * dist * 0.5;",
     "        const mast = boat ? v.def.perf?.sail?.mast || 0 : 0;\n        const dist = (L * (boat ? 0.95 : 1.05) + 3.2 + Math.min(speed, 60) * 0.035 + mast * 0.3) * far;\n        const hgt = (boat ? H * 0.55 + 1.5 + mast * 0.3 : H * 0.95 + 0.9) * far + this.pitchOff * dist * 0.5;"),
    ("        this.look.set(bodyC.x + s * ahead, refY + H * (boat ? 0.42 : 0.62), bodyC.z + co * ahead);",
     "        this.look.set(bodyC.x + s * ahead, refY + H * (boat ? 0.42 : 0.62) + mast * 0.18, bodyC.z + co * ahead);"),
])
print('ok')
