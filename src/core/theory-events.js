/**
 * Theory calendar day/event helpers and faculty slot utilities.
 */

import { uid } from './data-model/students.js';
import { parseDate, getWeekIndexForDate } from './calendar-engine.js';
import {
  WEEKDAYS,
  isLectureTopicEvent,
  stripModuleTitlePrefix,
  renumberWeekModules
} from './theory-modules.js';

export var FACULTY_NEEDED_NAME = 'Faculty Needed';

export function facultyDisplayName(slot) {
  if (!slot) return '';
  if (slot.needed || !slot.name || slot.name === FACULTY_NEEDED_NAME) return FACULTY_NEEDED_NAME;
  return slot.name;
}

export function makeFacultySlot(opts) {
  opts = opts || {};
  var needed = !!opts.needed || !opts.name || opts.name === FACULTY_NEEDED_NAME;
  return {
    name: needed ? FACULTY_NEEDED_NAME : String(opts.name || '').trim(),
    role: opts.role || 'lecturer',
    needed: needed
  };
}

export function clearFacultySlot(slot) {
  if (!slot) return makeFacultySlot({ needed: true, role: 'lecturer' });
  slot.name = FACULTY_NEEDED_NAME;
  slot.needed = true;
  return slot;
}

export function refreshFacultyNeeded(theory) {
  if (!theory) return [];
  var list = [];
  (theory.days || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      (ev.faculty || []).forEach(function (slot, idx) {
        if (!slot || !(slot.needed || slot.name === FACULTY_NEEDED_NAME || !slot.name)) return;
        list.push({
          eventId: ev.id,
          date: day.date,
          weekLabel: day.weekLabel,
          track: ev.track,
          title: ev.title || ev.track,
          role: slot.role || 'lecturer',
          slotIndex: idx
        });
      });
    });
  });
  theory.facultyNeeded = list;
  return list;
}

export function trackCssClass(ev) {
  var track = (ev && ev.track) || 'other';
  var cls = 'theory-track theory-track-' + track;
  if (track === 'assignment') {
    var area = (ev && ev.contentArea) || 'theory';
    cls += ' theory-track-assignment-' + area;
  }
  return cls;
}

/**
 * Practicum band on the master calendar: skills, clinical, simulation, orientation,
 * and assignments tagged to those content areas. Everything else is theory-band.
 */
export function isPracticumTrackEvent(ev) {
  if (!ev) return false;
  var track = ev.track;
  if (track === 'skills' || track === 'clinical' || track === 'simulation' || track === 'orientation') {
    return true;
  }
  if (track === 'assignment') {
    var area = ev.contentArea || 'theory';
    return area === 'skills' || area === 'clinical' || area === 'simulation';
  }
  return false;
}

/** Insert event into a day keeping theory-band events above practicum-band events. */
export function insertEventOnDay(day, ev) {
  if (!day) return;
  if (!day.events) day.events = [];
  if (!ev) return;
  var practicum = isPracticumTrackEvent(ev);
  if (!practicum) {
    var insertAt = 0;
    while (insertAt < day.events.length && !isPracticumTrackEvent(day.events[insertAt])) {
      insertAt++;
    }
    day.events.splice(insertAt, 0, ev);
    return;
  }
  day.events.push(ev);
}

/**
 * Sync Setup holidays/breaks onto theory calendar as all-day holiday events.
 * Only replaces events tagged categories includes 'synced_holiday'.
 */
