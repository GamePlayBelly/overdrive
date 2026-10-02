def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/app/hud.js', [
 ("    this.tr = h('div', { class: 'hud-tr' }, this.timeEl, this.stars, this.wantedInfo);",
  "    this.seaEl = h('div', { class: 'hud-sea hide' });\n    this.tr = h('div', { class: 'hud-tr' }, this.timeEl, this.seaEl, this.stars, this.wantedInfo);\n    this.o2Fill = bar(1, 'blue', 'o2-bar'); this.o2Depth = h('div', { class: 'o2-depth' }, '0.0 m');\n    this.o2Box = h('div', { class: 'o2-box hide' }, h('div', { class: 'o2-label' }, 'Breath'), this.o2Fill, this.o2Depth);"),
 ("this.prompt, this.subtitle, this.hint, this.fps, this.bubbles);", "this.prompt, this.subtitle, this.hint, this.fps, this.bubbles, this.o2Box);"),
 ("      this.updateObjective();\n", "      this.updateObjective();\n      this.updateSea(g, P);\n"),
 ("  updateObjective() {", """  // sea state while afloat or by the shore; breath and depth while swimming
  updateSea(g, P) {
    const sea = g.world.sea, W = sea?.waves, on = W && ((P.vehicle && P.vehicle.isBoat) || P.state === 'swim' || sea.distanceToSea(P.x, P.z) < 120);
    this.seaEl.classList.toggle('hide', !on);
    if (on) { const t = `Bft ${beaufort(W.U)} \u00b7 ${W.hs.toFixed(1)} m`; if (this.seaEl.textContent !== t) this.seaEl.textContent = t; }
    const sw = P.state === 'swim' && (P.o2 < 0.995 || P.dive > 0.1);
    this.o2Box.classList.toggle('hide', !sw);
    if (sw) { this.o2Fill.firstChild.style.width = Math.round(P.o2 * 100) + '%'; this.o2Fill.classList.toggle('low', P.o2 < 0.25); this.o2Depth.textContent = P.dive.toFixed(1) + ' m'; }
  }

  updateObjective() {"""),
])
s = open('src/app/hud.js', encoding='utf8').read()
print([l for l in s.split('\n') if l.startswith('import')][:8])
