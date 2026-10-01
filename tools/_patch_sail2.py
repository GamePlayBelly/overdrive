def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/vehicles/boat.js', [
    ("    this.planing = 0; this.wetN = 4;",
     "    this.sail = null; this.ease = 0; this.sailT = 0; this.sailLuff = 0; this.sailPow = 0; this.tws = 0; this.awa = 0; this.aws = 0; this.motorT = 0;\n    this.planing = 0; this.wetN = 4;"),
    ("    this.mu = 0.62;\n    const m = this.mass;",
     "    this.mu = 0.62;\n    this.sail = p.sail || null;\n    if (this.sail) this.k2 = this.sail.k2;\n    const m = this.mass;"),
    ("    this.contacts = pts;\n",
     "    if (this.sail) for (const tt of [0.4, 0.58]) pts.push({ lx: 0, lz: -b.L / 2 + tt * b.L, yk: -this.sail.keel });\n    this.contacts = pts;\n"),
    ("    const thrT = this.engineOn ? clamp(input.throttle, 0, 1) : 0, brkT = clamp(input.brake, 0, 1);",
     "    // a sailboat's auxiliary engine starts on throttle and stops again a few seconds after letting go\n    if (this.sail) {\n      if (!this.engineOn && input.throttle > 0.25) { this.engineOn = true; this.motorT = 6; }\n      else if (this.engineOn) { if (input.throttle > 0.05) this.motorT = 6; else if ((this.motorT -= dt) <= 0) this.engineOn = false; }\n    }\n    const thrT = this.engineOn ? clamp(input.throttle, 0, 1) : 0, brkT = clamp(input.brake, 0, 1);"),
    ("    // buoyancy springs on the live wave surface\n",
     """    // sails: lift and drag from the apparent wind, auto-trimmed; the handbrake key eases the sheets
    let sFu = 0, sFl = 0, sMr = 0;
    const SL = this.sail;
    if (SL) {
      const wnd = env.wind || { x: 0, z: 0 };
      const ax = wnd.x - this.vx, az = wnd.z - this.vz;
      const a_u = ax * sy + az * cy, a_l = -ax * cy + az * sy, aws = Math.hypot(a_u, a_l) || 1e-4;
      const beta = Math.atan2(Math.abs(a_l), -a_u), s = a_l < 0 ? 1 : -1;
      this.ease += ((input.hand ? 1 : 0) - this.ease) * Math.min(1, dt * 2.5);
      const trim = clamp(beta - 0.3 + this.ease * 0.9, 0.06, 1.45), alpha = beta - trim;
      const nogo = smoothstep(0.36, 0.66, beta);
      const cl0 = alpha < 0 ? 0 : Math.min(4.6 * alpha, 1.35) - Math.max(0, alpha - 0.32) * 1.7;
      const CL = Math.max(0, cl0) * nogo * (1 - 0.85 * this.ease);
      const sa = Math.sin(Math.min(Math.abs(alpha), 1.57));
      const CD = 0.07 + 0.06 * CL * CL + 0.75 * sa * sa;
      const heelCut = 1 - 0.5 * smoothstep(0.4, 0.75, Math.abs(this.roll));
      const q = 0.5 * 1.225 * aws * aws * SL.area * heelCut;
      const ux = a_u / aws, lx = a_l / aws;
      sFu = q * (-CL * s * lx + CD * ux); sFl = q * (CL * s * ux + CD * lx);
      sMr = sFl * SL.hCE;
      this.tws = Math.hypot(wnd.x, wnd.z); this.aws = aws; this.awa = beta * s;
      this.sailT = -s * trim;
      this.sailLuff = clamp(1 - smoothstep(0.03, 0.2, alpha) * nogo + 0.8 * this.ease, 0, 1);
      this.sailPow = clamp(Math.hypot(sFu, sFl) / (m * 3), 0, 1);
    }

    // buoyancy springs on the live wave surface
"""),
    ("    Fw *= this.buoy; Tp *= this.buoy; Tr *= this.buoy;\n",
     "    Fw *= this.buoy; Tp *= this.buoy; Tr *= this.buoy;\n    if (SL) { Tr += sMr - SL.gm * m * G * Math.sin(this.roll); this.rollV *= 1 - Math.min(0.5, dt * 1.6); }\n"),
    ("    u += ((Fl - D) / m + slx * sy + slz * cy) * dt;\n    vl += (slx * -cy + slz * sy) * dt;",
     "    if (SL) D += SL.wall * Math.max(0, au - SL.hull) ** 2;\n    u += ((Fl - D + sFu) / m + slx * sy + slz * cy) * dt;\n    vl += ((sFl) / m + slx * -cy + slz * sy) * dt;"),
])
patch('src/vehicles/boat.js', [
    ("    const e = { sea, terrain: this.world.terrain, t: sea.t };", "    const e = { sea, terrain: this.world.terrain, t: sea.t, wind: this.game.sky?.wind };"),
])
print('ok')
