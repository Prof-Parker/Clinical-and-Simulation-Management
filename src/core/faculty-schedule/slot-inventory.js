/**
 * Build faculty signup-slot inventory from Faculty Needed markers and assigned slots.
 */

import * as ScheduleHours from '../schedule-hours.js';
import * as DataModel from '../data-model/index.js';
import { dateForWeekdayInWeekRange } from '../calendar-engine.js';
import { FACULTY_NEEDED_NAME } from '../theory-events.js';
import { hoursFromTimes } from '../theory-data.js';
import { normalizeSpecialties } from './specialties.js';
import { courseBand } from './program-bands.js';
import * as CourseDefaults from '../course-defaults.js';
import { buildTheorySlots, eventSlotKind } from './theory-slots.js';

var SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var FULL_WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

function isNeeded(slot) {
  return !!(slot && (slot.needed || slot.name === FACULTY_NEEDED_NAME || !String(slot.name || '').trim()));
}

function courseCode(semester) {
  return (semester.meta && semester.meta.courseId) || '';
}

function courseLabel(semester) {
  var code = courseCode(semester);
  return CourseDefaults.displayName(code) || code || 'Course';
}

function defaultSpecialties(semester, kind) {
  if (kind === 'lecture') return ['Lec'];
  var course = CourseDefaults.get(courseCode(semester));
  var areas = (course && course.contentAreas) || ['MS'];
  return normalizeSpecialties(areas.map(function (t) {
    return t === 'PEDS' ? 'PED' : t;
  }));
}

function hhmmToMinutes(hhmm) {
  var v = ScheduleHours.normalizeHhmm(hhmm, '');
  if (!v) return 0;
  return parseInt(v.slice(0, 2), 10) * 60 + parseInt(v.slice(2, 4), 10);
}

function minutesToHhmm(mins) {
  var m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  var h = Math.floor(m / 60);
  var mm = m % 60;
  return String(h).padStart(2, '0') + String(mm).padStart(2, '0');
}

function slotHours(start, end) {
  return hoursFromTimes(start, end) || 0;
}

/** Normalize Mon/Monday/mon → Mon (calendar-weeks short form). */
function shortWeekday(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  var lower = s.toLowerCase();
  for (var i = 0; i < FULL_WEEKDAYS.length; i++) {
    if (FULL_WEEKDAYS[i].toLowerCase() === lower || SHORT_WEEKDAYS[i].toLowerCase() === lower) {
      return SHORT_WEEKDAYS[i];
    }
  }
  return '';
}

/** Normalize Mon/Monday → Monday (faculty browse grid). */
function fullWeekday(raw) {
  var short = shortWeekday(raw);
  if (!short) return '';
  return FULL_WEEKDAYS[SHORT_WEEKDAYS.indexOf(short)] || '';
}

function weekdayFromDate(iso) {
  if (!iso) return '';
  var d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  return FULL_WEEKDAYS[d.getDay()] || '';
}

function weekList(semester) {
  return (semester.calendar && Array.isArray(semester.calendar.weeks))
    ? semester.calendar.weeks
    : [];
}

/**
 * Resolve ISO date for a schedule cell. Student cells rarely store date/day;
 * derive from instructional week + clinical/sim weekday.
 */
function resolveCellDate(semester, weekIndex, dayHint) {
  var weeks = weekList(semester);
  var week = weeks[weekIndex];
  var short = shortWeekday(dayHint);
  if (week && short) {
    var iso = dateForWeekdayInWeekRange(week, short);
    if (iso) return iso;
  }
  return '';
}

function clinicalInstances(semester, clinicalGroup) {
  var dates = {};
  var groupDay = DataModel.getClinicalDayForGroup(clinicalGroup, semester.config || {});
  (semester.students || []).forEach(function (s) {
    if (s.clinicalGroup !== clinicalGroup) return;
    (s.schedule || []).forEach(function (cell, wi) {
      if (!cell || cell.inactive) return;
      var hasClinical = !!(cell.clinical && !cell.clinicalMissed);
      var hasMakeup = !!cell.makeupClinical;
      if (!hasClinical && !hasMakeup) return;
      var dayHint = cell.day || groupDay;
      var date = cell.date || resolveCellDate(semester, wi, dayHint);
      if (!date) return;
      dates[date] = {
        date: date,
        weekIndex: wi,
        weekday: fullWeekday(dayHint) || weekdayFromDate(date),
        facilityId: cell.facilityId || s.facilityId || null
      };
    });
  });
  return Object.keys(dates).sort().map(function (d) { return dates[d]; });
}

