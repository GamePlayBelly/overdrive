import { chromium } from 'playwright-core';
for (const headless of [true, false]) {
  const browser = await chromium.launch({ channel: 'msedge', headless, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('data:text/html,<body style="margin:0"><canvas id=c width=1280 height=720></canvas></body>');
  const r = await page.evaluate(() => new Promise((res) => { const ts = []; const cv = document.getElementById('c'); const gl = cv.getContext('webgl2'); const f = (t) => { gl.clearColor(Math.random(), 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); ts.push(t); if (ts.length < 240) requestAnimationFrame(f); else { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ p10: +d[24].toFixed(1), p50: +d[120].toFixed(1), p90: +d[216].toFixed(1) }); } }; requestAnimationFrame(f); }));
  console.log(headless ? 'headless' : 'headed', JSON.stringify(r));
  await browser.close();
}
process.exit(0);
