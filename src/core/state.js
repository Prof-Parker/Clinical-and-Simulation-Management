/**
 * Central reactive state: file roots, active semester, dirty flags, listeners.
 * Consumed by storage, UI tabs, and scheduler entry points.
 */

export const state = {
  fileRoot: null,
  data: null,
  dirty: false,
  fileHandle: null,
  fileName: null,
  saveTimer: null,
  simFacultyRoot: null,
  simFacultyReady: false,
  userFile: null,
  userFileHandle: null,
  userFileName: null,
  usersRegistry: null,
  usersRegistryFileHandle: null,
  usersRegistryFileName: null,
  usersRegistryLoadedRevision: null,
  userSession: null,
  playgroundRoot: null,
  playgroundFileHandle: null,
  playgroundFileName: null,
  clinicalSitesLibraryRoot: null,
  clinicalSitesLibraryFileHandle: null,
  theoryLibraryRoot: null,
  theoryLibraryFileHandle: null,
  fileLoadedRevision: null,
  semesterFileConnected: false,
  currentTab: 'dashboard',
  appShell: null,
  listeners: []
};

export function onStateChange(fn) {
  state.listeners.push(fn);
}

export function syncSemesterToFile() {
  if (!state.fileRoot || !state.data) return;
  var idx = state.fileRoot.semesters.findIndex(function (s) {
    return s.id === state.data.id;
  });
  if (idx >= 0) state.fileRoot.semesters[idx] = state.data;
}

export function getFileRoot() {
  syncSemesterToFile();
  return state.fileRoot;
}

export function setFileRoot(fileRoot) {
  state.fileRoot = fileRoot;
  if (!fileRoot || !fileRoot.semesters || !fileRoot.semesters.length) {
    state.data = null;
    return;
  }
  var activeId = fileRoot.meta.activeSemesterId;
  var sem = fileRoot.semesters.find(function (s) { return s.id === activeId; });
  state.data = sem || fileRoot.semesters[0];
  if (!sem) fileRoot.meta.activeSemesterId = state.data.id;
}

export function notifyChange() {
  state.dirty = true;
  syncSemesterToFile();
  state.listeners.forEach(function (fn) { fn(); });
}

export function setData(data) {
  state.data = data;
  syncSemesterToFile();
  notifyChange();
}

export function getData() {
  return state.data;
}

export function markClean() {
  state.dirty = false;
  state.listeners.forEach(function (fn) { fn(); });
}

export { switchSemester, addSemester } from '../ui/chrome.js';
