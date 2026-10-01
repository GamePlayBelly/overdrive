import { launch } from './harness.mjs';
import fs from 'node:fs';
// Contact sheet of avatar variants (front view) in the stage, to check face, hair, clothes.
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
const url = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const a = window.__app, g = window.__game, st = a.stage;
  a.openMenu('creator');
  await new Promise((r) => setTimeout(r, 600));
  const looks = [{ species: 'android' }, { species: 'alien' }, { species: 'fox', hair: { style: 'none', color: '#000' } }, { species: 'cat', skin: '#3a3a40', hair: { style: 'none', color: '#000' } }, { species: 'skull', jacket: { type: 'hoodie', color: '#222' } }, { species: 'human', skin: '#7a4f33' }];
  const W = 400, H = 560, cv = document.createElement('canvas'); cv.width = 3 * W; cv.height = 2 * H; const cx = cv.getContext('2d');
  const base = { name: 'Driver', height: 1.78, build: 0.45, skin: '#c69272', eyes: '#4a3526', face: { jaw: 0.5, nose: 0.5, brow: 0.5 }, hair: { style: 'short', color: '#2b1e16' }, facial: 'stubble', top: { type: 'tshirt', color: '#e9e9e6' }, jacket: { type: 'bomber', color: '#2c3440' }, pants: { type: 'jeans', color: '#34465e' }, shoes: { type: 'sneakers', color: '#f2f2f0' }, hat: { type: 'none', color: '#222222' }, glasses: 'none', watch: 'steel', chain: 'none', bag: 'none' };
  st.auto = 0; st.frame(0);
  for (let k = 0; k < looks.length; k++) {
    st.showAvatar({ ...base, ...looks[k] });
    st.tYaw = st.yaw = 0.2; st.tDist = st.dist = 2.6; st.tPitch = st.pitch = 0.02;
    for (let i = 0; i < 40; i++) { st.update(1 / 60); }
    st.render(1 / 60);
    cx.drawImage(g.canvas, 400, 0, 480, 672, (k % 3) * W, Math.floor(k / 3) * H, W, H);
  }
  return cv.toDataURL('image/png');
});
fs.mkdirSync('data/shots', { recursive: true });
fs.writeFileSync('data/shots/avatars.png', Buffer.from(url.split(',')[1], 'base64'));
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
