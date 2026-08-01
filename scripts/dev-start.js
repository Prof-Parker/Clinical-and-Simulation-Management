#!/usr/bin/env node

/**
 * Quick local test launcher:
 *   npm run dev:start
 *
 * 1. Seeds mock-onedrive/ if missing
 * 2. Starts Vite on http://localhost:5173 (or reuses it)
 * 3. Opens the browser with ?devStart=1 (auto ProgramData + engineer login)
 */

import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var ROOT = path.join(__dirname, '..');
var MOCK = path.join(ROOT, 'mock-onedrive');
var PORT = Number(process.env.PORT || 5173);
var APP_URL = 'http://localhost:' + PORT + '/?devStart=1';
var HEALTH_URL = 'http://localhost:' + PORT + '/__dev__/mock-onedrive/health';

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function runNode(scriptRel) {
  return new Promise(function (resolve, reject) {
    var child = spawn(process.execPath, [path.join(ROOT, scriptRel)], {
      cwd: ROOT,
      stdio: 'inherit'
    });
    child.on('exit', function (code) {
      if (code === 0) resolve();
      else reject(new Error(scriptRel + ' exited with code ' + code));
    });
    child.on('error', reject);
  });
}

async function ensureSeed() {
  var registry = path.join(MOCK, 'users', 'users-registry.json');
  if (fs.existsSync(registry)) {
    console.log('mock-onedrive/ ready');
    return;
  }
  console.log('Seeding mock-onedrive/…');
  await runNode('scripts/seed-mock-onedrive.js');
}

async function isServerReady() {
  try {
    var res = await fetch(HEALTH_URL);
    if (!res.ok) return false;
    var body = await res.json();
    return !!(body && body.ok && body.rootExists);
  } catch (_) {
    return false;
  }
}

async function waitForServer(timeoutMs) {
  var start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerReady()) return;
    await sleep(250);
  }
  throw new Error('Dev server did not become ready on port ' + PORT);
}

function openBrowser(url) {
  var cmd;
  if (process.platform === 'win32') {
    cmd = 'cmd /c start "" "' + url + '"';
  } else if (process.platform === 'darwin') {
    cmd = 'open "' + url + '"';
  } else {
    cmd = 'xdg-open "' + url + '"';
  }
  exec(cmd, function (err) {
    if (err) console.warn('Could not open browser automatically:', err.message);
    else console.log('Opened ' + url);
  });
}

function startVite() {
  console.log('Starting Vite on http://localhost:' + PORT + '…');
  var child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', '--port', String(PORT), '--strictPort'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: Object.assign({}, process.env)
    }
  );
  child.on('error', function (err) {
    console.error('Failed to start Vite:', err.message);
    process.exit(1);
  });
  return child;
}

async function main() {
  await ensureSeed();

  var alreadyUp = await isServerReady();
  var viteChild = null;
  if (!alreadyUp) {
    viteChild = startVite();
    await waitForServer(90000);
  } else {
    console.log('Reusing existing Vite server on port ' + PORT);
  }

  openBrowser(APP_URL);
  console.log('Quick start: mock-onedrive + engineer@example.edu / engineer-pass');

  if (viteChild) {
    viteChild.on('exit', function (code) {
      process.exit(code == null ? 0 : code);
    });
    process.on('SIGINT', function () {
      viteChild.kill('SIGINT');
    });
    process.on('SIGTERM', function () {
      viteChild.kill('SIGTERM');
    });
  }
}

main().catch(function (err) {
  console.error(err.message || err);
  process.exit(1);
});
