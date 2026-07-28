/**
 * Build student schedule .ics (iCalendar) calendars for Outlook / Apple / Google.
 * Includes clinical, simulation, lecture, skills lab, and assignment due events.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import * as DataModel from '../core/data-model/index.js';
import * as ScheduleHours from '../core/schedule-hours.js';
import { dateForWeekdayInWeek } from '../core/theory-modules.js';
import { APP_VERSION } from '../app-version.js';

var DEFAULT_ASSIGNMENT_DUE = '2359';
var ICS_PRODID = '-//Clinical and Simulation Management//' + APP_VERSION + '//EN';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Escape TEXT values per RFC 5545. */
function icsEscape(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/** Fold content lines at 75 octets (approx. chars for ASCII). */
function foldLine(line) {
  var s = String(line);
  if (s.length <= 75) return s;
  var parts = [];
  parts.push(s.slice(0, 75));
  var rest = s.slice(75);
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(' ' + rest);
  return parts.join('\r\n');
}

function hhmmParts(hhmm, fallback) {
  var v = ScheduleHours.normalizeHhmm(hhmm, fallback || '0000');
  return { h: parseInt(v.slice(0, 2), 10), m: parseInt(v.slice(2, 4), 10) };
}

/** Local floating DATE-TIME: YYYYMMDDTHHMMSS */
function formatLocalDateTime(isoDate, hhmm) {
  var parts = hhmmParts(hhmm, '0000');
  return String(isoDate || '').replace(/-/g, '') + 'T' +
    pad2(parts.h) + pad2(parts.m) + '00';
}

/** UTC stamp for DTSTAMP. */
function formatUtcStamp(date) {
  var d = date || new Date();
  return d.getUTCFullYear() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) + 'T' +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) + 'Z';
}

function nextDayIso(isoDate) {
  var d = CalendarEngine.parseDate(isoDate);
  if (!d) return isoDate;
  return CalendarEngine.toISO(CalendarEngine.addDays(d, 1));
}

function facilityLabel(semester, facilityId) {
  var f = DataModel.findFacilityById(semester, facilityId);
  if (!f) return '';
  return f.shortName || f.name || '';
}

function uidFor(student, kind, dateIso, extra) {
  var sid = String((student && student.id) || 'student').replace(/[^a-zA-Z0-9_-]/g, '');
  var extraPart = extra != null && extra !== '' ? '-' + String(extra).replace(/[^a-zA-Z0-9_-]/g, '') : '';
  return sid + '-' + kind + '-' + String(dateIso || '').replace(/-/g, '') +
    extraPart + '@clin-sim-mgmt';
}

function makeTimedEvent(opts) {
  return {
    uid: opts.uid,
    summary: opts.summary,
    dtStart: formatLocalDateTime(opts.date, opts.start),
    dtEnd: formatLocalDateTime(opts.endDate || opts.date, opts.end),
    location: opts.location || '',
    description: opts.description || ''
  };
}

/**
 * Resolve assignment due clock time.
 * Prefer explicit timeEnd / dueTime / timeStart; otherwise 23:59.
 */
function assignmentDueHhmm(ev) {
  if (!ev) return DEFAULT_ASSIGNMENT_DUE;
  if (ev.dueTime) return ScheduleHours.normalizeHhmm(ev.dueTime, DEFAULT_ASSIGNMENT_DUE);
  if (ev.timeEnd) return ScheduleHours.normalizeHhmm(ev.timeEnd, DEFAULT_ASSIGNMENT_DUE);
  if (ev.timeStart) return ScheduleHours.normalizeHhmm(ev.timeStart, DEFAULT_ASSIGNMENT_DUE);
  return DEFAULT_ASSIGNMENT_DUE;
}

function collectPracticumEvents(semester, student) {
  var events = [];
  var clinDay = DataModel.getClinicalDayForGroup(student.clinicalGroup, semester.config);
  for (var wi = 0; wi < 18; wi++) {
    var cell = student.schedule && student.schedule[wi];
    if (!cell || cell.inactive) continue;

    var dateClin = dateForWeekdayInWeek(semester, wi, clinDay);
    if (dateClin && ((cell.clinical && !cell.clinicalMissed) || cell.makeupClinical)) {
      var facId = cell.facilityId || student.facilityId;
      var cTimes = ScheduleHours.clinicalTimesForFacility(semester, facId);
      var site = facilityLabel(semester, facId);
      events.push(makeTimedEvent({
        uid: uidFor(student, cell.makeupClinical ? 'makeup-clinical' : 'clinical', dateClin, wi),
        summary: cell.makeupClinical ? 'Makeup Clinical' : 'Clinical',
        date: dateClin,
        start: cTimes.start,
        end: cTimes.end,
        location: site,
        description: site ? ('Clinical at ' + site) : ''
      }));
    }

    if (cell.sim) {
      var simDay = cell.simDay || 'Mon';
      var dateSim = dateForWeekdayInWeek(semester, wi, simDay);
      if (dateSim) {
        var sTimes = ScheduleHours.simTimesForNum(semester, cell.sim);
        events.push(makeTimedEvent({
          uid: uidFor(student, 'sim', dateSim, cell.sim),
          summary: 'Simulation ' + cell.sim,
          date: dateSim,
          start: sTimes.start,
          end: sTimes.end,
          description: cell.simGuestGroup ? ('Guest group ' + cell.simGuestGroup) : ''
        }));
      }
    }
  }
  return events;
}

