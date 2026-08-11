/**
 * Faculty semester-at-a-glance .ics export.
 */

import * as ScheduleHours from '../core/schedule-hours.js';
import { APP_VERSION } from '../app-version.js';
import { glanceEventsForUser } from '../ui/faculty/glance.js';
import { summarizeSlot } from '../proposals/schedule-proposals.js';

var ICS_PRODID = '-//Clinical and Simulation Management//' + APP_VERSION + '//EN';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function icsEscape(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

function foldLine(line) {
  var s = String(line);
  if (s.length <= 75) return s;
  var parts = [s.slice(0, 75)];
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

function formatLocalDateTime(isoDate, hhmm) {
  var parts = hhmmParts(hhmm, '0000');
  return String(isoDate || '').replace(/-/g, '') + 'T' +
    pad2(parts.h) + pad2(parts.m) + '00';
}

function formatUtcStamp(date) {
  var d = date || new Date();
  return d.getUTCFullYear() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) + 'T' +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) + 'Z';
}

function buildFacultyCalendarIcs(semester, session) {
  var events = glanceEventsForUser(semester, session);
  var stamp = formatUtcStamp();
  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:' + ICS_PRODID,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];
  events.forEach(function (ev, idx) {
    if (!ev.date || !ev.slot) return;
    var start = ev.substitute ? ev.substitute.timeStart : ev.slot.timeStart;
    var end = ev.substitute ? ev.substitute.timeEnd : ev.slot.timeEnd;
    var summary = summarizeSlot(ev.slot);
    if (ev.substitute) {
      summary += ' (Sub: ' + (ev.substitute.coveringName || '') + ')';
    }
    var uid = 'faculty-' + String(ev.slot.slotId || idx).replace(/[^a-zA-Z0-9_-]/g, '') +
      '-' + String(ev.date).replace(/-/g, '') + '@clin-sim-mgmt';
    lines.push('BEGIN:VEVENT');
    lines.push(foldLine('UID:' + uid));
    lines.push('DTSTAMP:' + stamp);
    lines.push('DTSTART:' + formatLocalDateTime(ev.date, start));
    lines.push('DTEND:' + formatLocalDateTime(ev.date, end));
    lines.push(foldLine('SUMMARY:' + icsEscape(summary)));
    if (ev.slot.siteLabel) {
      lines.push(foldLine('LOCATION:' + icsEscape(ev.slot.siteLabel)));
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function downloadFacultyIcs(semester, session, filename) {
  var ics = buildFacultyCalendarIcs(semester, session);
  var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename || 'faculty-schedule.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

export {
  buildFacultyCalendarIcs,
  downloadFacultyIcs
};
