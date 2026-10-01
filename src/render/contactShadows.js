import * as THREE from 'three';

// Soft blob shadows for traffic and pedestrians (immediate mode instanced quads), so only the hero car and static geometry use the shadow map.
export class ContactShadows {
  constructor(scene, cap = 320) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.55, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alphaAttr);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      vertexShader: 'attribute float aAlpha; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying float vA; void main(){ float a = texture2D(map, vUv).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }',
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 2; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
    this.cap = cap; this.n = 0;
    this.strength = 1; this.sx = 0; this.sz = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler(0, 0, 0);
  }

  // sun direction (unit, pointing from ground towards the sun) and overall strength 0..1
  setSun(dir, strength) { const l = Math.hypot(dir.x, dir.z) || 1; this.sx = -dir.x / l * Math.min(1.4, 1 / Math.max(0.35, dir.y)) * 0.3; this.sz = -dir.z / l * Math.min(1.4, 1 / Math.max(0.35, dir.y)) * 0.3; this.strength = strength; }
  begin() { this.n = 0; }
  add(x, y, z, yaw, sx, sz, alpha = 0.6, lift = 1) {
    if (this.n >= this.cap) return;
    this._q.setFromAxisAngle(this._p.set(0, 1, 0), yaw);
    this._p.set(x + this.sx * lift, y + 0.045, z + this.sz * lift);
    this._m.compose(this._p, this._q, this._s.set(sx, 1, sz));
    this.mesh.setMatrixAt(this.n, this._m);
    this.alphaAttr.array[this.n] = alpha * this.strength;
    this.n++;
  }
  end() { this.mesh.count = this.n; this.mesh.visible = this.n > 0; if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; this.alphaAttr.needsUpdate = true; } }
}