function theoryDefaults(semester) {
  var settings = (semester.theory && semester.theory.settings) || {};
  return {
    lectureStart: settings.defaultLectureStart || '0800',
    lectureEnd: settings.defaultLectureEnd || '1050',
    skillsStart: settings.defaultSkillsStart || '1200',
    skillsEnd: settings.defaultSkillsEnd || '1550'
  };
}

function collectTheoryEvents(semester, student) {
  var events = [];
  var theory = semester.theory;
  if (!theory || !theory.days) return events;
  var defaults = theoryDefaults(semester);

  theory.days.forEach(function (day) {
    var dateIso = day.date;
    if (!dateIso) return;
    (day.events || []).forEach(function (ev, idx) {
      if (!ev) return;
      if (ev.track === 'theory') {
        events.push(makeTimedEvent({
          uid: uidFor(student, 'lecture', dateIso, ev.id || idx),
          summary: 'Lecture',
          date: dateIso,
          start: ev.timeStart || defaults.lectureStart,
          end: ev.timeEnd || defaults.lectureEnd
        }));
        return;
      }
      if (ev.track === 'skills') {
        events.push(makeTimedEvent({
          uid: uidFor(student, 'skills', dateIso, ev.id || idx),
          summary: 'Skills lab',
          date: dateIso,
          start: ev.timeStart || defaults.skillsStart,
          end: ev.timeEnd || defaults.skillsEnd
        }));
        return;
      }
      if (ev.track === 'assignment') {
        var due = assignmentDueHhmm(ev);
        var endDate = dateIso;
        var endHhmm = due;
        // Zero-length events are awkward in some clients — end one minute later,
        // rolling to the next day when due is 23:59.
        if (due === '2359') {
          endDate = nextDayIso(dateIso);
          endHhmm = '0000';
        } else {
          var p = hhmmParts(due, DEFAULT_ASSIGNMENT_DUE);
          var mins = p.h * 60 + p.m + 1;
          if (mins >= 24 * 60) {
            endDate = nextDayIso(dateIso);
            endHhmm = '0000';
          } else {
            endHhmm = pad2(Math.floor(mins / 60)) + pad2(mins % 60);
          }
        }
        events.push(makeTimedEvent({
          uid: uidFor(student, 'assignment', dateIso, ev.id || idx),
          summary: ev.title ? String(ev.title) : 'Assignment due',
          date: dateIso,
          start: due,
          endDate: endDate,
          end: endHhmm,
          description: 'Assignment due'
        }));
      }
    });
  });
  return events;
}

/** Collect normalized calendar events for one student. */
function collectStudentCalendarEvents(semester, student) {
  if (!semester || !student) return [];
  if (!semester.calendar || !semester.calendar.weeks || !semester.calendar.weeks.length) {
    CalendarEngine.rebuildWeeks(semester);
  }
  return collectPracticumEvents(semester, student)
    .concat(collectTheoryEvents(semester, student));
}

function renderVEvent(ev, dtstamp) {
  var lines = [
    'BEGIN:VEVENT',
    'UID:' + ev.uid,
    'DTSTAMP:' + dtstamp,
    'DTSTART:' + ev.dtStart,
    'DTEND:' + ev.dtEnd,
    'SUMMARY:' + icsEscape(ev.summary)
  ];
  if (ev.location) lines.push('LOCATION:' + icsEscape(ev.location));
  if (ev.description) lines.push('DESCRIPTION:' + icsEscape(ev.description));
  lines.push('END:VEVENT');
  return lines.map(foldLine).join('\r\n');
}

/**
 * Build a full VCALENDAR document for one student.
 * @returns {string} ICS text (CRLF)
 */
function buildStudentIcs(semester, student, opts) {
  opts = opts || {};
  var events = collectStudentCalendarEvents(semester, student);
  var stamp = formatUtcStamp(opts.now || new Date());
  var calName = ((semester.meta && semester.meta.semesterName) || 'Semester') +
    ' — ' + (student.name || 'Student');
  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:' + ICS_PRODID,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEscape(calName)
  ];
  var body = lines.map(foldLine).join('\r\n');
  events.forEach(function (ev) {
    body += '\r\n' + renderVEvent(ev, stamp);
  });
  body += '\r\nEND:VCALENDAR\r\n';
  return body;
}

function icsFilename(semester, student) {
  var meta = semester.meta || {};
  var season = meta.semesterSeason === 'fall' ? 'Fall' : 'Spring';
  var year = meta.semesterYear || '';
  var course = meta.courseId || 'COURSE';
  var idTail = String(student.id || '').slice(-6);
  var name = String(student.name || 'student')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'student';
  return course + '_' + season + year + '_' + name + '_' + idTail + '.ics';
}

function downloadIcsText(text, filename) {
  var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}

/** Download .ics for one student (Student View toolbar). */
function exportStudentIcs(semester, student) {
  if (!semester || !student) return null;
  var text = buildStudentIcs(semester, student);
  var name = icsFilename(semester, student);
  downloadIcsText(text, name);
  return { filename: name, text: text };
}

export {
  DEFAULT_ASSIGNMENT_DUE,
  icsEscape,
  foldLine,
  formatLocalDateTime,
  assignmentDueHhmm,
  collectStudentCalendarEvents,
  buildStudentIcs,
  icsFilename,
  exportStudentIcs
};
