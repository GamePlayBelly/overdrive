import { EngineBank, STRIDE } from './engineDSP.js';

class EngineProcessor extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const n = (opts.processorOptions && opts.processorOptions.voices) || 6;
    this.bank = new EngineBank(sampleRate, n);
    this.port.onmessage = (e) => { if (e.data && e.data.p) this.bank.setParams(e.data.p); };
  }

  process(_in, outs) {
    const out = outs[0];
    const L = out[0], R = out[1] || out[0];
    this.bank.process(L, R, L.length);
    return true;
  }
}
registerProcessor('engine-bank', EngineProcessor);
export { STRIDE };
