/* global App */
var App = App || {};

App.Storage = (function () {
  var DB_NAME = 'regnTrackerDB';
  var STORE = 'handles';
  var CACHE_KEY = 'semesterData';
  var HANDLE_KEY = 'fileHandle';
  var META_KEY = 'storageMeta';

  function supportsFS() {
    return typeof window.showOpenFilePicker === 'function';
  }

  function openIDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function (e) {
        e.target.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet(key) {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbSet(key, val) {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(val, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getMeta() {
    return idbGet(META_KEY).then(function (m) {
      return m || { lastImportedFileName: '', lastSavedAt: '', hasLoadedData: false };
    });
  }

  function setMeta(partial) {
    return getMeta().then(function (meta) {
      var next = Object.assign({}, meta, partial);
      return idbSet(META_KEY, next).then(function () { return next; });
    });
  }

  function formatSavedTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function serialize(fileRoot) {
    App.syncSemesterToFile();
    fileRoot.meta.lastModified = new Date().toISOString();
    if (App.state.data && App.state.data.meta) {
      App.state.data.meta.lastModified = fileRoot.meta.lastModified;
    }
    return JSON.stringify(fileRoot, null, 2);
  }

  function cacheData(fileRoot) {
    var now = new Date().toISOString();
    return idbSet(CACHE_KEY, fileRoot).then(function () {
      return setMeta({ lastSavedAt: now, hasLoadedData: true });
    });
  }

  function loadCache() {
    return idbGet(CACHE_KEY);
  }

  function scheduleAutoSave() {
    if (App.state.saveTimer) clearTimeout(App.state.saveTimer);
    App.state.saveTimer = setTimeout(function () {
      saveCurrent();
    }, 600);
  }

  function saveCurrent() {
    var fileRoot = App.getFileRoot();
    if (!fileRoot) return Promise.resolve();
    return cacheData(fileRoot).then(function () {
      if (App.state.fileHandle && supportsFS()) {
        return writeToHandle(App.state.fileHandle, fileRoot).then(function () {
          App.markClean();
          updateStatusUI();
        }).catch(function () { updateStatusUI(); });
      }
      updateStatusUI();
    });
  }

  function writeToHandle(handle, data) {
    return handle.createWritable().then(function (writable) {
      return writable.write(serialize(data)).then(function () {
        return writable.close();
      });
    });
  }

  function readFromHandle(handle) {
    return handle.getFile().then(function (file) {
      return file.text();
    }).then(function (text) {
      return App.DataModel.migrateFile(JSON.parse(text));
    });
  }

  function openFilePicker() {
    if (!supportsFS()) return Promise.reject(new Error('FS API unavailable'));
    return window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    }).then(function (handles) {
      var handle = handles[0];
      App.state.fileHandle = handle;
      App.state.fileName = handle.name;
      return idbSet(HANDLE_KEY, handle).then(function () {
        return readFromHandle(handle);
      }).then(function (fileRoot) {
        return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true }).then(function () {
          return fileRoot;
        });
      });
    });
  }

  function createFilePicker() {
    if (!supportsFS()) return Promise.reject(new Error('FS API unavailable'));
    return window.showSaveFilePicker({
      suggestedName: 'regn-tracker.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handle) {
      App.state.fileHandle = handle;
      App.state.fileName = handle.name;
      return idbSet(HANDLE_KEY, handle).then(function () {
        var fileRoot = App.getFileRoot() || App.DataModel.createDefaultFile();
        return writeToHandle(handle, fileRoot).then(function () {
          return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true }).then(function () {
            return fileRoot;
          });
        });
      });
    });
  }

  function reconnectHandle() {
    if (!supportsFS()) return Promise.resolve(null);
    return idbGet(HANDLE_KEY).then(function (handle) {
      if (!handle) return null;
      return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
        if (perm === 'granted') {
          App.state.fileHandle = handle;
          App.state.fileName = handle.name;
          return readFromHandle(handle);
        }
        return null;
      });
    }).catch(function () { return null; });
  }

  function importFromFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = App.DataModel.migrateFile(JSON.parse(reader.result));
          App.state.fileHandle = null;
          resolve(data);
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    }).then(function (data) {
      return setMeta({
        lastImportedFileName: file.name,
        hasLoadedData: true
      }).then(function () { return data; });
    });
  }

  function exportDownload() {
    var fileRoot = App.getFileRoot();
    if (!fileRoot) return;
    var blob = new Blob([serialize(fileRoot)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = App.state.fileName || 'regn-tracker.json';
    a.click();
    URL.revokeObjectURL(a.href);
    cacheData(fileRoot);
    App.markClean();
    updateStatusUI();
    if (!supportsFS()) {
      alert('Save the downloaded file to college OneDrive (Files app → OneDrive) to back up your semester data.');
    }
  }

  function updateStatusUI() {
    var el = document.getElementById('fileStatus');
    if (!el) return;

    getMeta().then(function (meta) {
      var dirty = App.state.dirty;
      var name = App.state.fileName;
      var savedLabel = formatSavedTime(meta.lastSavedAt);

      if (supportsFS() && App.state.fileHandle) {
        el.textContent = dirty
          ? 'Unsaved — ' + (name || 'semester file')
          : 'Connected to OneDrive: ' + (name || 'semester file') +
            (savedLabel ? ' · saved ' + savedLabel : '');
        el.className = dirty ? 'file-status dirty' : 'file-status connected';
      } else if (dirty) {
        el.textContent = 'Unsaved on this device — export backup to OneDrive' +
          (name ? ' (' + name + ')' : '');
        el.className = 'file-status dirty';
      } else if (meta.hasLoadedData) {
        el.textContent = 'Saved on this device' +
          (name || meta.lastImportedFileName ? ': ' + (name || meta.lastImportedFileName) : '') +
          (savedLabel ? ' · ' + savedLabel : '');
        el.className = 'file-status connected';
      } else {
        el.textContent = 'Open a semester file from OneDrive to begin';
        el.className = 'file-status';
      }
    });
  }

  function shouldShowOnedriveBanner() {
    if (supportsFS()) return false;
    return getMeta().then(function (meta) {
      return !meta.hasLoadedData;
    });
  }

  function initUnloadWarning() {
    window.addEventListener('beforeunload', function (e) {
      if (supportsFS() || !App.state.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  function init() {
    initUnloadWarning();
    var loadedFromFile = false;
    return reconnectHandle().then(function (fromHandle) {
      if (fromHandle) {
        loadedFromFile = true;
        return setMeta({
          hasLoadedData: true,
          lastImportedFileName: App.state.fileName || ''
        }).then(function () { return fromHandle; });
      }
      return loadCache();
    }).then(function (raw) {
      if (!raw) {
        raw = App.DataModel.migrateFromLegacyLocalStorage();
        if (raw) loadedFromFile = true;
      } else {
        loadedFromFile = true;
      }
      var fileRoot = raw ? App.DataModel.migrateFile(raw) : App.DataModel.createDefaultFile();
      var sem = fileRoot.semesters.find(function (s) {
        return s.id === fileRoot.meta.activeSemesterId;
      }) || fileRoot.semesters[0];
      App.CalendarEngine.rebuildWeeks(sem);
      if (needsRegeneration(sem) && App.Scheduler) {
        App.Scheduler.regenerateAll(sem);
      }
      App.setFileRoot(fileRoot);
      App.markClean();
      if (!loadedFromFile) {
        return setMeta({ hasLoadedData: false, lastImportedFileName: '' }).then(function () {
          updateStatusUI();
          document.dispatchEvent(new CustomEvent('AppReady'));
          return fileRoot;
        });
      }
      updateStatusUI();
      document.dispatchEvent(new CustomEvent('AppReady'));
      return fileRoot;
    });
  }

  function needsRegeneration(semester) {
    if (!semester || !semester.students || !semester.students.length) return false;
    return semester.students.every(function (s) {
      return s.schedule.every(function (c) {
        return !c.clinical && !c.sim && !c.makeupClinical && !c.inactive;
      });
    });
  }

  return {
    supportsFS: supportsFS,
    init: init,
    saveCurrent: saveCurrent,
    scheduleAutoSave: scheduleAutoSave,
    openFilePicker: openFilePicker,
    createFilePicker: createFilePicker,
    importFromFile: importFromFile,
    exportDownload: exportDownload,
    updateStatusUI: updateStatusUI,
    cacheData: cacheData,
    shouldShowOnedriveBanner: shouldShowOnedriveBanner
  };
})();
