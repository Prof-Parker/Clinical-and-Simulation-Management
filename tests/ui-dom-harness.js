/**
 * jsdom harness for UI smoke tests — loads index.html and stubs browser APIs.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

var projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export function installBrowserStubs() {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = function () {
      return {
        matches: false,
        media: '',
        addListener: function () {},
        removeListener: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () { return false; }
      };
    };
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {};
  }

  HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(function () { return { width: 0 }; }),
      transform: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn()
    };
  };
}

export function loadIndexHtml() {
  var html = readFileSync(join(projectRoot, 'index.html'), 'utf8');
  html = html.replace(/<script type="module"[^>]*><\/script>\s*/i, '');
  document.documentElement.innerHTML = html;
  installBrowserStubs();
}

export function mockEngineerSession() {
  return {
    userId: 'usr_engineer_test',
    name: 'Program Engineer',
    email: 'engineer@example.edu',
    role: 'program_engineer',
    validated: true,
    validatedAt: new Date().toISOString()
  };
}
