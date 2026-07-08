/**
 * Simulation role assignments — in-memory view of meta.simRoles in the semester file.
 */

import * as SimFacultyData from '../auth/sim-faculty-data.js';
import * as Storage from './semester-storage.js';
import { getData, notifyChange, state } from '../core/state.js';

function setSimFacultyRoot(facultyRoot) {
  state.simFacultyRoot = facultyRoot;
}

function getSimFacultyRoot() {
  return state.simFacultyRoot;
}

function isReady() {
  return !!state.fileRoot && !!state.simFacultyRoot;
}

function hydrateFromFileRoot(fileRoot) {
  var facultyRoot = getSimFacultyRoot() || SimFacultyData.createEmptySimFacultyRoot();
  var result = SimFacultyData.hydrateFacultyRootFromFileRoot(fileRoot, facultyRoot);
  setSimFacultyRoot(result.facultyRoot);
  state.simFacultyReady = !!fileRoot;
  if (result.migrated) state.dirty = true;
  return result.migrated;
}

function getStudentRoles(studentId) {
  var facultyRoot = getSimFacultyRoot();
  var sem = getData();
  if (!facultyRoot || !sem) return { flags: { primary: null, secondary: null } };
  return SimFacultyData.getStudentRoles(facultyRoot, sem.id, studentId);
}

function setStudentRoleAssignment(studentId, simNum, iterKey, value) {
  var facultyRoot = getSimFacultyRoot();
  var sem = getData();
  if (!facultyRoot || !sem) return;
  SimFacultyData.setStudentRoleAssignment(facultyRoot, sem.id, studentId, simNum, iterKey, value);
  notifyChange();
}

function setStudentFlag(studentId, flagKey, value) {
  var facultyRoot = getSimFacultyRoot();
  var sem = getData();
  if (!facultyRoot || !sem) return;
  SimFacultyData.setStudentFlag(facultyRoot, sem.id, studentId, flagKey, value);
  notifyChange();
}

function init(fileRoot) {
  var facultyRoot = SimFacultyData.createEmptySimFacultyRoot();
  setSimFacultyRoot(facultyRoot);
  if (fileRoot) hydrateFromFileRoot(fileRoot);
  state.simFacultyReady = !!fileRoot;
  if (Storage.updateStatusUI) Storage.updateStatusUI();
  return Promise.resolve(facultyRoot);
}

export {
  init,
  isReady,
  hydrateFromFileRoot,
  getStudentRoles,
  setStudentRoleAssignment,
  setStudentFlag,
  getSimFacultyRoot
};
