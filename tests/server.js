import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const assets = new Map([
  ['index.html', '.html'], ['styles.css', '.css'],
  ['src/app.js', '.js'], ['src/dates.js', '.js'],
  ['src/records.js', '.js'], ['src/storage.js', '.js'], ['src/history.js', '.js']
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let path = url.pathname;
  if (path.startsWith('/phase/')) path = path.slice('/phase'.length);
  if (path === '/' || path === '/index.html') path = '/index.html';
  const asset = path.slice(1);
  if (!assets.has(asset) || request.method !== 'GET') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  try {
    const body = await readFile(resolve(root, asset));
    response.writeHead(200, { 'Content-Type': `${types[assets.get(asset)]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(500);
    response.end('Unable to read static asset');
  }
});

server.listen(Number(process.env.PORT ?? 4173), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close());
}