function facilityIdFromConfig(raw) {
  if (!raw) return '';
  if (Array.isArray(raw)) return raw[0] || '';
  return raw;
}

function facilityForGroup(semester, clinicalGroup, instances) {
  var byGroup = semester.config && semester.config.clinicalGroupFacilities;
  if (byGroup && byGroup[clinicalGroup]) {
    var id = facilityIdFromConfig(byGroup[clinicalGroup]);
    var fromCfg = DataModel.findFacilityById(semester, id);
    if (fromCfg) return fromCfg;
  }
  if (instances && instances.length && instances[0].facilityId) {
    return DataModel.findFacilityById(semester, instances[0].facilityId);
  }
  var student = (semester.students || []).find(function (s) {
    return s.clinicalGroup === clinicalGroup && s.facilityId;
  });
  if (student) return DataModel.findFacilityById(semester, student.facilityId);
  return (semester.facilities || [])[0] || null;
}

function makeBase(semester, partial) {
  var code = courseCode(semester);
  var band = courseBand(code);
  return Object.assign({
    courseId: code,
    courseLabel: courseLabel(semester),
    bandId: band.id,
    bandLabel: band.label,
    specialties: defaultSpecialties(semester, partial.kind),
    assignedUserId: '',
    assignedName: '',
    open: true,
    capacity: 1,
    openCount: 1,
    instances: [],
    hoursPerInstance: 0,
    totalHours: 0,
    siteId: '',
    siteLabel: '',
    facilityId: '',
    weekday: '',
    timeStart: '',
    timeEnd: ''
  }, partial);
}

function finalizeSlot(slot) {
  slot.hoursPerInstance = slotHours(slot.timeStart, slot.timeEnd);
  slot.totalHours = ScheduleHours.roundHours(slot.hoursPerInstance * (slot.instances.length || 0));
  if (!slot.weekday && slot.instances.length) {
    slot.weekday = slot.instances[0].weekday || weekdayFromDate(slot.instances[0].date);
  }
  return slot;
}

function clinicalSlots(semester) {
  var out = [];
  (semester.faculty || []).forEach(function (f) {
    if (!f) return;
    var instances = clinicalInstances(semester, f.clinicalGroup);
    var fac = facilityForGroup(semester, f.clinicalGroup, instances);
    var start = (fac && fac.clinicalStart) || ScheduleHours.DEFAULT_CLINICAL_START;
    var end = (fac && fac.clinicalEnd) || ScheduleHours.DEFAULT_CLINICAL_END;
    var needed = isNeeded(f);
    var tags = normalizeSpecialties(f.specialties);
    if (!tags.length && fac && fac.contentTags) {
      tags = normalizeSpecialties(fac.contentTags.map(function (t) {
        return t === 'PEDS' ? 'PED' : t;
      }));
    }
    if (!tags.length) tags = defaultSpecialties(semester, 'clinical');
    var slot = makeBase(semester, {
      slotId: 'clinical:' + f.id,
      kind: 'clinical',
      sourcePath: 'faculty.' + f.id,
      sourceId: f.id,
      clinicalGroup: f.clinicalGroup || '',
      specialties: tags,
      timeStart: start,
      timeEnd: end,
      facilityId: fac ? fac.id : '',
      siteId: fac ? (fac.siteId || fac.id) : '',
      siteLabel: fac ? (fac.shortName || fac.name || '') : '',
      open: needed,
      assignedName: needed ? '' : String(f.name || ''),
      assignedUserId: needed ? '' : String(f.userId || ''),
      capacity: 1,
      openCount: needed ? 1 : 0,
      instances: instances.map(function (inst) {
        return {
          date: inst.date,
          weekIndex: inst.weekIndex,
          weekday: inst.weekday || weekdayFromDate(inst.date),
          timeStart: start,
          timeEnd: end
        };
      })
    });
    out.push(finalizeSlot(slot));
  });
  return out;
}

