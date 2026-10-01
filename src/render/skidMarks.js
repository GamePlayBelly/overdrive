import * as THREE from 'three';

// Ring buffer of tire mark ribbons drawn on the ground. Each wheel keeps its own trail; a gap in contact breaks the ribbon.
export class SkidMarks {
  constructor(scene, cap = 3000) {
    this.cap = cap; this.head = 0;
    this.pos = new Float32Array(cap * 4 * 3); this.col = new Float32Array(cap * 4 * 4);
    const idx = new Uint32Array(cap * 6);
    for (let i = 0; i < cap; i++) { const b = i * 4; idx.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], i * 6); }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
    this.trails = new Map();
    this.dirtyMin = Infinity; this.dirtyMax = -1;
  }

  // key identifies a wheel; (x,y,z) contact point; dir = travel direction unit (xz); w width
  add(key, x, y, z, dx, dz, w, alpha, tint = 0) {
    let t = this.trails.get(key);
    const now = performance.now();
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const nx = -dz * w * 0.5, nz = dx * w * 0.5;
    if (t && now - t.t < 90 && Math.hypot(x - t.x, z - t.z) < 3) {
      const d = Math.hypot(x - t.x, z - t.z);
      if (d < 0.18) return;
      const i = this.head, b = i * 4;
      this.head = (this.head + 1) % this.cap;
      const P = this.pos, C = this.col;
      const set = (k, px, py, pz, a) => { P[(b + k) * 3] = px; P[(b + k) * 3 + 1] = py; P[(b + k) * 3 + 2] = pz; const c = tint ? 0.28 : 0.03; C[(b + k) * 4] = c; C[(b + k) * 4 + 1] = c * 0.95; C[(b + k) * 4 + 2] = c * 0.9; C[(b + k) * 4 + 3] = a; };
      set(0, t.x + t.nx, t.y + 0.025, t.z + t.nz, t.a); set(1, t.x - t.nx, t.y + 0.025, t.z - t.nz, t.a);
      set(2, x + nx, y + 0.025, z + nz, alpha); set(3, x - nx, y + 0.025, z - nz, alpha);
      this.mark(i);
    }
    this.trails.set(key, { x, y, z, nx, nz, a: alpha, t: now });
  }

  mark(i) { if (i < this.dirtyMin) this.dirtyMin = i; if (i > this.dirtyMax) this.dirtyMax = i; }

  flush() {
    if (this.dirtyMax < 0) return;
    if (this.dirtyMin > this.dirtyMax) { this.dirtyMin = 0; this.dirtyMax = this.cap - 1; }
    this.aPos.needsUpdate = this.aCol.needsUpdate = true;
    this.dirtyMin = Infinity; this.dirtyMax = -1;
  }
}
