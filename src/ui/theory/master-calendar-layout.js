/**
 * Pure layout for the Master Calendar grid: calendar weeks own cell dates;
 * theory.days events attach by exact ISO date.
 */

import { dateForWeekdayInWeek } from '../../core/theory-modules.js';

export var WEEK_COLS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * @returns {{ weekLabel: number, days: Array<{ wd: string, date: string, day: object|null, events: array }> }[]}
 */
export function buildMasterCalendarWeeks(data) {
  var theory = data && data.theory;
  var byDate = {};
  if (theory && Array.isArray(theory.days)) {
    theory.days.forEach(function (day) {
      if (!day || !day.date) return;
      byDate[day.date] = day;
    });
  }

  var weeks = [];
  for (var w = 1; w <= 18; w++) {
    var days = WEEK_COLS.map(function (wd) {
      var date = dateForWeekdayInWeek(data, w - 1, wd) || '';
      var day = date ? (byDate[date] || null) : null;
      return {
        wd: wd,
        date: date,
        day: day,
        events: (day && day.events) || []
      };
    });
    weeks.push({ weekLabel: w, days: days });
  }
  return weeks;
}

/** True when every dated cell in a week is strictly increasing by ISO date. */
export function weekDatesAreInOrder(week) {
  if (!week || !week.days) return true;
  var prev = null;
  for (var i = 0; i < week.days.length; i++) {
    var date = week.days[i].date;
    if (!date) continue;
    if (prev && date <= prev) return false;
    prev = date;
  }
  return true;
}
