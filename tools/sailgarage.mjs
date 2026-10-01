import { launch, sleep, shot } from './harness.mjs';
// Owned sailboats in the garage: open the page for each, switch tabs, look for errors.
const { page, close, logs } = await launch({ width: 1440, height: 810 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const uids = await page.evaluate(() => {
  const app = window.__app, p = app.profile; p.level = 40; p.money = 2000000;
  const out = [];
  for (const m of ['dinghy', 'sloop', 'cruiser']) { const r = app.store.act({ type: 'buyVehicle', model: m, color: '#f2f2f0' }); const v = app.profile.garage.vehicles.find((x) => x.model === m); out.push(v?.uid); }
  return out;
});
for (const uid of uids) {
  await page.evaluate((uid) => { const a = window.__app; a.openMenu('garage'); a.menu.go('garage', { uid, force: true }); }, uid);
  await sleep(900);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.tabs button, .tab')].map((b) => b.textContent.trim()).slice(0, 12));
  for (const t of tabs.slice(0, 8)) { await page.evaluate((t) => { const b = [...document.querySelectorAll('.tabs button, .tab')].find((x) => x.textContent.trim() === t); b?.click(); }, t); await sleep(250); }
  console.log(uid, JSON.stringify(tabs));
}
console.log(await shot(page, 'sail_garage'));
console.log('errs:', logs.filter((l) => !/getImageData|favicon|ERR_CONN/.test(l)).join('\n') || 'none');
await close(); process.exit(0);
