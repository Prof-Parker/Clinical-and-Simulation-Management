/**
 * Seed blank lecture/skills events from session rows, and full wipe+import
 * of theory calendar content from another semester.
 */

import { uid } from './data-model/students.js';
import { formatCourseBadge } from './course-visibility.js';
import {
  dateForWeekdayInWeek,
  isLectureTopicEvent,
  isPlaceholderTopicTitle,
  renumberAllWeekModules
} from './theory-modules.js';
import {
  ensureDay,
  findDay,
  insertEventOnDay,
  makeFacultySlot,
  refreshFacultyNeeded
} from './theory-events.js';
import { SYNCED_PRACTICUM_CATEGORY } from './theory-practicum-sync.js';

export { isPlaceholderTopicTitle };

function theoryCourseCodes(theory) {
  var codes = (theory && theory.courseCodes) || [];
  var theoryOnly = codes.filter(function (c) {
    return /^REGN\d+$/i.test(c) && !/P$/i.test(c);
  });
  return theoryOnly.length ? theoryOnly : [];
}

function placeholderTitle(courseCode, kind) {
  var badge = formatCourseBadge(courseCode) || String(courseCode || '').trim() || 'Course';
  return kind === 'skills' ? badge + ' Skills Lab' : badge + ' Lecture';
}

function isHolidayOrBreakDay(semester, date, day) {
  if (day && (day.isHoliday || day.isBreak)) return true;
  if (day && (day.events || []).some(function (ev) {
    return ev.track === 'holiday' ||
      (ev.categories && ev.categories.indexOf('synced_holiday') >= 0);
  })) return true;
  var weeks = (semester.calendar && semester.calendar.weeks) || [];
  for (var i = 0; i < weeks.length; i++) {
    var w = weeks[i];
    if (!w) continue;
    if (w.inactive || w.break) {
      if (date >= w.startDate && date <= w.endDate) return true;
    }
    if (w.holidayWeekdays && w.holidayWeekdays.length) {
      var dayObj = day || findDay(semester.theory, date);
      var wd = dayObj && dayObj.weekday;
      if (!wd) {
        var iso = date;
        // weekday from week holiday list match via dateForWeekdayInWeek
        for (var hi = 0; hi < w.holidayWeekdays.length; hi++) {
          var hDate = dateForWeekdayInWeek(semester, i, w.holidayWeekdays[hi]);
          if (hDate === iso) return true;
        }
      } else if (w.holidayWeekdays.indexOf(wd) >= 0 &&
          date >= w.startDate && date <= w.endDate) {
        return true;
      }
    }
  }
  return false;
}

function weekIsInactive(semester, weekIndex) {
  var w = semester.calendar && semester.calendar.weeks && semester.calendar.weeks[weekIndex];
  return !!(w && (w.inactive || w.break));
}

function sameCourseCode(a, b) {
  var ca = a == null || a === '' ? null : String(a).toUpperCase();
  var cb = b == null || b === '' ? null : String(b).toUpperCase();
  return ca === cb;
}

function hasMatchingEvent(day, track, timeStart, timeEnd, courseCode) {
  return (day.events || []).some(function (ev) {
    if (!ev) return false;
    if (track === 'theory') {
      if (!isLectureTopicEvent(ev)) return false;
    } else if (ev.track !== track) {
      return false;
    }
    if ((ev.timeStart || '') !== (timeStart || '')) return false;
    if ((ev.timeEnd || '') !== (timeEnd || '')) return false;
    return sameCourseCode(ev.courseCode, courseCode);
  });
}

function buildBlankEvent(kind, session, courseCode, settings) {
  var isSkills = kind === 'skills';
  var required = isSkills
    ? (settings.defaultSkillsFacultyRequired != null ? settings.defaultSkillsFacultyRequired : 2)
    : 1;
  var faculty = [];
  for (var i = 0; i < required; i++) {
    faculty.push(makeFacultySlot({
      needed: true,
      role: isSkills ? 'skills' : 'lecturer'
    }));
  }
  return {
    id: uid(),
    track: isSkills ? 'skills' : 'theory',
    title: placeholderTitle(courseCode, kind),
    description: '',
    notes: '',
    moduleCode: null,
    moduleRef: null,
    moduleRefs: [],
    skillRefs: [],
    skillPlacements: [],
    timeStart: session.start,
    timeEnd: session.end,
    faculty: faculty,
    facultyRequired: isSkills ? required : null,
    contentArea: null,
    courseCode: courseCode || null,
    categories: isSkills ? ['skills_lab'] : ['lecture'],
    allDay: false
  };
}

