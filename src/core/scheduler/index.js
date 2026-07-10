/**
 * Public scheduler API: full regeneration, per-student refresh, and re-exports.
 */

import {
  uid,
  assignDefaultStudentNames
} from '../data-model/index.js';
import * as CalendarEngine from '../calendar-engine.js';
import {
  assignSimGroups,
  assignFacilities,
  clearSchedules,
  markInactiveWeeks
} from './assignments.js';
import {
  scheduleClinicalForStudent,
  scheduleConflictClinicalMakeups,
  scheduleMissedMakeups
} from './clinical.js';
import {
  getStudentClinicalDay,
  findSimWeek,
  weekHasDoubleBooking,
  getSimCaps,
  getClinicalCaps,
  getDaySimStudents,
  getDaySimAttendanceCount,
  getSessionStudents,
  getSessionCount,
  getClinicalGroupAttendanceCount,
  getClinicalGroupSessionStudents,
  getClinicalAttendanceCount,
  getClinicalSessionStudents,
  getExistingSimSessions,
  getExistingClinicalAtFacility,
  getEffectiveSimNormalCap,
  clinicalSimWeekdaysOverlap,
  blockHasRegularCapacity,
  shouldDeferWeek18
} from './helpers.js';
import {
  findMakeupSlots,
  applyMakeupSlot,
  getWeek18SimMakeupSlot
} from './makeup.js';
import {
  SIM_GROUP_SCHEDULE,
  getSimWeekPatterns,
  resolveSimBlockWeeks,
  resolveSimSessionHost,
  buildProgramSimCalendar,
  getStudentSimSlot,
  getStudentSimSlotCandidates,
  getWeekSimNumber,
  getSimPlacements,
  buildSimPlacementCandidates,
  scheduleSimsForAllStudents,
  buildStateFromStudentSchedule,
  scheduleOneSimForStudent
} from './sim-placement.js';

export function regenerateAll(data) {
  if (!data || !data.students.length) return data;
  CalendarEngine.rebuildWeeks(data);
  assignSimGroups(data.students, data.config);
  assignFacilities(data.students, data.facilities, data.config);
  clearSchedules(data.students);
  data.students.forEach(function (s) { s.makeups = []; });
  markInactiveWeeks(data);
  data._simCalendar = buildProgramSimCalendar(data, data.config);
  data.students.forEach(function (s) {
    scheduleClinicalForStudent(s, data);
  });
  data._simSchedulingApplyHeadroom = true;
  var simStates = scheduleSimsForAllStudents(data, data._simCalendar);
  delete data._simSchedulingApplyHeadroom;
  data.students.forEach(function (s) {
    scheduleConflictClinicalMakeups(s, data, simStates[s.id]);
  });
  data.students.forEach(function (s) {
    scheduleMissedMakeups(s, data);
  });
  return data;
}

export function clearStudentSimSchedule(student, data) {
  var cfg = data.config;
  student.schedule.forEach(function (cell) {
    if (!cell || !cell.sim) return;
    if (cell.clinicalMissed && cell.clinical &&
        cell.simDay === getStudentClinicalDay(student, cfg)) {
      cell.clinicalMissed = false;
    }
    cell.sim = null;
    cell.simDay = null;
    cell.simGuestGroup = null;
    cell.simMakeup = false;
    cell.simOverload = false;
  });
  student.makeups = (student.makeups || []).filter(function (m) { return m.type !== 'sim'; });
}

export function regenerateStudent(student, data) {
  markInactiveWeeks(data);
  if (!data._simCalendar) data._simCalendar = buildProgramSimCalendar(data, data.config);
  clearStudentSimSchedule(student, data);
  var cfg = data.config;
  var calendar = data._simCalendar;
  var needed = cfg.simDaysRequired || 5;
  var state = buildStateFromStudentSchedule(student, cfg);
  data._simSchedulingApplyHeadroom = true;
  for (var simNum = 1; simNum <= needed; simNum++) {
    if (findSimWeek(student, simNum) < 0) {
      scheduleOneSimForStudent(student, data, state, calendar, simNum);
    }
  }
  delete data._simSchedulingApplyHeadroom;
  scheduleConflictClinicalMakeups(student, data, state);
  scheduleMissedMakeups(student, data);
}

export function copyForward(data, newSemesterName) {
  var copy = JSON.parse(JSON.stringify(data));
  copy.meta.semesterName = newSemesterName || 'New Semester';
  copy.meta.lastModified = new Date().toISOString();
  copy.students.forEach(function (s) {
    s.id = uid();
    s.absences = [];
    s.makeups = [];
  });
  assignDefaultStudentNames(copy.students);
  var start = new Date();
  start.setMonth(start.getMonth() + 4);
  copy.calendar.semesterStartDate = CalendarEngine.toISO(start);
  CalendarEngine.rebuildWeeks(copy);
  return copy;
}

export {
  SIM_GROUP_SCHEDULE,
  getSimWeekPatterns,
  resolveSimBlockWeeks,
  resolveSimSessionHost,
  buildProgramSimCalendar,
  getStudentSimSlot,
  getStudentSimSlotCandidates,
  getWeekSimNumber,
  getDaySimStudents,
  getDaySimAttendanceCount,
  getSimCaps,
  getClinicalCaps,
  getSessionStudents,
  getClinicalGroupAttendanceCount,
  getClinicalGroupSessionStudents,
  getClinicalAttendanceCount,
  getClinicalSessionStudents,
  getExistingSimSessions,
  getExistingClinicalAtFacility,
  getWeek18SimMakeupSlot,
  assignSimGroups,
  weekHasDoubleBooking,
  getStudentClinicalDay,
  findMakeupSlots,
  findSimWeek,
  applyMakeupSlot,
  getSessionCount,
  getSimPlacements,
  blockHasRegularCapacity,
  shouldDeferWeek18,
  buildSimPlacementCandidates,
  getEffectiveSimNormalCap,
  clinicalSimWeekdaysOverlap
};
