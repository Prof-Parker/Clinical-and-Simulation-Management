/* global App */
var App = App || {};
App.Theme = (function () {
  var STORAGE_KEY = 'regnThemePreference';
  var THEME_COLOR_LIGHT = '#2563eb';
  var THEME_COLOR_DARK = '#0f172a';
  var systemQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  function getPreference() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch (e) { /* ignore */ }
    return 'system';
  }

  function setPreference(value) {
    try {
      if (value === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
    } catch (e) { /* ignore */ }
  }

  function isDarkResolved() {
    var pref = getPreference();
    if (pref === 'dark') return true;
    if (pref === 'light') return false;
    return systemQuery ? systemQuery.matches : false;
  }

  function updateMenuLabel() {
    var btn = document.getElementById('darkModeToggle');
    if (!btn) return;
    btn.textContent = isDarkResolved() ? 'Switch to light mode' : 'Switch to dark mode';
  }

  function apply() {
    var dark = isDarkResolved();
    document.documentElement.classList.toggle('dark', dark);
    var meta = document.getElementById('themeColorMeta');
    if (meta) meta.setAttribute('content', dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
    updateMenuLabel();
  }

  function migrateLegacyFilePreference(fileRoot) {
    if (!fileRoot || !fileRoot.meta) return;
    var legacy = fileRoot.meta.darkMode;
    if (typeof legacy !== 'boolean') return;
    try {
      if (localStorage.getItem(STORAGE_KEY) == null) {
        setPreference(legacy ? 'dark' : 'light');
      }
    } catch (e) { /* ignore */ }
    delete fileRoot.meta.darkMode;
  }

  function init(fileRoot) {
    migrateLegacyFilePreference(fileRoot);
    apply();
    if (systemQuery && systemQuery.addEventListener) {
      systemQuery.addEventListener('change', function () {
        if (getPreference() === 'system') apply();
      });
    } else if (systemQuery && systemQuery.addListener) {
      systemQuery.addListener(function () {
        if (getPreference() === 'system') apply();
      });
    }
  }

  function toggle() {
    setPreference(isDarkResolved() ? 'light' : 'dark');
    apply();
  }

  return {
    init: init,
    toggle: toggle,
    apply: apply,
    getPreference: getPreference,
    isDarkResolved: isDarkResolved
  };
})();
