/**
 * Module letter/title helpers and moduleCode ↔ date mapping.
 */

import { parseDate, toISO, addDays } from './calendar-engine.js';

export var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

var SLOT_LETTERS = ['A', 'B', 'C', 'D'];
var MODULE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function moduleLetterAt(index) {
  if (index < 0) index = 0;
  if (index < 26) return MODULE_LETTERS.charAt(index);
  // AA, AB, … after Z
  var hi = Math.floor(index / 26) - 1;
  var lo = index % 26;
  return MODULE_LETTERS.charAt(hi) + MODULE_LETTERS.charAt(lo);
}

export function isLectureTopicEvent(ev) {
  if (!ev) return false;
  if (ev.track === 'theory') return true;
  return !!(ev.categories && ev.categories.indexOf('lecture') >= 0);
}

export function stripModuleTitlePrefix(title) {
  return String(title || '').replace(/^Module\s+\d+[A-Za-z]+\s*[—–-]\s*/i, '').trim();
}

export function formatModuleTitle(moduleCode, title) {
  var base = stripModuleTitlePrefix(title);
  if (!base) base = 'Topic';
  return 'Module ' + moduleCode + ' — ' + base;
}

/** Lecture topics in a week, ordered by weekday → start time → event order. */
export function listLectureTopicsInWeek(theory, weekLabel) {
  var items = [];
  (theory.days || []).forEach(function (day) {
    if (day.weekLabel !== weekLabel) return;
    (day.events || []).forEach(function (ev, eventIndex) {
      if (!isLectureTopicEvent(ev)) return;
      items.push({ day: day, ev: ev, eventIndex: eventIndex });
    });
  });
  items.sort(function (a, b) {
    var wa = weekdayToOffset(a.day.weekday);
    var wb = weekdayToOffset(b.day.weekday);
    if (wa !== wb) return wa - wb;
    var ta = a.ev.timeStart || '';
    var tb = b.ev.timeStart || '';
    if (ta !== tb) return ta < tb ? -1 : (ta > tb ? 1 : 0);
    return a.eventIndex - b.eventIndex;
  });
  return items;
}

/** Assign module codes 1A, 1B, … and sync title prefixes for lecture topics in a week. */
export function renumberWeekModules(theory, weekLabel) {
  var items = listLectureTopicsInWeek(theory, weekLabel);
  items.forEach(function (item, idx) {
    var code = String(weekLabel) + moduleLetterAt(idx);
    item.ev.moduleCode = code;
    item.ev.title = formatModuleTitle(code, item.ev.title);
  });
  return items;
}

export function renumberAllWeekModules(theory) {
  for (var w = 1; w <= 18; w++) renumberWeekModules(theory, w);
}

export function parseModuleCode(moduleCode) {
  if (!moduleCode || typeof moduleCode !== 'string') return null;
  var m = moduleCode.match(/^(\d+)([A-Za-z]+)$/);
  if (!m) return null;
  return { weekLabel: parseInt(m[1], 10), slotLetter: m[2].toUpperCase() };
}

export function slotIndexFromLetter(letter) {
  var idx = SLOT_LETTERS.indexOf((letter || '').toUpperCase());
  return idx >= 0 ? idx : 0;
}

export function weekdayForSlot(lectureWeekdays, slotLetter) {
  var days = lectureWeekdays || ['Wed', 'Thu'];
  var idx = slotIndexFromLetter(slotLetter);
  return days[idx] || days[days.length - 1];
}

export function weekdayToOffset(weekday) {
  var idx = WEEKDAYS.indexOf(weekday);
  return idx >= 0 ? idx : 0;
}

export function dateForWeekdayInWeek(semester, weekIndex, weekday) {
  if (!semester || !semester.calendar || !semester.calendar.weeks[weekIndex]) return null;
  var ws = parseDate(semester.calendar.weeks[weekIndex].startDate);
  if (!ws) return null;
  return toISO(addDays(ws, weekdayToOffset(weekday)));
}

export function dateForModuleCode(semester, moduleCode) {
  var theory = semester && semester.theory;
  if (theory && theory.days) {
    var needle = String(moduleCode || '').toUpperCase();
    for (var i = 0; i < theory.days.length; i++) {
      var day = theory.days[i];
      var hit = (day.events || []).some(function (ev) {
        return ev.moduleCode && String(ev.moduleCode).toUpperCase() === needle;
      });
      if (hit) return day.date;
    }
  }
  var parsed = parseModuleCode(moduleCode);
  if (!parsed || !semester || !semester.theory) return null;
  var weekday = weekdayForSlot(semester.theory.settings.lectureWeekdays, parsed.slotLetter);
  var weekIndex = parsed.weekLabel - 1;
  if (weekIndex < 0 || weekIndex > 17) return null;
  return dateForWeekdayInWeek(semester, weekIndex, weekday);
}
