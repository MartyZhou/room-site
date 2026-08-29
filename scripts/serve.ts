#!/usr/bin/env -S npx tsx
/**
 * Tiny static file server for local development (replaces `python3 -m
 * http.server`). Serves the repo root so content/*.json and prose/*.md are
 * fetchable, matching the deployed static-hosting behavior.
 *
 * Usage:
 *   npm run serve -- [port]   (defaults to 4321)
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 4321;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0] || '/');
  const relative = normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(REPO, relative);

  // Guard against path traversal escaping the repo root.
  if (!filePath.startsWith(REPO + sep) && filePath !== REPO) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Serving ${REPO} at http://localhost:${PORT}/`);
});