export function syncHolidaysFromSemester(semester) {
  if (!semester || !semester.theory) return semester;
  var theory = semester.theory;
  var weeks = (semester.calendar && semester.calendar.weeks) || [];

  (theory.days || []).forEach(function (day) {
    day.events = (day.events || []).filter(function (ev) {
      return !(ev.categories && ev.categories.indexOf('synced_holiday') >= 0);
    });
    day.isHoliday = false;
    day.isBreak = false;
  });

  function markDay(date, label, isBreak) {
    var day = ensureDay(theory, semester, date);
    day.isHoliday = !isBreak;
    day.isBreak = !!isBreak;
    day.events.push({
      id: uid(),
      track: 'holiday',
      title: label || (isBreak ? 'Break' : 'Holiday'),
      description: '',
      moduleCode: null,
      moduleRef: null,
      moduleRefs: [],
      timeStart: null,
      timeEnd: null,
      allDay: true,
      faculty: [],
      categories: ['synced_holiday'],
      contentArea: null,
      facultyRequired: null
    });
  }

  (semester.holidays || []).forEach(function (h) {
    var label = h.label || (h.type === 'break' ? 'Break' : 'Holiday');
    if (h.type === 'break') {
      var wi = h.weekIndex != null ? parseInt(h.weekIndex, 10) : getWeekIndexForDate(semester, h.date);
      if (wi < 0 || !weeks[wi]) return;
      var start = parseDate(weeks[wi].startDate);
      if (!start) return;
      for (var d = 0; d < 7; d++) {
        var cur = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
        var iso = cur.getFullYear() + '-' +
          String(cur.getMonth() + 1).padStart(2, '0') + '-' +
          String(cur.getDate()).padStart(2, '0');
        markDay(iso, label, true);
      }
      return;
    }
    if (!h.date) return;
    markDay(h.date, label, false);
  });

  return semester;
}

/**
 * Copy lecture titles/moduleRefs from sourceTheory onto empty lecture slots in targetTheory
 * matched by moduleCode order. Does not overwrite filled titles.
 */
export function seedTopicsFromTheory(targetTheory, sourceTheory) {
  if (!targetTheory || !sourceTheory) return { filled: 0 };
  var byCode = {};
  (sourceTheory.days || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (!isLectureTopicEvent(ev) || !ev.moduleCode) return;
      if (!byCode[ev.moduleCode]) byCode[ev.moduleCode] = ev;
    });
  });
  var filled = 0;
  (targetTheory.days || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (!isLectureTopicEvent(ev) || !ev.moduleCode) return;
      var src = byCode[ev.moduleCode];
      if (!src) return;
      var bare = stripModuleTitlePrefix(ev.title);
      if (bare && bare !== ev.track) return;
      if (src.title) ev.title = src.title;
      if (src.moduleRef) {
        ev.moduleRef = src.moduleRef;
        ev.moduleRefs = [src.moduleRef];
      }
      filled += 1;
    });
  });
  return { filled: filled };
}

/**
 * Move an event from one date to another within the theory calendar.
 */
export function moveEventToDate(theory, semester, eventId, toDate) {
  if (!theory || !eventId || !toDate) return false;
  var fromDay = null;
  var evIdx = -1;
  var ev = null;
  (theory.days || []).forEach(function (day) {
    if (ev) return;
    var idx = (day.events || []).findIndex(function (e) { return e.id === eventId; });
    if (idx >= 0) {
      fromDay = day;
      evIdx = idx;
      ev = day.events[idx];
    }
  });
  if (!ev || !fromDay) return false;
  if (fromDay.date === toDate) return true;
  fromDay.events.splice(evIdx, 1);
  var toDay = ensureDay(theory, semester, toDate);
  insertEventOnDay(toDay, ev);
  renumberWeekModulesForLabels(theory, [fromDay.weekLabel, toDay.weekLabel]);
  refreshFacultyNeeded(theory);
  return true;
}

function renumberWeekModulesForLabels(theory, labels) {
  var seen = {};
  (labels || []).forEach(function (wl) {
    if (wl == null || seen[wl]) return;
    seen[wl] = true;
    renumberWeekModules(theory, wl);
  });
}

export function findDay(theory, date) {
  if (!theory || !theory.days) return null;
  return theory.days.find(function (d) { return d.date === date; }) || null;
}

export function ensureDay(theory, semester, date) {
  var day = findDay(theory, date);
  if (day) return day;
  var weekIndex = getWeekIndexForDate(semester, date);
  var d = parseDate(date);
  var weekday = WEEKDAYS[d ? d.getDay() : 0];
  day = {
    date: date,
    weekIndex: weekIndex >= 0 ? weekIndex : 0,
    weekday: weekday,
    weekLabel: weekIndex >= 0 ? weekIndex + 1 : 1,
    isHoliday: false,
    isBreak: false,
    events: []
  };
  theory.days.push(day);
  theory.days.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return day;
}
