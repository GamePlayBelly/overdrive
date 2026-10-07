s = open('src/actors/player.js', encoding='utf8').read()
a = s.index("  updateSwim(dt, input, camYaw) {")
b = s.index("  // --------------------------------------------------------------- frame update")
new = r'''  // Swimming in three dimensions: strokes build speed slowly and the water holds it, the surface lifts and tilts the body, lungs
  // carry roughly forty seconds, currents and the orbital motion of the waves push, and the seabed stops a dive.
  updateSwim(dt, input, camYaw) {
    const g = this.game, W = g.world, sea = W.sea, wv = sea?.waves;
    const f = input.trigger('throttle') - input.trigger('brake'), sd = input.axis('left', 'right');
    const cy = Math.cos(camYaw), sy = Math.sin(camYaw);
    let mx = sy * f - cy * sd, mz = cy * f + sy * sd;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    const want = Math.min(1, l);
    const fast = input.held('sprint') && this.stamina > 0.05;
    const up = input.held('jump'), down = input.held('dive');
    const surf = sea ? sea.waveAt(this.x, this.z, null) : WATER_LEVEL, surfY = surf - 1.08;
    const sub = this.dive > 0.3;
    // breath: the head under the surface spends it, air refills it
    const headUnder = this.y + 1.45 < surf - 0.06;
    this.o2 = headUnder ? Math.max(0, this.o2 - dt / (fast ? 26 : 45)) : Math.min(1, this.o2 + dt * 0.4);
    if (this.o2 <= 0.001 && !this.choke) { this.choke = true; g.emit('hud:toast', { text: 'Out of breath' }); }
    else if (this.o2 > 0.45) this.choke = false;
    // horizontal: progressive stroke thrust, long glide, current and wave orbit
    const maxV = want > 0 ? (fast ? (sub ? 2.5 : 3.4) : (sub ? 1.5 : 2.0)) : 0;
    const stroke = want > 0 ? 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(this.swimPh * 6.2)) : 1;
    const k = want > 0 ? 2.0 : 1.3, nrm = Math.max(l, 1e-6);
    this.vx = damp(this.vx, want > 0 ? (mx / nrm) * maxV * want * stroke : 0, k, dt);
    this.vz = damp(this.vz, want > 0 ? (mz / nrm) * maxV * want * stroke : 0, k, dt);
    this.stamina = clamp(this.stamina + (fast && want > 0 ? -dt * 0.1 : dt * 0.08), 0, 1);
    this.speed = Math.hypot(this.vx, this.vz);
    let cvx = 0, cvz = 0;
    if (wv) {
      const sh = clamp(1 - this.dive * 0.35, 0.3, 1);
      cvx = Math.cos(wv.dirW) * 0.02 * wv.U * sh; cvz = Math.sin(wv.dirW) * 0.02 * wv.U * sh;
      wv.velocity(this.x, this.z, sea.t - wv.tRef, _v);
      const dec = Math.exp(-this.dive * (6.2832 / Math.max(8, wv.lam)));
      cvx += _v.x * 0.5 * dec; cvz += _v.z * 0.5 * dec;
    }
    this.cur = { x: cvx, z: cvz };
    if (this.speed > 0.25) this.yaw = dampAngle(this.yaw, Math.atan2(this.vx, this.vz), 7, dt);
    let nx = this.x + (this.vx + cvx) * dt, nz = this.z + (this.vz + cvz) * dt;
    const r = 0.32;
    g.world.colliders.query(nx, nz, r + 1, this.y + 0.3, this.y + 1.7, (c) => {
      if (!c.solid && c.kind !== 'prop') return;
      if (c.type === 'circle') { const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-5) { nx = c.x + (dx / d) * m; nz = c.z + (dz / d) * m; } }
      else { const hit = obbVsCircle(c, { x: nx, z: nz, r }); if (hit) { nx -= hit.nx * hit.depth; nz -= hit.nz * hit.depth; } }
    });
    for (const v of g.vehicles) { if (Math.abs(v.y - this.y) > 3.5) continue; const hit = obbVsCircle(v.obb(), { x: nx, z: nz, r }); if (hit) { nx -= hit.nx * hit.depth; nz -= hit.nz * hit.depth; } }
    const gr = this.groundAt(nx, nz, this.y + 1.2);
    if (!gr.deep) {
      // wading out: stand on the bed again
      this.x = nx; this.z = nz; this.dive = 0; this.vyS = 0; this.pitchS = 0;
      this.y = Math.max(gr.y, this.y - 4 * dt);
      if (this.y <= gr.y + 0.05 || gr.deck) { this.y = gr.y; this.state = 'foot'; this.vy = 0; }
      else this.y = lerp(this.y, gr.y, Math.min(1, dt * 6));
      this.rig.root.rotation.set(0, this.yaw, 0); this.rig.root.position.set(this.x, this.y, this.z);
      return;
    }
    // dock / platform edge within reach: climb out
    if (want > 0.3 && this.dive < 0.4) {
      const ax = nx + Math.sin(this.yaw) * 0.9, az = nz + Math.cos(this.yaw) * 0.9, upg = W.ground(ax, az, this.y + 2.2);
      if (upg.deck && upg.y - gr.surface < 1.9 && !blocked(g, ax, az, upg.y)) {
        this.seq = { kind: 'climb', t: 0, v: null, from: { x: this.x, y: this.y, z: this.z }, to: { x: ax, y: upg.y, z: az, swim: false }, dur: 0.8 };
        this.state = 'entering'; this.dive = 0;
        return;
      }
    }
    this.x = nx; this.z = nz;
    // vertical: dive, rise, buoyant drift, or the surface spring
    let dv = null;
    if (this.choke) dv = 2.0;
    else if (down && this.o2 > 0.2) dv = fast ? -2.1 : -1.4;
    else if (up) dv = 1.8;
    else if (this.dive > 0.3) dv = 0.45 + 0.25 * (1 - this.o2);
    if (dv !== null) this.vyS += (dv - this.vyS) * Math.min(1, dt * 3.2);
    else this.vyS += ((surfY - this.y) * 30 - this.vyS * 7) * dt;
    this.y += this.vyS * dt;
    const bedY = gr.y + 0.15;
    if (this.y < bedY) { this.y = bedY; this.vyS = Math.max(0, this.vyS); }
    if (dv !== null && this.y > surfY) { this.y = surfY; this.vyS = Math.min(this.vyS, 0); }
    const dive0 = this.dive;
    this.dive = Math.max(0, surfY - this.y);
    if (dive0 < 0.25 && this.dive >= 0.25) g.emit('player:submerge', { x: this.x, y: this.y, z: this.z });
    if (dive0 >= 0.25 && this.dive < 0.25) g.emit('player:surface', { x: this.x, y: surf, z: this.z, speed: Math.max(0, this.vyS) });
    // body: prone while swimming, vertical while treading, tilted by the climb or dive, lifted and tilted by the swell at the surface
    this.swimPh += (this.speed * 2.2 + (this.dive > 0.3 ? 0.5 : 0)) * dt * (fast ? 1.25 : 1);
    const subm = this.dive > 0.3, mov = clamp(this.speed / 0.8, 0, 1);
    const theta = subm ? clamp(1.35 - this.vyS * 0.32, 0.55, 2.1) * (0.35 + 0.65 * Math.max(mov, Math.abs(this.vyS) > 0.5 ? 1 : 0)) : 1.3 * mov + 0.12 * (1 - mov);
    this.pitchS += (theta - this.pitchS) * Math.min(1, dt * 5);
    const anim = subm ? (this.speed > 0.3 || Math.abs(this.vyS) > 0.5 ? 'dive' : 'hover') : this.speed > 0.4 ? 'swim' : 'tread';
    blendPose(this.pose, poseFor(anim, this.animT, this.swimPh * 3.1, 1), 1 - Math.exp(-dt * 10), this.pose);
    applyPose(this.rig, this.pose);
    let tilt = 0, roll = 0;
    if (!subm && sea) {
      sea.waveAt(this.x, this.z, _w);
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      tilt = Math.atan((_w.x * s + _w.z * c) / _w.y) * 0.6; roll = Math.atan(-(_w.x * c - _w.z * s) / _w.y) * 0.6;
    }
    const th = this.pitchS + tilt, hy = this.y + 0.95, ps = Math.sin(this.yaw), pc = Math.cos(this.yaw), off = 0.95;
    this.rig.root.rotation.set(th, this.yaw, roll, 'YXZ');
    this.rig.root.position.set(this.x - ps * off * Math.sin(th), hy - off * Math.cos(th), this.z - pc * off * Math.sin(th));
  }

'''
s = s[:a] + new + s[b:]
s = s.replace("    this.wade = 0; this.swimPh = 0; this.vyS = 0;", "    this.wade = 0; this.swimPh = 0; this.vyS = 0; this.dive = 0; this.o2 = 1; this.choke = false; this.pitchS = 0; this.cur = { x: 0, z: 0 };")
s = s.replace("    this.vy = 0;\n    this.game.emit('player:splash'", "    this.vy = 0; this.dive = 0; this.pitchS = 0;\n    this.game.emit('player:splash'")
open('src/actors/player.js', 'w', encoding='utf8').write(s)

