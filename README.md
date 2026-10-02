# OVERDRIVE — Riverton County

Open-world 3D driving and action game for the browser. Three.js, vanilla ES modules, no build step.

```
npm install
npm start            # http://localhost:5466  (node server.mjs [port])
```

The same process serves the game and the multiplayer WebSocket (`server/game-server.mjs`, no dependencies).
Progress is saved in the browser; online play keeps the profile on the server.

## Controls (remappable in Settings)

| | |
|---|---|
| Drive | W A S D, Space handbrake and drift, Shift nitro, H horn, L lights, C camera, B look back, R reset |
| Look | Mouse (click the game to capture it, Esc releases it) or the arrow keys |
| Boats | same keys, F to board and leave, Space drifts the hull |
| Sailboats | A D rudder, Space eases the sheets (spill wind, slow down), W starts the auxiliary engine; sails trim themselves, the dial shows the wind, the no-go zone and the boom |
| Aircraft | F to get in, Shift/Ctrl throttle, W/S pitch, A/D bank, Q/E rudder, Space brakes, F to get out once landed |
| On foot | WASD, Shift sprint, Space jump, left click punch, F enter or exit a vehicle, E enter a building / talk / pick up |
| Interface | Esc menu, M world map, P phone, T radio, F2 photo mode, F3 replay |

## What is in it

- City, suburbs, industrial harbor, forest hills, farms, the bay, open sea and Riverton Airfield, plus three outer regions reached by designed roads with graded profiles and hairpins: Alder Peak (snow village, Route 12, 230 m up), Dry Springs (desert town, Route 40, 170 m up, mesa, windmills) and Marin Island (village, coast road, lighthouse, boats on moorings) joined to the mainland by the Bayline Bridge, a cable-stayed span; traffic, pedestrians, police with six wanted levels (units arrive within seconds, stealing a car is one star).
- Cars, bikes, trucks, five motor boats and three sailing boats (skiff, 31 ft sloop, 44 ft cruiser) with wave and wind physics (apparent wind, lift and drag from the sails, heel, no-go zone, leeway),  and a prop plane, a helicopter and a jet with a flight model; swimming and boarding.
- Walk into buildings: shops, cafes, offices, workshops, bars, houses, warehouses, gyms and the precinct, each with a person who offers work, services or rumors and things to pick up with E.
- Fists with blood, knock-downs and witnesses; carjacking throws the driver out.
- Story missions, jobs, the Underground League, a race creator, evening car meet, collectibles, rare cars, dynamic events, auction house, shop (any car can be bought early at 1.6x), garage tuning and painting, season pass, crews.
- Ten ready-made characters (rookie, VR hacker, operator, neko, android, DJ, elf, hooded shadow, sunny, neon cyber) plus species and a full body editor.
- Replay of the last 45 seconds with an automatic camera director.
- Generative radio, optional glTF models (`assets/README.md`).
- Vehicle audio is synthesized from the physics (`src/audio`): an engine bank driven by real rpm, throttle, load, gear and shifts, with engine types (I3/I4/I6/V6/V8/V10/V12/flat-6, diesel, sport-bike I4, V-twin, triple, single), exhaust, intake, turbo spool and blow-off, gearbox/chain whine, overrun crackle, starter and shutdown, rev limiter; tyre, road, wet-road spray, wind and brake layers by surface and weather; camera-dependent mix (exterior, hood, bumper, cabin, exposed rider); distance LOD for traffic and other players; and an acoustic environment (open road, city canyon, tunnel, garage, industrial, mountain, forest, indoors) with a cross-fading procedural reverb.
- Adaptive quality governor aiming at 60 fps (Settings, Graphics).
- Photo-scanned CC0 PBR textures (Poly Haven, `assets/tex`, see `assets/tex/index.json`) with normal and roughness on roads, pavements, walls, roofs and terrain; screen-space ambient occlusion, real lamp lights at night, procedural cars built from lofted shells. `?nophoto=1` falls back to the procedural textures.

## Layout

```
src/core      math, input, audio helpers, asset loader
src/world     terrain, roads, buildings, sea, sky, grass, vegetation, airfield
src/vehicles  car, boat and aircraft models and physics, AI drivers
src/actors    player, characters, pedestrians, traffic, police, sea traffic
src/game      game loop, camera, missions, jobs, economy rules, replay, car meet, auction, combat
src/render    post pipeline, governor, particles, wake map
src/app       app shell, menu pages, HUD, phone, building interiors
assets/tex    CC0 texture pack (albedo with baked AO, normal xy + roughness) built by tools/tex_fetch.py and tex_pack.py
tools         Playwright + Edge test and measurement scripts (node tools/<name>.mjs)
```

`src/game/economy.js` holds every rule that changes a profile; the client and the server both run it.

## Vehicle sound configuration

The engine sound is derived from the existing catalog data (`sound.cyl`, `sound.pitch`, `sound.rough`, `perf.redline`, `perf.gears`, power to weight, body style), so every vehicle already has its own voice. To tune one, add optional keys to its `sound` block in `src/data/vehicles.js`:

```js
sound: { cyl: 6, pitch: 1.1, rough: 0.2,
         engineType: 'flat6',          // i3 i4 i6 v6 v8 v10 v12 flat6 diesel bike_i4 bike_triple bike_vtwin bike_single
         idleRPM: 900, redlineRPM: 7800, maxRPM: 8200,
         engineVolume: 1, exhaustVolume: 1.2, intakeVolume: 1, turboVolume: 1, transmissionVolume: 1,
         tireVolume: 1, windVolume: 1, enginePitch: 1, gearShiftIntensity: 1, turbo: true }
```

Turbo whistle and blow-off only play on cars with a turbo kit fitted in the garage (or `turbo: true` here). Surface sounds live in `SURFACE_SOUND` and engine types in `ENGINE_TYPES` (`src/audio/vehicleAudio.js`), room presets in `src/audio/environment.js`.

## Multiplayer hosting

`node server.mjs` serves the game and the WebSocket (`/ws`) from the same port, so a host that supports WebSockets (Render, Railway, Fly, a VPS) works with no setup: the game connects automatically and reconnects if the link drops. A static host (GitHub Pages, Netlify) cannot run the server; deploy `server.mjs` somewhere and open the game with `?server=wss://your-host/ws` (the address is remembered), or set `window.OVERDRIVE_SERVER`. `/healthz` reports the player count. Set `DATA_DIR` to a persistent disk to keep profiles; friend lists are also re-sent by the clients after a restart.

## Tests and measurements

Scripts in `tools/` drive a real Edge instance with the GPU enabled. Examples: `mission.mjs` (all story missions with cheats),
`boatflow.mjs`, `fly.mjs`, `interior.mjs`, `combat.mjs`, `replay.mjs`, `meet.mjs`, `race.mjs`, `auction.mjs`, `tour.mjs` (every menu page),
`avatarfaces.mjs`, `gpu*.mjs` (GPU timer queries), `gpuspots.mjs` (GPU ms at fixed places, `QUERY='?dev=1&nophoto=1'` for A/B), `aileg3.mjs` (an AI rival drives a whole league race), `racenew.mjs`, `routedrive.mjs`, `sailpolar.mjs` (sailing speed polar), `sailplay.mjs`, `sailshot.mjs`, `sailbuy.mjs`, `poicheck.mjs` (collectibles on dry land near roads), `jumpclimb.mjs` (jump, vault, climb), `audiodrive.mjs` (vehicle audio), `mpnet.mjs` (multiplayer protocol, no browser needed). Set `CHROME_PATH` to run the browser scripts on Linux.
