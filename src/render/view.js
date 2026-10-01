import * as THREE from 'three';

// Per-frame camera view: fast sphere/frustum tests and view-angle LOD bias for all instanced systems.
export class View {
  constructor() {
    this.pl = new Float32Array(24);
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.m = new THREE.Matrix4();
    this.f = new THREE.Frustum();
    this.stamp = 0;
    this.moved = 0;
    this._last = new THREE.Vector3(1e9, 0, 0);
    this._lastDir = new THREE.Vector3();
    this.lodScale = 1;
  }

  update(cam) {
    cam.updateMatrixWorld();
    this.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.f.setFromProjectionMatrix(this.m);
    for (let i = 0; i < 6; i++) {
      const p = this.f.planes[i];
      this.pl[i * 4] = p.normal.x; this.pl[i * 4 + 1] = p.normal.y; this.pl[i * 4 + 2] = p.normal.z; this.pl[i * 4 + 3] = p.constant;
    }
    cam.getWorldPosition(this.pos);
    cam.getWorldDirection(this.dir);
    this.moved = this.pos.distanceTo(this._last) + (1 - this.dir.dot(this._lastDir)) * 200;
    this._last.copy(this.pos); this._lastDir.copy(this.dir);
    this.stamp++;
  }

  sphere(x, y, z, r) {
    const p = this.pl;
    for (let i = 0; i < 24; i += 4) if (p[i] * x + p[i + 1] * y + p[i + 2] * z + p[i + 3] < -r) return false;
    return true;
  }

  // visible in frustum, or close enough that it could cast a shadow into view
  sphereOrNear(x, y, z, r, near = 30) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    if (dx * dx + dz * dz < near * near) return true;
    return this.sphere(x, y, z, r);
  }

  distSq(x, z) { const dx = x - this.pos.x, dz = z - this.pos.z; return dx * dx + dz * dz; }

  // 1 in the view centre, ~0.62 at the periphery / behind: multiplies LOD distances
  bias(x, y, z) {
    const dx = x - this.pos.x, dy = y - this.pos.y, dz = z - this.pos.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    if (l < 40) return 1;
    const c = (dx * this.dir.x + dy * this.dir.y + dz * this.dir.z) / l;
    const t = Math.min(1, Math.max(0, (c + 0.25) / 0.95));
    return 0.62 + 0.38 * t * t * (3 - 2 * t);
  }
}
