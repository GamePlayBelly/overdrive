import { launch } from './harness.mjs';
// Seconds from page load to the start prompt (world built, shaders warmed): QUERY='?nophoto=1' to compare.
const t0 = Date.now();
const { page, close } = await launch({ width: 1280, height: 720, query: process.env.QUERY ?? '' });
const t1 = Date.now();
await page.waitForSelector('.boot-go.show', { timeout: 200000 });
console.log('domcontentloaded', ((t1 - t0) / 1000).toFixed(1), 's; ready', ((Date.now() - t1) / 1000).toFixed(1), 's after');
console.log(JSON.stringify(await page.evaluate(() => ({ build: Math.round(window.__game.world.buildMs), t: window.__game.world.timings }))));
await close(); process.exit(0);
