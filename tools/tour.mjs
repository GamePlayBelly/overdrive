import { launch, shot, sleep } from './harness.mjs';
const PAGES = (process.env.PAGES || 'creator').split(',');
const { page, close, logs } = await launch({ width: 1440, height: 810, query: '' });
await page.waitForSelector('.boot-go.show', { timeout: 150000 });
await sleep(500);
await page.click('.boot-go button');
await page.waitForFunction(() => window.__app?.mode === 'home', null, { timeout: 90000 });
await sleep(1500);
const errs = () => logs.filter((l) => !/getImageData|favicon/.test(l));
await page.evaluate(() => { window.__app.playFromHome(); });
await sleep(2500);
await shot(page, 'tour_creator');
console.log('creator errs:', errs().length ? errs().join('\n') : 'none');
// finish creation
await page.evaluate(() => { const b = [...document.querySelectorAll('.preview-tools .btn')].find((x) => /Start game/.test(x.textContent)); b?.click(); });
await page.waitForFunction(() => window.__app?.mode === 'play', null, { timeout: 60000 });
await sleep(4000);
await shot(page, 'tour_play');
console.log('play errs:', errs().length ? errs().join('\n') : 'none');
for (const id of PAGES.filter((p) => p !== 'creator')) {
  await page.evaluate((id) => { const a = window.__app; if (a.mode === 'play') a.openMenu(id); else a.menu.go(id); }, id);
  await sleep(1800);
  await shot(page, 'tour_' + id);
  console.log(id, 'errs:', errs().length ? errs().join('\n') : 'none');
}
await close(); process.exit(0);
