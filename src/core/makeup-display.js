/**
 * Makeup slot tier styling helpers and week/day labels.
 */

import * as CalendarEngine from './calendar-engine.js';

function findMakeupRecord(student, weekIndex, type) {
  if (!student.makeups) return null;
  for (var i = student.makeups.length - 1; i >= 0; i--) {
    var m = student.makeups[i];
    if (m.weekIndex === weekIndex && m.type === type) return m;
  }
  return null;
}

function getSlotTier(slot) {
  if (!slot) return 'clean';
  if (slot.week18Fallback) return 'lastresort';
  if (slot.clinicalConflict) return 'conflict';
  return 'clean';
}

function getSimMakeupTier(cell, student, weekIndex) {
  if (!cell || !cell.simMakeup) return null;
  var meta = findMakeupRecord(student, weekIndex, 'sim');
  if (meta && meta.week18Fallback) return 'lastresort';
  if (meta && meta.clinicalConflict) return 'conflict';
  if (cell.clinicalMissed && cell.sim) return 'conflict';
  if (weekIndex === 17) return 'lastresort';
  return 'clean';
}

function getClinicalMakeupTier(cell, student, weekIndex) {
  if (!cell || !cell.makeupClinical) return null;
  var meta = findMakeupRecord(student, weekIndex, 'clinical');
  if (meta && meta.clinicalConflict) return 'conflict';
  if (meta && meta.week18Fallback) return 'lastresort';
  if (weekIndex === 17 && !(meta && meta.facilityId)) return 'lastresort';
  return 'clean';
}

function tierClass(tier) {
  return tier ? 'makeup-tier-' + tier : '';
}

function applyButtonClass(slot) {
  return 'btn btn-sm apply-makeup ' + tierClass(getSlotTier(slot));
}

function applyButtonLabel(slot) {
  return slot.overload ? 'Apply Overload' : 'Apply';
}

function week18ApplyLabel(slot, type) {
  if (type === 'sim') return 'Apply Week 18 Makeup';
  return applyButtonLabel(slot);
}

/**
 * Label like "Week 9 (Mon 4/6)" for makeup finder lists and confirmations.
 */
function formatWeekDayLabel(data, weekIndex, day) {
  var weekNum = (weekIndex == null ? 0 : weekIndex) + 1;
  var dayPart = day || '';
  if (!data || weekIndex == null || !dayPart) {
    return 'Week ' + weekNum + (dayPart ? ' (' + dayPart + ')' : '');
  }
  var weeks = data.calendar && data.calendar.weeks;
  var week = weeks && weeks[weekIndex];
  var iso = week ? CalendarEngine.dateForWeekdayInWeekRange(week, dayPart) : null;
  var datePart = '';
  if (iso) {
    var d = CalendarEngine.parseDate(iso);
    if (d) datePart = (d.getMonth() + 1) + '/' + d.getDate();
  }
  var inner = dayPart + (datePart ? ' ' + datePart : '');
  return 'Week ' + weekNum + ' (' + inner + ')';
}

export {
  findMakeupRecord,
  getSlotTier,
  getSimMakeupTier,
  getClinicalMakeupTier,
  tierClass,
  applyButtonClass,
  applyButtonLabel,
  week18ApplyLabel,
  formatWeekDayLabel
};
