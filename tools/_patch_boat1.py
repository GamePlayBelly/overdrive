def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)
patch('src/vehicles/boat.js', [
 ("    this.planing = 0; this.wetN = 4;", "    this.over = 0; this.windF = 0; this.planing = 0; this.wetN = 4;"),
 ("    const wm = m / 4, k = (wm * G) / this.d0, cc = 2 * 0.36 * Math.sqrt(k * wm);",
  "    // heavier hulls are better damped in heave; windage areas of the topsides and the front profile\n    this.zeta = 0.34 + 0.2 * smoothstep(800, 12000, m);\n    this.sideA = b.L * b.H * 0.3; this.frontA = b.W * b.H * 0.4; this.freeboard = Math.max(0.3, b.H * 0.3);\n    const wm = m / 4, k = (wm * G) / this.d0, cc = 2 * this.zeta * Math.sqrt(k * wm);"),
 ("    // buoyancy springs on the live wave surface\n    let Fw = 0, Tp = 0, Tr = 0, wetN = 0;", "    // buoyancy springs on the live wave surface\n    let Fw = 0, Tp = 0, Tr = 0, wetN = 0, over = -1;"),
 ("      c.F = F; c.h = h;", "      over = Math.max(over, comp - (this.freeboard - this.d0));\n      c.F = F; c.h = h;"),
 ("    Fw *= this.buoy; Tp *= this.buoy; Tr *= this.buoy;", "    Fw *= this.buoy; Tp *= this.buoy; Tr *= this.buoy;\n    this.over = over;\n    // windage on the topsides and the front profile\n    let wFu = 0, wFl = 0;\n    const wd = env.wind;\n    if (wd) {\n      const rx = wd.x - this.vx, rz = wd.z - this.vz, ru = rx * sy + rz * cy, rl = -rx * cy + rz * sy, rs = Math.hypot(ru, rl);\n      wFu = 0.5 * 1.225 * 0.6 * this.frontA * rs * ru; wFl = 0.5 * 1.225 * 1.0 * this.sideA * rs * rl;\n      Tr += wFl * this.heelArm;\n      this.windF = Math.hypot(wFu, wFl);\n    }"),
 ("    u += ((Fl - D + sFu) / m + slx * sy + slz * cy) * dt;\n    vl += ((sFl) / m + slx * -cy + slz * sy) * dt;", "    u += ((Fl - D + sFu + wFu) / m + slx * sy + slz * cy) * dt;\n    vl += ((sFl + wFl) / m + slx * -cy + slz * sy) * dt;"),
 ("    this.visPitch = this.pitch; this.visRoll = this.roll;\n  }", """    this.visPitch = this.pitch; this.visRoll = this.roll;
    // stability guard: a bad step is rolled back instead of propagating
    const gd = this._good;
    if (!Number.isFinite(this.x + this.y + this.z + this.vx + this.vz + this.vy + this.pitch + this.roll + this.w) || Math.abs(this.vy) > 40 || speed > 90) {
      if (gd) Object.assign(this, gd); else { this.vx = this.vz = this.vy = this.w = 0; }
      this.pitchV = this.rollV = 0;
    } else this._good = { x: this.x, y: this.y, z: this.z, yaw: this.yaw, vx: this.vx, vz: this.vz, vy: this.vy, pitch: this.pitch, roll: this.roll, w: this.w };
  }"""),
 ("    this.Ipitch = m * b.L * b.L * 0.12;", "    this.heelArm = b.H * 0.3;\n    this.Ipitch = m * b.L * b.L * 0.12;"),
 ("    // a leaking hull loses buoyancy and finally goes down\n    if (this.leak > 0.02) {\n      p.buoy = Math.max(0.2, 1 - this.leak * 0.8);\n", """    // waves breaking over the side swamp the hull; it bails itself slowly when the sea eases
    if (p.over > 0.02) this.swamp = Math.min(1.1, (this.swamp || 0) + dt * 0.02 * Math.min(2, p.over));
    else this.swamp = Math.max(0, (this.swamp || 0) - dt * 0.012);
    if (this.swamp > 0.02) {
      p.buoy = Math.max(0.2, (1 - this.leak * 0.8) * (1 - 0.45 * this.swamp));
      if (this.swamp > 1 && !this.sunk) { this.sunk = true; this.disabled = true; this.events.push({ type: 'sunk' }); }
    }
    // a leaking hull loses buoyancy and finally goes down
    if (this.leak > 0.02) {
      p.buoy = Math.max(0.2, (1 - this.leak * 0.8) * (1 - 0.45 * (this.swamp || 0)));
"""),
 ("    this.disabled = false; this.sunk = false; this.leak = 0; this.phys.buoy = 1;", "    this.disabled = false; this.sunk = false; this.leak = 0; this.swamp = 0; this.phys.buoy = 1;"),
])
print('ok')
