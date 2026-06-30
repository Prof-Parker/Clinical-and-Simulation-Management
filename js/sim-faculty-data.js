/* global App */
var App = App || {};

App.SimFacultyData = (function () {
  var FILE_VERSION = 1;

  function defaultStudentRoles() {
    return { flags: { primary: null, secondary: null } };
  }

  function createEmptySimFacultyFile(linkedSemesterHint) {
    return {
      meta: {
        fileVersion: FILE_VERSION,
        lastModified: new Date().toISOString(),
        linkedSemesterHint: linkedSemesterHint || ''
      },
      semesters: {}
    };
  }

  function migrateSimFaculty(raw) {
    if (!raw) return createEmptySimFacultyFile();
    if (!raw.meta) raw.meta = {};
    raw.meta.fileVersion = FILE_VERSION;
    if (!raw.semesters) raw.semesters = {};
    return raw;
  }

  function ensureSemesterBucket(facultyRoot, semesterId) {
    if (!facultyRoot.semesters[semesterId]) facultyRoot.semesters[semesterId] = {};
    return facultyRoot.semesters[semesterId];
  }

  function getStudentRoles(facultyRoot, semesterId, studentId) {
    if (!facultyRoot || !semesterId || !studentId) return defaultStudentRoles();
    var sem = facultyRoot.semesters[semesterId];
    if (!sem || !sem[studentId]) {
      var bucket = ensureSemesterBucket(facultyRoot, semesterId);
      bucket[studentId] = defaultStudentRoles();
      return bucket[studentId];
    }
    if (!sem[studentId].flags) sem[studentId].flags = { primary: null, secondary: null };
    return sem[studentId];
  }

  function setStudentRoleAssignment(facultyRoot, semesterId, studentId, simNum, iterKey, value) {
    var rd = getStudentRoles(facultyRoot, semesterId, studentId);
    if (!rd[simNum]) rd[simNum] = {};
    rd[simNum][iterKey] = value;
  }

  function setStudentFlag(facultyRoot, semesterId, studentId, flagKey, value) {
    var rd = getStudentRoles(facultyRoot, semesterId, studentId);
    if (!rd.flags) rd.flags = { primary: null, secondary: null };
    rd.flags[flagKey] = value || null;
  }

  function cloneRoles(roles) {
    return JSON.parse(JSON.stringify(roles || {}));
  }

  function rolesHasData(roles) {
    if (!roles || typeof roles !== 'object') return false;
    return Object.keys(roles).length > 0;
  }

  function extractRolesFromSemester(semester) {
    if (!semester || !semester.roles) return {};
    return cloneRoles(semester.roles);
  }

  function stripRolesFromSemester(semester) {
    if (semester && semester.roles !== undefined) delete semester.roles;
  }

  function mergeSemesterRoles(facultyRoot, semesterId, roles) {
    if (!facultyRoot || !semesterId || !rolesHasData(roles)) return false;
    var bucket = ensureSemesterBucket(facultyRoot, semesterId);
    Object.keys(roles).forEach(function (studentId) {
      bucket[studentId] = cloneRoles(roles[studentId]);
    });
    return true;
  }

  function stripRolesFromFileRoot(fileRoot) {
    if (!fileRoot || !fileRoot.semesters) return;
    fileRoot.semesters.forEach(stripRolesFromSemester);
  }

  function cloneFileRootWithoutRoles(fileRoot) {
    var clone = JSON.parse(JSON.stringify(fileRoot));
    stripRolesFromFileRoot(clone);
    delete clone._legacySimRoles;
    return clone;
  }

  function migrateRolesFromFileRoot(facultyRoot, fileRoot) {
    if (!facultyRoot || !fileRoot) return false;
    var migrated = false;
    (fileRoot.semesters || []).forEach(function (sem) {
      var roles = extractRolesFromSemester(sem);
      if (mergeSemesterRoles(facultyRoot, sem.id, roles)) migrated = true;
      stripRolesFromSemester(sem);
    });
    if (fileRoot._legacySimRoles && fileRoot.semesters && fileRoot.semesters.length) {
      if (mergeSemesterRoles(facultyRoot, fileRoot.semesters[0].id, fileRoot._legacySimRoles)) {
        migrated = true;
      }
      delete fileRoot._legacySimRoles;
    }
    return migrated;
  }

  function facultyRootHasData(facultyRoot) {
    if (!facultyRoot || !facultyRoot.semesters) return false;
    return Object.keys(facultyRoot.semesters).some(function (semId) {
      return rolesHasData(facultyRoot.semesters[semId]);
    });
  }

  return {
    FILE_VERSION: FILE_VERSION,
    createEmptySimFacultyFile: createEmptySimFacultyFile,
    migrateSimFaculty: migrateSimFaculty,
    getStudentRoles: getStudentRoles,
    setStudentRoleAssignment: setStudentRoleAssignment,
    setStudentFlag: setStudentFlag,
    extractRolesFromSemester: extractRolesFromSemester,
    stripRolesFromSemester: stripRolesFromSemester,
    mergeSemesterRoles: mergeSemesterRoles,
    stripRolesFromFileRoot: stripRolesFromFileRoot,
    cloneFileRootWithoutRoles: cloneFileRootWithoutRoles,
    migrateRolesFromFileRoot: migrateRolesFromFileRoot,
    facultyRootHasData: facultyRootHasData,
    rolesHasData: rolesHasData
  };
})();
