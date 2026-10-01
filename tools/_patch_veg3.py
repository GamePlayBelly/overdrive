def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:100])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/world/vegetation.js', [
    ("function frondTex() {", """// a spray of needles on a stem, drooping from the left; used as droopy branch cards on conifers
function branchTex(seed = 8) {
  const W = 256, H = 128, c = canvas(W, H), ctx = c.getContext('2d'), rnd = new RNG(seed);
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(70,54,38,0.95)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(4, H * 0.5); ctx.quadraticCurveTo(W * 0.5, H * 0.46, W - 6, H * 0.52); ctx.stroke();
  for (let k = 0; k < 150; k++) {
    const t = Math.pow(rnd.f(), 0.8), x = 6 + t * (W - 16), y = H * (0.5 - 0.04 * t);
    const side = rnd.f() < 0.5 ? -1 : 1, len = (10 + rnd.f() * 34) * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.08)), a = side * rnd.range(0.5, 1.25) + rnd.range(-0.15, 0.15);
    const v = rnd.range(0.62, 1.2);
    ctx.strokeStyle = `rgb(${Math.min(255, 78 * v)},${Math.min(255, 112 * v)},${Math.min(255, 70 * v)})`; ctx.lineWidth = rnd.range(1.5, 2.6);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * len * 0.6, y + Math.cos(a) * len * side * 0.9 * 0.7 + Math.abs(Math.cos(a)) * len * 0.25); ctx.stroke();
  }
  return toTex(c, { repeat: false });
}
function frondTex() {"""),
    ("    this.tex = { leaf: leafNoiseTex(), needle: needleTex(), card: cardTex(), frond: frondTex() };",
     "    this.tex = { leaf: leafNoiseTex(), needle: needleTex(), card: cardTex(), frond: frondTex(), branch: branchTex() };"),
    ("      cardPalm: new THREE.MeshStandardMaterial({ map: this.tex.frond, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }),",
     "      cardPalm: new THREE.MeshStandardMaterial({ map: this.tex.frond, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }),\n      cardCone: new THREE.MeshStandardMaterial({ map: this.tex.branch, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92 }),"),
    ("cards: K.cards ? mk(K.cards, d.type === 'palm' ? this.mats.cardPalm : this.mats.cardBroad, caps.hi, false, 'cards') : null,",
     "cards: K.cards ? mk(K.cards, d.type === 'palm' ? this.mats.cardPalm : d.type === 'cone' ? this.mats.cardCone : this.mats.cardBroad, caps.hi, false, 'cards') : null,"),
    ("      const shadeK = 0.72 + 0.4 * f;\n      solid.addGeo(g, 0, y + h / 2, 0, t * 0.7, 1, 1, 1, leaf.clone().multiplyScalar(shadeK));",
     """      const shadeK = 0.72 + 0.4 * f;
      solid.addGeo(g, 0, y + h / 2, 0, t * 0.7, 1, 1, 1, leaf.clone().multiplyScalar(shadeK));
      // droopy branch cards hang from the rim of the tier
      const nC = Math.round(7 + r * 2.4);
      for (let c = 0; c < nC; c++) {
        const a = (c / nC) * 6.283 + rng.f() * 0.6, rr = r * rng.range(0.5, 0.92), w = rng.range(1.5, 2.4) * (0.55 + 0.45 * (1 - f)), hh = w * 0.5, beta = rng.range(0.45, 0.85);
        const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(beta), sb = Math.sin(beta);
        const u = new THREE.Vector3(ca * cb, -sb, sa * cb), v = new THREE.Vector3(-sa, 0, ca), n = new THREE.Vector3().crossVectors(u, v);
        _m.makeBasis(u, v, n);
        _m.setPosition(ca * rr + u.x * w * 0.5, y + h * 0.18 + u.y * w * 0.5, sa * rr + u.z * w * 0.5);
        cards.add(new THREE.PlaneGeometry(w, hh), _m, leaf.clone().multiplyScalar(shadeK * rng.range(0.85, 1.12)));
      }"""),
])
print('ok')
