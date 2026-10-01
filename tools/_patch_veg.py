p = 'src/world/vegetation.js'
s = open(p, encoding='utf8').read()


def rep(a, b, cnt=1):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b, cnt)


# ---- better leaf textures
i0 = s.index('function leafNoiseTex(seed = 5) {')
i1 = s.index('function needleTex(seed = 6) {')
leaf_new = '''function leafPath(ctx, len, wid) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(wid * 0.55, len * 0.12, wid * 0.62, len * 0.62, 0, len);
  ctx.bezierCurveTo(-wid * 0.62, len * 0.62, -wid * 0.55, len * 0.12, 0, 0);
  ctx.closePath();
}
function drawLeaf(ctx, x, y, ang, len, wid, v, hue) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const r = 120 * v * hue[0], g = 158 * v * hue[1], b = 84 * v * hue[2];
  const gr = ctx.createLinearGradient(0, 0, 0, len);
  gr.addColorStop(0, `rgb(${Math.min(255, r * 0.78)},${Math.min(255, g * 0.8)},${Math.min(255, b * 0.8)})`);
  gr.addColorStop(1, `rgb(${Math.min(255, r * 1.12)},${Math.min(255, g * 1.12)},${Math.min(255, b * 1.05)})`);
  ctx.fillStyle = gr; leafPath(ctx, len, wid); ctx.fill();
  ctx.strokeStyle = `rgba(20,34,14,0.38)`; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.strokeStyle = `rgba(210,230,160,0.35)`; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, len * 0.9); ctx.stroke();
  ctx.restore();
}
function leafNoiseTex(seed = 5) {
  const S = 256, c = canvas(S), ctx = c.getContext('2d');
  const rnd = new RNG(seed);
  ctx.fillStyle = '#4c6a3a'; ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 1500; k++) {
    const x = rnd.f() * S, y = rnd.f() * S;
    for (const dx of [0, S, -S]) for (const dy of [0, S, -S]) if (x + dx > -24 && x + dx < S + 24 && y + dy > -24 && y + dy < S + 24) drawLeaf(ctx, x + dx, y + dy, rnd.f() * 6.283, 9 + rnd.f() * 8, 5 + rnd.f() * 3, rnd.range(0.55, 1.2), [1, 1, 1]);
  }
  return toTex(c);
}
'''
s = s[:i0] + leaf_new + s[i1:]

i0 = s.index('function cardTex(seed = 7) {')
i1 = s.index('function frondTex() {')
card_new = '''function cardTex(seed = 7) {
  const S = 256, c = canvas(S), ctx = c.getContext('2d');
  const rnd = new RNG(seed);
  ctx.clearRect(0, 0, S, S);
  // twigs
  ctx.strokeStyle = 'rgba(58,44,30,0.9)'; ctx.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const a = rnd.range(0, 6.283), r = rnd.range(30, 80);
    ctx.lineWidth = rnd.range(1.4, 2.4); ctx.beginPath(); ctx.moveTo(S / 2, S / 2); ctx.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); ctx.stroke();
  }
  const leaves = [];
  for (let k = 0; k < 150; k++) {
    const a = rnd.f() * 6.283, r = Math.pow(rnd.f(), 0.7) * S * 0.42;
    leaves.push({ x: S / 2 + Math.cos(a) * r * (0.9 + rnd.f() * 0.2), y: S / 2 + Math.sin(a) * r, ang: a + rnd.range(-0.9, 0.9) + Math.PI / 2, len: 22 + rnd.f() * 18, wid: 11 + rnd.f() * 8, v: 0.62 + (1 - r / (S * 0.42)) * 0.28 + rnd.f() * 0.4 });
  }
  leaves.sort((p, q) => p.v - q.v);
  for (const l of leaves) drawLeaf(ctx, l.x, l.y, l.ang, l.len, l.wid, l.v, [1, 1, 1]);
  return toTex(c, { repeat: false });
}
'''
s = s[:i0] + card_new + s[i1:]

# ---- smooth ellipsoid normals on blobs
rep('''    p.setXYZ(i, x * rx * n, y * ry * n, z * rz * n);
  }
  g.computeVertexNormals();
  return g;
}''', '''    p.setXYZ(i, x * rx * n, y * ry * n, z * rz * n);
  }
  const nr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (rx * rx), y = p.getY(i) / (ry * ry), z = p.getZ(i) / (rz * rz), l = Math.hypot(x, y, z) || 1;
    nr[i * 3] = x / l; nr[i * 3 + 1] = y / l * 0.9 + 0.1; nr[i * 3 + 2] = z / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
  return g;
}''')
# near blobs finer, crowns stronger inner shading
rep("const g = shade(blob(rx, ry, rz, 1, seed++), leaf, 0, ry).translate(x, y, z);", "const g = shade(blob(rx, ry, rz, 2, seed++, 0.3), leaf, 0, ry, 0.5, 1.22).translate(x, y, z);")
open(p, 'w', encoding='utf8').write(s)
print('ok')
