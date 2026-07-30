/**
 * Holiday application and algo scheduling block helpers.
 */

import { parseDate } from './calendar-dates.js';
import { getWeekIndexForDate, weekdayNameForDate } from './calendar-weeks.js';

var WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function holidayBlocksFullWeek(data) {
  var cfg = data && data.config;
  if (!cfg || cfg.holidayBlocksFullWeek === undefined || cfg.holidayBlocksFullWeek === null) {
    return true;
  }
  return !!cfg.holidayBlocksFullWeek;
}

export function applyHolidays(data) {
  (data.calendar.weeks || []).forEach(function (w) {
    w.inactive = false;
    w.break = false;
    w.holiday = false;
    w.holidayWeekdays = [];
    w.mondayHoliday = false;
    w.labels = [];
  });

  (data.holidays || []).forEach(function (h) {
    var type = h.type === 'mondayHoliday' ? 'holiday' : (h.type || 'holiday');
    var wi = -1;
    if (type === 'break' && h.weekIndex != null && h.weekIndex >= 0) {
      wi = parseInt(h.weekIndex, 10);
    } else {
      wi = getWeekIndexForDate(data, h.date);
    }
    if (wi < 0 || !data.calendar.weeks[wi]) return;
    var week = data.calendar.weeks[wi];
    week.labels.push(h.label || type);
    if (type === 'break') {
      week.break = true;
      week.inactive = true;
    } else {
      week.holiday = true;
      var d = parseDate(h.date);
      var dayName = d ? weekdayNameForDate(d) : null;
      if (dayName && week.holidayWeekdays.indexOf(dayName) < 0) {
        week.holidayWeekdays.push(dayName);
      }
    }
  });
}

export function isWeekInactive(data, weekIndex) {
  var w = data.calendar.weeks[weekIndex];
  return !w || w.inactive;
}

/** True when the whole week is blocked for algorithmic sim/clinical placement. */
export function isSchedulingBlockedWeek(data, weekIndex) {
  var w = data.calendar && data.calendar.weeks[weekIndex];
  if (!w) return true;
  if (w.inactive || w.break) return true;
  if (w.holiday && holidayBlocksFullWeek(data)) return true;
  return false;
}

/**
 * True when a specific weekday is blocked for algorithmic placement.
 * @param {string} day - e.g. 'Mon', 'Tue'
 */
export function isSchedulingBlockedDay(data, weekIndex, day) {
  if (isSchedulingBlockedWeek(data, weekIndex)) return true;
  var w = data.calendar.weeks[weekIndex];
  if (!w || !w.holiday || holidayBlocksFullWeek(data)) return false;
  var days = w.holidayWeekdays || [];
  return days.indexOf(day) >= 0;
}

export function weekHasHoliday(data, weekIndex) {
  var w = data.calendar && data.calendar.weeks[weekIndex];
  return !!(w && w.holiday);
}

export { WEEKDAY_NAMES };
