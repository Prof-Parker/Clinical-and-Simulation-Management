/**
 * Semester week calendar and holiday logic (public barrel).
 */

import { parseDate, toISO, addDays } from './calendar-dates.js';
import {
  buildWeekList,
  getWeekIndexForDate,
  dateForWeekdayInWeekRange,
  saturdayOnOrAfter,
  nextSundayAfter,
  weekdayNameForDate
} from './calendar-weeks.js';
import {
  applyHolidays,
  isWeekInactive,
  isSchedulingBlockedWeek,
  isSchedulingBlockedDay,
  holidayBlocksFullWeek,
  weekHasHoliday
} from './calendar-holidays.js';

function rebuildWeeks(data) {
  data.calendar.weeks = buildWeekList(data.calendar.semesterStartDate);
  applyHolidays(data);
  return data.calendar.weeks;
}

function getWeekDisplay(data, weekIndex, short) {
  var w = data.calendar.weeks[weekIndex];
  if (!w) return 'Wk ' + (weekIndex + 1);
  var label = 'Wk ' + w.weekNum;
  if (w.startDate) {
    var d = parseDate(w.startDate);
    var fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return short ? label + ' (' + fmt + ')' : label + '<br><span class="week-date">' + fmt + '</span>';
  }
  return label;
}

function formatDisplayDate(iso) {
  var d = parseDate(iso);
  if (!d) return iso || '';
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function getActiveSchedulingWeeks(data) {
  var cfg = data.config;
  var start = (cfg.simStartWeek || 5) - 1;
  var weeks = [];
  for (var i = start; i < 18; i++) {
    if (!isSchedulingBlockedWeek(data, i)) weeks.push(i);
  }
  return weeks;
}

function getClinicalEligibleWeeks(data, fromWeek) {
  var cfg = data.config;
  var start = Math.max((cfg.clinicalStartWeek || 5) - 1, fromWeek || 0);
  var weeks = [];
  for (var i = start; i < 18; i++) {
    if (!isSchedulingBlockedWeek(data, i)) weeks.push(i);
  }
  return weeks;
}

function resolveConfiguredMakeupWeek(data, weekNum1Based) {
  if (weekNum1Based == null || weekNum1Based === '' || isNaN(weekNum1Based)) return null;
  var wi = parseInt(weekNum1Based, 10) - 1;
  if (wi < 0 || wi >= 18) return null;
  if (!isSchedulingBlockedWeek(data, wi)) return wi;
  for (var d = 1; d < 18; d++) {
    if (wi - d >= 0 && !isSchedulingBlockedWeek(data, wi - d)) return wi - d;
    if (wi + d < 18 && !isSchedulingBlockedWeek(data, wi + d)) return wi + d;
  }
  return null;
}

function resolveMakeupWeeks(data) {
  var cfg = data.config || {};
  var active = [];
  for (var i = 0; i < 18; i++) {
    if (!isSchedulingBlockedWeek(data, i)) active.push(i);
  }
  var fallback = active.length ? active[active.length - 1] : 17;
  var primary = active.length > 1 ? active[active.length - 2] : fallback;
  var primaryWi = resolveConfiguredMakeupWeek(data, cfg.clinicalMakeupPrimaryWeek);
  var fallbackWi = resolveConfiguredMakeupWeek(data, cfg.clinicalMakeupFallbackWeek);
  var simLastWi = resolveConfiguredMakeupWeek(data, cfg.simMakeupLastResortWeek);
  return {
    clinicalPrimary: primaryWi != null ? primaryWi : primary,
    clinicalFallback: fallbackWi != null ? fallbackWi : fallback,
    simLastResort: simLastWi != null ? simLastWi : fallback
  };
}

export {
  parseDate,
  toISO,
  addDays,
  rebuildWeeks,
  applyHolidays,
  getWeekIndexForDate,
  isWeekInactive,
  isSchedulingBlockedWeek,
  isSchedulingBlockedDay,
  holidayBlocksFullWeek,
  weekHasHoliday,
  getWeekDisplay,
  formatDisplayDate,
  getActiveSchedulingWeeks,
  getClinicalEligibleWeeks,
  resolveMakeupWeeks,
  dateForWeekdayInWeekRange,
  saturdayOnOrAfter,
  nextSundayAfter,
  weekdayNameForDate,
  buildWeekList
};
