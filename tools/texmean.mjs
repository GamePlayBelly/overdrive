import { launch } from './harness.mjs';
// Mean colour of each procedural world texture vs the photo replacement (to keep overall brightness when swapping).
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
const r = await page.evaluate(async () => {
  const T = await import('/src/world/textures.js');
  const mean = (cv) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0, 128, 128);
    const d = x.getImageData(0, 0, 128, 128).data; let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4; return [r / n, g / n, b / n].map((v) => +(v / 255).toFixed(3));
  };
  const proc = {
    asphalt: T.makeAsphalt().map.image, concrete: T.makeConcrete(3, true).map.image, plain: T.makeConcrete(4, false, [160, 158, 152]).map.image, pavers: T.makePavers().map.image, grass: T.makeGrass().map.image,
    dirt: T.makeDirt(9, false).map.image, gravel: T.makeDirt(10, true).map.image, sand: T.makeSand().map.image, brick: T.makeBrick().map.image, stucco: T.makeStucco().map.image,
    corr: T.makeCorrugated().map.image, shingles: T.makeShingles().map.image, membrane: T.makeRoofMembrane().map.image,
  };
  const out = {};
  for (const [k, cv] of Object.entries(proc)) out[k] = { proc: mean(cv) };
  const keys = ['asphalt', 'concrete', 'pavers', 'grass', 'dirt', 'gravel', 'sand', 'brick', 'stucco', 'corr', 'shingles', 'membrane', 'rock'];
  for (const k of keys) {
    const img = new Image(); img.src = `/assets/tex/${k}.jpg`; await img.decode();
    out[k] = out[k] || {}; out[k].photo = mean(img);
  }
  return out;
});
for (const [k, v] of Object.entries(r)) console.log(k, JSON.stringify(v));
await close(); process.exit(0);
