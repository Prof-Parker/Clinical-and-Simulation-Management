/**
 * Playground sandbox file I/O with file-kind guards and sticky handles.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as CourseDefaults from '../core/course-defaults.js';
import * as DataModel from '../core/data-model/index.js';
import * as FileKind from '../core/file-kind.js';
import * as Scheduler from '../core/scheduler/index.js';
import * as Storage from './semester-storage.js';
import { hybridSave } from './hybrid-save.js';
import * as ProgramData from './program-data.js';
import { guardedWrite, writeTextToHandle } from './guarded-write.js';
import { getFileRoot, state } from '../core/state.js';
import { alertKindError, promptGuardDecision } from '../ui/file-kind-guard.js';

var HANDLE_KEY = 'playgroundFileHandle';
var DIR_HANDLE_KEY = 'playgroundDirHandle';
var PLAYGROUND_KIND = FileKind.FILE_KINDS.PLAYGROUND;

function suggestedFileName(courseId, season, year) {
  var token = season && year && courseId
    ? (season === 'fall' ? 'F' : 'S') + year + '_' + courseId
    : 'playground';
  return 'user_' + token + '_playground.json';
}

function createFromSemester(semester) {
  var copy = JSON.parse(JSON.stringify(getFileRoot()));
  copy.meta = copy.meta || {};
  copy.meta.playgroundSource = {
    courseId: semester.meta.courseId,
    semesterName: semester.meta.semesterName,
    copiedAt: new Date().toISOString()
  };
  FileKind.stampFileKind(copy, PLAYGROUND_KIND);
  if (copy.semesters && copy.semesters.length) {
    copy.semesters = [JSON.parse(JSON.stringify(semester))];
    copy.meta.activeSemesterId = copy.semesters[0].id;
  }
  return copy;
}

function createFromCourseDefaults(courseId) {
  var fileRoot = DataModel.createDefaultFile();
  var sem = fileRoot.semesters[0];
  if (CourseDefaults && courseId) {
    CourseDefaults.applyToSemester(sem, courseId);
  }
  CalendarEngine.rebuildWeeks(sem);
  Scheduler.regenerateAll(sem);
  fileRoot.meta.playgroundSource = { courseId: courseId, copiedAt: new Date().toISOString() };
  FileKind.stampFileKind(fileRoot, PLAYGROUND_KIND);
  return fileRoot;
}

function serialize(fileRoot) {
  fileRoot.meta = fileRoot.meta || {};
  fileRoot.meta.lastModified = new Date().toISOString();
  FileKind.stampFileKind(fileRoot, PLAYGROUND_KIND);
  return JSON.stringify(fileRoot, null, 2);
}

function persistHandles(handle, dirHandle) {
  state.playgroundFileHandle = handle;
  state.playgroundFileName = handle ? handle.name : null;
  if (dirHandle) state.playgroundDirHandle = dirHandle;
  var chain = Storage._idbSet(HANDLE_KEY, handle || null);
  if (dirHandle) {
    chain = chain.then(function () {
      return Storage._idbSet(DIR_HANDLE_KEY, dirHandle);
    });
  }
  return chain;
}

function writeHandle(handle, fileRoot) {
  return guardedWrite(handle, PLAYGROUND_KIND, function () {
    return writeTextToHandle(handle, serialize(fileRoot));
  }, {
    suggestedName: handle && handle.name
  }).then(function () {
    return handle.name;
  });
}

function buildHybridConfig(fileRoot, suggestedName) {
  return {
    kind: PLAYGROUND_KIND,
    suggestedName: suggestedName || 'user_playground.json',
    fileHandleKey: HANDLE_KEY,
    dirHandleKey: DIR_HANDLE_KEY,
    idbGet: Storage._idbGet,
    idbSet: Storage._idbSet,
    getFileHandle: function () { return state.playgroundFileHandle; },
    getDirHandle: function () { return state.playgroundDirHandle; },
    allowDownload: true,
    write: function (handle) {
      return writeHandle(handle, fileRoot);
    },
    download: function () {
      return exportDownload(fileRoot, suggestedName);
    },
    onPersisted: function (handle, dirHandle) {
      if (!handle) return Promise.resolve(null);
      return persistHandles(handle, dirHandle).then(function () {
        return handle.name;
      });
    }
  };
}

/** Always show destination chooser (Save as…). */
function saveToPicker(fileRoot, suggestedName) {
  if (!Storage.supportsFS()) {
    return exportDownload(fileRoot, suggestedName);
  }
  return hybridSave(buildHybridConfig(fileRoot, suggestedName), {
    forceChooser: true,
    title: 'Save playground',
    message: 'Create a new playground file, overwrite an existing one (validated before write), ' +
      'save into the playgrounds folder, or download a backup.'
  }).then(function (result) {
    return (result && result.name) || suggestedName;
  });
}

