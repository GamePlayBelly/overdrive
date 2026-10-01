// CC0 photo-scanned PBR textures (Poly Haven), packed offline by tools/tex_pack.py into assets/tex:
// <key>.jpg = albedo with ambient occlusion baked in, <key>_n.png = R,G tangent-space normal xy, B roughness.
const KEYS = ['asphalt', 'concrete', 'pavers', 'grass', 'dirt', 'gravel', 'sand', 'brick', 'stucco', 'corr', 'shingles', 'membrane', 'rock', 'bark'];
export const PHOTO = {};
let started = null;

const bitmap = async (url, raw) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return createImageBitmap(await r.blob(), raw ? { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } : {});
};

export function loadPhotos() {
  if (started) return started;
  started = (async () => {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nophoto')) return;
    let idx = {};
    try { idx = (await (await fetch('assets/tex/index.json')).json()).textures; } catch { /* sizes fall back below */ }
    await Promise.all(KEYS.map(async (k) => {
      try {
        const [a, nr] = await Promise.all([bitmap(`assets/tex/${k}.jpg`), bitmap(`assets/tex/${k}_n.png`, true)]);
        PHOTO[k] = { a, nr, size: idx[k]?.size || 2 };
      } catch (e) { console.warn('photo texture missing:', k); }
    }));
  })();
  return started;
}
