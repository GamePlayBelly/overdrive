import { launch, sleep } from './harness.mjs';
const { page, close, logs } = await launch({ width: 1280, height: 720, query: process.env.Q || '?dev=1' });
await sleep(Number(process.env.WAIT || 25000));
console.log('LOGS', logs.slice(0, 20).join('\n'));
console.log(await page.evaluate(() => JSON.stringify({ mode: window.__app?.mode, vehicle: !!window.__game?.player?.vehicle, boot: document.getElementById('boot')?.style.display, msg: document.querySelector('.boot-status .msg')?.textContent })));
await close(); process.exit(0);
