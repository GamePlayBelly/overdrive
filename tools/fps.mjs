import { launch, shot } from './harness.mjs';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const { page, close } = await launch({ width: W, height: H, fastFrames: !!process.env.FAST });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const spots = JSON.parse(process.env.SPOTS || '[[-271.5,230,3.14],[0,-60,0],[420,60,1.57],[-800,-100,1.57]]');
const secs = Number(process.env.SECS || 4);
for (const [x, z, yaw] of spots) {
  await page.evaluate(({ x, z, yaw }) => { const g = window.__game, v = g.player.vehicle; v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); }, { x, z, yaw });
  await new Promise((r) => setTimeout(r, 1500));
  const r = await page.evaluate((secs) => new Promise((res) => {
    const ts = []; const t0 = performance.now();
    const f = (t) => { ts.push(t); if (t - t0 < secs * 1000) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); const info = window.__game.renderer.info; res({ fps: +(d.length / ((ts[ts.length - 1] - ts[0]) / 1000)).toFixed(1), p50: +d[Math.floor(d.length * 0.5)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1), tris: info.render.triangles, calls: info.render.calls }); } };
    requestAnimationFrame(f);
  }), secs);
  console.log(JSON.stringify({ at: [x, z], ...r }));
}
await shot(page, 'fps');
await close();
process.exit(0);
