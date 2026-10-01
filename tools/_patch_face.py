def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:70])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)

patch('src/actors/avatarParts.js', [
    ("export const HEAD = { rx: 0.078, ry: 0.115, rz: 0.098 };", "export const HEAD = { rx: 0.083, ry: 0.114, rz: 0.098 };"),
    ("X *= 1 - low * (0.34 - face.jaw * 0.16);", "X *= 1 - low * (0.22 - face.jaw * 0.1);"),
    ("lip = sk.clone().lerp(new THREE.Color('#9a3f3f'), 0.5)", "lip = sk.clone().lerp(new THREE.Color('#8a2f35'), 0.62)"),
    ("Z += nx * tip * front * (0.011 + face.nose * 0.008);", "Z += nx * tip * front * (0.008 + face.nose * 0.006);"),
    ("Z += nx * smoothstep(0.1, -0.1, uy) * smoothstep(-0.34, 0.0, uy) * front * (0.007 + face.nose * 0.006);", "Z += nx * smoothstep(0.1, -0.1, uy) * smoothstep(-0.34, 0.0, uy) * front * (0.005 + face.nose * 0.004);"),
    ("tip = gauss(uy + 0.32, 0.06);", "tip = gauss(uy + 0.27, 0.06);"),
    ("ball: new THREE.SphereGeometry(0.0118, 20, 14),", "ball: new THREE.SphereGeometry(0.0128, 20, 14),"),
    ("iris: new THREE.CircleGeometry(0.0062, 20),", "iris: new THREE.CircleGeometry(0.0072, 20),"),
    ("pupil: new THREE.CircleGeometry(0.0029, 14),", "pupil: new THREE.CircleGeometry(0.0033, 14),"),
    ("lidTop: new THREE.SphereGeometry(0.0126, 20, 8, 0, Math.PI * 2, 0, 1.18),", "lidTop: new THREE.SphereGeometry(0.0136, 20, 8, 0, Math.PI * 2, 0, 1.05),"),
    ("lidBot: new THREE.SphereGeometry(0.0126, 20, 6, 0, Math.PI * 2, 2.55, 0.58),", "lidBot: new THREE.SphereGeometry(0.0136, 20, 6, 0, Math.PI * 2, 2.6, 0.54),"),
    ("for (let i = 0; i < 7; i++) parts.push(place(lock(0.04, 0.016), -0.05 + i * 0.0165, R.ry * 0.5, R.rz * 0.9, 0.5));", "for (let i = 0; i < 7; i++) parts.push(place(lock(0.026, 0.016), -0.05 + i * 0.0165, R.ry * 0.56, R.rz * 0.9, 0.5));"),
    ("for (let i = 0; i < 8; i++) parts.push(place(lock(0.05, 0.016), -0.052 + i * 0.015, R.ry * 0.5, R.rz * 0.9, 0.5));", "for (let i = 0; i < 8; i++) parts.push(place(lock(0.03, 0.016), -0.052 + i * 0.015, R.ry * 0.56, R.rz * 0.9, 0.5));"),
])

patch('src/actors/buildHuman.js', [
    ("roughness: 0.58, sheen: 0.55, sheenRoughness: 0.45, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffd9c8'), 0.5) }));", "roughness: 0.74, envMapIntensity: 0.55, sheen: 0.12, sheenRoughness: 0.6, sheenColor: new THREE.Color(color) }));"),
    ("const ctx = { THREE,", "// lips\n  { const lipM = mat(new THREE.Color(L.skin).lerp(new THREE.Color('#8a2f35'), 0.6).getStyle(), 0.5); const up = add(headG, new THREE.SphereGeometry(1, 14, 8), lipM, 0, HY - 0.0545, HZ + 0.0925, false); up.scale.set(0.0175, 0.0042, 0.0058); const lo = add(headG, new THREE.SphereGeometry(1, 14, 8), lipM, 0, HY - 0.0645, HZ + 0.091, false); lo.scale.set(0.0155, 0.0052, 0.0062); add(headG, new THREE.BoxGeometry(0.03, 0.0016, 0.004), mat('#3a1214', 0.8), 0, HY - 0.0595, HZ + 0.0925, false); }\n  const ctx = { THREE,"),
    ("const collar = add(spine, new THREE.TorusGeometry(0.058, 0.012, 8, 18), top, 0, 0.545, 0.004, false);", "const collar = add(spine, new THREE.TorusGeometry(0.057, 0.0075, 8, 18), top, 0, 0.538, 0.004, false);"),
    ("['human', 'fox', 'cat', 'elf'].includes(sp)", "['human', 'fox', 'cat', 'elf', 'cyber'].includes(sp)"),
])
