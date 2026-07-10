/**
 * Semester file persistence and IndexedDB cache.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as DataModel from '../core/data-model/index.js';
import * as Proposals from '../proposals/proposals.js';
import * as Scheduler from '../core/scheduler/index.js';
import * as SimFacultyData from '../auth/sim-faculty-data.js';
import * as SimFacultyStorage from './sim-faculty-storage.js';
import * as Theme from '../ui/theme.js';
import { getData, getFileRoot, markClean, onStateChange, setFileRoot, state, syncSemesterToFile } from '../core/state.js';
import { refresh } from '../ui/chrome.js';
import { showAlert, showConfirm } from '../ui/dialogs.js';

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
      var fileRoot = DataModel.createDefaultFile();
      var sem = fileRoot.semesters.find(function (s) {
        return s.id === fileRoot.meta.activeSemesterId;
      }) || fileRoot.semesters[0];
      CalendarEngine.rebuildWeeks(sem);
      if (Scheduler) Scheduler.regenerateAll(sem);
      state.fileHandle = null;
      state.fileName = null;
      if (Theme) Theme.apply();
      setFileRoot(fileRoot);
      markClean();
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
    syncSemesterToFile();
    var facultyRoot = SimFacultyStorage ? SimFacultyStorage.getSimFacultyRoot() : null;
    var exportRoot = SimFacultyData && facultyRoot
      ? SimFacultyData.embedSimRolesInFileRoot(fileRoot, facultyRoot)
      : (SimFacultyData
        ? SimFacultyData.cloneFileRootWithoutRoles(fileRoot)
        : JSON.parse(JSON.stringify(fileRoot)));
    exportRoot.meta.lastModified = new Date().toISOString();
    if (state.data && state.data.meta) {
      state.data.meta.lastModified = exportRoot.meta.lastModified;
    }
    if (exportRoot.meta) delete exportRoot.meta.darkMode;
    return JSON.stringify(exportRoot, null, 2);
  }
  function cacheData(fileRoot) {
    var now = new Date().toISOString();
    var toCache = fileRoot;
    if (SimFacultyData && SimFacultyStorage) {
      var facultyRoot = SimFacultyStorage.getSimFacultyRoot();
      if (facultyRoot) {
        toCache = SimFacultyData.embedSimRolesInFileRoot(fileRoot, facultyRoot);
      }
    }
    return idbSet(CACHE_KEY, toCache).then(function () {
      return setMeta({ lastSavedAt: now, hasLoadedData: true });
    });
  }
  function loadCache() {
    return idbGet(CACHE_KEY);
  }
  function scheduleAutoSave() {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      saveCurrent();
    }, 600);
  }
  function saveCurrent(forceOverwrite) {
    var fileRoot = getFileRoot();
    if (!fileRoot) return Promise.resolve();
    if (!state.fileHandle || !supportsFS()) {
      return cacheData(fileRoot).then(function () {
        updateStatusUI();
      });
    }
    return readFromHandle(state.fileHandle).then(function (remote) {
      var remoteRev = (remote.meta && remote.meta.revision) || 1;
      var localRev = (fileRoot.meta && fileRoot.meta.revision) || state.fileLoadedRevision || 1;
      if (!forceOverwrite && state.fileLoadedRevision != null && remoteRev > state.fileLoadedRevision) {
        return new Promise(function (resolve) {
          showConfirm('File changed on disk',
            'The semester file was modified elsewhere. Reload remote copy and lose local unsaved edits?',
            function () {
              setFileRoot(remote);
              state.fileLoadedRevision = remoteRev;
              markClean();
              refresh();
              resolve();
            },
            { confirmLabel: 'Reload', cancelLabel: 'Keep editing' }
          );
        });
      }
      if (remote && remote.semesters && fileRoot.semesters) {
        remote.semesters.forEach(function (remoteSem) {
          var localSem = fileRoot.semesters.find(function (s) { return s.id === remoteSem.id; });
          if (localSem && localSem.proposals && Proposals) {
            remoteSem.proposals = Proposals.mergeProposalLists(localSem.proposals, remoteSem.proposals);
          }
        });
        fileRoot.semesters.forEach(function (localSem) {
          var idx = remote.semesters.findIndex(function (s) { return s.id === localSem.id; });
          if (idx >= 0) remote.semesters[idx] = localSem;
          else remote.semesters.push(localSem);
        });
        fileRoot = remote;
        fileRoot.meta = fileRoot.meta || {};
        fileRoot.meta.activeSemesterId = state.fileRoot.meta.activeSemesterId;
      }
      fileRoot.meta.revision = Math.max(remoteRev, localRev) + 1;
      state.fileLoadedRevision = fileRoot.meta.revision;
      syncSemesterToFile();
      return writeToHandle(state.fileHandle, fileRoot).then(function () {
        state.fileRoot = fileRoot;
        var activeId = fileRoot.meta.activeSemesterId;
        var sem = fileRoot.semesters.find(function (s) { return s.id === activeId; });
        if (sem) state.data = sem;
        return cacheData(fileRoot).then(function () {
          markClean();
          updateStatusUI();
        });
      });
    }).catch(function () {
      return cacheData(fileRoot).then(function () { updateStatusUI(); });
    });
  }
  function writeFileRootToHandle(handle, fileRoot) {
    if (!fileRoot.meta) fileRoot.meta = {};
    if (!fileRoot.meta.revision) fileRoot.meta.revision = 1;
    return writeToHandle(handle, fileRoot);
  }
  function semesterFileTokenFromMeta(season, year, courseId) {
    if (!season || !year || !courseId) return null;
    return (season === 'fall' ? 'F' : 'S') + year + '_' + courseId;
  }
  function supportsDirectoryPicker() {
    return typeof window.showDirectoryPicker === 'function';
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
      return DataModel.migrateFile(JSON.parse(text));
    });
  }
  function openFilePicker() {
    if (!supportsFS()) return Promise.reject(new Error('FS API unavailable'));
    return window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    }).then(function (handles) {
      var handle = handles[0];
      state.fileHandle = handle;
      state.fileName = handle.name;
      return idbSet(HANDLE_KEY, handle).then(function () {
        return readFromHandle(handle);
      }).then(function (fileRoot) {
        return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true }).then(function () {
          return applyLoadedFileRoot(fileRoot);
        });
      });
    });
  }
  // {S|F}{year}_{courseId} token, e.g. F2026_REGN15P (spec §2.2). Null when
  // course or season/year are unknown so callers can fall back to legacy names.
  function semesterFileToken() {
    var data = getData();
    if (!data || !data.meta) return null;
    var season = data.meta.semesterSeason;
    var year = data.meta.semesterYear;
    var courseId = data.meta.courseId;
    if (!season || !year || !courseId) return null;
    return (season === 'fall' ? 'F' : 'S') + year + '_' + courseId;
  }
  function suggestedSemesterFileName() {
    var token = semesterFileToken();
    return token ? token + '.json' : 'regn-tracker.json';
  }
  function createFilePicker() {
    if (!supportsFS()) return Promise.reject(new Error('FS API unavailable'));
    return window.showSaveFilePicker({
      suggestedName: suggestedSemesterFileName(),
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handle) {
      state.fileHandle = handle;
      state.fileName = handle.name;
      return idbSet(HANDLE_KEY, handle).then(function () {
        var fileRoot = getFileRoot() || DataModel.createDefaultFile();
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
          state.fileHandle = handle;
          state.fileName = handle.name;
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
          var data = DataModel.migrateFile(JSON.parse(reader.result));
          state.fileHandle = null;
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
    var fileRoot = getFileRoot();
    if (!fileRoot) return;
    var blob = new Blob([serialize(fileRoot)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.fileName || suggestedSemesterFileName();
    a.click();
    URL.revokeObjectURL(a.href);
    cacheData(fileRoot);
    markClean();
    updateStatusUI();
    if (!supportsFS()) {
      showAlert('Export backup', 'Save the downloaded file to college OneDrive (Files app → OneDrive) to back up your semester data.');
    }
  }
  function applyLoadedFileRoot(fileRoot) {
    if (!fileRoot.meta) fileRoot.meta = {};
    if (!fileRoot.meta.revision) fileRoot.meta.revision = 1;
    state.fileLoadedRevision = fileRoot.meta.revision;
    if (SimFacultyStorage) {
      SimFacultyStorage.hydrateFromFileRoot(fileRoot);
    } else {
      SimFacultyData.stripRolesFromFileRoot(fileRoot);
    }
    return fileRoot;
  }
  function updateStatusUI() {
    var el = document.getElementById('fileStatus');
    if (!el) return;
    getMeta().then(function (meta) {
      var dirty = state.dirty;
      var name = state.fileName;
      var savedLabel = formatSavedTime(meta.lastSavedAt);
      var parts = [];
      if (supportsFS() && state.fileHandle) {
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
      el.textContent = parts.join(' · ');
      var syncBtn = document.getElementById('syncOneDriveBtn');
      if (syncBtn) {
        if (dirty) {
          syncBtn.classList.remove('hidden');
          if (supportsFS() && state.fileHandle) {
            syncBtn.textContent = 'Sync to OneDrive';
          } else if (supportsFS()) {
            syncBtn.textContent = 'Save to OneDrive…';
          } else {
            syncBtn.textContent = 'Export backup';
          }
        } else {
          syncBtn.classList.add('hidden');
        }
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
      if (supportsFS() || !state.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }
  function init() {
    onStateChange(function () {
      if (state.dirty) scheduleAutoSave();
    });
    initUnloadWarning();
    var loadedFromFile = false;
    return reconnectHandle().then(function (fromHandle) {
      if (fromHandle) {
        loadedFromFile = true;
        return setMeta({
          hasLoadedData: true,
          lastImportedFileName: state.fileName || ''
        }).then(function () { return fromHandle; });
      }
      return loadCache();
    }).then(function (raw) {
      if (!raw) {
        raw = DataModel.migrateFromLegacyLocalStorage();
        if (raw) loadedFromFile = true;
      } else {
        loadedFromFile = true;
      }
      var fileRoot = raw ? DataModel.migrateFile(raw) : DataModel.createDefaultFile();
      if (loadedFromFile) fileRoot = applyLoadedFileRoot(fileRoot);
      var sem = fileRoot.semesters.find(function (s) {
        return s.id === fileRoot.meta.activeSemesterId;
      }) || fileRoot.semesters[0];
      CalendarEngine.rebuildWeeks(sem);
      if (needsRegeneration(sem) && Scheduler) {
        Scheduler.regenerateAll(sem);
      }
      setFileRoot(fileRoot);
      markClean();
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
export {
  supportsFS,
  init,
  saveCurrent,
  scheduleAutoSave,
  openFilePicker,
  createFilePicker,
  importFromFile,
  exportDownload,
  updateStatusUI,
  cacheData,
  shouldShowOnedriveBanner,
  configureImportInput,
  isIOSDevice,
  semesterFileToken,
  suggestedSemesterFileName,
  clearAndRestoreDefaults,
  applyLoadedFileRoot,
  writeFileRootToHandle,
  readFromHandle,
  writeToHandle,
  serialize,
  semesterFileTokenFromMeta,
  supportsDirectoryPicker,
  idbGet as _idbGet,
  idbSet as _idbSet
};
