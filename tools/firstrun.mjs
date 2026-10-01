import { launch, shot, sleep } from './harness.mjs';
// Real boot with no saved profile: the title, Settings, and every rail button must be safe before a driver exists.
const { page, close, logs } = await launch({ width: 1280, height: 720, query: '' });
await page.waitForSelector('.boot-go.show', { timeout: 150000 });
await sleep(400);
await page.click('.boot-go button');
await page.waitForFunction(() => window.__app?.mode === 'home', null, { timeout: 90000 });
await sleep(1500);
console.log('profile', await page.evaluate(() => !!window.__app.store.profile));
console.log('home items', await page.evaluate(() => [...document.querySelectorAll('.home-item')].map((b) => b.textContent.trim())));
await page.evaluate(() => { const m = window.__app.menu; m.go('world'); m.go('missions'); m.go('home'); });
await sleep(500);
console.log('menu page after guarded go()', await page.evaluate(() => window.__app.menu.current));
console.log(await shot(page, 'firstrun'));
console.log('errors:', logs.filter((l) => !/getImageData|favicon/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
