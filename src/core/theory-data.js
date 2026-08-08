/**
 * Theory calendar schema, migration, projections, and public re-exports.
 */

import { uid } from './data-model/students.js';
import { rollPracticumHoursByWeek } from './schedule-hours.js';
import {
  isLectureTopicEvent,
  renumberAllWeekModules
} from './theory-modules.js';
import {
  FACULTY_NEEDED_NAME,
  syncHolidaysFromSemester,
  refreshFacultyNeeded
} from './theory-events.js';

export { WEEKDAYS } from './theory-modules.js';
export {
  moduleLetterAt,
  isLectureTopicEvent,
  stripModuleTitlePrefix,
  formatModuleTitle,
  listLectureTopicsInWeek,
  renumberWeekModules,
  renumberAllWeekModules,
  parseModuleCode,
  slotIndexFromLetter,
  weekdayForSlot,
  weekdayToOffset,
  dateForWeekdayInWeek,
  dateForModuleCode
} from './theory-modules.js';

export {
  isTheoryCourseCode,
  hoursFromTimes,
  eventContactHours,
  sumTheoryHoursForWeek,
  practicumCourseCode,
  coordinatorCompactLabel,
  clinicalOrdinalForGroup,
  practicumSlotsForDay,
  coordinatorItemsForDay,
  weekSummaryForLabel,
  semesterHourTotals,
  semesterContactHourTotal,
  contactHourTarget,
  contactHourValidation,
  listCourseOptions,
  simCrossCheckWarnings
} from './theory-coordinator.js';

export {
  FACULTY_NEEDED_NAME,
  facultyDisplayName,
  makeFacultySlot,
  clearFacultySlot,
  refreshFacultyNeeded,
  trackCssClass,
  isPracticumTrackEvent,
  insertEventOnDay,
  syncHolidaysFromSemester,
  seedTopicsFromTheory,
  moveEventToDate,
  findDay,
  ensureDay
} from './theory-events.js';

export var THEORY_VERSION = 1;

export var THEORY_TRACKS = [
  'theory', 'skills', 'shared', 'clinical', 'simulation', 'exam',
  'assignment', 'holiday', 'orientation', 'other'
];

export var ASSIGNMENT_CONTENT_AREAS = ['theory', 'skills', 'clinical', 'simulation'];

export function defaultTheorySettings(courseCodes) {
  return {
    lectureWeekdays: ['Wed', 'Thu'],
    defaultLectureStart: '0800',
    defaultLectureEnd: '1050',
    defaultSkillsStart: '1200',
    defaultSkillsEnd: '1550',
    defaultSkillsFacultyRequired: 2,
    theoryFaculty: [],
    skillsFaculty: [],
    showLecturers: true,
    showPracticumFaculty: true,
    showSkillsLabContent: true,
    clinicalClassroomLocation: 'Clinical Classroom (8220 and 8217)',
    courseHourTargets: defaultCourseHourTargets(courseCodes),
    contactHourRules: defaultContactHourRules(courseCodes),
    groupAliases: { G1: 'C1', G2: 'C2', G3: 'C3', G4: 'C4', G5: 'C5' }
  };
}

export function isPracticumCourseCode(courseCode) {
  if (!courseCode) return false;
  return /P$/i.test(courseCode) || courseCode === 'REGN35P-36P';
}

export function defaultCourseHourTargets(courseCodes) {
  return (courseCodes || []).map(function (code) {
    return {
      courseCode: code,
      creditHours: 3,
      contactHoursTarget: 58.5,
      contactHoursAutoCalculate: false,
      contactHoursFormulaNote: ''
    };
  });
}

export function defaultContactHourRules(courseCodes) {
  var rules = [];
  (courseCodes || []).forEach(function (code) {
    if (!/P$/i.test(code)) return;
    rules.push({
      courseCode: code,
      clinical: {
        defaultHoursPerClinicalDay: 12,
        facilityOverrides: [
          { facilityId: 'fac_srmc', hoursPerDay: 12 },
          { facilityId: 'fac_stel', hoursPerDay: 12 },
          { facilityId: 'fac_community_health', hoursPerDay: 6, note: 'Community Health specialty' }
        ],
        dayOverrides: []
      },
      simulation: {
        defaultHoursPerSimDay: 6,
        simOverrides: [{ simNum: 5, hoursPerDay: 8 }],
        dayOverrides: []
      }
    });
  });
  return rules;
}

