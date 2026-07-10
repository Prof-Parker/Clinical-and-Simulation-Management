/**
 * Theory content library file storage (topic bank).
 */

import * as Storage from './semester-storage.js';
import { state } from '../core/state.js';

var CACHE_KEY = 'theoryLibraryData';
var HANDLE_KEY = 'theoryLibraryFileHandle';

function idbGet(key) { return Storage._idbGet(key); }
function idbSet(key, val) { return Storage._idbSet(key, val); }
function supportsFS() { return Storage && Storage.supportsFS(); }

export function createEmptyLibrary(courseId) {
  return {
    meta: { version: 1, courseId: courseId || 'REGN15', lastModified: new Date().toISOString() },
    topics: []
  };
}

export function migrateLibrary(raw) {
  if (!raw || !raw.topics) return createEmptyLibrary();
  if (!raw.meta) raw.meta = { version: 1 };
  if (!raw.meta.courseId) raw.meta.courseId = 'REGN15';
  return raw;
}

export function getLibrary() {
  return state.theoryLibraryRoot;
}

function setRoot(root) {
  state.theoryLibraryRoot = migrateLibrary(root);
}

export function isReady() {
  return !!state.theoryLibraryRoot;
}

function serialize(root) {
  root.meta.lastModified = new Date().toISOString();
  return JSON.stringify(root, null, 2);
}

function writeToHandle(handle, root) {
  return handle.createWritable().then(function (w) {
    return w.write(serialize(root)).then(function () { return w.close(); });
  });
}

function readFromHandle(handle) {
  return handle.getFile().then(function (f) { return f.text(); }).then(function (t) {
    return migrateLibrary(JSON.parse(t));
  });
}

export function saveCurrent() {
  var root = getLibrary();
  if (!root || !state.theoryLibraryFileHandle) return Promise.resolve();
  return writeToHandle(state.theoryLibraryFileHandle, root).then(function () {
    return idbSet(CACHE_KEY, root);
  });
}

export function openFilePicker() {
  if (!supportsFS()) return importViaInput();
  return window.showOpenFilePicker({
    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
  }).then(function (handles) {
    var handle = handles[0];
    state.theoryLibraryFileHandle = handle;
    return idbSet(HANDLE_KEY, handle).then(function () {
      return readFromHandle(handle);
    }).then(function (root) {
      setRoot(root);
      return idbSet(CACHE_KEY, root).then(function () { return root; });
    });
  });
}

function importViaInput() {
  return new Promise(function (resolve, reject) {
    var input = document.getElementById('importTheoryLibraryInput');
    if (!input) return reject(new Error('No import input'));
    input.onchange = function (e) {
      var file = e.target.files[0];
      input.value = '';
      if (!file) return reject(new Error('No file'));
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var root = migrateLibrary(JSON.parse(reader.result));
          state.theoryLibraryFileHandle = null;
          setRoot(root);
          idbSet(CACHE_KEY, root).then(function () { resolve(root); }).catch(reject);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    };
    input.click();
  });
}

export function createFilePicker(courseId) {
  var root = createEmptyLibrary(courseId);
  if (!supportsFS()) return Promise.reject(new Error('FS unavailable'));
  return window.showSaveFilePicker({
    suggestedName: 'theory-content-library_' + (courseId || 'REGN15') + '.json',
    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
  }).then(function (handle) {
    state.theoryLibraryFileHandle = handle;
    setRoot(root);
    return idbSet(HANDLE_KEY, handle).then(function () {
      return writeToHandle(handle, root).then(function () {
        return idbSet(CACHE_KEY, root).then(function () { return root; });
      });
    });
  });
}

export function getTopicById(topicId) {
  var root = getLibrary();
  if (!root || !root.topics) return null;
  return root.topics.find(function (t) { return t.id === topicId; }) || null;
}

export function listTopics() {
  var root = getLibrary();
  return root && root.topics ? root.topics.slice() : [];
}

export function getConnectionLabel() {
  if (!isReady()) return '';
  if (state.theoryLibraryFileHandle && state.theoryLibraryFileHandle.name) {
    return state.theoryLibraryFileHandle.name;
  }
  return 'Theory content library (on this device)';
}

export function init() {
  return idbGet(HANDLE_KEY).then(function (handle) {
    if (!handle || !supportsFS()) return idbGet(CACHE_KEY);
    return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
      if (perm !== 'granted') return idbGet(CACHE_KEY);
      state.theoryLibraryFileHandle = handle;
      return readFromHandle(handle);
    });
  }).then(function (raw) {
    if (raw) setRoot(raw);
    return raw;
  }).catch(function () { return null; });
}
