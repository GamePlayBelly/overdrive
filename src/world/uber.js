import * as THREE from 'three';
import { canvas } from './textures.js';

// One PBR material for the entire static world. Texture selection, roughness, metalness, emissive and wetness come from
// a per-vertex layer id (aCol.a) looked up in uniform tables, so a single BatchedMesh draw can render every material.

const C = (h) => new THREE.Color(h);
const lin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// [name, array(0 none, 1 = 512px, 2 = 1024px), texture key, roughness (-1 = from albedo alpha), metalness, emissive strength, wet response, base colour, emissive key]
export const UBER_DEFS = [
  ['white', 0, null, 0.8, 0, 0, 0],
  ['asphalt', 1, 'asphalt', 0.92, 0, 0, 1],
  ['parkingLot', 1, 'asphalt', 0.93, 0, 0, 1, lin(0xe6e6e6)],
  ['sidewalk', 1, 'concrete', 0.88, 0, 0, 1],
  ['curb', 1, 'plain', 0.85, 0, 0, 1, lin(0xb5b3ad)],
  ['concrete', 1, 'plain', 0.9, 0, 0, 1],
  ['pavers', 1, 'pavers', 0.85, 0, 0, 1],
  ['grass', 1, 'grass', 0.95, 0, 0, 0],
  ['dirt', 1, 'dirt', 0.97, 0, 0, 0],
  ['gravel', 1, 'gravel', 0.95, 0, 0, 0],
  ['sand', 1, 'sand', 0.95, 0, 0, 0],
  ['brick', 1, 'brick', 0.88, 0, 0, 0],
  ['stucco', 1, 'stucco', 0.92, 0, 0, 0],
  ['siding', 1, 'siding', 0.75, 0, 0, 0],
  ['corrugated', 1, 'corr', 0.55, 0.45, 0, 0],
  ['shingles', 1, 'shingles', 0.9, 0, 0, 0],
  ['roof', 1, 'membrane', 0.95, 0, 0, 0],
  ['wallConcrete', 1, 'plain', 0.9, 0, 0, 0],
  ['metal', 0, null, 0.45, 0.75, 0, 0],
  ['paint', 0, null, 0.6, 0.1, 0, 0],
  ['plastic', 0, null, 0.5, 0, 0, 0],
  ['wood', 1, 'bark', 0.85, 0, 0, 0, lin(0xd8c0a0)],
  ['markWhite', 0, null, 0.75, 0, 0, 0, lin(0xe9e9e4)],
  ['markYellow', 0, null, 0.75, 0, 0, 0, lin(0xe0b12a)],
  ['windows', 2, 'windows', 0.25, 0.3, 1.35, 0, null, 'windows'],
  ['signs', 2, 'signs', 0.5, 0, 1.1, 0, null, 'signs'],
  ['facade_glass', 2, 'f_glass', -1, 0.55, 1.25, 0, null, 'f_glass'],
  ['facade_glass2', 2, 'f_glass2', -1, 0.55, 1.25, 0, null, 'f_glass2'],
  ['facade_glassBand', 2, 'f_glassBand', -1, 0.5, 1.25, 0, null, 'f_glassBand'],
  ['facade_concrete', 2, 'f_concrete', -1, 0.12, 1.25, 0, null, 'f_concrete'],
  ['facade_apartment', 2, 'f_apartment', -1, 0.12, 1.25, 0, null, 'f_apartment'],
  ['facade_brickTower', 2, 'f_brickTower', -1, 0.12, 1.25, 0, null, 'f_brickTower'],
  ['container', 1, 'container', 0.6, 0.35, 0, 0],
];
export const UBER_INDEX = Object.fromEntries(UBER_DEFS.map((d, i) => [d[0], i]));
export const UBER_DECAL = new Set(['windows', 'signs', 'markWhite', 'markYellow', 'parkingLot', 'pavers', 'concrete', 'gravel', 'sand', 'grass']);

