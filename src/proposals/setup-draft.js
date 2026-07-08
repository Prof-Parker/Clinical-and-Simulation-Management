/**
 * Setup form draft snapshots.
 */

import * as Permissions from '../auth/permissions.js';
import * as Proposals from './proposals.js';
import * as Setup from '../ui/setup/index.js';
import * as SetupConfig from '../ui/setup-config/index.js';
import * as UserSession from '../auth/user-session.js';
import { getData, notifyChange } from '../core/state.js';
import { refresh } from '../ui/chrome.js';

var DB_NAME = 'regnTrackerDB';
  var STORE = 'handles';
  var KEY_PREFIX = 'setupDraft:';

  var workingByKey = {};
  var dirtyByKey = {};

  function usesDraftMode() {
    return Permissions && Permissions.canAction('proposals.submit') &&
      !Permissions.canAction('setup.edit');
  }

  function currentUserId() {
    var session = UserSession && UserSession.getSession();
    return session ? session.userId : null;
  }

  function storageKey(userId, semesterId) {
    return KEY_PREFIX + (userId || '') + ':' + (semesterId || '');
  }

  function memKey(userId, semesterId) {
    return (userId || '') + ':' + (semesterId || '');
  }

  function getActive() {
    return getData();
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
    if (Setup.collectFromFormInto) {
      Setup.collectFromFormInto(working, { skipSideEffects: true });
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
    if (Setup.collectFromFormInto) {
      Setup.collectFromFormInto(snapshot, { skipSideEffects: true });
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
    if (Proposals.diffSetup) {
      return Proposals.diffSetup(active, working).length > 0;
    }
    return JSON.stringify(active) !== JSON.stringify(working);
  }

  function persistAfterEdit(data, opts) {
    opts = opts || {};
    if (usesDraftMode()) {
      markDirty();
      if (opts.rerender !== false && Setup) Setup.render(data);
      else if (opts.refresh && refresh) refresh();
      return;
    }
    notifyChange();
    if (opts.configBefore !== undefined && SetupConfig) {
      SetupConfig.maybeRegenerateAfterChange(data, opts.configBefore);
    }
    if (opts.rerender !== false && Setup) Setup.render(data);
    else if (opts.refresh && refresh) refresh();
  }

export {
  usesDraftMode,
  getActive,
  getWorking,
  getWorkingForEdit,
  resolveData,
  ensureWorking,
  markDirty,
  isDirty,
  syncFromDom,
  collectSnapshotFromDom,
  saveLocalDraft,
  loadLocalDraft,
  clearWorking,
  clearAllForSemester,
  hasWorkingChanges,
  persistAfterEdit
};