export function createEmptyTheory(courseCodes) {
  courseCodes = courseCodes || ['REGN15', 'REGN15P'];
  return {
    version: THEORY_VERSION,
    courseCodes: courseCodes.slice(),
    displayWeekStart: 'sunday',
    instructionalWeekdays: ['Wed', 'Thu', 'Fri'],
    settings: defaultTheorySettings(courseCodes),
    days: [],
    weekSummaries: {},
    facultyNeeded: []
  };
}

function migrateEventFields(ev) {
  if (!ev.id) ev.id = uid();
  if (!ev.track) ev.track = 'other';
  if (!ev.title) ev.title = '';
  if (!ev.description) ev.description = '';
  if (!ev.faculty) ev.faculty = [];
  if (!ev.categories) ev.categories = [];
  if (!Array.isArray(ev.moduleRefs)) {
    ev.moduleRefs = ev.moduleRef ? [ev.moduleRef] : [];
  }
  if (!Array.isArray(ev.skillRefs)) ev.skillRefs = [];
  if (ev.track === 'assignment' && !ev.contentArea) {
    ev.contentArea = 'theory';
  }
  if (ev.track === 'skills' && (ev.facultyRequired == null || isNaN(ev.facultyRequired))) {
    ev.facultyRequired = null;
  }
  (ev.faculty || []).forEach(function (slot) {
    if (!slot || typeof slot !== 'object') return;
    if (slot.needed == null) {
      slot.needed = !slot.name || slot.name === FACULTY_NEEDED_NAME;
    }
    if (slot.needed && !slot.name) slot.name = FACULTY_NEEDED_NAME;
  });
}

export function migrateTheory(semester) {
  if (!semester) return semester;
  var codes = ['REGN15', 'REGN15P'];
  var courseId = semester.meta && semester.meta.courseId != null
    ? String(semester.meta.courseId)
    : '';
  if (courseId.indexOf('REGN') === 0) {
    if (/P$/i.test(courseId) && courseId !== 'REGN35P-36P') {
      codes = [courseId.replace(/P$/i, ''), courseId];
    }
  }
  if (!semester.simInstructors) semester.simInstructors = [];
  if (!semester.theory || typeof semester.theory !== 'object') {
    semester.theory = createEmptyTheory(codes);
    syncHolidaysFromSemester(semester);
    return semester;
  }
  var t = semester.theory;
  if (!t.version) t.version = THEORY_VERSION;
  if (!t.courseCodes || !t.courseCodes.length) t.courseCodes = codes;
  if (!t.displayWeekStart) t.displayWeekStart = 'sunday';
  if (!t.instructionalWeekdays) t.instructionalWeekdays = ['Wed', 'Thu', 'Fri'];
  if (!t.settings) t.settings = defaultTheorySettings(t.courseCodes);
  var defaults = defaultTheorySettings(t.courseCodes);
  Object.keys(defaults).forEach(function (key) {
    if (t.settings[key] === undefined) t.settings[key] = defaults[key];
  });
  if (!Array.isArray(t.settings.theoryFaculty)) t.settings.theoryFaculty = [];
  if (!Array.isArray(t.settings.skillsFaculty)) t.settings.skillsFaculty = [];
  if (t.settings.defaultSkillsFacultyRequired == null) t.settings.defaultSkillsFacultyRequired = 2;
  if (t.settings.showLecturers == null) t.settings.showLecturers = true;
  if (t.settings.showPracticumFaculty == null) t.settings.showPracticumFaculty = true;
  if (t.settings.showSkillsLabContent == null) t.settings.showSkillsLabContent = true;
  if (!t.settings.courseHourTargets) t.settings.courseHourTargets = defaultCourseHourTargets(t.courseCodes);
  if (!t.settings.contactHourRules) t.settings.contactHourRules = defaultContactHourRules(t.courseCodes);
  if (!Array.isArray(t.days)) t.days = [];
  t.days = t.days.filter(function (day) { return day && typeof day === 'object'; });
  if (!t.weekSummaries || typeof t.weekSummaries !== 'object') t.weekSummaries = {};
  if (!Array.isArray(t.facultyNeeded)) t.facultyNeeded = [];
  t.days.forEach(function (day) {
    if (!Array.isArray(day.events)) day.events = [];
    day.events.forEach(migrateEventFields);
  });
  renumberAllWeekModules(t);
  syncHolidaysFromSemester(semester);
  refreshFacultyNeeded(t);
  return semester;
}

