p = 'src/vehicles/carShell.js'
s = open(p, encoding='utf8').read()


def rep(a, b, cnt=1):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b, cnt)


# --- hood: continuous slope toward the nose
rep("""      y = lerp(b.beltY + 0.02, b.hoodY, smoothstep(0, 0.55, u));
      y -= st.noseDive * Math.pow(smoothstep(0.78, 1, u), 1.7);""",
    """      y = lerp(b.beltY + 0.02, b.hoodY, smoothstep(0, 0.55, u));
      y -= st.noseDive * Math.pow(clamp((u - 0.45) / 0.55, 0, 1), 1.55);""")

# --- creased normals helper
rep("// ---------------------------------------------------------------- surface ray caster",
    """// smooth shading that keeps hard edges: a corner only averages the faces around it that lean less than `angle` from its own face
function creased(geo, angle = 0.66) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = g.attributes.position, n = pos.count / 3;
  const fn = new Float32Array(n * 3), ar = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const a = f * 3, b = a + 1, c = a + 2;
    const ux = pos.getX(b) - pos.getX(a), uy = pos.getY(b) - pos.getY(a), uz = pos.getZ(b) - pos.getZ(a);
    const vx = pos.getX(c) - pos.getX(a), vy = pos.getY(c) - pos.getY(a), vz = pos.getZ(c) - pos.getZ(a);
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    ar[f] = l; if (l > 1e-12) { nx /= l; ny /= l; nz /= l; }
    fn[f * 3] = nx; fn[f * 3 + 1] = ny; fn[f * 3 + 2] = nz;
  }
  const key = (i) => Math.round(pos.getX(i) * 2000) + ',' + Math.round(pos.getY(i) * 2000) + ',' + Math.round(pos.getZ(i) * 2000);
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) { const k = key(i); let a = groups.get(k); if (!a) groups.set(k, (a = [])); a.push(i); }
  const out = new Float32Array(pos.count * 3), ca = Math.cos(angle);
  for (const list of groups.values()) {
    for (const i of list) {
      const f = (i / 3) | 0;
      let sx = 0, sy = 0, sz = 0;
      for (const j of list) {
        const f2 = (j / 3) | 0;
        if (fn[f * 3] * fn[f2 * 3] + fn[f * 3 + 1] * fn[f2 * 3 + 1] + fn[f * 3 + 2] * fn[f2 * 3 + 2] >= ca) { sx += fn[f2 * 3] * ar[f2]; sy += fn[f2 * 3 + 1] * ar[f2]; sz += fn[f2 * 3 + 2] * ar[f2]; }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      out[i * 3] = sx / l; out[i * 3 + 1] = sy / l; out[i * 3 + 2] = sz / l;
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  const idx = new Array(pos.count); for (let i = 0; i < idx.length; i++) idx[i] = i;
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- surface ray caster""")

# use creased normals for the painted shell
rep("""  const lowerPaint = lowerFull.clone(); lowerPaint.setIndex([...lowIdx.paint, ...capIdx.paint]);
  parts.paint.add(lowerPaint);""",
    """  const lowerPaint = lowerFull.clone(); lowerPaint.setIndex([...lowIdx.paint, ...capIdx.paint]);
  parts.paint.add(LOD === 2 ? lowerPaint : creased(lowerPaint, 0.7));""")
rep("""    const g = full.clone(); g.setIndex(gIdx[k]);
    parts[k].add(g, null, k === 'trim' ? C('#0f1012') : null);""",
    """    const g = full.clone(); g.setIndex(gIdx[k]);
    parts[k].add(k === 'paint' && LOD < 2 ? creased(g, 0.7) : g, null, k === 'trim' ? C('#0f1012') : null);""")

# --- rear window spans the full roof width
rep("      else if (inRW) mat = topF ? 'glass' : side ? (glassSides ? 'glass' : 'paint') : 'paint';",
    "      else if (inRW) mat = topF || (edge && !glassSides) ? 'glass' : side ? (glassSides ? 'glass' : 'paint') : 'paint';")

