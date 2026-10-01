import { launch } from './harness.mjs';
const { page, close } = await launch({});
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async (code) => { const g = window.__game; const AF = Object.getPrototypeOf(async function () {}).constructor; return await new AF('g', code)(g); }, process.env.CODE || `
const T = g.world.terrain, res = [];
for (const x of [-320, -250, -180, 90, 330]) { const row = []; for (let z = 2290; z <= 2480; z += 10) row.push(Math.round(T.height(x, z) * 10) / 10); res.push(x + ': ' + row.join(' ')); }
res.push('slips: ' + JSON.stringify(g.world.marina.slips.slice(0, 4)));
return res.join('\\n');
`);
console.log(out);
await close(); process.exit(0);