/**
 * Sticky save: reuse playgroundFileHandle when permission is granted;
 * else ProgramData/playgrounds/; otherwise hybrid chooser.
 */
function saveCurrent(fileRoot, suggestedName) {
  if (!Storage.supportsFS()) {
    return exportDownload(fileRoot, suggestedName);
  }
  if (!state.playgroundFileHandle && ProgramData.isProgramDataConnected()) {
    var name = suggestedName || 'user_playground.json';
    return ProgramData.writeRelative(
      ProgramData.playgroundPath(name),
      PLAYGROUND_KIND,
      function () { return serialize(fileRoot); }
    ).then(function (result) {
      return persistHandles(result.handle, null).then(function () {
        return result.name;
      });
    });
  }
  return hybridSave(buildHybridConfig(fileRoot, suggestedName), {
    forceChooser: false,
    title: 'Save playground'
  }).then(function (result) {
    return (result && result.name) || suggestedName;
  });
}

function exportDownload(fileRoot, filename) {
  var blob = new Blob([serialize(fileRoot)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'user_playground.json';
  a.click();
  URL.revokeObjectURL(a.href);
  return Promise.resolve(filename);
}

function stampImportedPlayground(root) {
  root.meta = root.meta || {};
  if (!root.meta.playgroundSource) {
    root.meta.playgroundSource = {
      courseId: (root.semesters && root.semesters[0] && root.semesters[0].meta &&
        root.semesters[0].meta.courseId) || '',
      copiedAt: new Date().toISOString(),
      importedFromProgram: true
    };
  }
  FileKind.stampFileKind(root, PLAYGROUND_KIND);
  return root;
}

function importFromFile(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        resolve(DataModel.migrateFile(JSON.parse(reader.result)));
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  }).then(function (root) {
    var check = FileKind.assertFileKind(root, PLAYGROUND_KIND, {
      fileName: file && file.name,
      suggestedName: 'user_{term}_{courseId}_playground.json'
    });
    if (check.ok) {
      FileKind.stampFileKind(root, PLAYGROUND_KIND);
      return root;
    }
    if (check.detected === FileKind.FILE_KINDS.PROGRAM_SEMESTER) {
      return promptGuardDecision({
        proceed: false,
        hardBlock: false,
        needsConfirm: true,
        title: 'Import as playground?',
        message: 'This looks like a live program semester file.\n\n' +
          'Importing it into Playground creates a sandbox copy only — ' +
          'it will not replace the live file.',
        detected: check.detected,
        expected: PLAYGROUND_KIND,
        fileName: check.fileName
      }, {
        confirmLabel: 'Import as playground',
        repickLabel: 'Choose a different file…'
      }).then(function (choice) {
        if (choice !== 'proceed') return Promise.reject(new Error('cancelled'));
        return stampImportedPlayground(root);
      });
    }
    alertKindError(check);
    return Promise.reject(new Error(check.message || 'KIND_MISMATCH'));
  });
}

function openImportPicker() {
  if (Storage.supportsFS()) {
    return window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    }).then(function (handles) {
      return handles[0].getFile();
    }).then(function (file) { return importFromFile(file); });
  }
  return new Promise(function (resolve, reject) {
    var input = document.getElementById('importPlaygroundInput');
    if (!input) return reject(new Error('No input'));
    input.onchange = function (e) {
      var file = e.target.files[0];
      input.value = '';
      if (!file) return reject(new Error('No file'));
      importFromFile(file).then(resolve).catch(reject);
    };
    input.click();
  });
}

function reconnectHandle() {
  if (!Storage.supportsFS()) return Promise.resolve(null);
  return Storage._idbGet(DIR_HANDLE_KEY).then(function (dir) {
    if (dir) state.playgroundDirHandle = dir;
    return Storage._idbGet(HANDLE_KEY);
  }).then(function (handle) {
    if (!handle) return null;
    return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
      if (perm !== 'granted') return null;
      state.playgroundFileHandle = handle;
      state.playgroundFileName = handle.name;
      return handle;
    });
  }).catch(function () { return null; });
}

function connectionLabel() {
  if (state.playgroundFileName) {
    return 'playground · ' + state.playgroundFileName;
  }
  return '';
}

export {
  suggestedFileName,
  createFromSemester,
  createFromCourseDefaults,
  serialize,
  saveToPicker,
  saveCurrent,
  exportDownload,
  importFromFile,
  openImportPicker,
  reconnectHandle,
  connectionLabel
};
