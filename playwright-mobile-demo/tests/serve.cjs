// Tiny static server: node tests/serve.cjs <root> <port>. No dependencies.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(process.argv[2] || '.'), port = Number(process.argv[3]) || 8788;
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript',
  css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  svg: 'image/svg+xml', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', txt: 'text/plain', md: 'text/plain' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  let st; try { st = fs.statSync(file); } catch { res.writeHead(404); return res.end('not found'); }
  if (st.isDirectory()) {
    if (!url.pathname.endsWith('/')) { res.writeHead(301, { location: url.pathname + '/' + url.search }); return res.end(); }
    file = path.join(file, 'index.html');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': types[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}`));
