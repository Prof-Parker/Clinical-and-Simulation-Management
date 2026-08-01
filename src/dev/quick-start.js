/**
 * DEV quick-start: connect mock-onedrive, sign in as engineer, open Fall 2026 semester.
 * Triggered by ?devStart=1 (npm run dev:start).
 */

import * as ProgramData from '../storage/program-data.js';
import * as FileKind from '../core/file-kind.js';
import * as UsersRegistryStorage from '../storage/users-registry-storage.js';
import * as UserSession from '../auth/user-session.js';
import * as Storage from '../storage/semester-storage.js';
import { createMockProgramDataRoot } from './mock-fs-handles.js';

var ENGINEER_EMAIL = 'engineer@example.edu';
var ENGINEER_PASSWORD = 'engineer-pass';
var PREFERRED_SEMESTER = 'F2026_REGN_program.json';

export function shouldQuickStart() {
  try {
    var params = new URLSearchParams(window.location.search);
    var flag = params.get('devStart');
    return flag === '1' || flag === 'engineer' || flag === 'true';
  } catch (_) {
    return false;
  }
}

function clearDevStartParam() {
  try {
    var url = new URL(window.location.href);
    if (!url.searchParams.has('devStart')) return;
    url.searchParams.delete('devStart');
    var next = url.pathname + (url.search || '') + (url.hash || '');
    window.history.replaceState({}, '', next);
  } catch (_) { /* ignore */ }
}

function pickSemester(names) {
  var list = names || [];
  if (list.indexOf(PREFERRED_SEMESTER) !== -1) return PREFERRED_SEMESTER;
  var fuzzy = list.find(function (n) {
    return /F2026_REGN/i.test(n) && !/_playground\.json$/i.test(n);
  });
  return fuzzy || list[0] || '';
}

/**
 * @returns {Promise<boolean>} true when signed in with a semester open
 */
export function runQuickStart() {
  console.info('[dev:start] Connecting mock-onedrive as ProgramData…');
  return createMockProgramDataRoot().then(function (root) {
    return ProgramData.setProgramDataDir(root, { persist: false });
  }).then(function () {
    return ProgramData.readRelative(
      ProgramData.PATHS.REGISTRY,
      FileKind.FILE_KINDS.USERS_REGISTRY
    );
  }).then(function (result) {
    return UsersRegistryStorage.importFromRaw(result.raw, result.name, result.handle);
  }).then(function () {
    console.info('[dev:start] Signing in as ' + ENGINEER_EMAIL + '…');
    return UserSession.validateAndSetSession(ENGINEER_EMAIL, ENGINEER_PASSWORD);
  }).then(function (signIn) {
    if (!signIn || !signIn.ok) {
      throw new Error((signIn && signIn.error) || 'Engineer sign-in failed');
    }
    if (signIn.needsPasswordChange) {
      throw new Error('Engineer account requires a password change; re-seed mock-onedrive');
    }
    return ProgramData.listSemesterFiles();
  }).then(function (names) {
    var fileName = pickSemester(names);
    if (!fileName) {
      throw new Error('No semester JSON in mock-onedrive/semesters/');
    }
    console.info('[dev:start] Opening ' + fileName + '…');
    return Storage.loadFromProgramData(fileName).then(function (fileRoot) {
      UserSession.finishSemesterLoad(fileRoot, fileName);
      clearDevStartParam();
      console.info('[dev:start] Ready');
      return true;
    });
  });
}
