/**
 * Vite middleware: read/write gitignored mock-onedrive/ for npm run dev:start.
 * Only active during `vite` serve — never in production builds.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var ROOT = path.join(__dirname, '..', 'mock-onedrive');
var PREFIX = '/__dev__/mock-onedrive';

function safeResolve(relPath) {
  var cleaned = String(relPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..')) return null;
  var full = path.resolve(ROOT, cleaned);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function handleList(relPath, res) {
  var full = safeResolve(relPath || '.');
  if (!full) return sendJson(res, 400, { error: 'Invalid path' });
  if (relPath && !fs.existsSync(full)) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  var target = relPath ? full : ROOT;
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    return sendJson(res, 404, { error: 'Not a directory' });
  }
  var entries = fs.readdirSync(target, { withFileTypes: true }).map(function (d) {
    return {
      name: d.name,
      kind: d.isDirectory() ? 'directory' : 'file'
    };
  });
  sendJson(res, 200, { entries: entries });
}

function handleFileGet(relPath, res) {
  var full = safeResolve(relPath);
  if (!full) return sendJson(res, 400, { error: 'Invalid path' });
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(full).pipe(res);
}

function handleFilePut(relPath, req, res) {
  var full = safeResolve(relPath);
  if (!full) return sendJson(res, 400, { error: 'Invalid path' });
  return readBody(req).then(function (text) {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text, 'utf8');
    sendJson(res, 200, { ok: true });
  }).catch(function (err) {
    sendJson(res, 500, { error: (err && err.message) || 'Write failed' });
  });
}

function handleExists(relPath, res) {
  var full = safeResolve(relPath);
  if (!full) return sendJson(res, 400, { error: 'Invalid path' });
  if (!fs.existsSync(full)) return sendJson(res, 200, { exists: false });
  var st = fs.statSync(full);
  sendJson(res, 200, {
    exists: true,
    kind: st.isDirectory() ? 'directory' : 'file'
  });
}

export function mockOneDrivePlugin() {
  return {
    name: 'mock-onedrive-dev',
    configureServer: function (server) {
      server.middlewares.use(function (req, res, next) {
        var url = req.url || '';
        if (!url.startsWith(PREFIX)) return next();
        var parsed = new URL(url, 'http://localhost');
        var route = parsed.pathname.slice(PREFIX.length) || '/';
        var rel = parsed.searchParams.get('path') || '';

        if (route === '/list' && req.method === 'GET') {
          return handleList(rel, res);
        }
        if (route === '/file' && req.method === 'GET') {
          return handleFileGet(rel, res);
        }
        if (route === '/file' && req.method === 'PUT') {
          return handleFilePut(rel, req, res);
        }
        if (route === '/exists' && req.method === 'GET') {
          return handleExists(rel, res);
        }
        if (route === '/health' && req.method === 'GET') {
          return sendJson(res, 200, {
            ok: true,
            rootExists: fs.existsSync(ROOT)
          });
        }
        sendJson(res, 404, { error: 'Unknown mock-onedrive route' });
      });
    }
  };
}
