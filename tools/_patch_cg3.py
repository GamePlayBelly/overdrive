def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/actors/coastGuard.js', [
 ("      if (lvl === 0 || !wt) { if (u.state !== 'return') this.release(u); this.goHome(u, dt); continue; }", "      if (lvl === 0 || !wt) { if (u.state !== 'return') this.release(u); this.goHome(u, dt); ai.update(dt); continue; }"),
 ("        this.searchStep(u, T, ls, unseenT, dt);\n      }\n    }\n  }", "        this.searchStep(u, T, ls, unseenT, dt);\n      }\n      ai.update(dt);\n    }\n  }"),
])
patch('src/data/sea.js', [("    cruiser: { w: 1.4, cruise: 1, storm: 4.2, role: 'sail' },\n", "    cruiser: { w: 1.4, cruise: 1, storm: 4.2, role: 'sail' },\n    patrol: { w: 0, cruise: 0.5, storm: 3.4, role: 'run' },\n")])
patch('src/actors/boatTraffic.js', [
 ("const KIND_LIST = Object.keys(TRAFFIC.kinds).map((k) => ({ k, w: TRAFFIC.kinds[k].w }));", "const KIND_LIST = Object.keys(TRAFFIC.kinds).filter((k) => TRAFFIC.kinds[k].w > 0).map((k) => ({ k, w: TRAFFIC.kinds[k].w }));"),
 ("      if (p) this.spawn(this.rng.weighted(KIND_LIST).k, p.x, p.z, rnd() * 6.283, true);\n    }", "      if (p) this.spawn(this.rng.weighted(KIND_LIST).k, p.x, p.z, rnd() * 6.283, true);\n    }\n    for (let i = 0; i < 2; i++) { const pt = this.ports[i % this.ports.length], p = this.nav.random(rnd, pt.comp, pt.x, pt.z, 200, 900); if (p) this.spawn('patrol', p.x, p.z, rnd() * 6.283, true); }"),
 ("    v.moor = null; v.npcBoat = true; v.phys.engineOn = true;", "    v.moor = null; v.npcBoat = true; v.phys.engineOn = true; if (a.kind === 'patrol') v.lights.bar = true;"),
])
patch('src/game/crimes.js', [
 ("    game.on('player:carjack', (e) => P().crime('carjack', e.car.x, e.car.z, 2));", """    game.on('player:carjack', (e) => P().crime('carjack', e.car.x, e.car.z, 2));
    // boats: taking one that is not yours is a crime when somebody is around to see it
    const watched = (x, z) => game.peds.list.some((p) => Math.hypot(p.x - x, p.z - z) < 60) || P().cg.witness(x, z) || P().witnessedBy(x, z);
    game.on('player:entered', (e) => { const v = e.v; if (v?.isBoat && !v.owned && !v.cg && !v.stolen) { v.stolen = true; if (watched(v.x, v.z)) P().crime('boatTheft', v.x, v.z, 2); } });
    game.on('boat:hijack', (e) => { e.v.stolen = true; P().crime('boatHijack', e.v.x, e.v.z, 2); });
    this.rammed = new Map();"""),
 ("      else if (e.kind === 'prop' && e.impact > 6) P().crime('prop', e.x, e.z, 1);", """      else if (e.other?.isBoat && e.other !== e.v && e.impact > 4 && e.v.phys.speed > 5) { if (e.other.cg) P().crime('ramCoastGuard', e.x, e.z, 3); else { P().crime('boatRam', e.x, e.z, 1.5); this.rammed.set(e.other, game.time); } }
      else if (e.kind === 'prop' && e.impact > 6) P().crime('prop', e.x, e.z, 1);"""),
 ("    if (!v || P.state !== 'driving' || v.isBoat || v.isAir || !g.police.enabled) { this.speedT = 0; return; }", """    for (const [b, t] of this.rammed) { if (b.sunk) { g.police.crime('boatSink', b.x, b.z, 2.5); this.rammed.delete(b); } else if (g.time - t > 20 || !g.vehicles.includes(b)) this.rammed.delete(b); }
    if (v && v.isBoat && P.state === 'driving' && g.police.enabled) {
      // no-wake zone around the docks
      const pop = g.seaTraffic?.pop, H = WANTED.harbor;
      let near = false; if (pop) for (const q of pop.ports) if (Math.hypot(q.x - v.x, q.z - v.z) < H.radius) { near = true; break; }
      this.harborT = near && v.speed > H.limit ? (this.harborT || 0) + dt : Math.max(0, (this.harborT || 0) - dt);
      if (this.harborT > 3 && this.cool <= 0) { this.cool = 12; this.harborT = 0; g.police.crime('harborSpeed', v.x, v.z, 0.5); }
      this.speedT = 0; return;
    }
    if (!v || P.state !== 'driving' || v.isBoat || v.isAir || !g.police.enabled) { this.speedT = 0; return; }"""),
 ("import { SURF } from '../world/terrain.js';", "import { SURF } from '../world/terrain.js';\nimport { WANTED } from '../data/wanted.js';"),
])
