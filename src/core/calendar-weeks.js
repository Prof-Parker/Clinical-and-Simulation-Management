/**
 * Sunday–Saturday instructional week rebuild and date indexing.
 */

import { parseDate, toISO, addDays } from './calendar-dates.js';

var WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Saturday on or after date (inclusive). */
export function saturdayOnOrAfter(d) {
  var r = new Date(d.getTime());
  var dow = r.getDay();
  var add = (6 - dow + 7) % 7;
  return addDays(r, add);
}

/** Next Sunday strictly after date. If date is Sunday, returns date + 7. */
export function nextSundayAfter(d) {
  var r = new Date(d.getTime());
  var dow = r.getDay();
  var add = dow === 0 ? 7 : (7 - dow);
  return addDays(r, add);
}

export function weekdayNameForDate(d) {
  return WEEKDAY_NAMES[d.getDay()] || 'Sun';
}

/**
 * Build 18 instructional weeks: week 1 from semesterStart through Saturday;
 * weeks 2–18 always Sunday–Saturday.
 */
export function buildWeekList(semesterStartDate) {
  var start = parseDate(semesterStartDate);
  if (!start) start = new Date();
  var weeks = [];
  var week1End = saturdayOnOrAfter(start);
  weeks.push({
    weekNum: 1,
    startDate: toISO(start),
    endDate: toISO(week1End),
    inactive: false,
    break: false,
    holiday: false,
    holidayWeekdays: [],
    labels: []
  });
  var cursor = nextSundayAfter(start);
  if (start.getDay() === 0) {
    cursor = addDays(start, 7);
  }
  for (var i = 1; i < 18; i++) {
    var end = addDays(cursor, 6);
    weeks.push({
      weekNum: i + 1,
      startDate: toISO(cursor),
      endDate: toISO(end),
      inactive: false,
      break: false,
      holiday: false,
      holidayWeekdays: [],
      labels: []
    });
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export function getWeekIndexForDate(data, dateStr) {
  var d = parseDate(dateStr);
  if (!d || !data.calendar || !data.calendar.weeks || !data.calendar.weeks.length) return -1;
  for (var i = 0; i < data.calendar.weeks.length; i++) {
    var w = data.calendar.weeks[i];
    var ws = parseDate(w.startDate);
    var we = parseDate(w.endDate);
    if (!ws) continue;
    if (!we) we = addDays(ws, 6);
    if (d >= ws && d <= we) return i;
  }
  return -1;
}

/**
 * ISO date for weekday within a week, or null if that weekday is before instruction
 * (partial week 1) or outside the week range.
 */
export function dateForWeekdayInWeekRange(week, weekday) {
  if (!week || !week.startDate) return null;
  var target = WEEKDAY_NAMES.indexOf(weekday);
  if (target < 0) return null;
  var ws = parseDate(week.startDate);
  var we = parseDate(week.endDate);
  if (!ws) return null;
  if (!we) we = addDays(ws, 6);
  var startDow = ws.getDay();
  var delta = target - startDow;
  if (delta < 0) delta += 7;
  var d = addDays(ws, delta);
  if (d < ws || d > we) return null;
  return toISO(d);
}
