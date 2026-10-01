import * as THREE from 'three';
import { HEAD, brimGeo, hoodGeo, eyePos } from './avatarParts.js';
import { BONES } from './human.js';

// hats, glasses, species features and accessories, added on top of the base body built by buildHuman
export function addGear(c) {
  const { L, sp, accs, add, mat, headG, spine, HY, HZ, aL, aR, hips } = c;
  const hy = (y) => HY + y, hz = (z) => HZ + z, H = HEAD;
  const glossy = (color, emissive = '#000000', ei = 0, rough = 0.12) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.85, roughness: rough, emissive, emissiveIntensity: ei });
  const cloth = (color) => mat(color, 0.95, 0, { side: THREE.DoubleSide });
  const arcOver = (r, tube, parent, y, mater, sy = 1.22) => { const t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 32, Math.PI), mater); t.scale.y = sy; t.position.set(0, y, HZ - 0.004); parent.add(t); return t; };

  // ---------- species ----------
  if (sp === 'android') {
    c.head.visible = false;
    const shell = mat('#f4f7fa', 0.16, 0.2);
    add(headG, new THREE.SphereGeometry(1, 32, 24), shell, 0, hy(0.004), hz(0)).scale.set(H.rx * 1.1, H.ry * 1.04, H.rz * 1.1);
    const vis = new THREE.MeshPhysicalMaterial({ color: '#06121c', metalness: 0.9, roughness: 0.06, transparent: true, opacity: 0.78 });
    add(headG, new THREE.SphereGeometry(1, 24, 16), vis, 0, hy(0.012), hz(0.052)).scale.set(0.066, 0.043, 0.052);
    for (const g of c.eyeGroups) g.position.z += 0.034;
    for (const s of [1, -1]) { add(headG, new THREE.CylinderGeometry(0.026, 0.026, 0.028, 16), mat('#2a3340', 0.4, 0.6), s * (H.rx * 1.08), hy(0.0), hz(-0.004), false).rotation.z = Math.PI / 2; add(headG, new THREE.TorusGeometry(0.02, 0.003, 6, 16), c.glowC, s * (H.rx * 1.08 + 0.015), hy(0.0), hz(-0.004), false).rotation.y = Math.PI / 2; }
    add(headG, new THREE.CylinderGeometry(0.004, 0.004, 0.1, 5), mat('#c8d0d8', 0.3, 0.9), 0.05, hy(0.17), hz(-0.01), false);
    add(headG, new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshBasicMaterial({ color: '#35d3ff' }), 0.05, hy(0.225), hz(-0.01), false);
    add(spine, new THREE.CircleGeometry(0.03, 20), c.glowC, 0, 0.36, 0.127 + c.b * 0.02, false);
    add(spine, new THREE.TorusGeometry(0.036, 0.005, 6, 24), c.dark, 0, 0.36, 0.126 + c.b * 0.02, false);
    for (const a of [aL, aR]) { add(a.sh, new THREE.SphereGeometry(0.052, 12, 8), c.dark, 0, -0.02, 0, false); add(a.el, new THREE.BoxGeometry(0.006, 0.17, 0.006), c.glowC, 0.036, -0.12, 0, false); add(a.el, new THREE.BoxGeometry(0.006, 0.17, 0.006), c.glowC, -0.036, -0.12, 0, false); }
    return;
  }
  if (sp === 'alien') {
    c.head.scale.set(1.3, 1.2, 1.15);
    for (const g of c.eyeGroups) g.visible = false;
    for (const s of [1, -1]) { const e = add(headG, new THREE.SphereGeometry(0.034, 14, 10), glossy('#040507', '#000', 0, 0.05), s * 0.052, hy(0.018), hz(0.108), false); e.scale.set(1, 1.5, 0.42); e.rotation.z = s * -0.38; }
    for (const m of headG.children) if (m.geometry?.type === 'TubeGeometry') m.visible = false;
    return;
  }
  if (sp === 'skull') {
    for (const g of c.eyeGroups) g.visible = false;
    for (const s of [1, -1]) add(headG, new THREE.SphereGeometry(0.0235, 12, 10), mat('#050505', 0.9), s * 0.03, hy(0.014), hz(0.082), false).scale.set(1, 1.15, 0.6);
    add(headG, new THREE.ConeGeometry(0.009, 0.02, 3), mat('#050505', 0.9), 0, hy(-0.022), hz(0.098), false).rotation.x = Math.PI;
    for (let i = -3; i <= 3; i++) add(headG, new THREE.BoxGeometry(0.0095, 0.02, 0.008), mat('#f4f1e6', 0.5), i * 0.0105, hy(-0.062), hz(0.086 - Math.abs(i) * 0.002), false);
    return;
  }
  if (sp === 'fox' || sp === 'cat') {
    const fur = sp === 'fox' ? mat('#e2701f', 0.9) : mat(L.skin, 0.9), tip = sp === 'fox' ? mat('#f6efe3', 0.9) : fur;
    for (const s of [1, -1]) { const ear = add(headG, new THREE.ConeGeometry(0.048, sp === 'fox' ? 0.14 : 0.1, 4), fur, s * 0.056, hy(0.145), hz(-0.012), false); ear.rotation.z = s * -0.2; add(headG, new THREE.ConeGeometry(0.026, sp === 'fox' ? 0.09 : 0.065, 4), mat('#2a1a18', 0.9), s * 0.056, hy(0.138), hz(-0.002), false).rotation.z = s * -0.2; }
    add(headG, new THREE.ConeGeometry(0.036, 0.075, 10), tip, 0, hy(-0.03), hz(0.1), false).rotation.x = Math.PI / 2;
    add(headG, new THREE.SphereGeometry(0.0125, 8, 6), mat('#0a0a0a', 0.3), 0, hy(-0.026), hz(0.148), false);
    const tail = add(hips, new THREE.CapsuleGeometry(0.05, sp === 'fox' ? 0.5 : 0.4, 4, 10), fur, 0, 0.02, -0.28, true); tail.rotation.x = -1.0;
    if (sp === 'fox') add(hips, new THREE.SphereGeometry(0.058, 10, 8), tip, 0, 0.35, -0.55);
  }

  // ---------- hats ----------
  const hat = L.hat && L.hat.type;
  if (hat && hat !== 'none') {
    const hm = mat(L.hat.color, 0.82);
    if (hat === 'cap') {
      add(headG, new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), hm, 0, hy(0.04), hz(-0.004), false).scale.set(H.rx * 1.09, 0.082, H.rz * 1.09);
      const brim = add(headG, new THREE.CylinderGeometry(0.096, 0.096, 0.007, 22, 1, false, -Math.PI / 2 + 0.2, Math.PI - 0.4), hm, 0, hy(0.038), hz(0.07), false); brim.rotation.x = 0.12;
    } else if (hat === 'beanie') {
      add(headG, new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, 1.95), hm, 0, hy(0.026), hz(-0.002), false).scale.set(H.rx * 1.1, H.ry * 0.98, H.rz * 1.1);
      const cuff = add(headG, new THREE.TorusGeometry(0.086, 0.015, 8, 28), hm, 0, hy(0.012), hz(-0.002), false); cuff.rotation.x = Math.PI / 2; cuff.scale.y = 1.15;
    } else if (hat === 'bucket') {
      add(headG, new THREE.CylinderGeometry(0.083, 0.092, 0.085, 22), hm, 0, hy(0.095), hz(0), false);
      add(headG, brimGeo(0.135, 0.018), hm, 0, hy(0.062), hz(0), false);
    } else if (hat === 'fedora') {
      add(headG, new THREE.CylinderGeometry(0.075, 0.088, 0.095, 22), hm, 0, hy(0.105), hz(0), false);
      add(headG, new THREE.TorusGeometry(0.087, 0.008, 6, 24), mat('#161616', 0.6), 0, hy(0.075), hz(0), false).rotation.x = Math.PI / 2;
      add(headG, brimGeo(0.165, 0.012), hm, 0, hy(0.062), hz(0), false);
    } else if (hat === 'sun') {
      const straw = mat(L.hat.color, 0.92);
      add(headG, new THREE.SphereGeometry(1, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2), straw, 0, hy(0.092), hz(0), false).scale.set(0.096, 0.07, 0.102);
      add(headG, brimGeo(0.225, 0.03), straw, 0, hy(0.068), hz(0), false);
      add(headG, new THREE.TorusGeometry(0.098, 0.009, 6, 28), mat(L.hat.band || '#ff6fa8', 0.7), 0, hy(0.078), hz(0), false).rotation.x = Math.PI / 2;
    }
  }

  // ---------- glasses ----------
  if (L.glasses && L.glasses !== 'none') {
    const kind = L.glasses, frameM = glossy(kind === 'aviator' ? '#9a7b2a' : '#111114', '#000', 0, 0.3);
    const lens = new THREE.MeshPhysicalMaterial({ color: kind === 'sport' ? '#ff7a1a' : kind === 'sun' || kind === 'aviator' ? '#0a0a0c' : '#9fc8e0', metalness: 0.7, roughness: 0.05, transparent: true, opacity: kind === 'round' || kind === 'square' ? 0.35 : 0.9 });
    for (const s of [1, -1]) {
      const pe = eyePos(s), x = pe.x, y = hy(pe.y), z = hz(pe.z) + 0.021;
      const sq = kind === 'square' || kind === 'sport' || kind === 'sun';
      const lg = sq ? new THREE.PlaneGeometry(0.046, 0.032) : new THREE.CircleGeometry(0.0235, 22);
      const l = add(headG, lg, lens, x, y, z, false); if (kind === 'aviator') l.scale.y = 1.15;
      const fr = add(headG, sq ? new THREE.BoxGeometry(0.05, 0.036, 0.004) : new THREE.TorusGeometry(0.0235, 0.0026, 6, 22), frameM, x, y, z - 0.0016, false);
      if (sq) { fr.material = frameM; fr.scale.z = 0.4; }
      const t = add(headG, new THREE.BoxGeometry(0.003, 0.004, 0.1), frameM, s * (H.rx * 0.98), y, hz(0.04), false); t.rotation.y = s * 0.05;
    }
    add(headG, new THREE.BoxGeometry(0.016, 0.004, 0.004), frameM, 0, hy(eyePos(1).y + 0.003), hz(eyePos(1).z) + 0.021, false);
  }

  // ---------- accessories ----------
  if (accs.has('vr')) {
    const body = glossy('#15151c', '#000', 0, 0.35);
    add(headG, new THREE.BoxGeometry(0.17, 0.078, 0.072), body, 0, hy(0.012), hz(0.1), false);
    add(headG, new THREE.PlaneGeometry(0.15, 0.056), glossy('#9a1220', '#40040a', 1.4, 0.08), 0, hy(0.012), hz(0.1) + 0.0365, false);
    const strap = add(headG, new THREE.TorusGeometry(0.1, 0.008, 6, 30), body, 0, hy(0.016), hz(-0.002), false); strap.rotation.x = Math.PI / 2; strap.scale.set(0.84, 1.0, 1);
    const topS = add(headG, new THREE.TorusGeometry(0.098, 0.006, 6, 24, Math.PI), body, 0, hy(0.012), hz(0.0), false); topS.rotation.y = Math.PI / 2; topS.scale.x = 1.15;
    for (const s of [1, -1]) add(headG, new THREE.BoxGeometry(0.014, 0.04, 0.05), body, s * 0.08, hy(0.012), hz(0.074), false);
  }
  if (accs.has('catEars')) {
    const band = mat('#f4f4f6', 0.5);
    arcOver(0.093, 0.0065, headG, hy(0.0), band);
    for (const s of [1, -1]) {
      const e = add(headG, new THREE.ConeGeometry(0.04, 0.095, 4), mat(L.hair.color, 0.7), s * 0.062, hy(0.136), hz(-0.004), false); e.rotation.z = s * -0.3;
      const i = add(headG, new THREE.ConeGeometry(0.024, 0.07, 4), mat('#ff9fbf', 0.7), s * 0.061, hy(0.13), hz(0.003), false); i.rotation.z = s * -0.3;
    }
    add(spine, new THREE.TorusGeometry(0.056, 0.006, 6, 24), mat('#1c1c22', 0.5), 0, BONES.neckY + 0.008, 0.002, false).rotation.x = Math.PI / 2;
    add(spine, new THREE.SphereGeometry(0.008, 8, 6), mat('#d4af37', 0.3, 0.9), 0, BONES.neckY + 0.0, 0.058, false);
  }
  if (accs.has('headphones')) {
    const band = glossy('#1b2431', '#000', 0, 0.35);
    arcOver(0.098, 0.0085, headG, hy(0.0), band, 1.2);
    for (const s of [1, -1]) {
      const cup = add(headG, new THREE.CylinderGeometry(0.036, 0.036, 0.03, 20), glossy('#2a5bd7', '#0a1e66', 0.4, 0.3), s * (H.rx + 0.016), hy(-0.002), hz(-0.004), false); cup.rotation.z = Math.PI / 2;
      const ring = add(headG, new THREE.TorusGeometry(0.03, 0.003, 6, 20), c.glowC, s * (H.rx + 0.032), hy(-0.002), hz(-0.004), false); ring.rotation.y = Math.PI / 2;
    }
  }
  if (accs.has('flowers')) {
    const petal = mat('#ffd9e6', 0.7), pink = mat('#ff7fb0', 0.7), center = mat('#ffd24a', 0.6), leaf = mat('#3f9a4a', 0.8);
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2, rx = H.rx * 1.04, rz = H.rz * 1.02, x = Math.sin(a) * rx, z = Math.cos(a) * rz, y = hy(0.052 + Math.cos(a) * 0.012);
      const g = new THREE.Group(); g.position.set(x, y, hz(0) + z); g.lookAt(x * 2, y, hz(0) + z * 2); headG.add(g);
      if (i % 2) add(g, new THREE.ConeGeometry(0.014, 0.05, 4), leaf, 0.0, 0.0, 0, false).rotation.set(0, 0, 1.2);
      else { for (let k = 0; k < 5; k++) { const p = add(g, new THREE.SphereGeometry(0.011, 7, 5), i % 4 ? petal : pink, Math.cos(k * 1.2566) * 0.014, Math.sin(k * 1.2566) * 0.014, 0.004, false); p.scale.set(1, 1, 0.5); } add(g, new THREE.SphereGeometry(0.008, 7, 5), center, 0, 0, 0.008, false); }
    }
  }
  if (accs.has('hood')) {
    const hm = cloth('#0b0b0f');
    add(headG, hoodGeo(), hm, 0, hy(0.012), hz(0), false);
    add(headG, new THREE.SphereGeometry(1, 20, 14), mat('#020203', 1), 0, hy(0.0), hz(0.016), false).scale.set(H.rx * 0.98, H.ry * 0.96, H.rz * 0.96);
    for (const s of [1, -1]) { const e = add(headG, new THREE.SphereGeometry(0.0085, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }), s * 0.03, hy(0.012), hz(0.1), false); e.scale.set(1.6, 0.7, 0.5); e.rotation.z = s * 0.28; }
    const cape = add(spine, new THREE.CylinderGeometry(0.17, 0.3, 0.7, 20, 1, true), hm, 0, 0.1, -0.02, true); cape.scale.z = 0.8;
  }
  if (accs.has('vest')) {
    const plate = mat('#23292f', 0.8), red = mat('#c8202a', 0.6), w = 1 + c.b * 0.3;
    add(spine, new THREE.BoxGeometry(0.31 * w, 0.34, 0.07), plate, 0, 0.29, 0.1 + c.b * 0.02);
    add(spine, new THREE.BoxGeometry(0.31 * w, 0.34, 0.07), plate, 0, 0.29, -0.1 - c.b * 0.02);
    for (const s of [1, -1]) { const st = add(spine, new THREE.BoxGeometry(0.06, 0.05, 0.27), plate, s * 0.1 * w, 0.49, 0, false); st.rotation.x = 0.06; add(spine, new THREE.BoxGeometry(0.008, 0.2, 0.004), red, s * 0.12 * w, 0.3, 0.138 + c.b * 0.02, false); }
    for (const x of [-0.09, 0, 0.09]) add(spine, new THREE.BoxGeometry(0.075, 0.095, 0.045), mat('#2c343c', 0.8), x * w, 0.15, 0.15 + c.b * 0.02, false);
    add(spine, new THREE.BoxGeometry(0.1, 0.05, 0.004), red, 0, 0.42, 0.139 + c.b * 0.02, false);
    for (const s of [1, -1]) add(hips, new THREE.BoxGeometry(0.06, 0.1, 0.05), plate, s * 0.17, 0.0, 0.03, false);
  }
  if (sp === 'cyber' || accs.has('cyber')) {
    const armor = glossy('#241c44', '#000', 0, 0.25), glow = new THREE.MeshBasicMaterial({ color: '#35f0e0' });
    for (const a of [aL, aR]) {
      const p = add(a.sh, new THREE.SphereGeometry(0.075, 16, 10, 0, Math.PI * 2, 0, 1.45), armor, 0, 0.0, 0, true); p.scale.set(1.15, 1, 1.1);
      const r = add(a.sh, new THREE.TorusGeometry(0.074, 0.004, 6, 24), glow, 0, 0.0, 0, false); r.rotation.x = Math.PI / 2; r.scale.set(1.15, 1.1, 1);
      for (const x of [0.03, -0.03]) add(a.el, new THREE.BoxGeometry(0.005, 0.2, 0.005), glow, x, -0.13, 0.04, false);
    }
    add(spine, new THREE.TorusGeometry(0.06, 0.005, 6, 24), glow, 0, BONES.neckY - 0.012, 0.002, false).rotation.x = Math.PI / 2;
    add(spine, new THREE.BoxGeometry(0.2, 0.006, 0.004), glow, 0, 0.26, 0.108 + c.b * 0.02, false);
    add(headG, new THREE.BoxGeometry(0.006, 0.05, 0.004), glow, 0.06, hy(-0.01), hz(0.09), false);
  }
  if (accs.has('choker') && !accs.has('catEars')) add(spine, new THREE.TorusGeometry(0.056, 0.005, 6, 24), mat('#1c1c22', 0.5), 0, BONES.neckY + 0.008, 0.002, false).rotation.x = Math.PI / 2;
}
