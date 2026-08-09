/**
 * Keep theory.days weekLabel / weekday aligned with calendar weeks.
 * Separate from calendar-engine to avoid theory ↔ calendar import cycles.
 */

import { parseDate } from './calendar-dates.js';
import { getWeekIndexForDate, weekdayNameForDate } from './calendar-weeks.js';

/**
 * Refresh weekIndex, weekLabel, and weekday on one theory day from its date.
 * @returns {boolean} true when any field changed
 */
export function reindexTheoryDay(semester, day) {
  if (!day || !day.date) return false;
  var weekIndex = getWeekIndexForDate(semester, day.date);
  var d = parseDate(day.date);
  var weekday = d ? weekdayNameForDate(d) : (day.weekday || 'Sun');
  var nextIndex = weekIndex >= 0 ? weekIndex : 0;
  var nextLabel = weekIndex >= 0 ? weekIndex + 1 : 1;
  var changed = false;
  if (day.weekIndex !== nextIndex) {
    day.weekIndex = nextIndex;
    changed = true;
  }
  if (day.weekLabel !== nextLabel) {
    day.weekLabel = nextLabel;
    changed = true;
  }
  if (day.weekday !== weekday) {
    day.weekday = weekday;
    changed = true;
  }
  return changed;
}

/** Reindex every theory day on the semester. No-op when theory is missing. */
export function reindexTheoryDays(semester) {
  if (!semester || !semester.theory || !Array.isArray(semester.theory.days)) return 0;
  var n = 0;
  semester.theory.days.forEach(function (day) {
    if (reindexTheoryDay(semester, day)) n += 1;
  });
  return n;
}
