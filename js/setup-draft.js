/* global App */
var App = App || {};

/**
 * In-memory working draft for lead faculty Setup edits (propose-only mode).
 * Active semester (App.getData) stays approved until proposals are accepted.
 */
App.SetupDraft = (function () {
  var DB_NAME = 'regnTrackerDB';
  var STORE = 'handles';
  var KEY_PREFIX = 'setupDraft:';

  var workingByKey = {};
  var dirtyByKey = {};

  function usesDraftMode() {
    return App.Permissions && App.Permissions.canAction('proposals.submit') &&
      !App.Permissions.canAction('setup.edit');
  }

  function currentUserId() {
    var session = App.UserSession && App.UserSession.getSession();
    return session ? session.userId : null;
  }

  function storageKey(userId, semesterId) {
    return KEY_PREFIX + (userId || '') + ':' + (semesterId || '');
  }

  function memKey(userId, semesterId) {
    return (userId || '') + ':' + (semesterId || '');
  }

  function getActive() {
    return App.getData();
  }

  function openIDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function (e) {
        if (!e.target.result.objectStoreNames.contains(STORE)) {
          e.target.result.createObjectStore(STORE);
        }
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
    }).catch(function () { return null; });
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

  function idbDelete(key) {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { return null; });
  }

  function cloneSemester(sem) {
    return JSON.parse(JSON.stringify(sem));
  }

  function ensureWorking(userId) {
    userId = userId || currentUserId();
    var active = getActive();
    if (!active || !userId) return active;
    var mk = memKey(userId, active.id);
    if (!workingByKey[mk]) {
      workingByKey[mk] = cloneSemester(active);
    }
    return workingByKey[mk];
  }

  function getWorking(userId) {
    if (!usesDraftMode()) return getActive();
    userId = userId || currentUserId();
    var active = getActive();
    if (!active || !userId) return active;
    var mk = memKey(userId, active.id);
    return workingByKey[mk] || active;
  }

  function getWorkingForEdit(userId) {
    if (!usesDraftMode()) return getActive();
    return ensureWorking(userId);
  }

  function resolveData() {
    return getWorkingForEdit();
  }

  function markDirty(userId) {
    userId = userId || currentUserId();
    var active = getActive();
    if (!active || !userId) return;
    dirtyByKey[memKey(userId, active.id)] = true;
  }

  function isDirty(userId) {
    userId = userId || currentUserId();
    var active = getActive();
    if (!active || !userId) return false;
    return !!dirtyByKey[memKey(userId, active.id)];
  }

  function syncFromDom(userId) {
    var working = ensureWorking(userId);
    if (App.UI.Setup && App.UI.Setup.collectFromFormInto) {
      App.UI.Setup.collectFromFormInto(working, { skipSideEffects: true });
    }
    markDirty(userId);
    return working;
  }

  function collectSnapshotFromDom() {
    var active = getActive();
    if (!active) return null;
    if (usesDraftMode()) {
      return syncFromDom();
    }
    var snapshot = cloneSemester(active);
    if (App.UI.Setup && App.UI.Setup.collectFromFormInto) {
      App.UI.Setup.collectFromFormInto(snapshot, { skipSideEffects: true });
    }
    return snapshot;
  }

  function saveLocalDraft(userId) {
    userId = userId || currentUserId();
    var active = getActive();
    if (!active || !userId) return Promise.resolve();
    syncFromDom(userId);
    var mk = memKey(userId, active.id);
    var payload = {
      semesterId: active.id,
      userId: userId,
      savedAt: new Date().toISOString(),
      working: workingByKey[mk]
    };
    return idbSet(storageKey(userId, active.id), payload).then(function () {
      dirtyByKey[mk] = false;
    });
  }

  function loadLocalDraft(userId) {
    userId = userId || currentUserId();
    var active = getActive();
    if (!active || !userId || !usesDraftMode()) return Promise.resolve(null);
    return idbGet(storageKey(userId, active.id)).then(function (raw) {
      if (!raw || !raw.working || raw.semesterId !== active.id) return null;
      workingByKey[memKey(userId, active.id)] = raw.working;
      dirtyByKey[memKey(userId, active.id)] = true;
      return raw.working;
    });
  }

  function clearWorking(userId) {
    userId = userId || currentUserId();
    var active = getActive();
    if (!active || !userId) return Promise.resolve();
    delete workingByKey[memKey(userId, active.id)];
    delete dirtyByKey[memKey(userId, active.id)];
    return idbDelete(storageKey(userId, active.id));
  }

  function clearAllForSemester(semesterId) {
    Object.keys(workingByKey).forEach(function (k) {
      if (k.indexOf(':' + semesterId) >= 0) delete workingByKey[k];
    });
    Object.keys(dirtyByKey).forEach(function (k) {
      if (k.indexOf(':' + semesterId) >= 0) delete dirtyByKey[k];
    });
  }

  function hasWorkingChanges(userId) {
    if (!usesDraftMode()) return false;
    userId = userId || currentUserId();
    var active = getActive();
    var working = getWorking(userId);
    if (!active || !working || working === active) return false;
    if (App.Proposals && App.Proposals.diffSetup) {
      return App.Proposals.diffSetup(active, working).length > 0;
    }
    return JSON.stringify(active) !== JSON.stringify(working);
  }

  function persistAfterEdit(data, opts) {
    opts = opts || {};
    if (usesDraftMode()) {
      markDirty();
      if (opts.rerender !== false && App.UI.Setup) App.UI.Setup.render(data);
      else if (opts.refresh && App.UI.refresh) App.UI.refresh();
      return;
    }
    App.notifyChange();
    if (opts.configBefore !== undefined && App.UI.SetupConfig) {
      App.UI.SetupConfig.maybeRegenerateAfterChange(data, opts.configBefore);
    }
    if (opts.rerender !== false && App.UI.Setup) App.UI.Setup.render(data);
    else if (opts.refresh && App.UI.refresh) App.UI.refresh();
  }

  return {
    usesDraftMode: usesDraftMode,
    getActive: getActive,
    getWorking: getWorking,
    getWorkingForEdit: getWorkingForEdit,
    resolveData: resolveData,
    ensureWorking: ensureWorking,
    markDirty: markDirty,
    isDirty: isDirty,
    syncFromDom: syncFromDom,
    collectSnapshotFromDom: collectSnapshotFromDom,
    saveLocalDraft: saveLocalDraft,
    loadLocalDraft: loadLocalDraft,
    clearWorking: clearWorking,
    clearAllForSemester: clearAllForSemester,
    hasWorkingChanges: hasWorkingChanges,
    persistAfterEdit: persistAfterEdit
  };
})();
