/**
 * Semester file persistence and IndexedDB cache.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as DataModel from '../core/data-model/index.js';
import * as FileKind from '../core/file-kind.js';
import * as Proposals from '../proposals/proposals.js';
import * as Scheduler from '../core/scheduler/index.js';
import * as SimFacultyData from '../auth/sim-faculty-data.js';
import * as SimFacultyStorage from './sim-faculty-storage.js';
import * as Theme from '../ui/theme.js';
import { assertKindOrThrow, guardedWrite, writeTextToHandle } from './guarded-write.js';
import { hybridSave, ensureReadwritePermission, isCancelError } from './hybrid-save.js';
import { readHandleText } from './fs-handle.js';
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
import { getData, getFileRoot, markClean, onStateChange, setFileRoot, state, syncSemesterToFile } from '../core/state.js';
import { refresh } from '../ui/chrome.js';
import { showAlert, showConfirm } from '../ui/dialogs.js';

var CACHE_KEY = 'semesterData';
var HANDLE_KEY = 'fileHandle';
var DIR_HANDLE_KEY = 'programSemesterDirHandle';
var PROGRAM_KIND = FileKind.FILE_KINDS.PROGRAM_SEMESTER;
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
  function clearAndRestoreDefaults() {
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
      var sem = fileRoot.semesters.find(function (s) {
        return s.id === fileRoot.meta.activeSemesterId;
      }) || fileRoot.semesters[0];
      CalendarEngine.rebuildWeeks(sem);
      if (Scheduler) Scheduler.regenerateAll(sem);
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
  function serialize(fileRoot) {
    syncSemesterToFile();
    var facultyRoot = SimFacultyStorage ? SimFacultyStorage.getSimFacultyRoot() : null;
    var exportRoot = SimFacultyData && facultyRoot
      ? SimFacultyData.embedSimRolesInFileRoot(fileRoot, facultyRoot)
      : (SimFacultyData
        ? SimFacultyData.cloneFileRootWithoutRoles(fileRoot)
        : JSON.parse(JSON.stringify(fileRoot)));
    exportRoot.meta.lastModified = new Date().toISOString();
    FileKind.stampFileKind(exportRoot, PROGRAM_KIND);
    if (state.data && state.data.meta) {
      state.data.meta.lastModified = exportRoot.meta.lastModified;
    }
    if (exportRoot.meta) delete exportRoot.meta.darkMode;
    return JSON.stringify(exportRoot, null, 2);
  }
  function cacheData(fileRoot) {
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
  function loadCache() {
    return idbGet(CACHE_KEY);
  }
  function scheduleAutoSave() {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      saveCurrent();
    }, 600);
  }
  function saveCurrent(forceOverwrite) {
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
  function writeFileRootToHandle(handle, fileRoot) {
    if (!fileRoot.meta) fileRoot.meta = {};
    if (!fileRoot.meta.revision) fileRoot.meta.revision = 1;
    return writeToHandle(handle, fileRoot);
  }
  function semesterFileTokenFromMeta(season, year, courseId) {
    if (!season || !year || !courseId) return null;
    return (season === 'fall' ? 'F' : 'S') + year + '_' + courseId;
  }
  function supportsDirectoryPicker() {
    return typeof window.showDirectoryPicker === 'function';
  }
  function writeToHandle(handle, data) {
    return guardedWrite(handle, PROGRAM_KIND, function () {
      return writeTextToHandle(handle, serialize(data));
    });
  }
  function assertProgramRoot(fileRoot, fileName) {
    return assertKindOrThrow(fileRoot, PROGRAM_KIND, { fileName: fileName });
  }
  function readFromHandle(handle) {
    return readHandleText(handle, 'readwrite').then(function (text) {
      return DataModel.migrateFile(JSON.parse(text));
    });
  }
  function openFilePicker() {
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
  function loadFromProgramData(fileName) {
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
  // {S|F}{year}_{courseId} token, e.g. F2026_REGN15P (spec §2.2). Null when
  // course or season/year are unknown so callers can fall back to legacy names.
  function semesterFileToken() {
    var data = getData();
    if (!data || !data.meta) return null;
    var season = data.meta.semesterSeason;
    var year = data.meta.semesterYear;
    var courseId = data.meta.courseId;
    if (!season || !year || !courseId) return null;
    return (season === 'fall' ? 'F' : 'S') + year + '_' + courseId;
  }
  function suggestedSemesterFileName() {
    var token = semesterFileToken();
    return token ? token + '.json' : 'regn-tracker.json';
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
  function saveWithChooser(options) {
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

  function createFilePicker() {
    return saveWithChooser({
      forceChooser: true,
      preferredDest: 'folder',
      allowCreateNew: true,
      title: 'Save as…',
      message: 'Prefer Save to the ProgramData semesters/ folder or Overwrite existing (checked before write). ' +
        'Create new only with a NEW filename — Replace can wipe first.'
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
  function importFromFile(file) {
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
  function exportDownload() {
    if (!getFileRoot()) return Promise.resolve();
    doExportDownload();
    return Promise.resolve();
  }

  function suggestedDownloadName() {
    return state.fileName || suggestedSemesterFileName();
  }
  function applyLoadedFileRoot(fileRoot) {
    if (!fileRoot.meta) fileRoot.meta = {};
    if (!fileRoot.meta.revision) fileRoot.meta.revision = 1;
    state.fileLoadedRevision = fileRoot.meta.revision;
    if (SimFacultyStorage) {
      SimFacultyStorage.hydrateFromFileRoot(fileRoot);
    } else {
      SimFacultyData.stripRolesFromFileRoot(fileRoot);
    }
    return fileRoot;
  }
  function init() {
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
  function isSemesterFileConnected() {
    return !!(state.fileHandle || state.semesterFileConnected);
  }
  function activateFileRoot(fileRoot, fileName) {
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
  function needsRegeneration(semester) {
    if (!semester || !semester.students || !semester.students.length) return false;
    return semester.students.every(function (s) {
      return s.schedule.every(function (c) {
        return !c.clinical && !c.sim && !c.makeupClinical && !c.inactive;
      });
    });
  }
export { supportsFS, init, saveCurrent, scheduleAutoSave, openFilePicker, createFilePicker, saveWithChooser, importFromFile, exportDownload, updateStatusUI, flashStatus, cacheData, shouldShowOnedriveBanner, configureImportInput, isIOSDevice, semesterFileToken, suggestedSemesterFileName, suggestedDownloadName, clearAndRestoreDefaults, applyLoadedFileRoot, writeFileRootToHandle, readFromHandle, writeToHandle, serialize, semesterFileTokenFromMeta, supportsDirectoryPicker, isSemesterFileConnected, activateFileRoot, loadFromProgramData, isCancelError, idbGet as _idbGet, idbSet as _idbSet, HANDLE_KEY as _HANDLE_KEY, DIR_HANDLE_KEY as _DIR_HANDLE_KEY };
