/**
 * Sim faculty roles file storage.
 */

import * as SimFacultyData from '../auth/sim-faculty-data.js';
import * as Storage from './semester-storage.js';
import { getData, markSimFacultyClean, notifySimFacultyChange, state } from '../core/state.js';
import { showAlert } from '../ui/dialogs.js';

var CACHE_KEY = 'simFacultyData';
  var HANDLE_KEY = 'simFacultyFileHandle';
  var META_KEY = 'simFacultyMeta';

  function supportsFS() {
    return Storage && Storage.supportsFS();
  }

  function idbGet(key) {
    return Storage._idbGet(key);
  }

  function idbSet(key, val) {
    return Storage._idbSet(key, val);
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

  function serialize(facultyRoot) {
    facultyRoot.meta.lastModified = new Date().toISOString();
    return JSON.stringify(facultyRoot, null, 2);
  }

  function cacheData(facultyRoot) {
    var now = new Date().toISOString();
    return idbSet(CACHE_KEY, facultyRoot).then(function () {
      return setMeta({ lastSavedAt: now, hasLoadedData: true });
    });
  }

  function loadCache() {
    return idbGet(CACHE_KEY);
  }

  function setSimFacultyRoot(facultyRoot) {
    state.simFacultyRoot = facultyRoot;
  }

  function getSimFacultyRoot() {
    return state.simFacultyRoot;
  }

  function isReady() {
    return !!state.simFacultyRoot && !!state.simFacultyReady;
  }

  function scheduleAutoSave() {
    if (state.simFacultySaveTimer) clearTimeout(state.simFacultySaveTimer);
    state.simFacultySaveTimer = setTimeout(function () {
      saveCurrent();
    }, 600);
  }

  function saveCurrent() {
    var facultyRoot = getSimFacultyRoot();
    if (!facultyRoot || !isReady()) return Promise.resolve();
    return cacheData(facultyRoot).then(function () {
      if (state.simFacultyFileHandle && supportsFS()) {
        return writeToHandle(state.simFacultyFileHandle, facultyRoot).then(function () {
          markSimFacultyClean();
          updateStatusUI();
        }).catch(function () { updateStatusUI(); });
      }
      updateStatusUI();
    });
  }

  function writeToHandle(handle, facultyRoot) {
    return handle.createWritable().then(function (writable) {
      return writable.write(serialize(facultyRoot)).then(function () {
        return writable.close();
      });
    });
  }

  function readFromHandle(handle) {
    return handle.getFile().then(function (file) {
      return file.text();
    }).then(function (text) {
      return SimFacultyData.migrateSimFaculty(JSON.parse(text));
    });
  }

  function migrateFromSemesterFile(fileRoot) {
    var facultyRoot = getSimFacultyRoot() || SimFacultyData.createEmptySimFacultyFile();
    var migrated = SimFacultyData.migrateRolesFromFileRoot(facultyRoot, fileRoot);
    setSimFacultyRoot(facultyRoot);
    if (migrated) {
      state.simFacultyDirty = true;
      state.simFacultyReady = true;
      scheduleAutoSave();
      if (state.fileRoot) state.dirty = true;
    }
    return migrated;
  }

  function openFilePicker() {
    if (!supportsFS()) return Promise.reject(new Error('FS API unavailable'));
    return window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    }).then(function (handles) {
      var handle = handles[0];
      state.simFacultyFileHandle = handle;
      state.simFacultyFileName = handle.name;
      return idbSet(HANDLE_KEY, handle).then(function () {
        return readFromHandle(handle);
      }).then(function (facultyRoot) {
        setSimFacultyRoot(facultyRoot);
        state.simFacultyReady = true;
        markSimFacultyClean();
        return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true }).then(function () {
          updateStatusUI();
          return facultyRoot;
        });
      });
    });
  }

  function suggestedFacultyFileName() {
    var token = Storage && Storage.semesterFileToken
      ? Storage.semesterFileToken()
      : null;
    return token ? token + '_Faculty.json' : 'regn-tracker-sim-faculty.json';
  }

  function createFilePicker() {
    if (!supportsFS()) return Promise.reject(new Error('FS API unavailable'));
    return window.showSaveFilePicker({
      suggestedName: suggestedFacultyFileName(),
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handle) {
      state.simFacultyFileHandle = handle;
      state.simFacultyFileName = handle.name;
      var facultyRoot = getSimFacultyRoot() || SimFacultyData.createEmptySimFacultyFile();
      var hint = '';
      if (getData() && getData().meta) {
        hint = getData().meta.semesterName || '';
      }
      facultyRoot.meta.linkedSemesterHint = hint;
      setSimFacultyRoot(facultyRoot);
      return idbSet(HANDLE_KEY, handle).then(function () {
        return writeToHandle(handle, facultyRoot).then(function () {
          state.simFacultyReady = true;
          markSimFacultyClean();
          return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true }).then(function () {
            updateStatusUI();
            return facultyRoot;
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
          state.simFacultyFileHandle = handle;
          state.simFacultyFileName = handle.name;
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
          var facultyRoot = SimFacultyData.migrateSimFaculty(JSON.parse(reader.result));
          state.simFacultyFileHandle = null;
          resolve(facultyRoot);
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    }).then(function (facultyRoot) {
      setSimFacultyRoot(facultyRoot);
      state.simFacultyReady = true;
      state.simFacultyDirty = true;
      return setMeta({
        lastImportedFileName: file.name,
        hasLoadedData: true
      }).then(function () {
        state.simFacultyFileName = file.name;
        scheduleAutoSave();
        updateStatusUI();
        return facultyRoot;
      });
    });
  }

  function exportDownload() {
    var facultyRoot = getSimFacultyRoot();
    if (!facultyRoot || !isReady()) return;
    var blob = new Blob([serialize(facultyRoot)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.simFacultyFileName || suggestedFacultyFileName();
    a.click();
    URL.revokeObjectURL(a.href);
    cacheData(facultyRoot);
    markSimFacultyClean();
    updateStatusUI();
    if (!supportsFS()) {
      showAlert('Export backup', 'Save the downloaded sim faculty file to your team OneDrive folder.');
    }
  }

  function getStudentRoles(studentId) {
    var facultyRoot = getSimFacultyRoot();
    var sem = getData();
    if (!facultyRoot || !sem) return { flags: { primary: null, secondary: null } };
    return SimFacultyData.getStudentRoles(facultyRoot, sem.id, studentId);
  }

  function setStudentRoleAssignment(studentId, simNum, iterKey, value) {
    var facultyRoot = getSimFacultyRoot();
    var sem = getData();
    if (!facultyRoot || !sem) return;
    SimFacultyData.setStudentRoleAssignment(facultyRoot, sem.id, studentId, simNum, iterKey, value);
    notifySimFacultyChange();
  }

  function setStudentFlag(studentId, flagKey, value) {
    var facultyRoot = getSimFacultyRoot();
    var sem = getData();
    if (!facultyRoot || !sem) return;
    SimFacultyData.setStudentFlag(facultyRoot, sem.id, studentId, flagKey, value);
    notifySimFacultyChange();
  }

  function updateStatusUI() {
    if (Storage.updateStatusUI) Storage.updateStatusUI();
  }

  function init(fileRoot) {
    return reconnectHandle().then(function (fromHandle) {
      if (fromHandle) return fromHandle;
      return loadCache();
    }).then(function (raw) {
      var facultyRoot = raw
        ? SimFacultyData.migrateSimFaculty(raw)
        : SimFacultyData.createEmptySimFacultyFile();
      setSimFacultyRoot(facultyRoot);
      var migrated = fileRoot ? migrateFromSemesterFile(fileRoot) : false;
      return getMeta().then(function (meta) {
        state.simFacultyReady = !!(meta.hasLoadedData || migrated ||
          SimFacultyData.facultyRootHasData(facultyRoot));
        if (migrated && !meta.hasLoadedData) {
          return cacheData(facultyRoot).then(function () { return facultyRoot; });
        }
        return facultyRoot;
      });
    }).then(function (facultyRoot) {
      updateStatusUI();
      return facultyRoot;
    });
  }

  function initUnloadWarning() {
    /* handled by Storage.initUnloadWarning */
  }

export {
  init,
  initUnloadWarning,
  isReady,
  saveCurrent,
  scheduleAutoSave,
  openFilePicker,
  createFilePicker,
  importFromFile,
  exportDownload,
  migrateFromSemesterFile,
  getStudentRoles,
  setStudentRoleAssignment,
  setStudentFlag,
  getMeta as _getMeta,
  getSimFacultyRoot,
  serialize,
  cacheData
};
