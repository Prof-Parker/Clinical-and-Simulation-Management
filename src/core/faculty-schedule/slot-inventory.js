/**
 * Build faculty signup-slot inventory from Faculty Needed markers and assigned slots.
 */

import * as ScheduleHours from '../schedule-hours.js';
import * as DataModel from '../data-model/index.js';
import { FACULTY_NEEDED_NAME } from '../theory-events.js';
import { hoursFromTimes } from '../theory-data.js';
import { normalizeSpecialties } from './specialties.js';
import { courseBand } from './program-bands.js';
import * as CourseDefaults from '../course-defaults.js';

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

function clinicalInstances(semester, clinicalGroup) {
  var dates = {};
  (semester.students || []).forEach(function (s) {
    if (s.clinicalGroup !== clinicalGroup) return;
    (s.schedule || []).forEach(function (cell, wi) {
      if (!cell || !cell.clinical || !cell.date) return;
      dates[cell.date] = {
        date: cell.date,
        weekIndex: wi,
        weekday: cell.day || '',
        facilityId: cell.facilityId || s.facilityId || null
      };
    });
  });
  return Object.keys(dates).sort().map(function (d) { return dates[d]; });
}

function facilityForGroup(semester, clinicalGroup, instances) {
  var byGroup = semester.config && semester.config.clinicalGroupFacilities;
  if (byGroup && byGroup[clinicalGroup]) {
    return DataModel.findFacilityById(semester, byGroup[clinicalGroup]);
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

function weekdayFromDate(iso) {
  if (!iso) return '';
  var d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
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
      if (!cell || !cell.sim || !cell.date) return;
      dates[cell.date] = {
        date: cell.date,
        weekIndex: wi,
        weekday: cell.day || weekdayFromDate(cell.date),
        timeStart: start,
        timeEnd: end
      };
    });
  });
  return Object.keys(dates).sort().map(function (d) { return dates[d]; });
}

/**
 * Group theory faculty-needed rows by recurring pattern (weekday+times+type).
 */
function theorySlots(semester) {
  var theory = semester.theory;
  if (!theory || !Array.isArray(theory.days)) return [];
  var groups = {};
  theory.days.forEach(function (day) {
    if (!day || !Array.isArray(day.events)) return;
    day.events.forEach(function (ev) {
      if (!ev || !Array.isArray(ev.faculty)) return;
      var kind = ev.type === 'skills_lab' || ev.type === 'skills' ? 'skills'
        : (ev.type === 'lecture' || ev.type === 'guest_lecture' ? 'lecture' : '');
      if (!kind) return;
      ev.faculty.forEach(function (slot, fi) {
        if (!isNeeded(slot)) return;
        var start = ScheduleHours.normalizeHhmm(ev.timeStart || day.timeStart, '0800');
        var end = ScheduleHours.normalizeHhmm(ev.timeEnd || day.timeEnd, '1200');
        var wd = day.weekday || weekdayFromDate(day.date);
        var key = [kind, wd, start, end, ev.courseCode || ''].join('|');
        if (!groups[key]) {
          groups[key] = {
            kind: kind,
            weekday: wd,
            timeStart: start,
            timeEnd: end,
            courseCode: ev.courseCode || '',
            capacity: 0,
            refs: [],
            instances: {}
          };
        }
        groups[key].capacity += 1;
        groups[key].refs.push({
          dayId: day.id,
          eventId: ev.id,
          facultyIndex: fi,
          facultyId: slot.id || ''
        });
        if (day.date) {
          groups[key].instances[day.date] = {
            date: day.date,
            weekIndex: day.weekIndex != null ? day.weekIndex : null,
            weekday: wd,
            timeStart: start,
            timeEnd: end
          };
        }
      });
    });
  });

  return Object.keys(groups).map(function (key) {
    var g = groups[key];
    var specs = g.kind === 'lecture'
      ? ['Lec']
      : defaultSpecialties(semester, 'skills');
    var slot = makeBase(semester, {
      slotId: 'theory:' + key,
      kind: g.kind,
      sourcePath: 'theory',
      sourceId: key,
      specialties: specs,
      timeStart: g.timeStart,
      timeEnd: g.timeEnd,
      weekday: g.weekday,
      open: g.capacity > 0,
      capacity: g.capacity,
      openCount: g.capacity,
      theoryRefs: g.refs,
      instances: Object.keys(g.instances).sort().map(function (d) { return g.instances[d]; })
    });
    return finalizeSlot(slot);
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
  return listAllSlots(semester).find(function (s) { return s.slotId === slotId; }) || null;
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
  listAllSlots,
  listOpenSlots,
  findSlotById,
  filterSlots,
  hhmmToMinutes,
  minutesToHhmm,
  slotHours,
  clinicalInstances
};
