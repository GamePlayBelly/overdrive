import { launch } from './harness.mjs';
// Lists static colliders around a point plus the road graph nodes and edge starts nearby.
const X = Number(process.env.X || -1353), Z = Number(process.env.Z || -422), RAD = Number(process.env.RAD || 12);
const { page, close } = await launch({ width: 640, height: 360 });
await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__game?.player?.vehicle, null, { timeout: 240000 });
const r = await page.evaluate(({ X, Z, RAD }) => {
  const W = window.__game.world, R = W.roads, out = { cols: [], nodes: [], y: W.groundY(X, Z, 60) };
  W.colliders.query(X, Z, RAD, -100, 400, (c) => { out.cols.push([c.type, c.kind, c.mat, Math.round(c.x * 10) / 10, Math.round(c.z * 10) / 10, c.type === 'box' ? [+c.hx.toFixed(1), +c.hz.toFixed(1), +c.rot.toFixed(2)] : +c.r.toFixed(1), Math.round(c.y0), Math.round(c.y1), c.solid].join(' ')); });
  for (const n of R.nodes) if (Math.hypot(n.x - X, n.z - Z) < 40) out.nodes.push([n.id, Math.round(n.x), Math.round(n.z), +n.y.toFixed(1), (n.edges || []).length].join(' '));
  return out;
}, { X, Z, RAD });
console.log(JSON.stringify(r.y)); console.log(r.cols.join('\n')); console.log('nodes', r.nodes.join(' | '));
await close(); process.exit(0);