h = open('src/actors/human.js', encoding='utf8').read()
h = h.replace("    case 'tread': {", """    case 'dive': {
      const s = Math.sin(ph), k = Math.sin(ph * 3);
      out.lean = 0.05; out.hipY = 0; out.headX = -0.95; out.headY = Math.sin(ph * 0.5) * 0.1;
      out.shLx = -2.7 + s * 1.0; out.shRx = -2.7 - s * 1.0; out.shLz = 0.1; out.shRz = -0.1;
      out.elL = -0.15 - Math.max(0, -s) * 0.8; out.elR = -0.15 - Math.max(0, s) * 0.8;
      out.hpLx = -0.05 + k * 0.32; out.hpRx = -0.05 - k * 0.32; out.knL = 0.18 + Math.max(0, Math.sin(ph * 3 + 1)) * 0.4; out.knR = 0.18 + Math.max(0, -Math.sin(ph * 3 + 1)) * 0.4;
      break;
    }
    case 'hover': {
      const s = Math.sin(t * 1.9);
      out.lean = 0.04; out.hipY = 0; out.headX = -0.6; out.shLx = -2.2 + s * 0.2; out.shRx = -2.2 - s * 0.2; out.shLz = 0.5; out.shRz = -0.5; out.elL = -0.6; out.elR = -0.6;
      out.hpLx = -0.15 + s * 0.2; out.hpRx = -0.15 - s * 0.2; out.knL = 0.4; out.knR = 0.4;
      break;
    }
    case 'tread': {""", 1)
h = h.replace("      out.lean = 0.42; out.hipY = -0.08; out.headX = -0.38; out.headY = Math.sin(ph * 0.5) * 0.12;", "      out.lean = 0.05; out.hipY = 0; out.headX = -0.95; out.headY = Math.sin(ph * 0.5) * 0.12;", 1)
open('src/actors/human.js', 'w', encoding='utf8').write(h)

i = open('src/core/input.js', encoding='utf8').read()
i = i.replace("  photoMode: ['KeyN'],\n};", "  photoMode: ['KeyN'],\n  dive: ['ControlLeft', 'ControlRight'],\n};", 1)
i = i.replace("photoMode: 'Photo mode',\n};", "photoMode: 'Photo mode', dive: 'Dive / swim down',\n};", 1)
i = i.replace("surrender: 14 };", "surrender: 14, dive: 4 };", 1)
open('src/core/input.js', 'w', encoding='utf8').write(i)
print('ok')
