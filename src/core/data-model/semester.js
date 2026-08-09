/**
 * Semester lifecycle: defaults, naming, templates, and sorting.
 */

import { uid, defaultStudentName, createStudent, assignDefaultStudentNames } from './students.js';
import {
  defaultConfig,
  cloneConfig,
  CLINICAL_GROUPS
} from './config.js';
import {
  defaultFacilities,
  buildDefaultClinicalGroupFacilities,
  getDefaultFacilityIdForClinicalGroup
} from './facilities.js';
import { VERSION, FILE_VERSION, ensureAuditMeta, migrateSemester } from './migrations.js';
import { parseDate } from '../calendar-engine.js';

export function defaultSections() {
  return [
    { id: uid(), name: 'F6011' },
    { id: uid(), name: 'F6012' },
    { id: uid(), name: 'F6013' },
    { id: uid(), name: 'F6014' },
    { id: uid(), name: 'F6015' }
  ];
}

export function defaultFaculty(groups) {
  var list = groups || CLINICAL_GROUPS;
  return list.map(function (g) {
    return { id: uid(), name: '', clinicalGroup: g, needed: false };
  });
}

export function buildSemesterName(season, year) {
  var label = season === 'fall' ? 'Fall' : 'Spring';
  return label + ' ' + year;
}

export function startDateForSeason(season, year) {
  var y = parseInt(year, 10) || new Date().getFullYear();
  var month = season === 'fall' ? 7 : 0;
  var d = new Date(y, month, 1);
  var m = String(d.getMonth() + 1).padStart(2, '0');
  return y + '-' + m + '-01';
}

export function applySemesterSeasonYear(semester, season, year) {
  semester.meta.semesterSeason = season;
  semester.meta.semesterYear = parseInt(year, 10);
  semester.meta.semesterName = buildSemesterName(season, year);
  semester.calendar.semesterStartDate = startDateForSeason(season, year);
}

export function getSemesterLabel(semester) {
  return (semester.meta && semester.meta.semesterName) || 'Untitled Semester';
}

export function parseSemesterDisplay(semester) {
  var season = semester.meta && semester.meta.semesterSeason;
  var year = semester.meta && semester.meta.semesterYear;
  if (season && year) {
    return {
      name: buildSemesterName(season, year),
      season: season,
      year: String(year),
      finalized: !!(semester.meta && semester.meta.finalized)
    };
  }
  var name = getSemesterLabel(semester);
  var lower = name.toLowerCase();
  var season = null;
  if (lower.indexOf('spring') >= 0) season = 'spring';
  else if (lower.indexOf('fall') >= 0) season = 'fall';
  var yearMatch = name.match(/\b(20\d{2})\b/);
  var year = yearMatch ? yearMatch[1] : null;
  if ((!season || !year) && semester.calendar && semester.calendar.semesterStartDate) {
    var d = parseDate(semester.calendar.semesterStartDate);
    if (d) {
      if (!season) {
        var m = d.getMonth();
        if (m >= 0 && m <= 4) season = 'spring';
        else if (m >= 7) season = 'fall';
      }
      if (!year) year = String(d.getFullYear());
    }
  }
  if (!year) year = String(new Date().getFullYear());
  return {
    name: name,
    season: season,
    year: year,
    finalized: !!(semester.meta && semester.meta.finalized)
  };
}

export function createDefaultSemester() {
  var facilities = defaultFacilities();
  var sections = defaultSections();
  var students = [];
  var cfg = defaultConfig();
  cfg.clinicalGroupFacilities = buildDefaultClinicalGroupFacilities(cfg.clinicalGroups, facilities);
  var simGroups = cfg.simGroups;
  var idx = 0;
  cfg.clinicalGroups.forEach(function (g, gi) {
    var simGroup = simGroups[gi % simGroups.length];
    var facId = getDefaultFacilityIdForClinicalGroup(g, facilities);
    var sectionName = sections[gi] ? sections[gi].name : sections[0].name;
    for (var i = 0; i < 6; i++) {
      students.push(createStudent(
        defaultStudentName(idx),
        g,
        simGroup,
        facId,
        sectionName
      ));
      idx++;
    }
  });

  var season = 'fall';
  var year = 2026;
  var iso = startDateForSeason(season, year);

  return {
    id: uid(),
    meta: ensureAuditMeta({
      version: VERSION,
      semesterSeason: season,
      semesterYear: year,
      semesterName: buildSemesterName(season, year),
      finalized: false,
      configCustomized: false,
      showStudentEmailDomain: true,
      lastModified: new Date().toISOString()
    }),
    config: cfg,
    calendar: {
      semesterStartDate: iso,
      weeks: []
    },
    holidays: [],
    orientations: [],
    sections: sections,
    facilities: facilities,
    faculty: defaultFaculty(cfg.clinicalGroups),
    simInstructors: [],
    students: students
  };
}

export function createDefaultFile() {
  var sem = createDefaultSemester();
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

export function semesterSortKey(semester) {
  var parts = parseSemesterDisplay(semester);
  var year = parseInt(parts.year, 10) || 0;
  var seasonOrder = parts.season === 'fall' ? 1 : 0;
  return year * 2 + seasonOrder;
}

export function getFutureSemesters(fileRoot, currentSemester) {
  if (!fileRoot || !fileRoot.semesters) return [];
  var currentKey = semesterSortKey(currentSemester);
  return fileRoot.semesters.filter(function (sem) {
    return sem.id !== currentSemester.id && semesterSortKey(sem) > currentKey;
  });
}

export function createNewSemesterFromTemplate(template, season, year) {
  var copy = JSON.parse(JSON.stringify(template));
  copy.id = uid();
  copy.meta.lastModified = new Date().toISOString();
  copy.meta.finalized = false;
  // Fresh audit lifecycle for the new semester (keep courseId and leadFaculty from template).
  copy.meta.auditPhase = 'setup';
  copy.meta.makeupAttestation = { attestedAt: null, attestedByName: '', attestedByEmail: '', notes: '' };
  copy.meta.auditExport = { exportedAt: null, exportedByName: '', snapshotHash: '', appVersion: '', exportVersion: 0 };
  copy.meta.lock = { lockedAt: null, lockedByName: '', lockedReason: 'semester_complete' };
  applySemesterSeasonYear(copy, season || 'fall', year || new Date().getFullYear());
  copy.students.forEach(function (s) {
    s.id = uid();
    s.absences = [];
    s.makeups = [];
  });
  assignDefaultStudentNames(copy.students);
  return migrateSemester(copy);
}