export function projectLectureAssignments(theory, options) {
  options = options || {};
  var rows = [];
  // Include any day that has lecture/skills events — not only instructionalWeekdays.
  // Off-pattern days (e.g. a one-off Tuesday) appear only for weeks that have them.
  (theory.days || []).forEach(function (day) {
    var lectures = (day.events || []).filter(isLectureTopicEvent);
    var skillsEv = (day.events || []).find(function (ev) { return ev.track === 'skills'; }) || null;
    if (!lectures.length && !skillsEv) return;
    if (!lectures.length) {
      rows.push({
        week: day.weekLabel,
        date: day.date,
        weekday: day.weekday,
        topic: '—',
        lecturer: '—',
        skillsLab: skillsEv ? (skillsEv.description || skillsEv.title) : '—',
        moduleCode: null
      });
      return;
    }
    lectures.forEach(function (lectureEv, idx) {
      var lecturer = '';
      if (lectureEv.faculty && lectureEv.faculty.length) {
        lecturer = lectureEv.faculty.map(function (f) { return f.name; }).join(' / ');
      }
      if (options.facultyFilter) {
        var q = String(options.facultyFilter).toLowerCase();
        if (lecturer.toLowerCase().indexOf(q) < 0) return;
      }
      rows.push({
        week: day.weekLabel,
        date: day.date,
        weekday: day.weekday,
        topic: lectureEv.title || '—',
        lecturer: lecturer || '—',
        skillsLab: idx === 0 && skillsEv ? (skillsEv.description || skillsEv.title) : (idx === 0 ? '—' : ''),
        moduleCode: lectureEv.moduleCode || null
      });
    });
  });
  rows.sort(function (a, b) {
    if (a.week !== b.week) return a.week - b.week;
    return a.date < b.date ? -1 : 1;
  });
  return rows;
}

export function getContactHourRules(theory, courseCode) {
  var rules = (theory.settings && theory.settings.contactHourRules) || [];
  return rules.find(function (r) { return r.courseCode === courseCode; }) || null;
}

export function clinicalHoursForDay(rules, facilityId) {
  if (!rules || !rules.clinical) return 0;
  var c = rules.clinical;
  var hours = c.defaultHoursPerClinicalDay || 0;
  (c.facilityOverrides || []).forEach(function (o) {
    if (o.facilityId === facilityId && o.hoursPerDay != null) hours = o.hoursPerDay;
  });
  return hours;
}

export function simHoursForDay(rules, simNum) {
  if (!rules || !rules.simulation) return 0;
  var s = rules.simulation;
  var hours = s.defaultHoursPerSimDay || 0;
  (s.simOverrides || []).forEach(function (o) {
    if (o.simNum === simNum && o.hoursPerDay != null) hours = o.hoursPerDay;
  });
  return hours;
}

export function studentCountForSemester(semester) {
  var n = (semester && semester.students) ? semester.students.length : 0;
  return n > 0 ? n : 1;
}

/**
 * One clinical/sim group's session hours per week (from Setup facility/sim times).
 * courseCode kept for call-site compatibility; hours resolve from semester config/facilities.
 */
export function rollSchedulerHours(semester, courseCode) {
  return rollPracticumHoursByWeek(semester);
}

/** @deprecated Prefer rollSchedulerHours / rollPracticumHoursByWeek (already one-group hours). */
export function rollSchedulerHoursPerStudent(semester, courseCode) {
  return rollPracticumHoursByWeek(semester);
}
