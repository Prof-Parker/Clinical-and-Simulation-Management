/**
 * Theory calendar schema, migration, projections, and public re-exports.
 */

import { uid } from './data-model/students.js';
import { parseDate, getWeekIndexForDate } from './calendar-engine.js';
import { rollPracticumHoursByWeek } from './schedule-hours.js';
import {
  WEEKDAYS,
  isLectureTopicEvent,
  renumberAllWeekModules
} from './theory-modules.js';

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

export var THEORY_VERSION = 1;

export var THEORY_TRACKS = [
  'theory', 'skills', 'shared', 'clinical', 'simulation', 'exam',
  'assignment', 'holiday', 'orientation', 'other'
];

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
    settings: {
      lectureWeekdays: ['Wed', 'Thu'],
      defaultLectureStart: '0800',
      defaultLectureEnd: '1050',
      defaultSkillsStart: '1200',
      defaultSkillsEnd: '1550',
      clinicalClassroomLocation: 'Clinical Classroom (8220 and 8217)',
      courseHourTargets: defaultCourseHourTargets(courseCodes),
      contactHourRules: defaultContactHourRules(courseCodes),
      groupAliases: { G1: 'C1', G2: 'C2', G3: 'C3', G4: 'C4', G5: 'C5' }
    },
    days: [],
    weekSummaries: {}
  };
}

export function migrateTheory(semester) {
  if (!semester) return semester;
  var codes = ['REGN15', 'REGN15P'];
  if (semester.meta && semester.meta.courseId && semester.meta.courseId.indexOf('REGN') === 0) {
    var cid = semester.meta.courseId;
    if (/P$/i.test(cid) && cid !== 'REGN35P-36P') {
      codes = [cid.replace(/P$/i, ''), cid];
    }
  }
  if (!semester.theory || typeof semester.theory !== 'object') {
    semester.theory = createEmptyTheory(codes);
    return semester;
  }
  var t = semester.theory;
  if (!t.version) t.version = THEORY_VERSION;
  if (!t.courseCodes || !t.courseCodes.length) t.courseCodes = codes;
  if (!t.displayWeekStart) t.displayWeekStart = 'sunday';
  if (!t.instructionalWeekdays) t.instructionalWeekdays = ['Wed', 'Thu', 'Fri'];
  if (!t.settings) t.settings = createEmptyTheory(codes).settings;
  if (!t.settings.lectureWeekdays) t.settings.lectureWeekdays = ['Wed', 'Thu'];
  if (!t.settings.courseHourTargets) t.settings.courseHourTargets = defaultCourseHourTargets(t.courseCodes);
  if (!t.settings.contactHourRules) t.settings.contactHourRules = defaultContactHourRules(t.courseCodes);
  if (!t.days) t.days = [];
  if (!t.weekSummaries) t.weekSummaries = {};
  t.days.forEach(function (day) {
    if (!day.events) day.events = [];
    day.events.forEach(function (ev) {
      if (!ev.id) ev.id = uid();
      if (!ev.track) ev.track = 'other';
      if (!ev.title) ev.title = '';
      if (!ev.description) ev.description = '';
      if (!ev.faculty) ev.faculty = [];
      if (!ev.categories) ev.categories = [];
    });
  });
  renumberAllWeekModules(t);
  return semester;
}

export function findDay(theory, date) {
  if (!theory || !theory.days) return null;
  return theory.days.find(function (d) { return d.date === date; }) || null;
}

export function ensureDay(theory, semester, date) {
  var day = findDay(theory, date);
  if (day) return day;
  var weekIndex = getWeekIndexForDate(semester, date);
  var d = parseDate(date);
  var weekday = WEEKDAYS[d ? d.getDay() : 0];
  day = {
    date: date,
    weekIndex: weekIndex >= 0 ? weekIndex : 0,
    weekday: weekday,
    weekLabel: weekIndex >= 0 ? weekIndex + 1 : 1,
    isHoliday: false,
    isBreak: false,
    events: []
  };
  theory.days.push(day);
  theory.days.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return day;
}

export function projectLectureAssignments(theory, options) {
  options = options || {};
  var rows = [];
  var weekdays = theory.instructionalWeekdays || ['Wed', 'Thu', 'Fri'];
  (theory.days || []).forEach(function (day) {
    if (weekdays.indexOf(day.weekday) < 0) return;
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
