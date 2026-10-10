// Static file server for the local demo. No dependencies.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 4747;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  // Only src/ and data/ are served.
  const rel = path === '/' ? 'src/index.html' : path.startsWith('/data/') ? path.slice(1) : join('src', path);
  const file = normalize(join(root, rel));
  const allowed = [join(root, 'src') + sep, join(root, 'data') + sep];
  try {
    if (!allowed.some((dir) => file.startsWith(dir))) throw new Error('outside root');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Let's Code demo running at http://localhost:${port}`);
});
