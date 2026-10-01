def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/vehicles/aiDriver.js', [
    ("    const lat = 7.5 * (0.8 + this.skill * 0.4);\n", "    const safe = 0.72 + 0.2 * this.skill;\n"),
    ("        const vt = Math.sqrt(radius * lat);\n",
     "        // grip falls with speed (about 8.4 - 0.11 v m/s^2 measured on the Arc), solved for v\n        const bq = 0.11 * radius * safe, vt = (-bq + Math.sqrt(bq * bq + 33.6 * radius * safe)) / 2;\n"),
    ("    if (this.path.length && this.mode !== 'chase') desired = Math.min(desired, this.cornerSpeed());\n",
     "    if (this.path.length && this.mode !== 'chase') {\n      desired = Math.min(desired, this.cornerSpeed());\n      if (this.xt > 1.8) desired = Math.min(desired, Math.max(7, desired * (1 - 0.18 * (this.xt - 1.8))));\n    }\n"),
    ("    let acc = 0, i = this.pi;\n    let px = v.x, pz = v.z;\n",
     "    let xt = 1e9;\n    for (let k = Math.max(0, this.pi - 1); k <= Math.min(this.path.length - 2, this.pi + 1); k++) {\n      const a = this.path[k], b = this.path[k + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;\n      const u = clamp(((v.x - a.x) * dx + (v.z - a.z) * dz) / L2, 0, 1);\n      xt = Math.min(xt, Math.hypot(a.x + dx * u - v.x, a.z + dz * u - v.z));\n    }\n    this.xt = xt;\n    let acc = 0, i = this.pi;\n    let px = v.x, pz = v.z;\n"),
])
print('ok')
