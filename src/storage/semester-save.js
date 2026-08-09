/**
 * Semester cache, autosave, hybrid save, download export, and clear defaults.
 */

import * as DataModel from '../core/data-model/index.js';
import * as Proposals from '../proposals/proposals.js';
import * as Scheduler from '../core/scheduler/index.js';
import * as SimFacultyData from '../auth/sim-faculty-data.js';
import * as SimFacultyStorage from './sim-faculty-storage.js';
import * as Theme from '../ui/theme.js';
import { hybridSave, ensureReadwritePermission } from './hybrid-save.js';
import * as ProgramData from './program-data.js';
import { idbGet, idbSet, supportsFS } from './storage-idb.js';
import { setMeta, updateStatusUI } from './semester-status-ui.js';
import { getFileRoot, markClean, setFileRoot, state, syncSemesterToFile } from '../core/state.js';
import { refresh } from '../ui/chrome.js';
import { showAlert, showConfirm } from '../ui/dialogs.js';
import {
  CACHE_KEY,
  HANDLE_KEY,
  DIR_HANDLE_KEY,
  PROGRAM_KIND,
  serialize,
  writeToHandle,
  readFromHandle,
  suggestedSemesterFileName
} from './semester-file-io.js';
import { resolveActiveSemester, prepareActiveSemester } from './semester-hydrate.js';

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

export function cacheData(fileRoot) {
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

export function loadCache() {
  return idbGet(CACHE_KEY);
}

export function scheduleAutoSave() {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(function () {
    saveCurrent();
  }, 600);
}

export function saveCurrent(forceOverwrite) {
  var fileRoot = getFileRoot();
  if (!fileRoot) return Promise.resolve({ ok: true, localOnly: true });
  if (!state.fileHandle || !supportsFS()) {
    return cacheData(fileRoot).then(function () {
      updateStatusUI();
      return { ok: true, localOnly: true };
    });
  }
  return ensureReadwritePermission(state.fileHandle).then(function (ok) {
    if (!ok) {
      return cacheData(fileRoot).then(function () {
        updateStatusUI();
        return {
          ok: false,
          localOnly: true,
          error: new Error('Write permission was not granted for the connected semester file.')
        };
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
              resolve({ ok: true, reloaded: true });
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
          return { ok: true, synced: true };
        });
      });
    });
  }).catch(function (err) {
    return cacheData(fileRoot).then(function () {
      updateStatusUI();
      return {
        ok: false,
        localOnly: true,
        error: err || new Error('Could not write to the connected OneDrive file.')
      };
    });
  });
}

function buildHybridSaveConfig(fileRoot) {
  var root = fileRoot || getFileRoot() || DataModel.createDefaultFile();
  return {
    kind: PROGRAM_KIND,
    suggestedName: suggestedSemesterFileName,
    fileHandleKey: HANDLE_KEY,
    dirHandleKey: DIR_HANDLE_KEY,
    idbGet: idbGet,
    idbSet: idbSet,
    getFileHandle: function () { return state.fileHandle; },
    getDirHandle: function () { return state.programSemesterDirHandle; },
    resolvePreferredDir: function () {
      if (!ProgramData.isProgramDataConnected()) return Promise.resolve(null);
      return ProgramData.getDirectoryHandle(ProgramData.PATHS.SEMESTERS_DIR, true).then(function (dir) {
        if (dir) state.programSemesterDirHandle = dir;
        return dir;
      });
    },
    allowDownload: true,
    write: function (handle) {
      return writeToHandle(handle, root);
    },
    download: function () {
      doExportDownload();
    },
    onPersisted: function (handle, dirHandle) {
      if (!handle) return Promise.resolve(root);
      state.fileHandle = handle;
      state.fileName = handle.name;
      state.semesterFileConnected = true;
      if (dirHandle) state.programSemesterDirHandle = dirHandle;
      return setMeta({ lastImportedFileName: handle.name, hasLoadedData: true }).then(function () {
        return cacheData(root).then(function () {
          markClean();
          updateStatusUI();
          return root;
        });
      });
    }
  };
}

/** Hybrid chooser (advanced Save as…). */
export function saveWithChooser(options) {
  options = options || {};
  var root = getFileRoot() || DataModel.createDefaultFile();
  var suggested = suggestedSemesterFileName();
  return hybridSave(buildHybridSaveConfig(root), {
    forceChooser: !!options.forceChooser,
    title: options.title || 'Save as…',
    preferredDest: options.preferredDest || 'folder',
    allowCreateNew: options.allowCreateNew,
    folderLabel: options.folderLabel,
    message: (options.message ||
      'Prefer Save to folder or Overwrite existing so the file type is checked before write.') +
      '\n\nSuggested filename: ' + suggested
  }).then(function (result) {
    if (result && result.dest === 'folder' && result.name) {
      showAlert('Saved', 'Saved as ' + result.name + ' in the selected folder.');
    }
    return root;
  });
}

export function createFilePicker() {
  return saveWithChooser({
    forceChooser: true,
    preferredDest: 'folder',
    allowCreateNew: true,
    title: 'Save as…',
    message: 'Prefer Save to the ProgramData semesters/ folder or Overwrite existing (checked before write). ' +
      'Create new only with a NEW filename — Replace can wipe first.'
  });
}

function doExportDownload() {
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
}

/** Download-only backup (no hybrid chooser). */
export function exportDownload() {
  if (!getFileRoot()) return Promise.resolve();
  doExportDownload();
  return Promise.resolve();
}

export function clearAndRestoreDefaults() {
  return idbSet(CACHE_KEY, null).then(function () {
    return idbSet(HANDLE_KEY, null);
  }).then(function () {
    return idbSet(DIR_HANDLE_KEY, null);
  }).then(function () {
    return ProgramData.clearProgramDataDir();
  }).then(function () {
    return setMeta({ lastImportedFileName: '', lastSavedAt: '', hasLoadedData: false });
  }).then(function () {
    clearLegacyLocalStorage();
    var fileRoot = DataModel.createDefaultFile();
    var sem = resolveActiveSemester(fileRoot);
    prepareActiveSemester(sem, Scheduler);
    state.fileHandle = null;
    state.fileName = null;
    state.programSemesterDirHandle = null;
    state.programDataDirHandle = null;
    state.semesterFileConnected = false;
    if (Theme) Theme.apply();
    setFileRoot(fileRoot);
    markClean();
    return cacheData(fileRoot).then(function () {
      updateStatusUI();
      return fileRoot;
    });
  });
}
