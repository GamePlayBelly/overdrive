def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/game/maritimeEvents.js', [
 ("import { buildHuman, poseFor, applyPose, blendPose, REST } from '../actors/human.js';", "import { buildHuman as buildHumanRaw, poseFor, applyPose, blendPose, REST, DEFAULT_LOOK } from '../actors/human.js';"),
 ("const NAMES =", "const buildHuman = (look) => buildHumanRaw({ ...DEFAULT_LOOK, facial: 'none', jacket: { type: 'none', color: '#222222' }, ...look });\nconst NAMES ="),
 ("pants: { type: 'shorts', color: '#1d4f91' } }", "pants: { type: 'jeans', color: '#1d4f91' } }"),
 ("pants: { type: 'shorts', color: '#2f2f32' } }", "pants: { type: 'jeans', color: '#2f2f32' } }"),
 ("pants: { type: 'shorts', color: '#e8e6e0' } }", "pants: { type: 'jeans', color: '#e8e6e0' } }"),
 ("(e.ents.people ||= []).push({ rig, x: v.x + i * 3, z: v.z - 2, pose: { ...REST }, ph: i, saved: false, name: NAMES[i] }); } e.type = 'overboard'; e.ents.boat = null; return; }", "(e.ents.people ||= []).push({ rig, x: v.x + i * 3, z: v.z - 2, pose: { ...REST }, ph: i, saved: false, name: NAMES[i] }); } e.type = 'overboard'; e.ents.wreck = v; e.ents.boat = null; return; }"),
 ("v.leak = 0; v.repair(); v.distress = false; this.reward(e, Math.round(900 + v.def.price * 0.004), 450, 'VESSEL SAVED'); this.say(NAMES[e.id % 5], 'Pumps are holding. Thank you!'); const pop = g.seaTraffic.pop; this.finish(e); return;", "v.leak = 0; v.repair(); v.distress = false; this.reward(e, Math.round(900 + v.def.price * 0.004), 450, 'VESSEL SAVED'); this.say(NAMES[e.id % 5], 'Pumps are holding. Thank you!'); E.boat = null; this.left.push(v); this.finish(e); return;"),
 ("    if (E.boat && !E.boat.driver && g.player.vehicle !== E.boat) g.removeVehicle(E.boat);", "    if (E.boat && !E.boat.driver && g.player.vehicle !== E.boat) g.removeVehicle(E.boat);\n    if (E.wreck && g.player.vehicle !== E.wreck) this.left.push(E.wreck);"),
 ("    this.rain = null;\n  }", "    this.rain = null; this.left = [];\n  }"),
 ("    this.markers.update(dt, g.camera.position);\n    this.stepSquall(dt);\n    const P = g.player, F = P.vehicle || P, sea = g.world.sea;", "    this.markers.update(dt, g.camera.position);\n    this.stepSquall(dt);\n    const P = g.player, F = P.vehicle || P, sea = g.world.sea;\n    for (let i = this.left.length - 1; i >= 0; i--) { const v = this.left[i]; if (!g.vehicles.includes(v)) this.left.splice(i, 1); else if (!v.driver && v !== P.vehicle && Math.hypot(v.x - F.x, v.z - F.z) > 700) { g.removeVehicle(v); this.left.splice(i, 1); } }"),
])
patch('src/data/sea.js', [("  jelly: { geo: 'jelly',", "  dolphin: { geo: 'fish', w: 0.2, h: 0.24, tail: 0.3, dorsal: 0.14, size: 2.2, n: [4, 4], speed: 5, depth: [2, 14], rel: 'top', flee: 0, col: [[0.42, 0.47, 0.52]], weight: 0 },\n  jelly: { geo: 'jelly',")])
patch('src/actors/marineLife.js', [
 ("grouper: 12, tuna: 40, ray: 8, jelly: 60 };", "grouper: 12, tuna: 40, ray: 8, jelly: 60, dolphin: 12 };"),
 ("      this.step(sc, dtc, swimmer, boats, night, storm);", "      if (!sc.manual) this.step(sc, dtc, swimmer, boats, night, storm);"),
])
patch('src/game/game.js', [
 ("import { MarineLife } from '../actors/marineLife.js';", "import { MarineLife } from '../actors/marineLife.js';\nimport { MaritimeEvents } from './maritimeEvents.js';"),
 ("    this.marine = new MarineLife(this);", "    this.marine = new MarineLife(this);\n    this.maritime = new MaritimeEvents(this);"),
 ("    this.marine.update(dt);\n", "    this.marine.update(dt);\n    this.maritime.update(dt);\n"),
])
patch('src/app/app.js', [
 ("    g.on('police:radio', (e) => this.hud.say('Dispatch', e.text, 3800));", "    g.on('police:radio', (e) => this.hud.say('Dispatch', e.text, 3800));\n    g.on('marine:radio', (e) => this.hud.say(e.who || 'Coast Guard', e.text, 4200));"),
 ("    this.blipFns.push(() => this.meet.blips());", "    this.blipFns.push(() => this.meet.blips());\n    this.blipFns.push(() => this.game.maritime.blips());"),
])
patch('src/game/radio.js', [
 ("    const w = { sunny: 'clear skies', cloudy: 'cloudy skies', overcast: 'an overcast sky', lightRain: 'light rain', heavyRain: 'heavy rain', fog: 'dense fog', storm: 'thunderstorms' }[sky.weather] || 'fair weather';", "    const w = { sunny: 'clear skies', cloudy: 'cloudy skies', overcast: 'an overcast sky', lightRain: 'light rain', heavyRain: 'heavy rain', fog: 'dense fog', storm: 'thunderstorms', calm: 'calm and clear skies', breezy: 'a fresh breeze', windy: 'strong winds', roughSea: 'rough seas', thunderstorm: 'thunderstorms', gale: 'gale force winds' }[sky.weather] || 'fair weather';\n    const sw = g.world.sea?.waves, sea = sw ? `Marine forecast: waves of ${sw.hs.toFixed(1)} metres, wind ${Math.round(sw.U)} metres per second.` : '';"),
 ("      'Marlow Bay reports a busy afternoon at the marina. Boaters are reminded to keep a slow wake inside the harbor.',", "      'Marlow Bay reports a busy afternoon at the marina. Boaters are reminded to keep a slow wake inside the harbor.',\n      sea || 'Calm seas reported along the coast.',"),
])
