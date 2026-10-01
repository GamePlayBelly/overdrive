import * as THREE from 'three';

// World-space objective markers: a fading light beam over a pulsing ground ring with a slowly turning gem on top.
const VS = `varying float vH; void main(){ vH = position.y / 70.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `uniform vec3 uColor; uniform float uA; varying float vH; void main(){ float a = pow(clamp(1.0 - vH, 0.0, 1.0), 1.6) * uA; gl_FragColor = vec4(uColor * 2.2, a); }`;

let beamGeo = null, ringGeo = null, gemGeo = null;

export class Markers {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.t = 0;
    beamGeo = beamGeo || new THREE.CylinderGeometry(1, 1, 70, 20, 1, true).translate(0, 35, 0);
    ringGeo = ringGeo || new THREE.RingGeometry(0.88, 1, 56).rotateX(-Math.PI / 2);
    gemGeo = gemGeo || new THREE.OctahedronGeometry(0.45, 0);
  }

  // o: { x, z, y?, r, color, beam, gem, water }
  add(o) {
    const col = new THREE.Color(o.color || '#ff3b4d');
    const grp = new THREE.Group();
    const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uColor: { value: col }, uA: { value: o.beam === false ? 0 : 0.42 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    beam.scale.set(o.r * 0.55, 1, o.r * 0.55);
    const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.scale.setScalar(o.r);
    const ring2 = new THREE.Mesh(ringGeo, ringMat); ring2.scale.setScalar(o.r * 0.6); ring2.material = ringMat;
    const gem = new THREE.Mesh(gemGeo, new THREE.MeshBasicMaterial({ color: col, toneMapped: false, fog: false }));
    gem.scale.setScalar(Math.max(0.8, o.r * 0.12)); gem.position.y = 3 + o.r * 0.12;
    grp.add(beam, ring, ring2, gem);
    for (const m of [beam, ring, ring2, gem]) { m.frustumCulled = false; m.renderOrder = 4; }
    const m = { x: o.x, z: o.z, y: o.y ?? 0, r: o.r, water: !!o.water, grp, ring, ring2, gem, beam, phase: Math.random() * 6, dead: false, tint: col };
    this.place(m);
    this.group.add(grp);
    this.list.push(m);
    return m;
  }

  place(m) {
    const W = this.g.world;
    const y = m.water ? (W.sea ? W.sea.waveAt(m.x, m.z) : -2.2) : W.groundY(m.x, m.z, 1e4);
    m.y = y + 0.06; m.grp.position.set(m.x, m.y, m.z);
  }

  remove(m) {
    if (!m || m.dead) return;
    m.dead = true; this.group.remove(m.grp);
    m.beam.material.dispose(); m.ring.material.dispose(); m.gem.material.dispose();
    const i = this.list.indexOf(m); if (i >= 0) this.list.splice(i, 1);
  }

  clear() { for (const m of [...this.list]) this.remove(m); }

  update(dt, cam) {
    this.t += dt;
    for (const m of this.list) {
      const d = Math.hypot(m.x - cam.x, m.z - cam.z);
      m.grp.visible = d < 1400;
      if (!m.grp.visible) continue;
      const k = 1 + Math.sin(this.t * 3 + m.phase) * 0.06;
      m.ring.scale.setScalar(m.r * k); m.ring2.scale.setScalar(m.r * 0.6 * (1.1 - (this.t * 0.6 + m.phase) % 1 * 0.2));
      m.ring.material.opacity = 0.65 + Math.sin(this.t * 4 + m.phase) * 0.2;
      m.gem.rotation.y += dt * 1.6; m.gem.position.y = 3 + m.r * 0.12 + Math.sin(this.t * 2 + m.phase) * 0.25;
      // keep a thin beam visible from far away
      const w = m.r * 0.55 * (1 + Math.min(6, d / 160));
      m.beam.scale.set(w, 1, w);
      if (m.water) this.place(m);
    }
  }
}
