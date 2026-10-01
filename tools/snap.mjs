import { launch } from './harness.mjs';
// Prints the nearest road-graph node to each of the given points (checkpoints should sit on nodes).
const PTS = JSON.parse(process.env.PTS || '[[-960,-420],[-1300,-420],[-1650,-420],[-1850,-420]]');
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate((PTS) => {
  const R = window.__game.world.roads;
  return PTS.map(([x, z]) => { const n = R.nearestNode(x, z); return [x, z, +n.x.toFixed(1), +n.z.toFixed(1), +n.y.toFixed(1), Math.round(Math.hypot(n.x - x, n.z - z)), n.id]; });
}, PTS);
for (const l of r) console.log(JSON.stringify(l));
await close(); process.exit(0);
