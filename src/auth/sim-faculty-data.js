/**
 * Sim faculty role assignments data.
 */

var FILE_VERSION = 1;
var SIM_ROLES_ENCODING = 'b64v1';

  function defaultStudentRoles() {
    return { flags: { primary: null, secondary: null } };
  }

  function createEmptySimFacultyRoot() {
    return { semesters: {} };
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

  function encodeUtf8Base64(obj) {
    var json = JSON.stringify(obj);
    if (typeof TextEncoder !== 'undefined') {
      var bytes = new TextEncoder().encode(json);
      var binary = '';
      bytes.forEach(function (b) { binary += String.fromCharCode(b); });
      return btoa(binary);
    }
    return btoa(unescape(encodeURIComponent(json)));
  }

  function decodeUtf8Base64(b64) {
    if (!b64 || typeof b64 !== 'string') return null;
    try {
      var binary = atob(b64);
      if (typeof TextDecoder !== 'undefined') {
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return JSON.parse(new TextDecoder().decode(bytes));
      }
      return JSON.parse(decodeURIComponent(escape(binary)));
    } catch (e) {
      return null;
    }
  }

  function encodeSimRolesBlob(semesters) {
    return {
      encoding: SIM_ROLES_ENCODING,
      data: encodeUtf8Base64(semesters || {})
    };
  }

  function decodeSimRolesFromMeta(meta) {
    if (!meta || !meta.simRoles) return {};
    var blob = meta.simRoles;
    if (!blob || typeof blob !== 'object' || !blob.data) return {};
    if ((blob.encoding || SIM_ROLES_ENCODING) !== SIM_ROLES_ENCODING) return {};
    var decoded = decodeUtf8Base64(blob.data);
    return decoded && typeof decoded === 'object' ? decoded : {};
  }

  function cloneFileRootWithoutRoles(fileRoot) {
    var clone = JSON.parse(JSON.stringify(fileRoot));
    stripRolesFromFileRoot(clone);
    delete clone._legacySimRoles;
    if (clone.meta) delete clone.meta.simRoles;
    return clone;
  }

  function embedSimRolesInFileRoot(fileRoot, facultyRoot) {
    var clone = cloneFileRootWithoutRoles(fileRoot);
    if (!clone.meta) clone.meta = {};
    var semesters = facultyRoot && facultyRoot.semesters ? facultyRoot.semesters : {};
    if (facultyRootHasData(facultyRoot)) {
      clone.meta.simRoles = encodeSimRolesBlob(semesters);
    } else {
      delete clone.meta.simRoles;
    }
    return clone;
  }

  function hydrateFacultyRootFromFileRoot(fileRoot, facultyRoot) {
    if (!facultyRoot) facultyRoot = createEmptySimFacultyRoot();
    var migrated = false;
    var fromEncoded = decodeSimRolesFromMeta(fileRoot && fileRoot.meta);
    Object.keys(fromEncoded).forEach(function (semId) {
      if (mergeSemesterRoles(facultyRoot, semId, fromEncoded[semId])) migrated = true;
    });
    if (migrateRolesFromFileRoot(facultyRoot, fileRoot)) migrated = true;
    return { facultyRoot: facultyRoot, migrated: migrated };
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

export {
  FILE_VERSION,
  SIM_ROLES_ENCODING,
  createEmptySimFacultyRoot,
  getStudentRoles,
  setStudentRoleAssignment,
  setStudentFlag,
  extractRolesFromSemester,
  stripRolesFromSemester,
  mergeSemesterRoles,
  stripRolesFromFileRoot,
  cloneFileRootWithoutRoles,
  embedSimRolesInFileRoot,
  hydrateFacultyRootFromFileRoot,
  encodeSimRolesBlob,
  decodeSimRolesFromMeta,
  encodeUtf8Base64,
  decodeUtf8Base64,
  migrateRolesFromFileRoot,
  facultyRootHasData,
  rolesHasData
};
