/**
 * Semester persistence barrel — open/init/activate + stable public re-exports.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as DataModel from '../core/data-model/index.js';
import * as Scheduler from '../core/scheduler/index.js';
import * as ProgramData from './program-data.js';
import { idbGet, idbSet, supportsFS } from './storage-idb.js';
import {
  setMeta,
  isIOSDevice,
  configureImportInput,
  updateStatusUI,
  flashStatus,
  shouldShowOnedriveBanner,
  initUnloadWarning
} from './semester-status-ui.js';
import { markClean, onStateChange, setFileRoot, state } from '../core/state.js';
import { isCancelError } from './hybrid-save.js';
import {
  HANDLE_KEY,
  DIR_HANDLE_KEY,
  PROGRAM_KIND,
  serialize,
  writeToHandle,
  writeFileRootToHandle,
  readFromHandle,
  assertProgramRoot,
  applyLoadedFileRoot,
  needsRegeneration,
  semesterFileToken,
  semesterFileTokenFromMeta,
  suggestedSemesterFileName,
  suggestedDownloadName,
  supportsDirectoryPicker
} from './semester-file-io.js';
import {
  cacheData,
  loadCache,
  scheduleAutoSave,
  saveCurrent,
  saveWithChooser,
  createFilePicker,
  exportDownload,
  clearAndRestoreDefaults
} from './semester-save.js';

export function openFilePicker() {
  if (!supportsFS()) return Promise.reject(new Error('FS API unavailable'));
  return window.showOpenFilePicker({
    mode: 'readwrite',
    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    multiple: false
  }).then(function (handles) {
    var handle = handles[0];
    return readFromHandle(handle).then(function (fileRoot) {
      assertProgramRoot(fileRoot, handle.name);
      state.fileHandle = handle;
      state.fileName = handle.name;
      state.semesterFileConnected = true;
      return idbSet(HANDLE_KEY, handle).then(function () {
        return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true }).then(function () {
          return applyLoadedFileRoot(fileRoot);
        });
      });
    });
  });
}

/** Load semester from ProgramData/semesters/{fileName} and attach sticky handle. */
export function loadFromProgramData(fileName) {
  var path = ProgramData.semesterPath(fileName);
  return ProgramData.readRelative(path, PROGRAM_KIND).then(function (result) {
    var fileRoot = DataModel.migrateFile(result.raw);
    assertProgramRoot(fileRoot, result.name);
    state.fileHandle = result.handle;
    state.fileName = result.name;
    state.semesterFileConnected = true;
    if (ProgramData.getProgramDataDir()) {
      state.programSemesterDirHandle = null;
    }
    var persistHandle = result.handle && !result.handle.__devMockFs;
    var afterHandle = persistHandle ? idbSet(HANDLE_KEY, result.handle) : Promise.resolve();
    return afterHandle.then(function () {
      return setMeta({ lastImportedFileName: result.name, hasLoadedData: true }).then(function () {
        return applyLoadedFileRoot(fileRoot);
      });
    });
  });
}

function reconnectHandle() {
  if (!supportsFS()) return Promise.resolve(null);
  return idbGet(DIR_HANDLE_KEY).then(function (dir) {
    if (dir) state.programSemesterDirHandle = dir;
    return idbGet(HANDLE_KEY);
  }).then(function (handle) {
    if (!handle) return null;
    return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
      if (perm === 'granted') {
        state.fileHandle = handle;
        state.fileName = handle.name;
        return readFromHandle(handle);
      }
      if (perm === 'prompt' && typeof handle.requestPermission === 'function') {
        return handle.requestPermission({ mode: 'readwrite' }).then(function (next) {
          if (next !== 'granted') return null;
          state.fileHandle = handle;
          state.fileName = handle.name;
          return readFromHandle(handle);
        });
      }
      return null;
    });
  }).catch(function () { return null; });
}

export function importFromFile(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = DataModel.migrateFile(JSON.parse(reader.result));
        assertProgramRoot(data, file && file.name);
        state.fileHandle = null;
        resolve(data);
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  }).then(function (data) {
    return applyLoadedFileRoot(data);
  }).then(function (data) {
    state.semesterFileConnected = true;
    return setMeta({
      lastImportedFileName: file.name,
      hasLoadedData: true
    }).then(function () { return data; });
  });
}

export function init() {
  onStateChange(function () {
    if (state.dirty) scheduleAutoSave();
  });
  initUnloadWarning();
  var loadedFromFile = false;
  return ProgramData.reconnectProgramData().then(function () {
    return reconnectHandle();
  }).then(function (fromHandle) {
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
    state.semesterFileConnected = loadedFromFile;
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

export function isSemesterFileConnected() {
  return !!(state.fileHandle || state.semesterFileConnected);
}

export function activateFileRoot(fileRoot, fileName) {
  var sem = fileRoot.semesters.find(function (s) {
    return s.id === fileRoot.meta.activeSemesterId;
  }) || fileRoot.semesters[0];
  CalendarEngine.rebuildWeeks(sem);
  if (needsRegeneration(sem) && Scheduler) {
    Scheduler.regenerateAll(sem);
  }
  setFileRoot(fileRoot);
  state.semesterFileConnected = true;
  if (fileName != null) state.fileName = fileName;
  markClean();
  updateStatusUI();
  return sem;
}

export {
  supportsFS,
  saveCurrent,
  scheduleAutoSave,
  createFilePicker,
  saveWithChooser,
  exportDownload,
  updateStatusUI,
  flashStatus,
  cacheData,
  shouldShowOnedriveBanner,
  configureImportInput,
  isIOSDevice,
  semesterFileToken,
  suggestedSemesterFileName,
  suggestedDownloadName,
  clearAndRestoreDefaults,
  applyLoadedFileRoot,
  writeFileRootToHandle,
  readFromHandle,
  writeToHandle,
  serialize,
  semesterFileTokenFromMeta,
  supportsDirectoryPicker,
  isCancelError,
  idbGet as _idbGet,
  idbSet as _idbSet,
  HANDLE_KEY as _HANDLE_KEY,
  DIR_HANDLE_KEY as _DIR_HANDLE_KEY
};
