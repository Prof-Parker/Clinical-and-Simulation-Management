/**
 * Minimal browser globals for Node scripts that import core modules
 * which transitively load UI (theme/state/chrome → jspdf) at module evaluation.
 */
import { Buffer } from 'buffer';

function atobPolyfill(data) {
  return Buffer.from(String(data), 'base64').toString('binary');
}

function btoaPolyfill(data) {
  return Buffer.from(String(data), 'binary').toString('base64');
}

if (typeof globalThis.atob !== 'function') globalThis.atob = atobPolyfill;
if (typeof globalThis.btoa !== 'function') globalThis.btoa = btoaPolyfill;

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    matchMedia: function () {
      return {
        matches: false,
        media: '',
        addListener: function () {},
        removeListener: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () { return false; }
      };
    },
    localStorage: {
      getItem: function () { return null; },
      setItem: function () {},
      removeItem: function () {},
      clear: function () {}
    },
    document: {
      documentElement: {
        getAttribute: function () { return null; },
        setAttribute: function () {}
      },
      body: {
        classList: {
          add: function () {},
          remove: function () {},
          contains: function () { return false; }
        }
      },
      createElement: function () {
        return {
          style: {},
          setAttribute: function () {},
          appendChild: function () {},
          getContext: function () { return null; }
        };
      },
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {}
    },
    atob: atobPolyfill,
    btoa: btoaPolyfill,
    console: globalThis.console,
    navigator: { userAgent: 'node' },
    location: { href: 'http://localhost/' }
  };
} else {
  if (typeof globalThis.window.atob !== 'function') {
    globalThis.window.atob = atobPolyfill;
  }
  if (typeof globalThis.window.btoa !== 'function') {
    globalThis.window.btoa = btoaPolyfill;
  }
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = globalThis.window.document;
}

if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis.window;
}

if (typeof globalThis.global === 'undefined') {
  globalThis.global = globalThis;
}
