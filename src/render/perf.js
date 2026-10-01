// Per-frame GPU (timer query) and CPU timing measured inside the real render loop.
export class Perf {
  constructor(renderer) {
    this.gl = renderer.getContext();
    this.ext = null;
    this.enabled = false;
    this.pending = [];
    this.gpu = 0; this.cpu = 0; this.frame = 0; this.fps = 60;
    this.gpuMax = 0;
    this._cpu0 = 0; this._last = performance.now(); this._acc = 0; this._n = 0;
    this._gpuHist = [];
  }

  enable(on) { this.enabled = on; this.ext = on ? this.gl.getExtension('EXT_disjoint_timer_query_webgl2') : null; }

  begin() {
    this._cpu0 = performance.now();
    if (!this.ext || this.pending.length > 5) return;
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this._q = q;
  }

  end() {
    this.cpu += ((performance.now() - this._cpu0) - this.cpu) * 0.1;
    if (this._q) { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this._q); this._q = null; }
    const now = performance.now();
    const dt = now - this._last; this._last = now;
    this.frame = dt; this.fps += (1000 / Math.max(1, dt) - this.fps) * 0.05;
    this.poll();
  }

  poll() {
    if (!this.ext) return;
    const gl = this.gl;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.gpu += (ms - this.gpu) * 0.1;
        this._gpuHist.push(ms); if (this._gpuHist.length > 60) this._gpuHist.shift();
      }
      gl.deleteQuery(q);
    }
  }

  gpuMed() { if (!this._gpuHist.length) return 0; const a = [...this._gpuHist].sort((x, y) => x - y); return a[Math.floor(a.length * 0.5)]; }

  gpuP95() { if (!this._gpuHist.length) return 0; const a = [...this._gpuHist].sort((x, y) => x - y); return a[Math.floor(a.length * 0.95)]; }
}
