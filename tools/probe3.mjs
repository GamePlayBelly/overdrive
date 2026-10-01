import { launch } from './harness.mjs';
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play', null, { timeout: 240000 });
console.log(JSON.stringify(await page.evaluate(() => { const g = window.__game, w = g.world, C = { x: 460.5, z: 247.5 }; return { a: w.groundY(C.x, C.z, 50), b: w.groundY(C.x, C.z, 1e4), c: w.ground(C.x, C.z, 50) }; })));
await close(); process.exit(0);
