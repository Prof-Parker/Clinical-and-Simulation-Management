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

  function idbClear() {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  var LEGACY_LOCAL_STORAGE_KEYS = [
    'nursingWeekDates',
    'nursingStudentNames',
    'nursingSimRoles'
  ];

  function clearLegacyLocalStorage() {
    LEGACY_LOCAL_STORAGE_KEYS.forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    });
  }

  function clearAndRestoreDefaults() {
    return idbSet(CACHE_KEY, null).then(function () {
      return idbSet(HANDLE_KEY, null);
    }).then(function () {
      return setMeta({ lastImportedFileName: '', lastSavedAt: '', hasLoadedData: false });
    }).then(function () {
      clearLegacyLocalStorage();
      var fileRoot = App.DataModel.createDefaultFile();
      var sem = fileRoot.semesters.find(function (s) {
        return s.id === fileRoot.meta.activeSemesterId;
      }) || fileRoot.semesters[0];
      App.CalendarEngine.rebuildWeeks(sem);
      if (App.Scheduler) App.Scheduler.regenerateAll(sem);
      App.state.fileHandle = null;
      App.state.fileName = null;
      if (App.Theme) App.Theme.apply();
      App.setFileRoot(fileRoot);
      App.markClean();
      return cacheData(fileRoot).then(function () {
        updateStatusUI();
        return fileRoot;
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
    var exportRoot = App.SimFacultyData
      ? App.SimFacultyData.cloneFileRootWithoutRoles(fileRoot)
      : JSON.parse(JSON.stringify(fileRoot));
    exportRoot.meta.lastModified = new Date().toISOString();
    if (App.state.data && App.state.data.meta) {
      App.state.data.meta.lastModified = exportRoot.meta.lastModified;
    }
    if (exportRoot.meta) delete exportRoot.meta.darkMode;
    return JSON.stringify(exportRoot, null, 2);
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
          return applyLoadedFileRoot(fileRoot);
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

  function isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function configureImportInput() {
    var input = document.getElementById('importFileInput');
    if (!input) return;
    // iOS Files / OneDrive often mislabels .json MIME types; a strict accept filter hides them.
    if (isIOSDevice()) {
      input.removeAttribute('accept');
    } else {
      input.setAttribute('accept', '.json,application/json');
    }
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
      return applyLoadedFileRoot(data);
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
      App.UI.showAlert('Export backup', 'Save the downloaded file to college OneDrive (Files app → OneDrive) to back up your semester data.');
    }
  }

  function applyLoadedFileRoot(fileRoot) {
    if (App.SimFacultyStorage) {
      App.SimFacultyData.stripRolesFromFileRoot(fileRoot);
      var migrated = App.SimFacultyStorage.migrateFromSemesterFile(fileRoot);
      if (migrated) App.state.dirty = true;
    } else {
      App.SimFacultyData.stripRolesFromFileRoot(fileRoot);
    }
    return fileRoot;
  }

  function updateStatusUI() {
    var el = document.getElementById('fileStatus');
    if (!el) return;

    Promise.all([
      getMeta(),
      App.SimFacultyStorage ? App.SimFacultyStorage._getMeta() : Promise.resolve(null)
    ]).then(function (results) {
      var meta = results[0];
      var facultyMeta = results[1];
      var dirty = App.state.dirty;
      var name = App.state.fileName;
      var savedLabel = formatSavedTime(meta.lastSavedAt);
      var parts = [];

      if (supportsFS() && App.state.fileHandle) {
        parts.push(dirty
          ? 'Unsaved — ' + (name || 'semester file')
          : 'Connected to OneDrive: ' + (name || 'semester file') +
            (savedLabel ? ' · saved ' + savedLabel : ''));
        el.className = dirty ? 'file-status dirty' : 'file-status connected';
      } else if (dirty) {
        parts.push('Unsaved on this device — export backup to OneDrive' +
          (name ? ' (' + name + ')' : ''));
        el.className = 'file-status dirty';
      } else if (meta.hasLoadedData) {
        parts.push('Saved on this device' +
          (name || meta.lastImportedFileName ? ': ' + (name || meta.lastImportedFileName) : '') +
          (savedLabel ? ' · ' + savedLabel : ''));
        el.className = 'file-status connected';
      } else {
        parts.push('Open a semester file from OneDrive to begin');
        el.className = 'file-status';
      }

      if (App.SimFacultyStorage && App.SimFacultyStorage.isReady()) {
        var facultyName = App.state.simFacultyFileName ||
          (facultyMeta && facultyMeta.lastImportedFileName) ||
          'sim faculty file';
        var facultyDirty = App.state.simFacultyDirty ? ' (unsaved)' : '';
        parts.push('Sim faculty: ' + facultyName + facultyDirty);
      }

      el.textContent = parts.join(' · ');
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
      if (supportsFS() || (!App.state.dirty && !App.state.simFacultyDirty)) return;
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
    shouldShowOnedriveBanner: shouldShowOnedriveBanner,
    configureImportInput: configureImportInput,
    isIOSDevice: isIOSDevice,
    clearAndRestoreDefaults: clearAndRestoreDefaults,
    applyLoadedFileRoot: applyLoadedFileRoot,
    _idbGet: idbGet,
    _idbSet: idbSet
  };
})();
