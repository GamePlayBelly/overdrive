import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
const PORT = 5470;
const up = () => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port: PORT, path: '/index.html', timeout: 1500 }, () => { r.destroy(); res(true); }); r.on('error', () => res(false)); });
let server = null;
if (!(await up())) { server = spawn(process.execPath, ['server.mjs', String(PORT)], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 150)); }
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--window-position=0,0', '--window-size=1300,800', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://127.0.0.1:${PORT}/index.html`);
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const [x, z, yaw] = JSON.parse(process.env.SPOT || '[0,-60,0]');
await page.evaluate(({ x, z, yaw }) => { const g = window.__game, v = g.player.vehicle; v.place(x, g.world.groundY(x, z, 60), z, yaw); g.rig.snapBehind(); g.pipeline.setQuality({ scale: 0.5, samples: 0, bloom: false, fxaa: true }); g.sky.envAge = -1e9; }, { x, z, yaw });
await new Promise((r) => setTimeout(r, 2000));
const run = async (label, mode) => {
  const r = await page.evaluate((mode) => new Promise((res) => {
    window.__pauseLoop = true;
    const g = window.__game; const ts = []; const t0 = performance.now(); g.perf._gpuHist.length = 0;
    const f = (t) => {
      if (mode === 'update+render') g.update(1 / 60);
      if (mode === 'sim-only-noRenderUpdates') { const w = g.world; const p = w.props.update, v = w.veg.update, st = w.store.update; w.props.update = () => {}; w.veg.update = () => {}; w.store.update = () => {}; g.update(1 / 60); w.props.update = p; w.veg.update = v; w.store.update = st; }
      g.render(1 / 60); ts.push(t);
      if (t - t0 < 3500) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ fps: +(d.length / ((ts[ts.length - 1] - ts[0]) / 1000)).toFixed(1), p50: +d[Math.floor(d.length / 2)].toFixed(1), gpuMed: +g.perf.gpuMed().toFixed(1), gpuP95: +g.perf.gpuP95().toFixed(1) }); }
    };
    requestAnimationFrame(f);
  }), mode);
  console.log(label.padEnd(34), JSON.stringify(r));
};
await run('render only', 'render');
await page.evaluate(() => { const src = 'let x=0; setInterval(()=>{},1000); function spin(){ const t=performance.now(); while(performance.now()-t<9){ for(let i=0;i<1e5;i++) x+=Math.sqrt(i); } setTimeout(spin,4);} spin();'; window.__w = []; for (let i = 0; i < 3; i++) window.__w.push(new Worker(URL.createObjectURL(new Blob([src])))); });
await run('render only + 3 spinning worker threads', 'render');
await page.evaluate(() => { window.__w.forEach((w) => w.terminate()); });
await run('render only (again, workers stopped)', 'render');
await browser.close(); if (server) server.kill(); process.exit(0);
