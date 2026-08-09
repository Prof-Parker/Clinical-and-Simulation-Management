/**
 * Semester file serialize, read/write handles, apply, and naming helpers.
 */

import * as DataModel from '../core/data-model/index.js';
import * as FileKind from '../core/file-kind.js';
import * as SimFacultyData from '../auth/sim-faculty-data.js';
import * as SimFacultyStorage from './sim-faculty-storage.js';
import { assertKindOrThrow, guardedWrite, writeTextToHandle } from './guarded-write.js';
import { readHandleText } from './fs-handle.js';
import { getData, state, syncSemesterToFile } from '../core/state.js';

export var CACHE_KEY = 'semesterData';
export var HANDLE_KEY = 'fileHandle';
export var DIR_HANDLE_KEY = 'programSemesterDirHandle';
export var PROGRAM_KIND = FileKind.FILE_KINDS.PROGRAM_SEMESTER;

export function serialize(fileRoot) {
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

export function writeToHandle(handle, data) {
  return guardedWrite(handle, PROGRAM_KIND, function () {
    return writeTextToHandle(handle, serialize(data));
  });
}

export function writeFileRootToHandle(handle, fileRoot) {
  if (!fileRoot.meta) fileRoot.meta = {};
  if (!fileRoot.meta.revision) fileRoot.meta.revision = 1;
  return writeToHandle(handle, fileRoot);
}

export function assertProgramRoot(fileRoot, fileName) {
  return assertKindOrThrow(fileRoot, PROGRAM_KIND, { fileName: fileName });
}

export function readFromHandle(handle) {
  return readHandleText(handle, 'readwrite').then(function (text) {
    var raw = JSON.parse(text);
    // Kind-check raw JSON before migrateFile so non-semester roots cannot be laundered.
    assertProgramRoot(raw, handle.name);
    return DataModel.migrateFile(raw);
  });
}

export function applyLoadedFileRoot(fileRoot) {
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

export { needsRegeneration } from './semester-hydrate.js';

export function semesterFileTokenFromMeta(season, year, courseId) {
  if (!season || !year || !courseId) return null;
  return (season === 'fall' ? 'F' : 'S') + year + '_' + courseId;
}

/** {S|F}{year}_{courseId} token, e.g. F2026_REGN15P (spec §2.2). */
export function semesterFileToken() {
  var data = getData();
  if (!data || !data.meta) return null;
  var season = data.meta.semesterSeason;
  var year = data.meta.semesterYear;
  var courseId = data.meta.courseId;
  if (!season || !year || !courseId) return null;
  return (season === 'fall' ? 'F' : 'S') + year + '_' + courseId;
}

export function suggestedSemesterFileName() {
  var token = semesterFileToken();
  return token ? token + '.json' : 'regn-tracker.json';
}

export function suggestedDownloadName() {
  return state.fileName || suggestedSemesterFileName();
}

export function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === 'function';
}