function simSlots(semester) {
  var out = [];
  var start = (semester.config && semester.config.simDefaultStart) || ScheduleHours.DEFAULT_SIM_START;
  var end = (semester.config && semester.config.simDefaultEnd) || ScheduleHours.DEFAULT_SIM_END;
  (semester.simInstructors || []).forEach(function (f, idx) {
    if (!f) return;
    var needed = isNeeded(f);
    var slot = makeBase(semester, {
      slotId: 'sim:' + (f.id || ('idx_' + idx)),
      kind: 'sim',
      sourcePath: 'simInstructors.' + (f.id || idx),
      sourceId: f.id || String(idx),
      specialties: normalizeSpecialties(f.specialties).length
        ? normalizeSpecialties(f.specialties)
        : defaultSpecialties(semester, 'sim'),
      timeStart: start,
      timeEnd: end,
      open: needed,
      assignedName: needed ? '' : String(f.name || ''),
      assignedUserId: needed ? '' : String(f.userId || ''),
      capacity: 1,
      openCount: needed ? 1 : 0,
      instances: buildSimInstances(semester, start, end)
    });
    out.push(finalizeSlot(slot));
  });
  return out;
}

function buildSimInstances(semester, start, end) {
  var dates = {};
  (semester.students || []).forEach(function (s) {
    (s.schedule || []).forEach(function (cell, wi) {
      if (!cell || !cell.sim) return;
      var dayHint = cell.simDay || cell.day || 'Mon';
      var date = cell.date || resolveCellDate(semester, wi, dayHint);
      if (!date) return;
      dates[date] = {
        date: date,
        weekIndex: wi,
        weekday: fullWeekday(dayHint) || weekdayFromDate(date),
        timeStart: start,
        timeEnd: end
      };
    });
  });
  return Object.keys(dates).sort().map(function (d) { return dates[d]; });
}

function theorySlots(semester) {
  return buildTheorySlots(semester, {
    isNeeded: isNeeded,
    makeBase: makeBase,
    finalizeSlot: finalizeSlot,
    fullWeekday: fullWeekday,
    weekdayFromDate: weekdayFromDate,
    defaultSpecialties: defaultSpecialties
  });
}

/**
 * All inventory slots (open and filled).
 */
function listAllSlots(semester) {
  if (!semester) return [];
  return clinicalSlots(semester)
    .concat(simSlots(semester))
    .concat(theorySlots(semester));
}

function listOpenSlots(semester) {
  return listAllSlots(semester).filter(function (s) { return s.open && s.openCount > 0; });
}

function findSlotById(semester, slotId) {
  var id = String(slotId || '');
  var prefix = semester && semester.id ? semester.id + '::' : '';
  if (prefix && id.indexOf(prefix) === 0) id = id.slice(prefix.length);
  return listAllSlots(semester).find(function (s) { return s.slotId === id; }) || null;
}

function filterSlots(slots, filters) {
  filters = filters || {};
  return (slots || []).filter(function (slot) {
    if (filters.courseId && slot.courseId !== filters.courseId) return false;
    if (filters.kind && slot.kind !== filters.kind) return false;
    if (filters.siteId && slot.siteId !== filters.siteId && slot.facilityId !== filters.siteId) return false;
    if (filters.weekday) {
      var wd = String(filters.weekday).toLowerCase();
      var matchWeekday = String(slot.weekday || '').toLowerCase() === wd;
      if (!matchWeekday) {
        matchWeekday = (slot.instances || []).some(function (inst) {
          return String(inst.weekday || '').toLowerCase() === wd;
        });
      }
      if (!matchWeekday) return false;
    }
    if (filters.openOnly && !(slot.open && slot.openCount > 0)) return false;
    return true;
  });
}

export {
  isNeeded,
  eventSlotKind,
  listAllSlots,
  listOpenSlots,
  findSlotById,
  filterSlots,
  hhmmToMinutes,
  minutesToHhmm,
  slotHours,
  clinicalInstances
};
