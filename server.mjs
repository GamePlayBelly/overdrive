import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachGameServer } from './server/game-server.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || process.argv[2] || 5466);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/debug/shot' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const b64 = body.slice(body.indexOf(',') + 1);
      const name = (url.searchParams.get('name') || 'shot').replace(/[^\w-]/g, '');
      fs.mkdirSync(path.join(ROOT, 'data', 'shots'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'data', 'shots', name + '.jpg'), Buffer.from(b64, 'base64'));
      res.writeHead(200).end('ok');
    });
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  // /w/<path>: same file with the bare 'three' specifiers made absolute, because import maps do not apply inside workers
  const asWorker = p.startsWith('/w/');
  if (asWorker) p = p.slice(2);
  const file = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, file).split(path.sep)[0];
  if (!file.startsWith(ROOT) || rel === 'data' || rel === 'server' || rel.startsWith('.')) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('not found'); return; }
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
    if (asWorker && path.extname(file) === '.js') {
      fs.readFile(file, 'utf8', (e2, src) => {
        if (e2) { res.writeHead(500).end(); return; }
        res.writeHead(200, headers).end(src.replace(/(from\s*|import\s*\(\s*|import\s+)(['"])three(\/addons\/)?/g, (m, a, q, ad) => a + q + (ad ? '/node_modules/three/examples/jsm/' : '/node_modules/three/build/three.module.js')));
      });
      return;
    }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
});

attachGameServer(server, path.join(ROOT, 'data'));
server.listen(PORT, () => console.log(`Real World — Riverton County  http://localhost:${PORT}`));
