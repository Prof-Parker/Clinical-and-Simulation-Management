/**
 * Shared IndexedDB access for persisted handles and cached application data.
 */

var DB_NAME = 'regnTrackerDB';
var STORE = 'handles';

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

export { supportsFS, idbGet, idbSet };
