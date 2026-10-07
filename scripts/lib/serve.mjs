/**
 * A throwaway static server over the repo, for the builders that render in
 * headless Chrome (share cards, the image pipeline). Pages load fonts and
 * images from it exactly as the site would.
 *
 *   const srv = await serve({ '/__card.html': (url) => html });
 *   ... srv.origin ...
 *   srv.close();
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.json': 'application/json',
};

export async function serve(routes = {}, root = ROOT) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (routes[u.pathname]) {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
      return res.end(routes[u.pathname](u));
    }
    const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