function drawTo(cv, size, alphaCv) {
  const c = canvas(size, size), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.translate(0, size); ctx.scale(1, -1);
  ctx.drawImage(cv, 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  if (alphaCv) {
    const a = canvas(size, size), actx = a.getContext('2d', { willReadFrequently: true });
    actx.translate(0, size); actx.scale(1, -1);
    actx.drawImage(alphaCv, 0, 0, size, size);
    const ad = actx.getImageData(0, 0, size, size).data, d = img.data;
    for (let i = 0; i < d.length; i += 4) d[i + 3] = ad[i];
  } else { const d = img.data; for (let i = 3; i < d.length; i += 4) d[i] = 255; }
  return img.data;
}

function makeArray(list, size, srgb = true, fill = [255, 255, 255, 255]) {
  const layers = Math.max(1, list.length);
  const data = new Uint8Array(size * size * 4 * layers);
  list.forEach((src, i) => {
    if (src) { data.set(drawTo(src.cv, size, src.alpha), i * size * size * 4); return; }
    for (let p = i * size * size * 4; p < (i + 1) * size * size * 4; p += 4) { data[p] = fill[0]; data[p + 1] = fill[1]; data[p + 2] = fill[2]; data[p + 3] = fill[3]; }
  });
  const t = new THREE.DataArrayTexture(data, size, size, layers);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  t.unpackAlignment = 1;
  return t;
}

// sources: { key: canvas | { cv, alpha } } for albedo, emis: { key: canvas }
// nr: { key: image } packed normal xy + roughness for the layers that have photo scans; ks: { key: uv multiplier } so a photo tiles at its real size
// fd: { facadeKey: [detailKey, uv scale x, uv scale y] } wall detail (photo albedo luma + normal) laid over the non-glass part of the facade textures
export function buildUber(src, emis, noiseTex, aniso = 8, nr = {}, ks = {}, fd = {}) {
  const n = UBER_DEFS.length;
  const l512 = [], l512n = [], l1024 = [], e1024 = [];
  const MI = new Float32Array(n * 4), MP = new Float32Array(n * 4), MC = new Float32Array(n * 4);
  const idx512 = new Map(), idx1024 = new Map();
  UBER_DEFS.forEach((d, i) => {
    const [name, arr, key, rough, metal, emisK, wet, col, emisKey] = d;
    let layer = 0, emisLayer = -1;
    if (arr === 1 && src[key]) { if (!idx512.has(key)) { idx512.set(key, l512.length); l512.push({ cv: src[key] }); l512n.push(nr[key] ? { cv: nr[key] } : null); } layer = idx512.get(key); }
    if (arr === 2 && src[key]) {
      const k2 = key + (emisKey ? '|e' : '');
      if (!idx1024.has(k2)) {
        idx1024.set(k2, l1024.length);
        const s = src[key];
        l1024.push(s.cv ? s : { cv: s });
        e1024.push(emisKey && emis[emisKey] ? { cv: emis[emisKey] } : null);
      }
      layer = idx1024.get(k2); emisLayer = emisKey ? layer : -1;
    }
    MI.set([src[key] || arr === 0 ? arr : 0, layer, emisLayer, arr === 1 && src[key] && nr[key] ? 1 : 0], i * 4);
    MP.set([rough, metal, emisK, wet], i * 4);
    MC.set([col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1, ks[key] || 1], i * 4);
  });
  const FD = new Float32Array(n * 3);
  UBER_DEFS.forEach((d, i) => { const f = fd[d[2]]; if (f && nr[f[0]] && idx512.has(f[0])) FD.set([f[1], f[2], idx512.get(f[0])], i * 3); });
  const A5 = makeArray(l512, 512), A10 = makeArray(l1024, 1024), E10 = makeArray(e1024, 1024), N5 = makeArray(l512n, 512, false, [128, 128, 255, 255]);
  for (const t of [A5, A10, E10, N5]) t.anisotropy = aniso;
  const uniforms = {
    uA5: { value: A5 }, uA10: { value: A10 }, uE10: { value: E10 }, uN5: { value: N5 }, uNK: { value: 1.0 }, uFD: { value: FD }, uMI: { value: MI }, uMP: { value: MP }, uMC: { value: MC },
    uNight: { value: 0 }, uWet: { value: 0 }, uNoise: { value: noiseTex }, uSun: { value: 1 },
  };
  const make = (offset) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 1 });
    if (offset) { m.polygonOffset = true; m.polygonOffsetFactor = -offset; m.polygonOffsetUnits = -offset; }
    m.customProgramCacheKey = () => 'uber' + (offset ? 'D' : 'S');
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = 'attribute vec4 aCol; varying vec4 vCol; varying vec2 vUvU; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCol = aCol; vUvU = uv; vWP = position;');
      sh.fragmentShader = `uniform sampler2DArray uA5; uniform sampler2DArray uA10; uniform sampler2DArray uE10; uniform sampler2DArray uN5; uniform float uNK; uniform sampler2D uNoise; uniform vec3 uFD[${n}];
uniform vec4 uMI[${n}]; uniform vec4 uMP[${n}]; uniform vec4 uMC[${n}]; uniform float uNight; uniform float uWet;
varying vec4 vCol; varying vec2 vUvU; varying vec3 vWP; vec4 gMI; vec4 gMP; vec2 gDx; vec2 gDy; float gAlpha; vec4 gNR; float gNF; vec2 gNx; vec2 gNy;
` + sh.fragmentShader
        .replace('#include <map_fragment>', `
          int uL = int(vCol.a * 255.0 + 0.5);
          gMI = uMI[uL]; gMP = uMP[uL];
          vec2 uvS = vUvU * uMC[uL].w;
          gDx = dFdx(uvS); gDy = dFdy(uvS);
          vec4 uT = vec4(1.0);
          if (gMI.x > 1.5) uT = textureGrad(uA10, vec3(uvS, gMI.y), gDx, gDy);
          else if (gMI.x > 0.5) uT = textureGrad(uA5, vec3(uvS, gMI.y), gDx, gDy);
          gAlpha = gMI.x > 1.5 ? uT.a : 0.0;
          gNR = vec4(0.5, 0.5, 1.0, 0.0); gNF = 0.0;
          gNx = gDx; gNy = gDy;
          if (gMI.w > 0.5) {
            uT.rgb *= 0.84 + 0.32 * texture2D(uNoise, vWP.xz * 0.012).g;
            gNF = 1.0 - smoothstep(40.0, 95.0, length(vViewPosition));
            if (gNF > 0.01) gNR = textureGrad(uN5, vec3(uvS, gMI.y), gDx, gDy);
          }
          vec3 fdv = uFD[uL];
          if (fdv.x > 0.0 && gAlpha > 0.5) {
            vec2 duv = vUvU * fdv.xy;
            vec2 ddx = dFdx(duv), ddy = dFdy(duv);
            float wall = smoothstep(0.55, 0.95, gAlpha);
            vec4 da = textureGrad(uA5, vec3(duv, fdv.z), ddx, ddy);
            uT.rgb *= mix(1.0, 0.3 + 0.95 * dot(da.rgb, vec3(0.333)), wall * 0.85);
            float dN = (1.0 - smoothstep(40.0, 95.0, length(vViewPosition))) * wall;
            if (dN > 0.01) { gNR = textureGrad(uN5, vec3(duv, fdv.z), ddx, ddy); gNx = ddx; gNy = ddy; gNF = dN; }
          }
          diffuseColor.rgb *= uT.rgb * uMC[uL].rgb * vCol.rgb;`)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = gMP.x < 0.0 ? 0.1 + 0.9 * gAlpha : gMP.x;
          if (gNF > 0.01) roughnessFactor = mix(roughnessFactor, gNR.z, 0.85 * gNF);
          float wetK = uWet * gMP.w;
          float pud = wetK * smoothstep(0.5, 0.6, texture2D(uNoise, vWP.xz * 0.045).r);
          roughnessFactor = mix(roughnessFactor, 0.05, pud) * mix(1.0, 0.5, wetK);
          diffuseColor.rgb *= 1.0 - 0.34 * wetK - 0.28 * pud;`)
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMP.y;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (gNF > 0.01) {
            vec2 nxy = (gNR.xy * 2.0 - 1.0) * uNK * gNF;
            vec3 nm = vec3(nxy, sqrt(max(0.05, 1.0 - dot(nxy, nxy))));
            vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
            vec3 q1p = cross(q1, normal), q0p = cross(normal, q0);
            vec3 Tn = q1p * gNx.x + q0p * gNy.x, Bn = q1p * gNx.y + q0p * gNy.y;
            float det = max(dot(Tn, Tn), dot(Bn, Bn));
            float sc = det == 0.0 ? 0.0 : faceDirection * inversesqrt(det);
            normal = normalize(Tn * (nm.x * sc) + Bn * (nm.y * sc) + normal * nm.z);
          }`)
        .replace('#include <emissivemap_fragment>', `
          if (gMP.z > 0.0 && uNight > 0.01 && gMI.z >= 0.0) totalEmissiveRadiance += textureGrad(uE10, vec3(vUvU, gMI.z), gDx, gDy).rgb * gMP.z * uNight;`);
    };
    return m;
  };
  return { solid: make(0), decal: make(3), uniforms, arrays: { A5, A10, E10 } };
}
