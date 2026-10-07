def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/app/hud.js', [("import { WEATHERS } from '../world/sky.js';", "import { WEATHERS } from '../world/sky.js';\nimport { beaufort } from '../data/sea.js';")])
open('css/ui.css', 'a', encoding='utf8').write("""
.hud-sea { font-family: var(--cond); font-size: 13px; letter-spacing: 0.14em; color: #bfe3ff; text-shadow: 0 2px 8px #000; text-align: right; text-transform: uppercase; }
.o2-box { position: absolute; left: 50%; bottom: 92px; transform: translateX(-50%); width: 220px; text-align: center; font-family: var(--cond); text-shadow: 0 2px 8px #000; display: flex; flex-direction: column; gap: 5px; align-items: stretch; }
.o2-label { letter-spacing: 0.3em; font-size: 12px; color: #bfe3ff; text-transform: uppercase; } .o2-depth { font-size: 18px; color: #e8f4ff; } .o2-bar { height: 7px; } .o2-bar > i { transition: width 0.25s linear; } .o2-bar.low > i { background: linear-gradient(90deg, #b3151b, #ff5a5f); }
""")
patch('src/game/camera.js', [
 ("      const head = new THREE.Vector3(pl.x, pl.y + 1.55, pl.z);", "      const swimming = pl.state === 'swim', diving = swimming && pl.dive > 0.35, hOff = swimming ? 1.1 : 1.55;\n      const head = new THREE.Vector3(pl.x, pl.y + hOff, pl.z);"),
 ("pl.y + 1.6 + Math.sin(this.footPitch) * d, pl.z - Math.cos(this.footYaw)", "pl.y + hOff + 0.05 + Math.sin(this.footPitch) * d, pl.z - Math.cos(this.footYaw)"),
 ("      if (g.world.sea) gy = Math.max(gy, g.world.sea.waveAt(want.x, want.z) + (pl.state === 'swim' ? 0.45 : 0.3));", "      if (diving) gy = g.world.terrain.height(want.x, want.z) + 0.3;\n      else if (g.world.sea) gy = Math.max(gy, g.world.sea.waveAt(want.x, want.z) + (swimming ? 0.45 : 0.3));"),
])
patch('src/actors/player.js', [
 ("    if (this.wade > 0.05) { this.vx *= 1 - this.wade * 0.22 * dt * 6; this.vz *= 1 - this.wade * 0.22 * dt * 6; }", """    if (this.wade > 0.05) {
      const dr = Math.min(0.9, this.wade * 0.5 * dt * 6); this.vx *= 1 - dr; this.vz *= 1 - dr;
      this.wadeT = (this.wadeT || 0) - dt;
      if (this.speed > 1 && this.wadeT <= 0) { this.wadeT = 0.28 - Math.min(0.12, this.speed * 0.02); g.emit('player:wade', { x: this.x, y: gr.surface ?? this.y, z: this.z, speed: this.speed, depth: this.wade }); }
    }"""),
])
patch('src/render/vehicleFx.js', [
 ("    game.on('player:splash', (e) => this.splash(e.x, e.y, e.z, e.speed));", "    game.on('player:splash', (e) => this.splash(e.x, e.y, e.z, e.speed));\n    game.on('player:wade', (e) => this.wade(e));"),
 ("  swimmer(P, dt) {", """  // knee-deep steps: small rings and droplets at the feet
  wade(e) {
    const sea = this.g.world.sea, W = this.g.wake, n = 2 + Math.round(e.speed * 1.2);
    if (W) { W.stamp(e.x, e.z, 0.7, 0.18); W.wave(e.x, e.z, 0.6, 0.01); }
    for (let i = 0; i < n; i++) this.pt.emit({ x: e.x + rnd(0.35), y: (sea ? sea.waveAt(e.x, e.z) : e.y) + 0.05, z: e.z + rnd(0.35), vx: rnd(0.9), vy: 0.8 + Math.random() * 1.1 * Math.min(1.5, e.speed / 3), vz: rnd(0.9), life: 0.45 + Math.random() * 0.35, s0: 0.06, s1: 0.2, c0: [1, 1, 1, 0.45], c1: [0.9, 0.96, 1, 0], drag: 1, grav: 8, kind: 0 });
  }

  swimmer(P, dt) {"""),
])
