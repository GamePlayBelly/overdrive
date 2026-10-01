def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:90])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


patch('src/app/pages/common.js', [
    ("  const s = Math.min((w - 30) / L, (h2 - 34) / (H + d * 0.8)),", "  const sl = def.perf?.sail, HH = sl ? sl.mast + 0.2 : H;\n  const s = Math.min((w - 30) / L, (h2 - 34) / (HH + (sl ? sl.keel : d) * 0.8)),"),
    ("  else { rect(-3.6, 1.4, fbS + 0.05, fbS + 1.45, color);",
     """  else if (sl) {
    const m = sl.mast, mz = L * 0.08, base = fbS + 0.06;
    x.fillStyle = '#1c2b38'; x.beginPath(); x.moveTo(X(-L * 0.04), Y(-d)); x.lineTo(X(L * 0.2), Y(-d)); x.lineTo(X(L * 0.14), Y(-sl.keel)); x.lineTo(X(L * 0.07), Y(-sl.keel)); x.closePath(); x.fill();
    rect(-L * 0.2, L * 0.1, fbS, fbS + H * 0.3, color); rect(-L * 0.14, L * 0.07, fbS + H * 0.12, fbS + H * 0.24, glass);
    x.strokeStyle = '#c9ccd0'; x.lineWidth = 2; x.beginPath(); x.moveTo(X(mz), Y(base)); x.lineTo(X(mz), Y(m)); x.stroke();
    x.fillStyle = '#f4f2ea'; x.beginPath(); x.moveTo(X(mz - 0.1), Y(base + 0.35)); x.lineTo(X(mz - 0.1), Y(m * 0.97)); x.lineTo(X(-L * 0.44), Y(base + 0.5)); x.closePath(); x.fill();
    x.fillStyle = '#e4e1d6'; x.beginPath(); x.moveTo(X(mz + 0.18), Y(m * 0.92)); x.lineTo(X(L * 0.46), Y(base + 0.12)); x.lineTo(X(mz + 0.3), Y(base + 0.55)); x.closePath(); x.fill();
  }
  else { rect(-3.6, 1.4, fbS + 0.05, fbS + 1.45, color);"""),
])
print('ok')
