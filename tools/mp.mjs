import { launch, shot, sleep } from './harness.mjs';
const A = await launch({ width: 960, height: 540 });
await A.page.waitForFunction(() => window.__game && window.__game.player?.vehicle && window.__app?.mode === 'play', null, { timeout: 240000 });
const pageB = await A.browser.newPage({ viewport: { width: 960, height: 540 } });
pageB.on('pageerror', (e) => console.error('B pageerror:', e.message));
await pageB.goto(`http://127.0.0.1:${A.port}/index.html?dev=1`);
await pageB.waitForFunction(() => window.__game && window.__game.player?.vehicle && window.__app?.mode === 'play', null, { timeout: 240000 });
const setup = async (page, name, x, z, model) => page.evaluate(async ({ name, x, z, model }) => {
  const app = window.__app, g = window.__game;
  app.store.profile.name = name;
  g.traffic.update = () => {}; g.peds.update = () => {};
  const v = g.player.vehicle; v.place(x, g.world.groundY(x, z, 80), z, 0.4);
  try { await app.net.connect(); } catch (e) { return 'connect failed ' + e.message; }
  return 'online ' + app.net.connected;
}, { name, x, z, model });
console.log('A:', await setup(A.page, 'Alice', 880, 1500));
console.log('B:', await setup(pageB, 'Bob', 892, 1506));
await sleep(2500);
const info = async (page) => page.evaluate(() => { const app = window.__app; return JSON.stringify({ peers: [...app.net.peers.values()].map((p) => ({ n: p.name, x: +p.x.toFixed(1), z: +p.z.toFixed(1) })), ghosts: app.remote.list.size, players: app.net.players.length }); });
console.log('A sees:', await info(A.page));
console.log('B sees:', await info(pageB));
// view from A looking at the ghost
await A.page.evaluate(() => { const g = window.__game; g.rig.snapBehind(); for (let i = 0; i < 60; i++) { g.update(1 / 60); window.__app.remote.update(1 / 60); } g.render(1 / 60); });
await sleep(500);
console.log(await shot(A.page, 'mp_a'));
await A.close(); process.exit(0);
