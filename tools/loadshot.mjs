import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launch, shot, sleep } from './harness.mjs';
const { page, close, logs } = await launch({ width: Number(process.env.W || 1280), height: Number(process.env.H || 720), query: process.env.Q || '' });
page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 400)));
page.on('worker', (w) => console.log('worker started', w.url()));
await page.reload();
await sleep(Number(process.env.WAIT || 7000));
const n = Number(process.env.SHOTS || 1);
for (let i = 0; i < n; i++) { console.log(await shot(page, (process.env.NAME || 'loading3d') + (n > 1 ? i : ''))); if (i < n - 1) await sleep(Number(process.env.GAP || 2500)); }
await close(); process.exit(0);
