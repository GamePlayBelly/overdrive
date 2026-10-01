import { launch } from './harness.mjs';
// Buys the three sailboats through the store and checks that each one waits at a berth in the water.
const { page, close, logs } = await launch({ width: 800, height: 450 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(() => {
  const app = window.__app, g = window.__game, p = app.profile, out = [];
  p.level = 40; p.money = 2000000;
  for (const m of ['dinghy', 'sloop', 'cruiser']) {
    const res = app.store.act({ type: 'buyVehicle', model: m, color: '#f2f2f0' });
    out.push(`${m}: ${JSON.stringify(res)}`);
  }
  app.spawnOwnedBoats();
  for (const v of g.vehicles) if (v.owned && v.isBoat) out.push(`owned ${v.def.id} at ${v.x.toFixed(0)},${v.z.toFixed(0)} y=${v.y.toFixed(2)} hoist=${v.hoist}`);
  return out;
});
console.log(r.join('\n'));
console.log('errs:', logs.filter((l) => !/getImageData|favicon|ERR_CONN/.test(l)).join('\n') || 'none');
await close(); process.exit(0);
