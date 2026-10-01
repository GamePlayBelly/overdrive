import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
console.log(JSON.stringify(await page.evaluate(() => { const w = window.__game.world; return { meet: w.poi.meet, club: w.poi.motorClub, parked: w.parked.filter((q) => q.meet).length }; })));
await close(); process.exit(0);
