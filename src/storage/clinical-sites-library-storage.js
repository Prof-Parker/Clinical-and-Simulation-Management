/**
 * Standalone site library file storage.
 */

import * as SiteLibrary from '../core/clinical-sites-library.js';
import * as Storage from './semester-storage.js';
import * as FileKind from '../core/file-kind.js';
import { assertKindOrThrow, guardedWrite, writeTextToHandle } from './guarded-write.js';
import { hybridSave } from './hybrid-save.js';
import * as ProgramData from './program-data.js';
import { state } from '../core/state.js';

var CACHE_KEY = 'clinicalSitesLibraryData';
  var HANDLE_KEY = 'clinicalSitesLibraryFileHandle';
  var DIR_HANDLE_KEY = 'clinicalSitesDirHandle';
  var KIND = FileKind.FILE_KINDS.CLINICAL_SITES_LIBRARY;

  function idbGet(key) { return Storage._idbGet(key); }
  function idbSet(key, val) { return Storage._idbSet(key, val); }
  function supportsFS() { return Storage && Storage.supportsFS(); }

  function createEmpty() {
    return {
      meta: {
        version: 1,
        fileKind: KIND,
        lastModified: new Date().toISOString()
      },
      sites: []
    };
  }

  function migrate(raw) {
    if (!raw || !Array.isArray(raw.sites)) return createEmpty();
    if (!raw.meta || typeof raw.meta !== 'object') raw.meta = { version: 1 };
    raw.sites = raw.sites.filter(function (s) { return s && typeof s === 'object'; });
    return raw;
  }

  function getRoot() {
    return state.clinicalSitesLibraryRoot;
  }

  function setRoot(root) {
    state.clinicalSitesLibraryRoot = migrate(root);
    if (SiteLibrary.setStandaloneOverlay) {
      SiteLibrary.setStandaloneOverlay(state.clinicalSitesLibraryRoot);
    }
  }

  function isReady() {
    return !!state.clinicalSitesLibraryRoot;
  }

  function serialize(root) {
    root.meta.lastModified = new Date().toISOString();
    FileKind.stampFileKind(root, KIND);
    return JSON.stringify(root, null, 2);
  }

  function writeToHandle(handle, root) {
    return guardedWrite(handle, KIND, function () {
      return writeTextToHandle(handle, serialize(root));
    });
  }

  function readFromHandle(handle) {
    return handle.getFile().then(function (f) { return f.text(); }).then(function (t) {
      return assertKindOrThrow(migrate(JSON.parse(t)), KIND, {
        fileName: handle.name,
        suggestedName: 'clinical-sites-library.json'
      });
    });
  }

  function saveCurrent() {
    var root = getRoot();
    if (!root) return Promise.resolve();
    if (state.clinicalSitesLibraryFileHandle) {
      return writeToHandle(state.clinicalSitesLibraryFileHandle, root).then(function () {
        return idbSet(CACHE_KEY, root);
      });
    }
    if (ProgramData.isProgramDataConnected()) {
      return ProgramData.writeRelative(
        ProgramData.PATHS.CLINICAL_SITES,
        KIND,
        function () { return serialize(root); }
      ).then(function (result) {
        state.clinicalSitesLibraryFileHandle = result.handle;
        return idbSet(HANDLE_KEY, result.handle).then(function () {
          return idbSet(CACHE_KEY, root);
        });
      });
    }
    return Promise.resolve();
  }

  function openFilePicker() {
    if (!supportsFS()) return Promise.reject(new Error('FS unavailable'));
    return window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handles) {
      var handle = handles[0];
      return readFromHandle(handle).then(function (root) {
        state.clinicalSitesLibraryFileHandle = handle;
        setRoot(root);
        return idbSet(HANDLE_KEY, handle).then(function () {
          return idbSet(CACHE_KEY, root).then(function () { return root; });
        });
      });
    });
  }

  function createFilePicker() {
    var root = createEmpty();
    if (SiteLibrary) {
      root.sites = SiteLibrary.list().map(function (s) {
        return { id: s.id, name: s.name, shortName: s.shortName, contentTags: s.contentTags.slice() };
      });
    }
    if (!supportsFS()) {
      var blob = new Blob([serialize(root)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'clinical-sites-library.json';
      a.click();
      URL.revokeObjectURL(a.href);
      setRoot(root);
      return Promise.resolve(root);
    }
    return hybridSave({
      kind: KIND,
      suggestedName: 'clinical-sites-library.json',
      fileHandleKey: HANDLE_KEY,
      dirHandleKey: DIR_HANDLE_KEY,
      idbGet: idbGet,
      idbSet: idbSet,
      getFileHandle: function () { return state.clinicalSitesLibraryFileHandle; },
      getDirHandle: function () { return state.clinicalSitesDirHandle; },
      allowDownload: true,
      write: function (handle) {
        return writeToHandle(handle, root);
      },
      download: function () {
        var b = new Blob([serialize(root)], { type: 'application/json' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(b);
        link.download = 'clinical-sites-library.json';
        link.click();
        URL.revokeObjectURL(link.href);
        setRoot(root);
      },
      onPersisted: function (handle, dirHandle) {
        if (!handle) return Promise.resolve(root);
        state.clinicalSitesLibraryFileHandle = handle;
        if (dirHandle) state.clinicalSitesDirHandle = dirHandle;
        setRoot(root);
        return idbSet(CACHE_KEY, root).then(function () { return root; });
      }
    }, {
      forceChooser: true,
      title: 'Clinical sites library',
      message: 'Create, overwrite (validated before write), save to a folder, or download.'
    }).then(function () { return root; });
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
        state.clinicalSitesLibraryFileHandle = handle;
        return readFromHandle(handle);
      });
    }).then(function (raw) {
      if (raw) setRoot(raw);
      return getRoot();
    }).catch(function () { return null; });
  }

export {
  init,
  isReady,
  getRoot,
  setRoot,
  createEmpty,
  openFilePicker,
  createFilePicker,
  saveCurrent,
  migrateFromSemesterOverlay,
  serialize
};
