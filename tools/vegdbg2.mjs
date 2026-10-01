import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(() => {
  const V = window.__game.world.veg, out = {};
  for (const k of Object.keys(V.kinds)) { const K = V.kinds[k]; out[k] = { solid: K.tris.solid, mid: K.tris.mid, far: K.tris.far, cards: K.cards ? K.cards.index.count / 3 : 0, meshCards: !!V.meshes[k].cards, cnt: JSON.stringify(V.meshes[k].cnt) }; }
  return out;
});
for (const [k, v] of Object.entries(r)) console.log(k, JSON.stringify(v));
await close(); process.exit(0);
