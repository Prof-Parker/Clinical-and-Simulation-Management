/**
 * Global browser API stubs for Vitest jsdom (loaded before test modules).
 */

import { vi } from 'vitest';

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(function (query) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      };
    })
  });

  HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      measureText: vi.fn(function () { return { width: 0 }; }),
      fillText: vi.fn()
    };
  };

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
}
