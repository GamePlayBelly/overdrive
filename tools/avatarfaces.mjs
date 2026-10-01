import { launch } from './harness.mjs';
import fs from 'node:fs';
// Close-ups (MODE=face) or full bodies (MODE=body) of every archetype.
const { page, close, logs } = await launch({ width: 1280, height: 720 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
const mode = process.env.MODE || 'face';
const url = await page.evaluate(async (mode) => {
  window.__pauseLoop = true;
  const a = window.__app, g = window.__game, st = a.stage;
  const { ARCHETYPES, BASE_LOOK } = await import('/src/data/avatars.js');
  a.openMenu('creator');
  await new Promise((r) => setTimeout(r, 600));
  const base = { name: 'Driver', height: 1.78, build: 0.45, skin: '#c69272', eyes: '#4a3526', face: { jaw: 0.5, nose: 0.5, brow: 0.5 }, hair: { style: 'short', color: '#2b1e16' }, facial: 'none', top: { type: 'tshirt', color: '#e9e9e6' }, jacket: { type: 'bomber', color: '#2c3440' }, pants: { type: 'jeans', color: '#34465e' }, shoes: { type: 'sneakers', color: '#f2f2f0' }, hat: { type: 'none', color: '#222222' }, glasses: 'none', watch: 'steel', chain: 'none', bag: 'none' };
  const face = mode === 'face', W = face ? 300 : 240, H = face ? 330 : 420, cols = 5, rows = 2, cv = document.createElement('canvas');
  cv.width = cols * W; cv.height = rows * H;
  const cx = cv.getContext('2d');
  st.auto = 0; st.frame(0);
  ARCHETYPES.forEach((ar, k) => {
    st.showAvatar({ ...base, ...JSON.parse(JSON.stringify(BASE_LOOK)), ...JSON.parse(JSON.stringify(ar.look)) });
    if (face) { st.center.set(0, 1.64, 0); st.tDist = st.dist = 0.95; st.tPitch = st.pitch = 0.0; st.tYaw = st.yaw = 0.22; }
    else { st.tDist = st.dist = 2.9; st.tPitch = st.pitch = 0.03; st.tYaw = st.yaw = 0.25; }
    for (let i = 0; i < 40; i++) st.update(1 / 60);
    st.render(1 / 60);
    cx.drawImage(g.canvas, face ? 440 : 400, face ? 130 : 0, face ? 400 : 480, face ? 440 : 720, (k % cols) * W, Math.floor(k / cols) * H, W, H);
  });
  return cv.toDataURL('image/png');
}, mode);
fs.writeFileSync(`data/shots/archetypes_${mode}.png`, Buffer.from(url.split(',')[1], 'base64'));
console.log('logs:', logs.filter((l) => !/getImageData/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
