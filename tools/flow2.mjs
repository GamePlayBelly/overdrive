import { launch, shot, sleep } from './harness.mjs';
const { page, close, logs } = await launch({ width: 1440, height: 810, query: '' });
await page.waitForSelector('.boot-go.show', { timeout: 120000 });
await sleep(800);
await page.keyboard.press('Enter');
for (let i = 0; i < 6; i++) {
  await sleep(3000);
  console.log(await page.evaluate(() => { const A = window.__app.game.audio; return JSON.stringify({ mode: window.__app?.mode, ctx: A.ctx?.state, ready: A.ready, worker: !!A.sampleWorker, vars: Object.keys(A.variants).length }); }));
}
console.log('LOGS', logs.filter((l) => !/getImageData/.test(l)).slice(0, 10).join('\n'));
await close(); process.exit(0);
