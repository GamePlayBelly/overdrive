import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';

// Sails and boom for the sailing boats. Cloth is a flat grid in the sail's own plane (luff on the y axis, foot running toward -z);
// camber and flutter are applied in the vertex shader so one cached geometry serves every boat of a type.
const cache = {};

function sailGeo(key, { luff, foot, roach, taper, lean = 0, nu = 14, nv = 22 }) {
  if (cache[key]) return cache[key];
  const pos = [], aS = [], idx = [];
  const chord = (v) => foot * Math.max(0.02, 1 - taper * v) * (1 + roach * Math.sin(Math.PI * Math.pow(v, 0.8)));
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, c = chord(v);
    for (let i = 0; i <= nu; i++) { const u = i / nu; pos.push(0, v * luff * Math.sqrt(1 - lean * lean), -v * luff * lean - u * c); aS.push(u, v, Math.max(0.2, c)); }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSail', new THREE.Float32BufferAttribute(aS, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, k) => (k % 3 === 0 ? 1 : 0)), 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, luff / 2, -foot / 2), Math.hypot(luff, foot) * 0.75);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-0.6, 0, -foot * 1.2), new THREE.Vector3(0.6, luff, 0.3));
  return (cache[key] = g);
}

export function makeSailMaterial(color = '#f3f0e6') {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, side: THREE.DoubleSide, emissive: new THREE.Color('#b4b1a6'), emissiveIntensity: 0.5 });
  const U = { uCamber: { value: 0 }, uFlutter: { value: 0 }, uTime: { value: 0 } };
  m.userData.sail = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSail; varying vec2 vSu; uniform float uCamber, uFlutter, uTime;')
      .replace('#include <beginnormal_vertex>', `float su = aSail.x, sv = aSail.y, sc = aSail.z;
        vec3 objectNormal = normalize(vec3(1.0, 0.0, uCamber * 4.0 * (1.0 - 2.0 * su) * (1.0 - 0.5 * sv) / sc));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        float flap = sin(uTime * 12.0 + sv * 8.0 - su * 5.0) * 0.55 + sin(uTime * 7.3 + su * 11.0 + sv * 3.0) * 0.45;
        transformed.x += uCamber * 4.0 * su * (1.0 - su) * (1.0 - 0.5 * sv) + uFlutter * flap * (0.04 + 0.12 * smoothstep(0.1, 1.0, su)) * sc * 0.28;
        vSu = vec2(su, sv);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSu;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float seam = abs(fract(vSu.y * 11.0) - 0.5);
        diffuseColor.rgb *= 1.0 - 0.09 * smoothstep(0.465, 0.5, seam) - 0.05 * smoothstep(0.0, 1.0, vSu.x) * 0.0;
        diffuseColor.rgb *= 0.96 + 0.04 * sin(vSu.y * 90.0 + vSu.x * 40.0);`);
  };
  m.customProgramCacheKey = () => 'sail';
  return m;
}

const alloy = new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.3, metalness: 0.9, envMapIntensity: 1.2 });

// boom, mainsail and jib on their pivots; returns the groups the boat animates
// r: { x, y, z (gooseneck), foot, luff, boomLen, jib: { x, y, z (tack), hx, hy, hz (head), foot }, color }
export function makeSails(r) {
  const g = new THREE.Group();
  const cloth = makeSailMaterial(r.color);
  const main = new THREE.Group(); main.position.set(r.x, r.y, r.z);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, r.boomLen, 8).rotateX(Math.PI / 2).translate(0, 0, -r.boomLen / 2), alloy);
  boom.castShadow = true;
  const sail = new THREE.Mesh(sailGeo('main' + r.luff + '|' + r.foot, { luff: r.luff, foot: r.foot, roach: 0.12, taper: 0.9 }), cloth);
  sail.position.y = 0.12; sail.castShadow = true; sail.frustumCulled = false;
  main.add(boom, sail);
  const J = r.jib, base = new THREE.Vector3(J.x, J.y, J.z), head = new THREE.Vector3(J.hx, J.hy, J.hz);
  const axis = head.clone().sub(base), jl = axis.length(); axis.normalize();
  // the jib hinges about the forestay; its foot stays horizontal when it is sheeted on the centreline
  const jibPivot = new THREE.Group(); jibPivot.position.copy(base);
  const jg = sailGeo('jib' + jl.toFixed(2) + '|' + J.foot + '|' + axis.z.toFixed(3), { luff: jl, foot: J.foot, roach: 0.0, taper: 0.97, lean: -axis.z });
  const jibSail = new THREE.Mesh(jg, cloth);
  jibSail.castShadow = true; jibSail.frustumCulled = false;
  const hinge = new THREE.Group(); hinge.add(jibSail); jibPivot.add(hinge);
  g.add(main, jibPivot);
  g.userData = { main, jibPivot, hinge, axis, cloth, meshes: [sail, jibSail] };
  return g;
}
