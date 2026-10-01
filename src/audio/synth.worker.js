import { manifest } from './synth.js';

self.onmessage = (e) => {
  const sr = e.data.sr;
  for (const [name, kind, arrs] of manifest(sr)) {
    const copies = arrs.map((a) => Float32Array.from(a));
    self.postMessage({ name, kind, arrs: copies }, copies.map((a) => a.buffer));
  }
  self.postMessage({ done: true });
};
