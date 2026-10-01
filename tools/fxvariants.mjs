import { launch } from './harness.mjs';
const { page, close, logs } = await launch({ width: 960, height: 540 });
await page.waitForFunction(() => window.__game && window.__game.player?.vehicle, null, { timeout: 240000 });
const out = await page.evaluate(async () => {
  window.__pauseLoop = true;
  const g = window.__game, P = g.pipeline, fx = P.fx, res = [];
  g.gov.enabled = false;
  g.sky.time = 11; g.sky.lockWeather = 'sunny'; g.sky.setWeather('sunny', true);
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  const base = { speed: fx.speed, ca: fx.ca, rain: fx.rain, dof: fx.dof, bloom: fx.bloom };
  const cases = [
    ['plain', { samples: 2, bloom: false, fxaa: false, scale: 1 }, {}],
    ['sharp', { samples: 2, bloom: false, fxaa: false, scale: 0.7 }, {}],
    ['bloom', { samples: 4, bloom: true, fxaa: false, scale: 1 }, {}],
    ['fxaa', { samples: 0, bloom: false, fxaa: true, scale: 0.7 }, {}],
    ['speed', { samples: 2, bloom: false, fxaa: false, scale: 0.7 }, { speed: 0.6 }],
    ['ca', { samples: 2, bloom: false, fxaa: false, scale: 1 }, { ca: 0.03 }],
    ['rain', { samples: 2, bloom: false, fxaa: false, scale: 1 }, { rain: 0.8 }],
    ['all', { samples: 0, bloom: true, fxaa: true, scale: 0.7 }, { speed: 0.4, rain: 0.6 }],
  ];
  for (const [name, q, f] of cases) {
    P.setQuality(q); Object.assign(fx, base, f);
    const t0 = performance.now(); g.render(1 / 60); g.render(1 / 60); const ms = performance.now() - t0;
    res.push(name + ' ok ' + ms.toFixed(0) + 'ms ready=' + P.ready.size);
  }
  P.setDepth(true); P.setQuality({ samples: 2, bloom: false, fxaa: false, scale: 1 }); Object.assign(fx, base, { dof: 0.3 }); fx.focus.set(8, 2.5);
  const t0 = performance.now(); g.render(1 / 60); g.render(1 / 60); res.push('dof ok ' + (performance.now() - t0).toFixed(0) + 'ms');
  P.setDepth(false); Object.assign(fx, base);
  return res;
});
console.log(out.join('\n'));
console.log('errors:', logs.filter((l) => /rror|WebGL/.test(l) && !/getImageData/.test(l)).slice(0, 6).join('\n') || 'none');
await close(); process.exit(0);
