/**
 * Semester and file migration, audit meta backfill, and legacy import.
 */

import { uid, emptySchedule, emptyCell } from './students.js';
import {
  defaultConfig,
  normalizeConfig,
  getClinicalGroups,
  cloneConfig,
  configsMatch,
  syncSemesterFaculty
} from './config.js';
import {
  defaultFacilities,
  normalizeFacilities,
  migrateClinicalGroupFacilities
} from './facilities.js';
import { migrateTheory } from '../theory-data.js';
import {
  ensureFacilityTimes,
  ensureSimTimes,
  ensureOrientationTimes
} from '../schedule-hours.js';
import {
  defaultFaculty,
  defaultSections,
  buildSemesterName,
  startDateForSeason,
  parseSemesterDisplay,
  createDefaultFile
} from './semester.js';
import { looksLikeLegacySemester } from '../file-kind-shape.js';

export var FILE_VERSION = 5;
export var VERSION = 1;
export var AUDIT_PHASES = ['setup', 'active', 'makeup_review', 'audit_exported', 'locked'];

// Backfill audit/closeout meta fields (spec: docs/AUDIT_TRACKING_IMPLEMENTATION.md §4.1).
// Legacy mapping: finalized === true -> auditPhase 'active'; never auto-lock.
export function ensureAuditMeta(meta) {
  if (meta.courseId === undefined || meta.courseId === null) meta.courseId = '';
  else meta.courseId = String(meta.courseId);
  if (!meta.auditPhase || AUDIT_PHASES.indexOf(meta.auditPhase) < 0) {
    meta.auditPhase = meta.finalized === true ? 'active' : 'setup';
  }
  if (!meta.leadFaculty || typeof meta.leadFaculty !== 'object') {
    meta.leadFaculty = { name: '', email: '' };
  }
  if (meta.leadFaculty.name === undefined) meta.leadFaculty.name = '';
  if (meta.leadFaculty.email === undefined) meta.leadFaculty.email = '';
  if (!meta.makeupAttestation || typeof meta.makeupAttestation !== 'object') {
    meta.makeupAttestation = { attestedAt: null, attestedByName: '', attestedByEmail: '', notes: '' };
  }
  if (meta.makeupAttestation.attestedAt === undefined) meta.makeupAttestation.attestedAt = null;
  if (meta.makeupAttestation.attestedByName === undefined) meta.makeupAttestation.attestedByName = '';
  if (meta.makeupAttestation.attestedByEmail === undefined) meta.makeupAttestation.attestedByEmail = '';
  if (meta.makeupAttestation.notes === undefined) meta.makeupAttestation.notes = '';
  if (!meta.auditExport || typeof meta.auditExport !== 'object') {
    meta.auditExport = { exportedAt: null, exportedByName: '', snapshotHash: '', appVersion: '', exportVersion: 0 };
  }
  if (meta.auditExport.exportedAt === undefined) meta.auditExport.exportedAt = null;
  if (meta.auditExport.exportedByName === undefined) meta.auditExport.exportedByName = '';
  if (meta.auditExport.snapshotHash === undefined) meta.auditExport.snapshotHash = '';
  if (meta.auditExport.appVersion === undefined) meta.auditExport.appVersion = '';
  if (!meta.auditExport.exportVersion) meta.auditExport.exportVersion = 0;
  if (!meta.lock || typeof meta.lock !== 'object') {
    meta.lock = { lockedAt: null, lockedByName: '', lockedReason: 'semester_complete' };
  }
  if (meta.lock.lockedAt === undefined) meta.lock.lockedAt = null;
  if (meta.lock.lockedByName === undefined) meta.lock.lockedByName = '';
  if (!meta.lock.lockedReason) meta.lock.lockedReason = 'semester_complete';
  return meta;
}

function coerceFiniteYear(value, fallback) {
  var n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStudentSchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length !== 18) return emptySchedule();
  return schedule.map(function (c) {
    return (c && typeof c === 'object') ? c : emptyCell();
  });
}

