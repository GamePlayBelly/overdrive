import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();

export class GeoBuilder {
  constructor() {
    this.p = []; this.n = []; this.u = []; this.c = []; this.i = [];
  }
  get count() { return this.p.length / 3; }

  v(x, y, z, nx, ny, nz, u, v, r = 1, g = 1, b = 1) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v); this.c.push(r, g, b);
    return this.p.length / 3 - 1;
  }

  tri(a, b, c) { this.i.push(a, b, c); }

  // quad from 4 points (counter-clockwise when seen from the front), uv as [u0,v0,u1,v1]
  quad(a, b, c, d, col, uv = [0, 0, 1, 1]) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = d[0] - a[0], e2y = d[1] - a[1], e2z = d[2] - a[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const [r, g, bb] = col ? [col.r, col.g, col.b] : [1, 1, 1];
    const i0 = this.v(a[0], a[1], a[2], nx, ny, nz, uv[0], uv[1], r, g, bb);
    this.v(b[0], b[1], b[2], nx, ny, nz, uv[2], uv[1], r, g, bb);
    this.v(c[0], c[1], c[2], nx, ny, nz, uv[2], uv[3], r, g, bb);
    this.v(d[0], d[1], d[2], nx, ny, nz, uv[0], uv[3], r, g, bb);
    this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  // axis-aligned (optionally y-rotated) box; uvMode 'world' maps meters/uvScale
  box(cx, cy, cz, sx, sy, sz, col, rotY = 0, uvScale = 0, skipBottom = true, skipTop = false) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const us = uvScale || 0;
    const U = (w, h) => (us ? [0, 0, w / us, h / us] : [0, 0, 1, 1]);
    // +z face
    this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), col, U(sx, sy));
    this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), col, U(sx, sy));
    this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), col, U(sz, sy));
    this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), col, U(sz, sy));
    if (!skipTop) this.quad(P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), col, U(sx, sz));
    if (!skipBottom) this.quad(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), col, U(sx, sz));
  }

  // append any THREE.BufferGeometry transformed by matrix
  add(geo, matrix, col) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, gc = geo.attributes.color;
    const base = this.count;
    if (matrix) _nm.getNormalMatrix(matrix);
    const cr = col ? col.r : 1, cg = col ? col.g : 1, cb = col ? col.b : 1;
    for (let k = 0; k < pos.count; k++) {
      _v.fromBufferAttribute(pos, k);
      if (matrix) _v.applyMatrix4(matrix);
      if (nor) { _n.fromBufferAttribute(nor, k); if (matrix) _n.applyMatrix3(_nm).normalize(); } else _n.set(0, 1, 0);
      let r = cr, g = cg, b = cb;
      if (gc) { r *= gc.getX(k); g *= gc.getY(k); b *= gc.getZ(k); }
      this.p.push(_v.x, _v.y, _v.z); this.n.push(_n.x, _n.y, _n.z);
      this.u.push(uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0); this.c.push(r, g, b);
    }
    if (geo.index) { const ix = geo.index.array; for (let k = 0; k < ix.length; k++) this.i.push(base + ix[k]); }
    else for (let k = 0; k < pos.count; k++) this.i.push(base + k);
  }

  addGeo(geo, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, col, rotX = 0, rotZ = 0) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')),
      new THREE.Vector3(sx, sy, sz),
    );
    this.add(geo, m, col);
  }

  merge(other) {
    const base = this.count;
    for (let k = 0; k < other.p.length; k++) this.p.push(other.p[k]);
    for (let k = 0; k < other.n.length; k++) this.n.push(other.n[k]);
    for (let k = 0; k < other.u.length; k++) this.u.push(other.u[k]);
    for (let k = 0; k < other.c.length; k++) this.c.push(other.c[k]);
    for (let k = 0; k < other.i.length; k++) this.i.push(base + other.i[k]);
  }

  // strip between two polylines with uv along length
  strip(left, right, col, uScale = 1, vScale = 1, up = true) {
    let s = 0;
    const base = this.count;
    const [r, g, b] = col ? [col.r, col.g, col.b] : [1, 1, 1];
    for (let k = 0; k < left.length; k++) {
      if (k > 0) s += Math.hypot(left[k].x - left[k - 1].x, left[k].z - left[k - 1].z) * 0.5 + Math.hypot(right[k].x - right[k - 1].x, right[k].z - right[k - 1].z) * 0.5;
      const w = Math.hypot(right[k].x - left[k].x, right[k].z - left[k].z);
      this.v(left[k].x, left[k].y, left[k].z, 0, 1, 0, 0, s / uScale, r, g, b);
      this.v(right[k].x, right[k].y, right[k].z, 0, 1, 0, w / vScale, s / uScale, r, g, b);
    }
    for (let k = 0; k < left.length - 1; k++) {
      const a = base + k * 2;
      if (up) this.i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else this.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  build(computeNormals = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const cnt = this.count;
    g.setIndex(cnt > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    if (computeNormals) g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export const col = (hex) => _c.set(hex).clone();
export const rgb = (r, g, b) => new THREE.Color(r, g, b);

// chunked builders keyed by material name + chunk
export class ChunkedGeo {
  constructor(size = 320) { this.size = size; this.map = new Map(); }
  get(mat, x, z) {
    const key = `${mat}|${Math.floor(x / this.size)}|${Math.floor(z / this.size)}`;
    let b = this.map.get(key);
    if (!b) { b = new GeoBuilder(); b.mat = mat; this.map.set(key, b); }
    return b;
  }
  toMeshes(materials, { castShadow = true, receiveShadow = true } = {}) {
    const out = [];
    for (const b of this.map.values()) {
      if (!b.count) continue;
      const m = new THREE.Mesh(b.build(), materials[b.mat]);
      m.castShadow = castShadow; m.receiveShadow = receiveShadow;
      m.matrixAutoUpdate = false; m.updateMatrix();
      out.push(m);
    }
    return out;
  }
}
