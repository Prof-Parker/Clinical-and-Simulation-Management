/**
 * Dashboard / export labels for break weeks and date holidays.
 */

import { holidayBlocksFullWeek } from './calendar-holidays.js';
import { getClinicalDayForGroup, getSimGroupDay } from './data-model/index.js';

export function isBreakWeek(data, weekIndex) {
  var w = data && data.calendar && data.calendar.weeks[weekIndex];
  return !!(w && (w.inactive || w.break));
}

/**
 * Weekday names to show as "Holiday (Mon)" for this student/week.
 * Full-week-block courses: every student sees all holiday weekdays that week.
 * Day-only courses: only weekdays that hit the student's clinical or sim day.
 */
export function holidayIndicatorDays(data, student, weekIndex) {
  var w = data && data.calendar && data.calendar.weeks[weekIndex];
  if (!w || !w.holiday) return [];
  var days = (w.holidayWeekdays || []).slice();
  if (!days.length) return [];
  if (holidayBlocksFullWeek(data)) return days;

  var cfg = data.config;
  var clinDay = getClinicalDayForGroup(student.clinicalGroup, cfg);
  var simDay = getSimGroupDay(student.simGroup, cfg);
  return days.filter(function (d) {
    return d === clinDay || d === simDay;
  });
}

export function formatHolidayIndicator(days) {
  if (!days || !days.length) return '';
  return 'Holiday (' + days.join(', ') + ')';
}

/** Plain-text label for an empty/blocked cell (Break, Holiday (Mon), or ''). */
export function scheduleHolidayPlainLabel(data, student, weekIndex, cell) {
  if ((cell && cell.inactive) || isBreakWeek(data, weekIndex)) return 'Break';
  return formatHolidayIndicator(holidayIndicatorDays(data, student, weekIndex));
}
