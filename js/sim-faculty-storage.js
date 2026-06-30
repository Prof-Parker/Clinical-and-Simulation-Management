/* global App */
var App = App || {};

App.SimFacultyStorage = (function () {
  var CACHE_KEY = 'simFacultyData';
  var HANDLE_KEY = 'simFacultyFileHandle';
  var META_KEY = 'simFacultyMeta';

  function supportsFS() {
    return App.Storage && App.Storage.supportsFS();
  }

  function idbGet(key) {
    return App.Storage._idbGet(key);
  }

  function idbSet(key, val) {
    return App.Storage._idbSet(key, val);
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
    App.state.simFacultyRoot = facultyRoot;
  }

  function getSimFacultyRoot() {
    return App.state.simFacultyRoot;
  }

  function isReady() {
    return !!App.state.simFacultyRoot && !!App.state.simFacultyReady;
  }

  function scheduleAutoSave() {
    if (App.state.simFacultySaveTimer) clearTimeout(App.state.simFacultySaveTimer);
    App.state.simFacultySaveTimer = setTimeout(function () {
      saveCurrent();
    }, 600);
  }

  function saveCurrent() {
    var facultyRoot = getSimFacultyRoot();
    if (!facultyRoot || !isReady()) return Promise.resolve();
    return cacheData(facultyRoot).then(function () {
      if (App.state.simFacultyFileHandle && supportsFS()) {
        return writeToHandle(App.state.simFacultyFileHandle, facultyRoot).then(function () {
          App.markSimFacultyClean();
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
      return App.SimFacultyData.migrateSimFaculty(JSON.parse(text));
    });
  }

  function migrateFromSemesterFile(fileRoot) {
    var facultyRoot = getSimFacultyRoot() || App.SimFacultyData.createEmptySimFacultyFile();
    var migrated = App.SimFacultyData.migrateRolesFromFileRoot(facultyRoot, fileRoot);
    setSimFacultyRoot(facultyRoot);
    if (migrated) {
      App.state.simFacultyDirty = true;
      App.state.simFacultyReady = true;
      scheduleAutoSave();
      if (App.state.fileRoot) App.state.dirty = true;
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
      App.state.simFacultyFileHandle = handle;
      App.state.simFacultyFileName = handle.name;
      return idbSet(HANDLE_KEY, handle).then(function () {
        return readFromHandle(handle);
      }).then(function (facultyRoot) {
        setSimFacultyRoot(facultyRoot);
        App.state.simFacultyReady = true;
        App.markSimFacultyClean();
        return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true }).then(function () {
          updateStatusUI();
          return facultyRoot;
        });
      });
    });
  }

  function createFilePicker() {
    if (!supportsFS()) return Promise.reject(new Error('FS API unavailable'));
    return window.showSaveFilePicker({
      suggestedName: 'regn-tracker-sim-faculty.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handle) {
      App.state.simFacultyFileHandle = handle;
      App.state.simFacultyFileName = handle.name;
      var facultyRoot = getSimFacultyRoot() || App.SimFacultyData.createEmptySimFacultyFile();
      var hint = '';
      if (App.getData() && App.getData().meta) {
        hint = App.getData().meta.semesterName || '';
      }
      facultyRoot.meta.linkedSemesterHint = hint;
      setSimFacultyRoot(facultyRoot);
      return idbSet(HANDLE_KEY, handle).then(function () {
        return writeToHandle(handle, facultyRoot).then(function () {
          App.state.simFacultyReady = true;
          App.markSimFacultyClean();
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
          App.state.simFacultyFileHandle = handle;
          App.state.simFacultyFileName = handle.name;
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
          var facultyRoot = App.SimFacultyData.migrateSimFaculty(JSON.parse(reader.result));
          App.state.simFacultyFileHandle = null;
          resolve(facultyRoot);
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    }).then(function (facultyRoot) {
      setSimFacultyRoot(facultyRoot);
      App.state.simFacultyReady = true;
      App.state.simFacultyDirty = true;
      return setMeta({
        lastImportedFileName: file.name,
        hasLoadedData: true
      }).then(function () {
        App.state.simFacultyFileName = file.name;
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
    a.download = App.state.simFacultyFileName || 'regn-tracker-sim-faculty.json';
    a.click();
    URL.revokeObjectURL(a.href);
    cacheData(facultyRoot);
    App.markSimFacultyClean();
    updateStatusUI();
    if (!supportsFS()) {
      alert('Save the downloaded sim faculty file to your team OneDrive folder.');
    }
  }

  function getStudentRoles(studentId) {
    var facultyRoot = getSimFacultyRoot();
    var sem = App.getData();
    if (!facultyRoot || !sem) return { flags: { primary: null, secondary: null } };
    return App.SimFacultyData.getStudentRoles(facultyRoot, sem.id, studentId);
  }

  function setStudentRoleAssignment(studentId, simNum, iterKey, value) {
    var facultyRoot = getSimFacultyRoot();
    var sem = App.getData();
    if (!facultyRoot || !sem) return;
    App.SimFacultyData.setStudentRoleAssignment(facultyRoot, sem.id, studentId, simNum, iterKey, value);
    App.notifySimFacultyChange();
  }

  function setStudentFlag(studentId, flagKey, value) {
    var facultyRoot = getSimFacultyRoot();
    var sem = App.getData();
    if (!facultyRoot || !sem) return;
    App.SimFacultyData.setStudentFlag(facultyRoot, sem.id, studentId, flagKey, value);
    App.notifySimFacultyChange();
  }

  function updateStatusUI() {
    if (App.Storage && App.Storage.updateStatusUI) App.Storage.updateStatusUI();
  }

  function init(fileRoot) {
    return reconnectHandle().then(function (fromHandle) {
      if (fromHandle) return fromHandle;
      return loadCache();
    }).then(function (raw) {
      var facultyRoot = raw
        ? App.SimFacultyData.migrateSimFaculty(raw)
        : App.SimFacultyData.createEmptySimFacultyFile();
      setSimFacultyRoot(facultyRoot);
      var migrated = fileRoot ? migrateFromSemesterFile(fileRoot) : false;
      return getMeta().then(function (meta) {
        App.state.simFacultyReady = !!(meta.hasLoadedData || migrated ||
          App.SimFacultyData.facultyRootHasData(facultyRoot));
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
    /* handled by App.Storage.initUnloadWarning */
  }

  return {
    init: init,
    initUnloadWarning: initUnloadWarning,
    isReady: isReady,
    saveCurrent: saveCurrent,
    scheduleAutoSave: scheduleAutoSave,
    openFilePicker: openFilePicker,
    createFilePicker: createFilePicker,
    importFromFile: importFromFile,
    exportDownload: exportDownload,
    migrateFromSemesterFile: migrateFromSemesterFile,
    getStudentRoles: getStudentRoles,
    setStudentRoleAssignment: setStudentRoleAssignment,
    setStudentFlag: setStudentFlag,
    _getMeta: getMeta,
    getSimFacultyRoot: getSimFacultyRoot,
    serialize: serialize,
    cacheData: cacheData
  };
})();