export function migrateSemester(semester) {
  if (!semester || typeof semester !== 'object') semester = {};
  if (!semester.id) semester.id = uid();
  if (!semester.meta || typeof semester.meta !== 'object') {
    semester.meta = { version: VERSION, semesterName: 'Semester', lastModified: new Date().toISOString() };
  }
  if (!semester.config || typeof semester.config !== 'object') semester.config = defaultConfig();
  normalizeConfig(semester.config);
  if (!semester.config.maxStudentsPerSimSession) semester.config.maxStudentsPerSimSession = 8;
  if (!semester.config.maxStudentsPerSimSessionOverload) semester.config.maxStudentsPerSimSessionOverload = 9;
  if (!semester.config.maxPerClinicalGroupOverload) {
    semester.config.maxPerClinicalGroupOverload = (semester.config.maxPerClinicalGroup || 6) + 1;
  }
  if (!semester.calendar || typeof semester.calendar !== 'object') {
    semester.calendar = { semesterStartDate: new Date().toISOString().slice(0, 10), weeks: [] };
  }
  if (!Array.isArray(semester.holidays)) semester.holidays = [];
  semester.holidays = semester.holidays.filter(function (h) { return h && typeof h === 'object'; });
  semester.holidays.forEach(function (h) {
    if (h.type === 'mondayHoliday') h.type = 'holiday';
  });
  if (!Array.isArray(semester.orientations)) semester.orientations = [];
  semester.orientations = semester.orientations.filter(function (o) {
    return o && typeof o === 'object';
  });
  if (!Array.isArray(semester.simInstructors)) semester.simInstructors = [];
  if (!Array.isArray(semester.students)) semester.students = [];
  semester.students = semester.students.filter(function (s) {
    return s && typeof s === 'object';
  });
  // Normalize roster arrays before facility remaps touch them.
  semester.students.forEach(function (s) {
    if (!Array.isArray(s.makeups)) s.makeups = [];
    else s.makeups = s.makeups.filter(function (m) { return m && typeof m === 'object'; });
    if (!Array.isArray(s.absences)) s.absences = [];
    s.schedule = normalizeStudentSchedule(s.schedule);
  });
  if (!Array.isArray(semester.facilities) || !semester.facilities.length) {
    semester.facilities = defaultFacilities();
  } else {
    semester.facilities = semester.facilities.filter(function (f) {
      return f && typeof f === 'object';
    });
    if (!semester.facilities.length) semester.facilities = defaultFacilities();
  }
  normalizeFacilities(semester);
  migrateClinicalGroupFacilities(semester);
  if (!Array.isArray(semester.faculty)) {
    semester.faculty = defaultFaculty(getClinicalGroups(semester.config));
  } else {
    semester.faculty = semester.faculty.filter(function (f) { return f && typeof f === 'object'; });
  }
  syncSemesterFaculty(semester);
  if (!Array.isArray(semester.sections) || !semester.sections.length) {
    var seen = {};
    semester.sections = [];
    semester.students.forEach(function (s) {
      if (s.section && !seen[s.section]) {
        seen[s.section] = true;
        semester.sections.push({ id: uid(), name: s.section });
      }
    });
    if (!semester.sections.length) semester.sections = defaultSections();
  } else {
    semester.sections = semester.sections.filter(function (sec) {
      return sec && typeof sec === 'object';
    });
  }
  var seenStudentIds = {};
  semester.students.forEach(function (s) {
    s.schedule = normalizeStudentSchedule(s.schedule);
    if (!s.id || seenStudentIds[s.id]) s.id = uid();
    seenStudentIds[s.id] = true;
    if (s.email === undefined) s.email = '';
    if (!Array.isArray(s.absences)) s.absences = [];
    if (!Array.isArray(s.makeups)) s.makeups = [];
    s.makeups = s.makeups.filter(function (m) { return m && typeof m === 'object'; });
    s.makeups.forEach(function (m) {
      // Provenance backfill (spec §4.3): legacy records get an id but keep
      // appliedAt null since the original apply time is unknown.
      if (!m.id) m.id = uid();
      if (m.appliedAt === undefined) m.appliedAt = null;
      if (m.appliedByName === undefined) m.appliedByName = '';
    });
    if (s.orientationWeekIndex !== undefined && s.orientationWeekIndex !== null) {
      var ow = parseInt(s.orientationWeekIndex, 10);
      s.orientationWeekIndex = (ow >= 0 && ow < 18) ? ow : null;
    }
    s.schedule.forEach(function (c) {
      if (c.simMakeup === undefined) c.simMakeup = false;
      if (c.simOverload === undefined) c.simOverload = false;
      if (c.facilityId === undefined) c.facilityId = null;
    });
  });
  (semester.facilities || []).forEach(ensureFacilityTimes);
  ensureSimTimes(semester.config);
  (semester.orientations || []).forEach(ensureOrientationTimes);
  semester.meta.version = VERSION;
  if (semester.meta.configCustomized === undefined) semester.meta.configCustomized = false;
  if (semester.meta.finalized === undefined) semester.meta.finalized = false;
  ensureAuditMeta(semester.meta);
  var parsed = parseSemesterDisplay(semester);
  if (!semester.meta.semesterSeason && parsed.season) {
    semester.meta.semesterSeason = parsed.season;
  }
  var fallbackYear = new Date().getFullYear();
  semester.meta.semesterYear = coerceFiniteYear(
    semester.meta.semesterYear != null ? semester.meta.semesterYear : parsed.year,
    fallbackYear
  );
  if (!semester.meta.semesterSeason) semester.meta.semesterSeason = 'spring';
  semester.meta.semesterName = buildSemesterName(
    semester.meta.semesterSeason,
    semester.meta.semesterYear
  );
  if (!semester.calendar.semesterStartDate) {
    semester.calendar.semesterStartDate = startDateForSeason(
      semester.meta.semesterSeason,
      semester.meta.semesterYear
    );
  }
  if (!Array.isArray(semester.proposals)) semester.proposals = [];
  migrateTheory(semester);
  return semester;
}