/**
 * Add blank lecture/skills events on matching weekdays that lack one.
 * Does not overwrite existing events.
 */
export function seedEmptySessionEvents(semester) {
  if (!semester || !semester.theory) return { lectureAdded: 0, skillsAdded: 0 };
  var theory = semester.theory;
  var settings = theory.settings || {};
  var lectureSessions = settings.lectureSessions || [];
  var skillsSessions = settings.skillsSessions || [];
  var codes = theoryCourseCodes(theory);
  if (!codes.length) codes = [null];

  var lectureAdded = 0;
  var skillsAdded = 0;

  function seedKind(kind, sessions) {
    (sessions || []).forEach(function (session) {
      if (!session || !session.weekday) return;
      for (var w = 0; w < 18; w++) {
        if (weekIsInactive(semester, w)) continue;
        var date = dateForWeekdayInWeek(semester, w, session.weekday);
        if (!date) continue;
        var day = findDay(theory, date);
        if (isHolidayOrBreakDay(semester, date, day)) continue;
        codes.forEach(function (courseCode) {
          var existing = day || findDay(theory, date);
          if (existing && hasMatchingEvent(
            existing, kind === 'skills' ? 'skills' : 'theory',
            session.start, session.end, courseCode
          )) return;
          day = ensureDay(theory, semester, date);
          insertEventOnDay(day, buildBlankEvent(kind, session, courseCode, settings));
          if (kind === 'skills') skillsAdded += 1;
          else lectureAdded += 1;
        });
      }
    });
  }

  seedKind('lecture', lectureSessions);
  seedKind('skills', skillsSessions);
  renumberAllWeekModules(theory);
  refreshFacultyNeeded(theory);
  return { lectureAdded: lectureAdded, skillsAdded: skillsAdded };
}

function isPreservedEvent(ev) {
  if (!ev) return false;
  if (ev.track === 'holiday') return true;
  var cats = ev.categories || [];
  if (cats.indexOf('synced_holiday') >= 0) return true;
  if (cats.indexOf(SYNCED_PRACTICUM_CATEGORY) >= 0) return true;
  return false;
}

function eventMatchesCourseScope(ev, courseCodes) {
  if (!courseCodes || !courseCodes.length) return true;
  if (!ev.courseCode) return true;
  var ec = String(ev.courseCode).toUpperCase();
  return courseCodes.some(function (c) {
    return String(c).toUpperCase() === ec;
  });
}

function cloneEvent(ev) {
  var copy = JSON.parse(JSON.stringify(ev));
  copy.id = uid();
  return copy;
}

/**
 * Wipe non-holiday / non-practicum theory events and import from sourceTheory,
 * mapping by weekLabel + weekday.
 */
export function importTheoryEventsFromSemester(targetSemester, sourceTheory) {
  if (!targetSemester || !targetSemester.theory || !sourceTheory) {
    return { removed: 0, imported: 0, skipped: 0 };
  }
  var theory = targetSemester.theory;
  var codes = theoryCourseCodes(theory);
  var removed = 0;
  var imported = 0;
  var skipped = 0;

  (theory.days || []).forEach(function (day) {
    var kept = [];
    (day.events || []).forEach(function (ev) {
      if (isPreservedEvent(ev)) {
        kept.push(ev);
        return;
      }
      if (!eventMatchesCourseScope(ev, codes)) {
        kept.push(ev);
        return;
      }
      removed += 1;
    });
    day.events = kept;
  });

  (sourceTheory.days || []).forEach(function (srcDay) {
    (srcDay.events || []).forEach(function (ev) {
      if (isPreservedEvent(ev)) return;
      if (!eventMatchesCourseScope(ev, codes)) return;
      var weekLabel = srcDay.weekLabel;
      var weekday = srcDay.weekday;
      if (weekLabel == null || !weekday) {
        skipped += 1;
        return;
      }
      var weekIndex = weekLabel - 1;
      if (weekIndex < 0 || weekIndex > 17) {
        skipped += 1;
        return;
      }
      if (weekIsInactive(targetSemester, weekIndex)) {
        skipped += 1;
        return;
      }
      var date = dateForWeekdayInWeek(targetSemester, weekIndex, weekday);
      if (!date) {
        skipped += 1;
        return;
      }
      var day = findDay(theory, date);
      if (isHolidayOrBreakDay(targetSemester, date, day)) {
        skipped += 1;
        return;
      }
      day = ensureDay(theory, targetSemester, date);
      insertEventOnDay(day, cloneEvent(ev));
      imported += 1;
    });
  });

  renumberAllWeekModules(theory);
  refreshFacultyNeeded(theory);
  return { removed: removed, imported: imported, skipped: skipped };
}
