/**
 * Theory calendar schema, migration, projections, and public re-exports.
 */

import { uid } from './data-model/students.js';
import { parseDate, getWeekIndexForDate } from './calendar-engine.js';
import { rollPracticumHoursByWeek } from './schedule-hours.js';
import {
  WEEKDAYS,
  isLectureTopicEvent,
  stripModuleTitlePrefix,
  renumberAllWeekModules,
  renumberWeekModules
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

export var ASSIGNMENT_CONTENT_AREAS = ['theory', 'skills', 'clinical', 'simulation'];

export var FACULTY_NEEDED_NAME = 'Faculty Needed';

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
  if (semester.meta && semester.meta.courseId && semester.meta.courseId.indexOf('REGN') === 0) {
    var cid = semester.meta.courseId;
    if (/P$/i.test(cid) && cid !== 'REGN35P-36P') {
      codes = [cid.replace(/P$/i, ''), cid];
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
  if (!t.days) t.days = [];
  if (!t.weekSummaries) t.weekSummaries = {};
  if (!t.facultyNeeded) t.facultyNeeded = [];
  t.days.forEach(function (day) {
    if (!day.events) day.events = [];
    day.events.forEach(migrateEventFields);
  });
  renumberAllWeekModules(t);
  syncHolidaysFromSemester(semester);
  refreshFacultyNeeded(t);
  return semester;
}

export function facultyDisplayName(slot) {
  if (!slot) return '';
  if (slot.needed || !slot.name || slot.name === FACULTY_NEEDED_NAME) return FACULTY_NEEDED_NAME;
  return slot.name;
}

export function makeFacultySlot(opts) {
  opts = opts || {};
  var needed = !!opts.needed || !opts.name || opts.name === FACULTY_NEEDED_NAME;
  return {
    name: needed ? FACULTY_NEEDED_NAME : String(opts.name || '').trim(),
    role: opts.role || 'lecturer',
    needed: needed
  };
}

export function clearFacultySlot(slot) {
  if (!slot) return makeFacultySlot({ needed: true, role: 'lecturer' });
  slot.name = FACULTY_NEEDED_NAME;
  slot.needed = true;
  return slot;
}

export function refreshFacultyNeeded(theory) {
  if (!theory) return [];
  var list = [];
  (theory.days || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      (ev.faculty || []).forEach(function (slot, idx) {
        if (!slot || !(slot.needed || slot.name === FACULTY_NEEDED_NAME || !slot.name)) return;
        list.push({
          eventId: ev.id,
          date: day.date,
          weekLabel: day.weekLabel,
          track: ev.track,
          title: ev.title || ev.track,
          role: slot.role || 'lecturer',
          slotIndex: idx
        });
      });
    });
  });
  theory.facultyNeeded = list;
  return list;
}

export function trackCssClass(ev) {
  var track = (ev && ev.track) || 'other';
  var cls = 'theory-track theory-track-' + track;
  if (track === 'assignment') {
    var area = (ev && ev.contentArea) || 'theory';
    cls += ' theory-track-assignment-' + area;
  }
  return cls;
}

/**
 * Practicum band on the master calendar: skills, clinical, simulation, orientation,
 * and assignments tagged to those content areas. Everything else is theory-band.
 */
export function isPracticumTrackEvent(ev) {
  if (!ev) return false;
  var track = ev.track;
  if (track === 'skills' || track === 'clinical' || track === 'simulation' || track === 'orientation') {
    return true;
  }
  if (track === 'assignment') {
    var area = ev.contentArea || 'theory';
    return area === 'skills' || area === 'clinical' || area === 'simulation';
  }
  return false;
}

/** Insert event into a day keeping theory-band events above practicum-band events. */
export function insertEventOnDay(day, ev) {
  if (!day) return;
  if (!day.events) day.events = [];
  if (!ev) return;
  var practicum = isPracticumTrackEvent(ev);
  if (!practicum) {
    var insertAt = 0;
    while (insertAt < day.events.length && !isPracticumTrackEvent(day.events[insertAt])) {
      insertAt++;
    }
    day.events.splice(insertAt, 0, ev);
    return;
  }
  day.events.push(ev);
}

/**
 * Sync Setup holidays/breaks onto theory calendar as all-day holiday events.
 * Only replaces events tagged categories includes 'synced_holiday'.
 */
