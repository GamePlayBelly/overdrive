import * as THREE from 'three';
import * as T from './textures.js';
import { buildUber } from './uber.js';
import { PHOTO, loadPhotos } from './photos.js';
import { WATER_FX, WATER_FX_GLSL } from './waterFx.js';

// tile size in metres of the procedural texture each photo replaces: the world's UVs are metres / this
const SITE = { asphalt: 7, concrete: 3, plain: 3, pavers: 2.4, grass: 5, dirt: 6, gravel: 3, sand: 6, brick: 3.2, stucco: 4, corr: 3.2, shingles: 3, membrane: 8, bark: 2 };

// shared world materials; wetness/night are driven from sky.js
// asphalt keeps the 7 m repeat so the cracks of the photo do not read as a pattern
const KEEP_SITE = new Set(['asphalt']);
const K_ADJ = {};

export async function createMaterials(renderer) {
  T.setMaxAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  await loadPhotos();
  const ph = (k, make) => (PHOTO[k] ? T.fromPhoto(PHOTO[k]) : make());
  const asphalt = ph('asphalt', () => T.makeAsphalt());
  const concrete = ph('concrete', () => T.makeConcrete(3, true));
  const plain = PHOTO.concrete ? concrete : T.makeConcrete(4, false, [160, 158, 152]);
  const pavers = ph('pavers', () => T.makePavers());
  const grass = ph('grass', () => T.makeGrass());
  const dirt = ph('dirt', () => T.makeDirt(9, false));
  const gravel = ph('gravel', () => T.makeDirt(10, true));
  const sand = ph('sand', () => T.makeSand());
  const brick = ph('brick', () => T.makeBrick());
  const stucco = ph('stucco', () => T.makeStucco());
  const siding = T.makeSiding();
  const corr = ph('corr', () => T.makeCorrugated());
  const shingles = ph('shingles', () => T.makeShingles());
  const membrane = ph('membrane', () => T.makeRoofMembrane());
  const rock = PHOTO.rock ? T.fromPhoto(PHOTO.rock) : gravel;
  const waterN = T.makeNormalNoise();
  const noiseTex = T.makeCloudNoise();
  const windows = T.makeWindowAtlas();
  const signs = T.makeSignAtlas();
  const roadSigns = T.makeRoadSignAtlas();
  const bill = T.makeBillboardAtlas();
  const leaves = T.makeLeaves(41, false);
  const needles = T.makeLeaves(42, true);
  const barkPh = PHOTO.bark ? T.fromPhoto(PHOTO.bark) : null;
  const bark = barkPh ? barkPh.map : T.makeBark();
  const container = T.makeContainerTex();
  const lotLines = T.makeParkingLot();

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {};
  M.asphalt = std({ map: asphalt.map, normalMap: asphalt.normal || null, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92, color: 0xffffff });
  M.asphaltDark = std({ map: asphalt.map, normalMap: asphalt.normal || null, roughness: 0.9, color: 0xc8c8c8 });
  M.junction = M.asphalt;
  M.parkingLot = std({ map: asphalt.map, roughness: 0.93, color: 0xe6e6e6 });
  M.lotLines = std({ map: lotLines, transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  M.markWhite = std({ color: 0xe9e9e4, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  M.markYellow = std({ color: 0xe0b12a, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  M.sidewalk = std({ map: concrete.map, normalMap: concrete.normal || null, roughness: 0.88, vertexColors: true });
  M.curb = std({ map: plain.map, roughness: 0.85, color: 0xb5b3ad, vertexColors: true });
  M.concrete = std({ map: plain.map, roughness: 0.9, vertexColors: true });
  M.pavers = std({ map: pavers.map, normalMap: pavers.normal || null, roughness: 0.85, vertexColors: true });
  M.grass = std({ map: grass.map, roughness: 0.95, vertexColors: true });
  M.dirt = std({ map: dirt.map, normalMap: dirt.normal || null, roughness: 0.97, vertexColors: true });
  M.gravel = std({ map: gravel.map, normalMap: gravel.normal || null, roughness: 0.95, vertexColors: true });
  M.sand = std({ map: sand.map, roughness: 0.95, vertexColors: true });
  M.terrain = std({ map: grass.map, roughness: 0.96, vertexColors: true });
  const terrNR = PHOTO.grass && PHOTO.dirt && PHOTO.sand && PHOTO.rock ? { g: T.nrTexture(PHOTO.grass.nr), d: T.nrTexture(PHOTO.dirt.nr), s: T.nrTexture(PHOTO.sand.nr), r: T.nrTexture(PHOTO.rock.nr) } : null;
  const TS = terrNR ? [5 / PHOTO.grass.size, 5 / PHOTO.dirt.size, 5 / PHOTO.sand.size, 5 / PHOTO.rock.size] : [1, 0.9, 0.8, 0.6];
  // splat terrain: grass / dirt / sand / rock blended by per-vertex weights, with low-frequency macro variation against tiling
  M.terrain.onBeforeCompile = (sh) => {
    sh.uniforms.uGrass = { value: grass.map }; sh.uniforms.uDirt = { value: dirt.map }; sh.uniforms.uSand = { value: sand.map }; sh.uniforms.uRock = { value: rock.map };
    sh.uniforms.uTS = { value: new THREE.Vector4(...TS) };
    Object.assign(sh.uniforms, WATER_FX);
    sh.uniforms.uNoise = { value: noiseTex };
    if (terrNR) Object.assign(sh.uniforms, { uNG: { value: terrNR.g }, uND: { value: terrNR.d }, uNS: { value: terrNR.s }, uNR: { value: terrNR.r } });
    sh.vertexShader = 'attribute vec4 aW; varying vec4 vW; varying vec3 vTP; varying vec3 vTN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW; vTP = position; vTN = normal;');
    sh.fragmentShader = (terrNR ? '#define TERR_NRM\nuniform sampler2D uNG; uniform sampler2D uND; uniform sampler2D uNS; uniform sampler2D uNR;\n' : '') + WATER_FX_GLSL + 'uniform vec4 uTS; uniform sampler2D uNoise; uniform sampler2D uGrass; uniform sampler2D uDirt; uniform sampler2D uSand; uniform sampler2D uRock; varying vec4 vW; varying vec3 vTP; varying vec3 vTN;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec2 uvg = vMapUv * uTS.x, uvd = vMapUv * uTS.y, uvs = vMapUv * uTS.z, uvr = vMapUv * uTS.w;
        vec3 tg = texture2D(uGrass, uvg).rgb, td = texture2D(uDirt, uvd).rgb, ts = texture2D(uSand, uvs).rgb, tr = texture2D(uRock, uvr).rgb;
        float macro = clamp((texture2D(uNoise, vTP.xz * 0.0024).g * 0.5 + texture2D(uNoise, vTP.xz * 0.0075).g * 0.3 + texture2D(uNoise, vTP.xz * 0.021).g * 0.2 - 0.5) * 1.7 + 0.5, 0.0, 1.0);
        vec4 w = vW;
        float desert = smoothstep(1950.0, 2350.0, vTP.x);
        float coast = max(step(vTP.x, -1020.0), step(2200.0, vTP.z));
        float sandK = coast * (1.0 - smoothstep(0.1, 1.5, vTP.y)) * (1.0 - w.w);
        w.y += w.x * desert * 0.45; w.z += w.x * desert * 0.55; w.x *= 1.0 - desert;
        w.z = mix(w.z, 1.0, sandK); w.x *= 1.0 - sandK; w.y *= 1.0 - sandK;
        tg *= mix(vec3(1.25, 1.02, 0.52), vec3(0.84, 1.03, 1.12), smoothstep(0.25, 0.75, macro));
        vec3 sp = tg * w.x + td * w.y + ts * w.z + tr * w.w;
        diffuseColor.rgb *= sp * (0.78 + 0.5 * macro);
        diffuseColor.rgb = wfxApply(diffuseColor.rgb, vTP, length(vViewPosition));`)
      .replace('#include <color_fragment>', `
#ifdef USE_COLOR
        diffuseColor.rgb *= mix(vColor.rgb, vec3(0.95), clamp(1.0 - w.x, 0.0, 1.0));
#endif
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.4, 0.92, 0.64), desert * (1.0 - w.w * 0.4));
        float snowN = smoothstep(0.35, 0.65, macro);
        float snow = smoothstep(196.0, 262.0, vTP.y + (snowN - 0.5) * 44.0) * smoothstep(0.5, 0.82, vTN.y) * (1.0 - desert);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.76, 0.8), snow);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef TERR_NRM
        float nNear = 1.0 - smoothstep(45.0, 180.0, length(vViewPosition));
        if (nNear > 0.01) {
          vec2 nA = (texture2D(uNG, uvg).xy * w.x + texture2D(uND, uvd).xy * w.y + texture2D(uNS, uvs).xy * w.z + texture2D(uNR, uvr).xy * w.w) / max(dot(w, vec4(1.0)), 0.001);
          vec2 nxy = (nA * 2.0 - 1.0) * nNear * 0.9;
          vec3 nm = vec3(nxy, sqrt(max(0.05, 1.0 - dot(nxy, nxy))));
          vec2 dux = dFdx(vMapUv), duy = dFdy(vMapUv);
          vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
          vec3 q1p = cross(q1, normal), q0p = cross(normal, q0);
          vec3 Tn = q1p * dux.x + q0p * duy.x, Bn = q1p * dux.y + q0p * duy.y;
          float det = max(dot(Tn, Tn), dot(Bn, Bn));
          float sc = det == 0.0 ? 0.0 : faceDirection * inversesqrt(det);
          normal = normalize(Tn * (nm.x * sc) + Bn * (nm.y * sc) + normal * nm.z);
        }
#endif`);
  };
  M.farTerrain = std({ roughness: 1, vertexColors: true, flatShading: false });

  M.brick = std({ map: brick.map, normalMap: brick.normal || null, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.88, vertexColors: true });
  M.stucco = std({ map: stucco.map, roughness: 0.92, vertexColors: true });
  M.siding = std({ map: siding.map, normalMap: siding.normal || null, roughness: 0.75, vertexColors: true });
  M.corrugated = std({ map: corr.map, normalMap: corr.normal || null, roughness: 0.55, metalness: 0.45, vertexColors: true });
  M.shingles = std({ map: shingles.map, normalMap: shingles.normal || null, roughness: 0.9, vertexColors: true });
  M.roof = std({ map: membrane.map, roughness: 0.95, vertexColors: true });
  M.wallConcrete = std({ map: plain.map, roughness: 0.9, vertexColors: true });
  M.metal = std({ color: 0xffffff, roughness: 0.45, metalness: 0.75, vertexColors: true });
  M.paint = std({ color: 0xffffff, roughness: 0.6, metalness: 0.1, vertexColors: true });
  M.plastic = std({ color: 0xffffff, roughness: 0.5, metalness: 0.0, vertexColors: true });
  M.wood = std({ map: bark, color: 0xd8c0a0, roughness: 0.85, vertexColors: true });
  M.glass = std({ color: 0x223038, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.2 });
  M.glassLight = std({ color: 0x8aa0aa, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
  M.windows = std({ map: windows.map, emissiveMap: windows.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.25, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.signs = std({ map: signs.map, emissiveMap: signs.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.roadSigns = std({ map: roadSigns.map, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
  M.billboards = std({ map: bill.map, roughness: 0.6, emissiveMap: bill.map, emissive: 0xffffff, emissiveIntensity: 0 });
  M.container = std({ map: container, roughness: 0.6, metalness: 0.35, vertexColors: true });
  M.fence = std({ color: 0xb8bcc0, alphaMap: T.makeChainLink(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4, vertexColors: true });
  M.leaves = std({ map: leaves, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true });
  M.needles = std({ map: needles, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true });
  M.bark = std({ map: bark, roughness: 0.95, vertexColors: true });
  M.lampGlow = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
  M.lampOff = std({ color: 0xcfcfc8, roughness: 0.3, emissive: 0xffe2b0, emissiveIntensity: 0 });
  M.glow = M.lampOff;
  M.lightPool = new THREE.MeshBasicMaterial({ map: T.makeLightPool(), color: 0xffc98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  M.water = std({ color: 0x1d3b45, roughness: 0.06, metalness: 0.2, normalMap: waterN, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.4, transparent: true, opacity: 0.94 });

  const facades = {};
  for (const [k, seed] of [['glass', 101], ['glass2', 102], ['glassBand', 103], ['concrete', 104], ['apartment', 105], ['brickTower', 106]]) facades[k] = T.makeTowerFacade(k === 'glass2' ? 'glass' : k, seed);
  M._facades = facades;
  const im = (t) => t.image;
  const nrSrc = {}, ks = {};
  for (const [key, t] of Object.entries({ asphalt, concrete, plain, pavers, grass, dirt, gravel, sand, brick, stucco, corr, shingles, membrane, bark: barkPh || {} })) if (t.photo) { nrSrc[key] = t.nr; ks[key] = (KEEP_SITE.has(key) ? 1 : SITE[key] / t.size) * (K_ADJ[key] || 1); }
  const fdSrc = {};
  for (const [k, det] of [['f_glass', 'concrete'], ['f_glass2', 'concrete'], ['f_glassBand', 'concrete'], ['f_concrete', 'concrete'], ['f_apartment', 'concrete'], ['f_brickTower', 'brick']]) {
    const f = facades[k.slice(2)], P = PHOTO[det];
    if (P) fdSrc[k] = [det, f.tileW / P.size, f.tileH / P.size];
  }
  const uber = buildUber({
    asphalt: im(asphalt.map), concrete: im(concrete.map), plain: im(plain.map), pavers: im(pavers.map), grass: im(grass.map), dirt: im(dirt.map), gravel: im(gravel.map), sand: im(sand.map),
    brick: im(brick.map), stucco: im(stucco.map), siding: im(siding.map), corr: im(corr.map), shingles: im(shingles.map), membrane: im(membrane.map), bark: im(bark), container: im(container),
    windows: im(windows.map), signs: im(signs.map),
    f_glass: { cv: im(facades.glass.map), alpha: im(facades.glass.rough) }, f_glass2: { cv: im(facades.glass2.map), alpha: im(facades.glass2.rough) }, f_glassBand: { cv: im(facades.glassBand.map), alpha: im(facades.glassBand.rough) },
    f_concrete: { cv: im(facades.concrete.map), alpha: im(facades.concrete.rough) }, f_apartment: { cv: im(facades.apartment.map), alpha: im(facades.apartment.rough) }, f_brickTower: { cv: im(facades.brickTower.map), alpha: im(facades.brickTower.rough) },
  }, {
    windows: im(windows.emissive), signs: im(signs.emissive), f_glass: im(facades.glass.emissive), f_glass2: im(facades.glass2.emissive), f_glassBand: im(facades.glassBand.emissive),
    f_concrete: im(facades.concrete.emissive), f_apartment: im(facades.apartment.emissive), f_brickTower: im(facades.brickTower.emissive),
  }, noiseTex, Math.min(8, renderer.capabilities.getMaxAnisotropy()), nrSrc, ks, fdSrc);
  M.uber = uber.solid; M.uberDecal = uber.decal; M._uberU = uber.uniforms;
  M._tex = { asphalt, concrete, windows, signs, roadSigns, bill, container };
  M._wetTargets = [M.asphalt, M.asphaltDark, M.parkingLot, M.sidewalk, M.concrete, M.pavers, M.curb];
  for (const m of M._wetTargets) { m.userData.dryRough = m.roughness; m.userData.dryColor = m.color.clone(); }
  M.windows.userData.nightMax = 1.35;
  M.signs.userData.nightMax = 1.1;
  M.billboards.userData.nightMax = 0.6;
  return M;
}

export function applyWetness(M, wet) {
  if (M._uberU) M._uberU.uWet.value = wet;
  for (const m of M._wetTargets) {
    m.roughness = m.userData.dryRough * (1 - wet * 0.72);
    m.color.copy(m.userData.dryColor).multiplyScalar(1 - wet * 0.32);
    m.envMapIntensity = 1 + wet * 1.6;
  }
}

export function applyNight(M, night) {
  if (M._uberU) M._uberU.uNight.value = night;
  M.windows.emissiveIntensity = night * M.windows.userData.nightMax;
  M.signs.emissiveIntensity = night * M.signs.userData.nightMax;
  M.billboards.emissiveIntensity = night * M.billboards.userData.nightMax;
  M.lampOff.emissiveIntensity = night * 4;
  M.lightPool.opacity = night * 0.42;
}
