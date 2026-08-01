/**
 * Sticky ProgramData folder — path-bound read/write under a shared root.
 * Layout (design §18.4):
 *   ProgramData/
 *     users/users-registry.json
 *     users/*.user.json
 *     semesters/*.json
 *     playgrounds/*.json
 *     clinical-sites-library.json
 *     theory-content-library_*.json
 */

import * as FileKind from '../core/file-kind.js';
import { assertKindOrThrow, guardedWrite, writeTextToHandle } from './guarded-write.js';
import { ensureReadwritePermission } from './hybrid-save.js';
import { readHandleText } from './fs-handle.js';
import { state } from '../core/state.js';

var DB_NAME = 'regnTrackerDB';
var STORE = 'handles';
var ROOT_KEY = 'programDataDirHandle';

export var PATHS = {
  USERS_DIR: 'users',
  REGISTRY: 'users/users-registry.json',
  SEMESTERS_DIR: 'semesters',
  PLAYGROUNDS_DIR: 'playgrounds',
  CLINICAL_SITES: 'clinical-sites-library.json'
};

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

export function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === 'function';
}

export function getProgramDataDir() {
  return state.programDataDirHandle || null;
}

export function isProgramDataConnected() {
  return !!state.programDataDirHandle;
}

export function clearProgramDataDir() {
  state.programDataDirHandle = null;
  return idbSet(ROOT_KEY, null);
}

/**
 * Persist and activate a ProgramData root directory handle.
 */
export function setProgramDataDir(dirHandle) {
  if (!dirHandle) return Promise.resolve(null);
  state.programDataDirHandle = dirHandle;
  return idbSet(ROOT_KEY, dirHandle).then(function () { return dirHandle; });
}

/**
 * Show directory picker and store as ProgramData root.
 * Call from a user-gesture click handler.
 */
export function connectProgramData() {
  if (!supportsDirectoryPicker()) {
    return Promise.reject(new Error('Directory picker unavailable in this browser.'));
  }
  return window.showDirectoryPicker({ mode: 'readwrite' }).then(function (dir) {
    return ensureReadwritePermission(dir).then(function (ok) {
      if (!ok) {
        return Promise.reject(new Error('Write permission was not granted for ProgramData.'));
      }
      return setProgramDataDir(dir);
    });
  });
}

/**
 * Restore sticky ProgramData handle from IndexedDB (permission may be prompt).
 */
export function reconnectProgramData() {
  if (state.programDataDirHandle) {
    return ensureReadwritePermission(state.programDataDirHandle).then(function (ok) {
      return ok ? state.programDataDirHandle : null;
    });
  }
  return idbGet(ROOT_KEY).then(function (stored) {
    if (!stored) return null;
    return ensureReadwritePermission(stored).then(function (ok) {
      if (!ok) return null;
      state.programDataDirHandle = stored;
      return stored;
    });
  }).catch(function () { return null; });
}

/**
 * Walk path segments under root (e.g. "users/users-registry.json").
 * Intermediate directories must exist; file may be created when create=true.
 */
export function resolveRelative(root, relativePath, create) {
  var parts = String(relativePath || '').split('/').filter(Boolean);
  if (!parts.length) {
    return Promise.reject(new Error('Empty relative path'));
  }
  var fileName = parts[parts.length - 1];
  var dirs = parts.slice(0, -1);

  var chain = Promise.resolve(root);
  dirs.forEach(function (seg) {
    chain = chain.then(function (dir) {
      return dir.getDirectoryHandle(seg, { create: !!create });
    });
  });
  return chain.then(function (dir) {
    return dir.getFileHandle(fileName, { create: !!create }).then(function (fh) {
      return { fileHandle: fh, parentDir: dir, name: fileName };
    });
  });
}

export function readRelative(relativePath, expectedKind) {
  var root = getProgramDataDir();
  if (!root) return Promise.reject(new Error('ProgramData folder is not connected.'));
  return resolveRelative(root, relativePath, false).then(function (resolved) {
    return readHandleText(resolved.fileHandle, 'read').then(function (text) {
      var raw = JSON.parse(text);
      if (expectedKind) assertKindOrThrow(raw, expectedKind, { fileName: resolved.name });
      return { raw: raw, handle: resolved.fileHandle, name: resolved.name, path: relativePath };
    });
  });
}

export function writeRelative(relativePath, expectedKind, textOrSerialize) {
  var root = getProgramDataDir();
  if (!root) return Promise.reject(new Error('ProgramData folder is not connected.'));
  return resolveRelative(root, relativePath, true).then(function (resolved) {
    return guardedWrite(resolved.fileHandle, expectedKind, function () {
      var text = typeof textOrSerialize === 'function' ? textOrSerialize() : textOrSerialize;
      return writeTextToHandle(resolved.fileHandle, text);
    }, { fileName: resolved.name }).then(function () {
      return { handle: resolved.fileHandle, name: resolved.name, path: relativePath };
    });
  });
}

/**
 * List *.json file names in a subdirectory of ProgramData.
 */
/**
 * Resolve a subdirectory under ProgramData (e.g. "semesters").
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export function getDirectoryHandle(relativeDir, create) {
  var root = getProgramDataDir();
  if (!root) return Promise.resolve(null);
  var parts = String(relativeDir || '').split('/').filter(Boolean);
  if (!parts.length) return Promise.resolve(root);
  var chain = Promise.resolve(root);
  parts.forEach(function (seg) {
    chain = chain.then(function (dir) {
      return dir.getDirectoryHandle(seg, { create: !!create });
    });
  });
  return chain.catch(function () { return null; });
}

export function listJsonInDir(relativeDir) {
  var root = getProgramDataDir();
  if (!root) return Promise.reject(new Error('ProgramData folder is not connected.'));
  return getDirectoryHandle(relativeDir, false).then(function (dir) {
    if (!dir) return Promise.reject(new Error('Folder not found: ' + relativeDir));
    var names = [];
    var it = dir.values();
    function next() {
      return it.next().then(function (res) {
        if (res.done) return names.sort();
        var entry = res.value;
        if (entry.kind === 'file' && /\.json$/i.test(entry.name)) {
          names.push(entry.name);
        }
        return next();
      });
    }
    return next();
  });
}

export function listUserCredentialFiles() {
  return listJsonInDir(PATHS.USERS_DIR).then(function (names) {
    return names.filter(function (n) {
      return /\.user\.json$/i.test(n) && n.toLowerCase() !== 'users-registry.json';
    });
  });
}

export function listSemesterFiles() {
  return listJsonInDir(PATHS.SEMESTERS_DIR).then(function (names) {
    return names.filter(function (n) { return !/_playground\.json$/i.test(n); });
  });
}

export function theoryLibraryPath(courseId) {
  var id = courseId || 'REGN15';
  return 'theory-content-library_' + id + '.json';
}

export function playgroundPath(fileName) {
  return PATHS.PLAYGROUNDS_DIR + '/' + fileName;
}

export function semesterPath(fileName) {
  return PATHS.SEMESTERS_DIR + '/' + fileName;
}

export function userCredentialPath(fileName) {
  return PATHS.USERS_DIR + '/' + fileName;
}

export { ROOT_KEY, FileKind };