export function syncHolidaysFromSemester(semester) {
  if (!semester || !semester.theory) return semester;
  var theory = semester.theory;
  var weeks = (semester.calendar && semester.calendar.weeks) || [];

  (theory.days || []).forEach(function (day) {
    day.events = (day.events || []).filter(function (ev) {
      return !(ev.categories && ev.categories.indexOf('synced_holiday') >= 0);
    });
    day.isHoliday = false;
    day.isBreak = false;
  });

  function markDay(date, label, isBreak) {
    var day = ensureDay(theory, semester, date);
    day.isHoliday = !isBreak;
    day.isBreak = !!isBreak;
    day.events.push({
      id: uid(),
      track: 'holiday',
      title: label || (isBreak ? 'Break' : 'Holiday'),
      description: '',
      moduleCode: null,
      moduleRef: null,
      moduleRefs: [],
      timeStart: null,
      timeEnd: null,
      allDay: true,
      faculty: [],
      categories: ['synced_holiday'],
      contentArea: null,
      facultyRequired: null
    });
  }

  (semester.holidays || []).forEach(function (h) {
    var label = h.label || (h.type === 'break' ? 'Break' : 'Holiday');
    if (h.type === 'break') {
      var wi = h.weekIndex != null ? parseInt(h.weekIndex, 10) : getWeekIndexForDate(semester, h.date);
      if (wi < 0 || !weeks[wi]) return;
      var start = parseDate(weeks[wi].startDate);
      if (!start) return;
      for (var d = 0; d < 7; d++) {
        var cur = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
        var iso = cur.getFullYear() + '-' +
          String(cur.getMonth() + 1).padStart(2, '0') + '-' +
          String(cur.getDate()).padStart(2, '0');
        markDay(iso, label, true);
      }
      return;
    }
    if (!h.date) return;
    if (h.type === 'mondayHoliday') {
      var mwi = getWeekIndexForDate(semester, h.date);
      if (mwi >= 0 && weeks[mwi]) {
        var ws = parseDate(weeks[mwi].startDate);
        if (ws) {
          var mon = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 1);
          var monIso = mon.getFullYear() + '-' +
            String(mon.getMonth() + 1).padStart(2, '0') + '-' +
            String(mon.getDate()).padStart(2, '0');
          markDay(monIso, label, false);
          return;
        }
      }
    }
    markDay(h.date, label, false);
  });

  return semester;
}

/**
 * Copy lecture titles/moduleRefs from sourceTheory onto empty lecture slots in targetTheory
 * matched by moduleCode order. Does not overwrite filled titles.
 */
export function seedTopicsFromTheory(targetTheory, sourceTheory) {
  if (!targetTheory || !sourceTheory) return { filled: 0 };
  var byCode = {};
  (sourceTheory.days || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (!isLectureTopicEvent(ev) || !ev.moduleCode) return;
      if (!byCode[ev.moduleCode]) byCode[ev.moduleCode] = ev;
    });
  });
  var filled = 0;
  (targetTheory.days || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (!isLectureTopicEvent(ev) || !ev.moduleCode) return;
      var src = byCode[ev.moduleCode];
      if (!src) return;
      var bare = stripModuleTitlePrefix(ev.title);
      if (bare && bare !== ev.track) return;
      if (src.title) ev.title = src.title;
      if (src.moduleRef) {
        ev.moduleRef = src.moduleRef;
        ev.moduleRefs = [src.moduleRef];
      }
      filled += 1;
    });
  });
  return { filled: filled };
}

/**
 * Move an event from one date to another within the theory calendar.
 */
export function moveEventToDate(theory, semester, eventId, toDate) {
  if (!theory || !eventId || !toDate) return false;
  var fromDay = null;
  var evIdx = -1;
  var ev = null;
  (theory.days || []).forEach(function (day) {
    if (ev) return;
    var idx = (day.events || []).findIndex(function (e) { return e.id === eventId; });
    if (idx >= 0) {
      fromDay = day;
      evIdx = idx;
      ev = day.events[idx];
    }
  });
  if (!ev || !fromDay) return false;
  if (fromDay.date === toDate) return true;
  fromDay.events.splice(evIdx, 1);
  var toDay = ensureDay(theory, semester, toDate);
  insertEventOnDay(toDay, ev);
  renumberWeekModulesForLabels(theory, [fromDay.weekLabel, toDay.weekLabel]);
  refreshFacultyNeeded(theory);
  return true;
}

function renumberWeekModulesForLabels(theory, labels) {
  var seen = {};
  (labels || []).forEach(function (wl) {
    if (wl == null || seen[wl]) return;
    seen[wl] = true;
    renumberWeekModules(theory, wl);
  });
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
