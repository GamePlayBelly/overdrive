def patch(path, pairs):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (path, a[:100])
        s = s.replace(a, b, 1)
    open(path, 'w', encoding='utf8').write(s)


s = open('src/world/textures.js', encoding='utf8').read()
s += '''
// photo-scanned layer with the same shape as the procedural generators ({ map, size }) plus the packed normal/roughness image
export function fromPhoto(P) {
  const c = canvas(512); c.getContext('2d').drawImage(P.a, 0, 0, 512, 512);
  return { map: toTex(c), size: P.size, nr: P.nr, photo: true };
}
// packed normal xy + roughness as a linear texture (terrain detail)
export function nrTexture(nr) {
  const c = canvas(512); c.getContext('2d').drawImage(nr, 0, 0, 512, 512);
  return toTex(c, { srgb: false });
}
export function makeNormalNoise(seed = 5, S = 128) {
  const rnd = mulberry32(seed);
  return heightToNormal(tileNoise(S, S, 8, rnd, 4), S, S, 2);
}
'''
open('src/world/textures.js', 'w', encoding='utf8').write(s)

patch('src/world/materials.js', [
    ("import { buildUber } from './uber.js';\n", "import { buildUber } from './uber.js';\nimport { PHOTO, loadPhotos } from './photos.js';\n\n// tile size in metres of the procedural texture each photo replaces: the world's UVs are metres / this\nconst SITE = { asphalt: 7, concrete: 3, plain: 3, pavers: 2.4, grass: 5, dirt: 6, gravel: 3, sand: 6, brick: 3.2, stucco: 4, corr: 3.2, shingles: 3, membrane: 8 };\n"),
    ("export function createMaterials(renderer) {\n  T.setMaxAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));\n  const asphalt = T.makeAsphalt();\n  const concrete = T.makeConcrete(3, true);\n  const plain = T.makeConcrete(4, false, [160, 158, 152]);\n  const pavers = T.makePavers();\n  const grass = T.makeGrass();\n  const dirt = T.makeDirt(9, false);\n  const gravel = T.makeDirt(10, true);\n  const sand = T.makeSand();\n  const brick = T.makeBrick();\n  const stucco = T.makeStucco();\n  const siding = T.makeSiding();\n  const corr = T.makeCorrugated();\n  const shingles = T.makeShingles();\n  const membrane = T.makeRoofMembrane();\n",
     """export async function createMaterials(renderer) {
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
"""),
    ("normalMap: asphalt.normal, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.4", "normalMap: waterN, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.4"),
    ("""    sh.uniforms.uGrass = { value: grass.map }; sh.uniforms.uDirt = { value: dirt.map }; sh.uniforms.uSand = { value: sand.map }; sh.uniforms.uRock = { value: gravel.map };""",
     """    sh.uniforms.uGrass = { value: grass.map }; sh.uniforms.uDirt = { value: dirt.map }; sh.uniforms.uSand = { value: sand.map }; sh.uniforms.uRock = { value: rock.map };
    sh.uniforms.uTS = { value: new THREE.Vector4(...TS) };
    if (terrNR) Object.assign(sh.uniforms, { uNG: { value: terrNR.g }, uND: { value: terrNR.d }, uNS: { value: terrNR.s }, uNR: { value: terrNR.r } });"""),
    ("    sh.fragmentShader = 'uniform sampler2D uGrass; uniform sampler2D uDirt; uniform sampler2D uSand; uniform sampler2D uRock; varying vec4 vW; varying vec3 vTP; varying vec3 vTN;\\n' + sh.fragmentShader",
     "    sh.fragmentShader = (terrNR ? '#define TERR_NRM\\nuniform sampler2D uNG; uniform sampler2D uND; uniform sampler2D uNS; uniform sampler2D uNR;\\n' : '') + 'uniform vec4 uTS; uniform sampler2D uGrass; uniform sampler2D uDirt; uniform sampler2D uSand; uniform sampler2D uRock; varying vec4 vW; varying vec3 vTP; varying vec3 vTN;\\n' + sh.fragmentShader"),
    ("        vec3 tg = texture2D(uGrass, vMapUv).rgb, td = texture2D(uDirt, vMapUv * 0.9).rgb, ts = texture2D(uSand, vMapUv * 0.8).rgb, tr = texture2D(uRock, vMapUv * 0.6).rgb;",
     "        vec2 uvg = vMapUv * uTS.x, uvd = vMapUv * uTS.y, uvs = vMapUv * uTS.z, uvr = vMapUv * uTS.w;\n        vec3 tg = texture2D(uGrass, uvg).rgb, td = texture2D(uDirt, uvd).rgb, ts = texture2D(uSand, uvs).rgb, tr = texture2D(uRock, uvr).rgb;"),
    ("        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.76, 0.8), snow);`);\n  };",
     """        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.76, 0.8), snow);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef TERR_NRM
        float nNear = 1.0 - smoothstep(70.0, 260.0, length(vViewPosition));
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
  };"""),
    ("  M.terrain = std({ map: grass.map, roughness: 0.96, vertexColors: true });\n",
     "  M.terrain = std({ map: grass.map, roughness: 0.96, vertexColors: true });\n  const terrNR = PHOTO.grass && PHOTO.dirt && PHOTO.sand && PHOTO.rock ? { g: T.nrTexture(PHOTO.grass.nr), d: T.nrTexture(PHOTO.dirt.nr), s: T.nrTexture(PHOTO.sand.nr), r: T.nrTexture(PHOTO.rock.nr) } : null;\n  const TS = terrNR ? [5 / PHOTO.grass.size, 5 / PHOTO.dirt.size, 5 / PHOTO.sand.size, 5 / PHOTO.rock.size] : [1, 0.9, 0.8, 0.6];\n"),
    ("  }, T.makeCloudNoise(), Math.min(8, renderer.capabilities.getMaxAnisotropy()));\n",
     "  }, T.makeCloudNoise(), Math.min(8, renderer.capabilities.getMaxAnisotropy()), nrSrc, ks);\n"),
    ("  const im = (t) => t.image;\n  const uber = buildUber({",
     """  const im = (t) => t.image;
  const nrSrc = {}, ks = {};
  for (const [key, t] of Object.entries({ asphalt, concrete, plain, pavers, grass, dirt, gravel, sand, brick, stucco, corr, shingles, membrane })) if (t.photo) { nrSrc[key] = t.nr; ks[key] = SITE[key] / t.size; }
  const uber = buildUber({"""),
])
patch('src/world/world.js', [
    ("    this.M = createMaterials(this.renderer);", "    this.M = await createMaterials(this.renderer);"),
])
print('ok')
