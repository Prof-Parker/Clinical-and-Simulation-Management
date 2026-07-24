/**
 * Minimal browser globals for Node scripts that import core modules
 * which transitively load UI (theme/state) at module evaluation time.
 */
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
      documentElement: { getAttribute: function () { return null; }, setAttribute: function () {} },
      body: { classList: { add: function () {}, remove: function () {}, contains: function () { return false; } } }
    }
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = globalThis.window.document;
}
