/**
 * Theory calendar schema, migration, moduleCode helpers, and projections.
 */

import { uid } from './data-model/students.js';
import { getClinicalDayForGroup } from './data-model/index.js';
import { parseDate, toISO, addDays, getWeekIndexForDate } from './calendar-engine.js';
import {
  resolveClinicalDayHours,
  resolveSimDayHours,
  rollPracticumHoursByWeek,
  rollPracticumHoursForCohort
} from './schedule-hours.js';

export var THEORY_VERSION = 1;

export var THEORY_TRACKS = [
  'theory', 'skills', 'shared', 'clinical', 'simulation', 'exam',
  'assignment', 'holiday', 'orientation', 'other'
];

export var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

var SLOT_LETTERS = ['A', 'B', 'C', 'D'];
var MODULE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function moduleLetterAt(index) {
  if (index < 0) index = 0;
  if (index < 26) return MODULE_LETTERS.charAt(index);
  // AA, AB, … after Z
  var hi = Math.floor(index / 26) - 1;
  var lo = index % 26;
  return MODULE_LETTERS.charAt(hi) + MODULE_LETTERS.charAt(lo);
}

export function isLectureTopicEvent(ev) {
  if (!ev) return false;
  if (ev.track === 'theory') return true;
  return !!(ev.categories && ev.categories.indexOf('lecture') >= 0);
}

export function stripModuleTitlePrefix(title) {
  return String(title || '').replace(/^Module\s+\d+[A-Za-z]+\s*[—–-]\s*/i, '').trim();
}

export function formatModuleTitle(moduleCode, title) {
  var base = stripModuleTitlePrefix(title);
  if (!base) base = 'Topic';
  return 'Module ' + moduleCode + ' — ' + base;
}

/** Lecture topics in a week, ordered by weekday → start time → event order. */
export function listLectureTopicsInWeek(theory, weekLabel) {
  var items = [];
  (theory.days || []).forEach(function (day) {
    if (day.weekLabel !== weekLabel) return;
    (day.events || []).forEach(function (ev, eventIndex) {
      if (!isLectureTopicEvent(ev)) return;
      items.push({ day: day, ev: ev, eventIndex: eventIndex });
    });
  });
  items.sort(function (a, b) {
    var wa = weekdayToOffset(a.day.weekday);
    var wb = weekdayToOffset(b.day.weekday);
    if (wa !== wb) return wa - wb;
    var ta = a.ev.timeStart || '';
    var tb = b.ev.timeStart || '';
    if (ta !== tb) return ta < tb ? -1 : (ta > tb ? 1 : 0);
    return a.eventIndex - b.eventIndex;
  });
  return items;
}

/** Assign module codes 1A, 1B, … and sync title prefixes for lecture topics in a week. */
export function renumberWeekModules(theory, weekLabel) {
  var items = listLectureTopicsInWeek(theory, weekLabel);
  items.forEach(function (item, idx) {
    var code = String(weekLabel) + moduleLetterAt(idx);
    item.ev.moduleCode = code;
    item.ev.title = formatModuleTitle(code, item.ev.title);
  });
  return items;
}

export function renumberAllWeekModules(theory) {
  for (var w = 1; w <= 18; w++) renumberWeekModules(theory, w);
}