# --- headlights without a pupil
rep("""      if (st.lens !== 'slit') {
        const F3 = frame([h.p[0] + h.n[0] * 0.006, h.p[1] + h.n[1] * 0.006, h.p[2] + h.n[2] * 0.006], h.n, 0);
        const Fi = F3.clone().multiply(new THREE.Matrix4().makeTranslation(-s * w * 0.18, 0, 0));
        parts.chrome.add(new THREE.CylinderGeometry(ht * 0.3, ht * 0.3, 0.012, 14).rotateX(Math.PI / 2), Fi, chromeC);
      }""",
    """      if (st.lens !== 'slit') {
        const F3 = frame([h.p[0] + h.n[0] * 0.012, h.p[1] + h.n[1] * 0.012, h.p[2] + h.n[2] * 0.012], h.n, 0);
        const rr = st.lens === 'round' ? ht * 0.36 : ht * 0.3;
        const Fi = F3.clone().multiply(new THREE.Matrix4().makeTranslation(st.lens === 'round' ? 0 : -s * w * 0.2, 0, 0));
        parts.trim.add(new THREE.CylinderGeometry(rr, rr, 0.01, 16).rotateX(Math.PI / 2), Fi, C('#2a2d31'));
        parts.chrome.add(new THREE.TorusGeometry(rr * 1.05, 0.006, 4, 18), Fi, chromeC);
      }
      const Fd = frame([h.p[0] + h.n[0] * 0.012, h.p[1] + h.n[1] * 0.012, h.p[2] + h.n[2] * 0.012], h.n, 0).clone().multiply(new THREE.Matrix4().makeTranslation(0, ht * 0.38, 0));
      if (st.lens !== 'round') addLens(0, new THREE.BoxGeometry(w * 0.86, 0.012, 0.006), Fd);""")
rep("const colorOf = (kind) => ({ 0: C('#e8eef2'),", "const colorOf = (kind) => ({ 0: C('#a9b1b8'),")

# --- wheel arch liners
rep("  parts.lights = lights;\n\n  // ---- body style extras ----",
    """  if (DET) for (const w of wheelPositions(b)) {
    const R = b.wr + 0.075, s = w.left ? 1 : -1, x0 = s * P.halfW(P.tOf(w.z)) * 0.5, x1 = s * (P.halfW(P.tOf(w.z)) - 0.012);
    const N = LOD === 0 ? 14 : 8;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI, a1 = ((i + 1) / N) * Math.PI;
      const p = (x, a) => [x, b.wr + R * Math.sin(a), w.z + R * Math.cos(a)];
      const q = [p(x0, a0), p(x1, a0), p(x1, a1), p(x0, a1)];
      // inward-facing quad: keep the winding that faces the wheel axle
      const ex = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], ey = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
      const nrm = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
      const mid = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2 - b.wr, (q[0][2] + q[2][2]) / 2 - w.z];
      const inward = -(nrm[1] * mid[1] + nrm[2] * mid[2]) > 0;
      if (inward) parts.trim.quad(q[0], q[1], q[2], q[3], C('#0b0c0e')); else parts.trim.quad(q[3], q[2], q[1], q[0], C('#0b0c0e'));
    }
    // inner wall seen through the arch
    const wall = [], steps = N;
    for (let i = 0; i <= steps; i++) { const a = (i / steps) * Math.PI; wall.push([x0, b.wr + R * Math.sin(a), w.z + R * Math.cos(a)]); }
    for (let i = 0; i < steps; i++) {
      const c0 = [x0, b.wr, w.z];
      const faceOut = s > 0 ? 1 : -1;
      if (faceOut > 0) parts.trim.quad(c0, wall[i + 1], wall[i], wall[i], C('#101114')); else parts.trim.quad(c0, wall[i], wall[i + 1], wall[i + 1], C('#101114'));
    }
  }
  parts.lights = lights;

  // ---- body style extras ----""")
open(p, 'w', encoding='utf8').write(s)
print('ok')
