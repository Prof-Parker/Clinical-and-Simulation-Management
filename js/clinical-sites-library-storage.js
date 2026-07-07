/* global App */
var App = App || {};

App.ClinicalSitesLibraryStorage = (function () {
  var CACHE_KEY = 'clinicalSitesLibraryData';
  var HANDLE_KEY = 'clinicalSitesLibraryFileHandle';

  function idbGet(key) { return App.Storage._idbGet(key); }
  function idbSet(key, val) { return App.Storage._idbSet(key, val); }
  function supportsFS() { return App.Storage && App.Storage.supportsFS(); }

  function createEmpty() {
    return { meta: { version: 1, lastModified: new Date().toISOString() }, sites: [] };
  }

  function migrate(raw) {
    if (!raw || !raw.sites) return createEmpty();
    if (!raw.meta) raw.meta = { version: 1 };
    return raw;
  }

  function getRoot() {
    return App.state.clinicalSitesLibraryRoot;
  }

  function setRoot(root) {
    App.state.clinicalSitesLibraryRoot = migrate(root);
    if (App.SiteLibrary && App.SiteLibrary.setStandaloneOverlay) {
      App.SiteLibrary.setStandaloneOverlay(App.state.clinicalSitesLibraryRoot);
    }
  }

  function isReady() {
    return !!App.state.clinicalSitesLibraryRoot;
  }

  function serialize(root) {
    root.meta.lastModified = new Date().toISOString();
    return JSON.stringify(root, null, 2);
  }

  function writeToHandle(handle, root) {
    return handle.createWritable().then(function (w) {
      return w.write(serialize(root)).then(function () { return w.close(); });
    });
  }

  function readFromHandle(handle) {
    return handle.getFile().then(function (f) { return f.text(); }).then(function (t) {
      return migrate(JSON.parse(t));
    });
  }

  function saveCurrent() {
    var root = getRoot();
    if (!root || !App.state.clinicalSitesLibraryFileHandle) return Promise.resolve();
    return writeToHandle(App.state.clinicalSitesLibraryFileHandle, root).then(function () {
      return idbSet(CACHE_KEY, root);
    });
  }

  function openFilePicker() {
    if (!supportsFS()) return Promise.reject(new Error('FS unavailable'));
    return window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handles) {
      var handle = handles[0];
      App.state.clinicalSitesLibraryFileHandle = handle;
      return idbSet(HANDLE_KEY, handle).then(function () {
        return readFromHandle(handle);
      }).then(function (root) {
        setRoot(root);
        return idbSet(CACHE_KEY, root).then(function () { return root; });
      });
    });
  }

  function createFilePicker() {
    var root = createEmpty();
    if (App.SiteLibrary) {
      root.sites = App.SiteLibrary.list().map(function (s) {
        return { id: s.id, name: s.name, shortName: s.shortName, contentTags: s.contentTags.slice() };
      });
    }
    return window.showSaveFilePicker({
      suggestedName: 'clinical-sites-library.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handle) {
      App.state.clinicalSitesLibraryFileHandle = handle;
      setRoot(root);
      return idbSet(HANDLE_KEY, handle).then(function () {
        return writeToHandle(handle, root).then(function () {
          return idbSet(CACHE_KEY, root).then(function () { return root; });
        });
      });
    });
  }

  function migrateFromSemesterOverlay(fileRoot) {
    if (!fileRoot || !fileRoot.meta || !fileRoot.meta.siteLibrary) return false;
    var overlay = fileRoot.meta.siteLibrary;
    if (!overlay.sites || !overlay.sites.length) return false;
    setRoot({ meta: { version: 1 }, sites: overlay.sites.slice() });
    return true;
  }

  function init() {
    return idbGet(HANDLE_KEY).then(function (handle) {
      if (!handle || !supportsFS()) return idbGet(CACHE_KEY);
      return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
        if (perm !== 'granted') return idbGet(CACHE_KEY);
        App.state.clinicalSitesLibraryFileHandle = handle;
        return readFromHandle(handle);
      });
    }).then(function (raw) {
      if (raw) setRoot(raw);
      return getRoot();
    }).catch(function () { return null; });
  }

  return {
    init: init,
    isReady: isReady,
    getRoot: getRoot,
    setRoot: setRoot,
    createEmpty: createEmpty,
    openFilePicker: openFilePicker,
    createFilePicker: createFilePicker,
    saveCurrent: saveCurrent,
    migrateFromSemesterOverlay: migrateFromSemesterOverlay,
    serialize: serialize
  };
})();