export function isTheoryCourseCode(courseCode) {
  if (!courseCode) return false;
  return /^REGN\d+$/i.test(courseCode) && !/P$/i.test(courseCode);
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

export function parseModuleCode(moduleCode) {
  if (!moduleCode || typeof moduleCode !== 'string') return null;
  var m = moduleCode.match(/^(\d+)([A-Za-z]+)$/);
  if (!m) return null;
  return { weekLabel: parseInt(m[1], 10), slotLetter: m[2].toUpperCase() };
}

export function slotIndexFromLetter(letter) {
  var idx = SLOT_LETTERS.indexOf((letter || '').toUpperCase());
  return idx >= 0 ? idx : 0;
}

export function weekdayForSlot(lectureWeekdays, slotLetter) {
  var days = lectureWeekdays || ['Wed', 'Thu'];
  var idx = slotIndexFromLetter(slotLetter);
  return days[idx] || days[days.length - 1];
}

export function weekdayToOffset(weekday) {
  var idx = WEEKDAYS.indexOf(weekday);
  return idx >= 0 ? idx : 0;
}

export function dateForWeekdayInWeek(semester, weekIndex, weekday) {
  if (!semester || !semester.calendar || !semester.calendar.weeks[weekIndex]) return null;
  var ws = parseDate(semester.calendar.weeks[weekIndex].startDate);
  if (!ws) return null;
  return toISO(addDays(ws, weekdayToOffset(weekday)));
}

export function dateForModuleCode(semester, moduleCode) {
  var theory = semester && semester.theory;
  if (theory && theory.days) {
    var needle = String(moduleCode || '').toUpperCase();
    for (var i = 0; i < theory.days.length; i++) {
      var day = theory.days[i];
      var hit = (day.events || []).some(function (ev) {
        return ev.moduleCode && String(ev.moduleCode).toUpperCase() === needle;
      });
      if (hit) return day.date;
    }
  }
  var parsed = parseModuleCode(moduleCode);
  if (!parsed || !semester || !semester.theory) return null;
  var weekday = weekdayForSlot(semester.theory.settings.lectureWeekdays, parsed.slotLetter);
  var weekIndex = parsed.weekLabel - 1;
  if (weekIndex < 0 || weekIndex > 17) return null;
  return dateForWeekdayInWeek(semester, weekIndex, weekday);
}

export function hoursFromTimes(timeStart, timeEnd) {
  if (!timeStart || !timeEnd) return 0;
  var sh = parseInt(timeStart.slice(0, 2), 10);
  var sm = parseInt(timeStart.slice(2, 4) || '0', 10);
  var eh = parseInt(timeEnd.slice(0, 2), 10);
  var em = parseInt(timeEnd.slice(2, 4) || '0', 10);
  var mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

export function eventContactHours(ev) {
  if (ev.contactHours != null && !isNaN(ev.contactHours)) return ev.contactHours;
  return hoursFromTimes(ev.timeStart, ev.timeEnd);
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

export function sumTheoryHoursForWeek(theory, weekLabel, category) {
  var lecture = 0;
  var skills = 0;
  var lectureSlots = {};
  (theory.days || []).forEach(function (day) {
    if (day.weekLabel !== weekLabel) return;
    (day.events || []).forEach(function (ev) {
      var h = eventContactHours(ev);
      if (isLectureTopicEvent(ev)) {
        // Multiple topics in one timeslot share one lecture block's hours.
        var slotKey = day.date + '|' + (ev.timeStart || '') + '|' + (ev.timeEnd || '');
        if (!lectureSlots[slotKey]) {
          lectureSlots[slotKey] = true;
          lecture += h;
        }
      }
      if (ev.track === 'skills' || (ev.categories && ev.categories.indexOf('skills_lab') >= 0)) {
        skills += h;
      }
    });
  });
  if (category === 'lecture') return Math.round(lecture * 100) / 100;
  if (category === 'skills_lab') return Math.round(skills * 100) / 100;
  return Math.round((lecture + skills) * 100) / 100;
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

export function practicumCourseCode(theory) {
  var codes = (theory && theory.courseCodes) || [];
  var match = codes.find(function (c) { return /P$/i.test(c); });
  return match || 'REGN15P';
}

var COORDINATOR_TRACK_LABELS = {
  theory: 'Lecture',
  skills: 'Skills lab',
  simulation: 'Simulation',
  clinical: 'Clinical'
};

export function coordinatorCompactLabel(track, timeStart, timeEnd) {
  var label = COORDINATOR_TRACK_LABELS[track] || track;
  if (timeStart && timeEnd) return label + ' ' + timeStart + '–' + timeEnd;
  return label;
}

/** Nth clinical day for a group through weekIndex (1-based), for coordinator labels. */
export function clinicalOrdinalForGroup(semester, clinicalGroup, throughWeekIndex) {
  var cfg = semester.config;
  var n = 0;
  for (var wi = 0; wi <= throughWeekIndex; wi++) {
    var has = (semester.students || []).some(function (s) {
      if (s.clinicalGroup !== clinicalGroup) return false;
      var cell = s.schedule && s.schedule[wi];
      return !!(cell && !cell.inactive && cell.clinical && !cell.clinicalMissed);
    });
    if (has) n++;
  }
  return n;
}

export function practicumSlotsForDay(semester, weekLabel, weekday, courseCode) {
  var wi = weekLabel - 1;
  var cfg = semester.config;
  var clinicalByGroup = {};
  var simByKey = {};
  (semester.students || []).forEach(function (student) {
    var cell = student.schedule && student.schedule[wi];
    if (!cell || cell.inactive) return;
    if (cell.clinical && !cell.clinicalMissed) {
      var clinDay = getClinicalDayForGroup(student.clinicalGroup, cfg);
      if (clinDay === weekday) {
        var cg = student.clinicalGroup || 'C?';
        if (!clinicalByGroup[cg]) {
          var facilityId = cell.facilityId || student.facilityId || null;
          clinicalByGroup[cg] = {
            group: cg,
            clinicalNum: clinicalOrdinalForGroup(semester, cg, wi),
            hours: resolveClinicalDayHours(semester, facilityId)
          };
        }
      }
    }
    if (cell.sim && cell.simDay === weekday) {
      var sg = cell.simGuestGroup || student.simGroup || 'SG?';
      var key = sg + '|' + cell.sim;
      if (!simByKey[key]) {
        simByKey[key] = {
          group: sg,
          simNum: cell.sim,
          hours: resolveSimDayHours(semester, cell.sim)
        };
      }
    }
  });
  return {
    clinicals: Object.keys(clinicalByGroup).sort().map(function (k) { return clinicalByGroup[k]; }),
    simulations: Object.keys(simByKey).sort().map(function (k) { return simByKey[k]; })
  };
}

export function coordinatorItemsForDay(theory, semester, weekLabel, weekday, courseCode) {
  var items = [];
  var day = (theory.days || []).find(function (d) {
    return d.weekLabel === weekLabel && d.weekday === weekday;
  });
  if (day) {
    (day.events || []).forEach(function (ev) {
      // Lecture / skills only — simulation comes from the practicum scheduler.
      if (['theory', 'skills'].indexOf(ev.track) < 0) return;
      items.push({
        kind: ev.track,
        label: coordinatorCompactLabel(ev.track, ev.timeStart, ev.timeEnd)
      });
    });
  }
  var practicum = practicumSlotsForDay(semester, weekLabel, weekday, courseCode);
  practicum.clinicals.forEach(function (c) {
    items.push({
      kind: 'clinical',
      label: c.group + ' Clinical ' + c.clinicalNum
    });
  });
  practicum.simulations.forEach(function (s) {
    items.push({
      kind: 'simulation',
      label: s.group + ', Sim ' + s.simNum
    });
  });
  return items;
}

export function weekSummaryForLabel(theory, semester, weekLabel, courseCode) {
  var override = theory.weekSummaries && theory.weekSummaries[String(weekLabel)];
  var lecture = sumTheoryHoursForWeek(theory, weekLabel, 'lecture');
  var skills_lab = sumTheoryHoursForWeek(theory, weekLabel, 'skills_lab');
  var sched = rollPracticumHoursByWeek(semester);
  var clinical = sched[weekLabel] ? sched[weekLabel].clinical : 0;
  var simulation = sched[weekLabel] ? sched[weekLabel].simulation : 0;
  if (override) {
    if (override.lecture != null) lecture = override.lecture;
    if (override.skills_lab != null) skills_lab = override.skills_lab;
    // Clinical / sim always come from the practicum scheduler + Setup times.
  }
  return { lecture: lecture, skills_lab: skills_lab, clinical: clinical, simulation: simulation };
}

export function semesterHourTotals(theory, semester, courseCode) {
  var totals = { lecture: 0, skills_lab: 0, clinical: 0, simulation: 0 };
  var cohort = rollPracticumHoursForCohort(semester);
  for (var w = 1; w <= 18; w++) {
    var s = weekSummaryForLabel(theory, semester, w, courseCode);
    totals.lecture += s.lecture;
    totals.skills_lab += s.skills_lab;
    totals.clinical += cohort[w] ? cohort[w].clinical : 0;
    totals.simulation += cohort[w] ? cohort[w].simulation : 0;
  }
  totals.lecture = Math.round(totals.lecture * 100) / 100;
  totals.skills_lab = Math.round(totals.skills_lab * 100) / 100;
  totals.clinical = Math.round(totals.clinical * 100) / 100;
  totals.simulation = Math.round(totals.simulation * 100) / 100;
  totals.practicum = Math.round((totals.skills_lab + totals.clinical + totals.simulation) * 100) / 100;
  return totals;
}

export function semesterContactHourTotal(theory, semester, courseCode) {
  var t = semesterHourTotals(theory, semester, courseCode);
  return Math.round((t.lecture + t.skills_lab + t.clinical + t.simulation) * 100) / 100;
}

export function contactHourTarget(theory, courseCode) {
  var targets = (theory.settings && theory.settings.courseHourTargets) || [];
  var row = targets.find(function (t) { return t.courseCode === courseCode; });
  return row ? row.contactHoursTarget : null;
}

export function contactHourValidation(theory, semester, courseCode) {
  var target = contactHourTarget(theory, courseCode);
  var scheduled = semesterContactHourTotal(theory, semester, courseCode);
  if (target == null) return { scheduled: scheduled, target: null, delta: null, status: 'unknown' };
  var delta = Math.round((scheduled - target) * 100) / 100;
  var tol = 0.5;
  var status = Math.abs(delta) <= tol ? 'on_target' : (delta < 0 ? 'under' : 'over');
  return { scheduled: scheduled, target: target, delta: delta, status: status };
}

export function listCourseOptions(fileRoot) {
  var options = [];
  if (!fileRoot || !fileRoot.semesters) return options;
  var sem = fileRoot.semesters.find(function (s) {
    return s.id === fileRoot.meta.activeSemesterId;
  }) || fileRoot.semesters[0];
  if (!sem || !sem.theory || !sem.theory.courseCodes) {
    if (sem && sem.meta && sem.meta.courseId) {
      options.push({ code: sem.meta.courseId, label: sem.meta.courseId, shell: 'clinical' });
    }
    return options;
  }
  sem.theory.courseCodes.forEach(function (code) {
    options.push({
      code: code,
      label: code,
      shell: isTheoryCourseCode(code) ? 'theory' : 'clinical'
    });
  });
  return options;
}

export function simCrossCheckWarnings(semester) {
  var warnings = [];
  if (!semester || !semester.theory || !semester.theory.days) return warnings;
  semester.theory.days.forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (ev.track !== 'simulation' || !ev.linkedSimNum) return;
      var wi = day.weekIndex;
      var hasSim = (semester.students || []).some(function (s) {
        return s.schedule && s.schedule[wi] && s.schedule[wi].sim === ev.linkedSimNum;
      });
      if (!hasSim) {
        warnings.push('Week ' + (day.weekLabel || wi + 1) + ': theory marks sim ' +
          ev.linkedSimNum + ' but scheduler has no matching placement.');
      }
    });
  });
  return warnings;
}