export function migrateFile(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid semester file: expected a JSON object');
  }
  if (Array.isArray(raw.semesters)) {
    if (!raw.semesters.length) {
      throw new Error('Invalid semester file: no semesters found');
    }
    if (!raw.meta || typeof raw.meta !== 'object') raw.meta = {};
    raw.meta.fileVersion = FILE_VERSION;
    var seenSemIds = {};
    raw.semesters = raw.semesters.filter(function (sem) {
      return sem && typeof sem === 'object';
    });
    if (!raw.semesters.length) {
      throw new Error('Invalid semester file: no semesters found');
    }
    raw.semesters.forEach(function (sem) {
      migrateSemester(sem);
      if (seenSemIds[sem.id]) sem.id = uid();
      seenSemIds[sem.id] = true;
    });
    if (!raw.meta.activeSemesterId || !seenSemIds[raw.meta.activeSemesterId]) {
      raw.meta.activeSemesterId = raw.semesters[0].id;
    }
    if (!raw.meta.schedulingDefaults || typeof raw.meta.schedulingDefaults !== 'object') {
      raw.meta.schedulingDefaults = cloneConfig(raw.semesters[0].config);
    }
    if (!raw.meta.revision) raw.meta.revision = 1;
    if (!raw.meta.activeCourseCode) {
      var activeSem = raw.semesters.find(function (s) {
        return s.id === raw.meta.activeSemesterId;
      }) || raw.semesters[0];
      raw.meta.activeCourseCode = (activeSem && activeSem.meta && activeSem.meta.courseId) || 'REGN15P';
    }
    raw.semesters.forEach(function (sem) {
      if (sem.meta.configCustomized === undefined) {
        sem.meta.configCustomized = !configsMatch(sem.config, raw.meta.schedulingDefaults);
      }
    });
    return raw;
  }
  if (!looksLikeLegacySemester(raw)) {
    throw new Error('Invalid semester file: unrecognized JSON shape');
  }
  var sem = migrateSemester(raw);
  var defaults = cloneConfig(sem.config);
  return {
    meta: {
      fileVersion: FILE_VERSION,
      activeSemesterId: sem.id,
      schedulingDefaults: defaults,
      lastModified: new Date().toISOString()
    },
    semesters: [sem]
  };
}

export function migrate(data) {
  return migrateFile(data);
}

export function migrateFromLegacyLocalStorage() {
  try {
    var dates = JSON.parse(localStorage.getItem('nursingWeekDates') || 'null');
    var names = JSON.parse(localStorage.getItem('nursingStudentNames') || 'null');
    var roles = JSON.parse(localStorage.getItem('nursingSimRoles') || 'null');
    if (!names && !roles && !dates) return null;
    var data = createDefaultFile();
    if (names && names.length === data.semesters[0].students.length) {
      data.semesters[0].students.forEach(function (s, i) { s.name = names[i] || s.name; });
    }
    if (roles) data._legacySimRoles = roles;
    return data;
  } catch (e) {
    return null;
  }
}
