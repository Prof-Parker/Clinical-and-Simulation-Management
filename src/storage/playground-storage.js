/**
 * Playground sandbox file I/O with file-kind guards and sticky handle.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as CourseDefaults from '../core/course-defaults.js';
import * as DataModel from '../core/data-model/index.js';
import * as FileKind from '../core/file-kind.js';
import * as Scheduler from '../core/scheduler/index.js';
import * as Storage from './semester-storage.js';
import { getFileRoot, state } from '../core/state.js';
import { runWriteGuard, alertKindError, promptGuardDecision } from '../ui/file-kind-guard.js';

var HANDLE_KEY = 'playgroundFileHandle';

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
  FileKind.stampFileKind(copy, FileKind.FILE_KINDS.PLAYGROUND);
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
  FileKind.stampFileKind(fileRoot, FileKind.FILE_KINDS.PLAYGROUND);
  return fileRoot;
}

function serialize(fileRoot) {
  fileRoot.meta = fileRoot.meta || {};
  fileRoot.meta.lastModified = new Date().toISOString();
  FileKind.stampFileKind(fileRoot, FileKind.FILE_KINDS.PLAYGROUND);
  return JSON.stringify(fileRoot, null, 2);
}

function persistHandle(handle) {
  state.playgroundFileHandle = handle;
  state.playgroundFileName = handle ? handle.name : null;
  if (!handle) return Storage._idbSet(HANDLE_KEY, null);
  return Storage._idbSet(HANDLE_KEY, handle);
}

function writeHandle(handle, fileRoot) {
  return handle.createWritable().then(function (writable) {
    return writable.write(serialize(fileRoot)).then(function () {
      return writable.close();
    });
  }).then(function () {
    return persistHandle(handle).then(function () { return handle.name; });
  });
}

function pickSaveHandle(suggestedName) {
  return window.showSaveFilePicker({
    suggestedName: suggestedName || 'user_playground.json',
    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
  });
}

function guardAndWrite(handle, fileRoot, suggestedName) {
  return runWriteGuard(handle, FileKind.FILE_KINDS.PLAYGROUND, {
    suggestedName: suggestedName,
    onRepick: function () {
      return pickSaveHandle(suggestedName);
    }
  }).then(function (decision) {
    if (!decision.proceed) {
      return Promise.reject(new Error('cancelled'));
    }
    return writeHandle(decision.handle, fileRoot);
  });
}

/** Always open the save picker (Save as…). */
function saveToPicker(fileRoot, suggestedName) {
  if (!Storage.supportsFS()) {
    return exportDownload(fileRoot, suggestedName);
  }
  return pickSaveHandle(suggestedName).then(function (handle) {
    return guardAndWrite(handle, fileRoot, suggestedName);
  });
}

/**
 * Sticky save: reuse playgroundFileHandle when permission is granted;
 * otherwise fall back to save picker.
 */
function saveCurrent(fileRoot, suggestedName) {
  if (!Storage.supportsFS()) {
    return exportDownload(fileRoot, suggestedName);
  }
  var existing = state.playgroundFileHandle;
  if (!existing) return saveToPicker(fileRoot, suggestedName);

  return existing.queryPermission({ mode: 'readwrite' }).then(function (perm) {
    if (perm !== 'granted') {
      return existing.requestPermission({ mode: 'readwrite' });
    }
    return perm;
  }).then(function (perm) {
    if (perm !== 'granted') return saveToPicker(fileRoot, suggestedName);
    return guardAndWrite(existing, fileRoot, suggestedName);
  }).catch(function () {
    return saveToPicker(fileRoot, suggestedName);
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
  FileKind.stampFileKind(root, FileKind.FILE_KINDS.PLAYGROUND);
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
    var check = FileKind.assertFileKind(root, FileKind.FILE_KINDS.PLAYGROUND, {
      fileName: file && file.name,
      suggestedName: 'user_{term}_{courseId}_playground.json'
    });
    if (check.ok) {
      FileKind.stampFileKind(root, FileKind.FILE_KINDS.PLAYGROUND);
      return root;
    }
    // Program semester → offer sandbox copy (does not touch live file).
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
        expected: FileKind.FILE_KINDS.PLAYGROUND,
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
  return Storage._idbGet(HANDLE_KEY).then(function (handle) {
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
  connectionLabel,
  persistHandle
};
