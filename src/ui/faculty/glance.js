/**
 * Faculty semester-at-a-glance calendar.
 */

import { escapeHtml } from '../dialogs.js';
import * as CalendarEngine from '../../core/calendar-engine.js';
import { listAllSlots } from '../../core/faculty-schedule/slot-inventory.js';
import { listMyAssignedSlots } from '../../proposals/substitute-proposals.js';
import { slotChipHtml, kindLabel } from './chips.js';
import { formatHhmmDisplay } from '../../core/schedule-hours.js';

var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function esc(s) {
  return escapeHtml(s == null ? '' : String(s));
}

function shortName(fullName) {
  var parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return parts[0].charAt(0).toUpperCase() + '. ' + parts[parts.length - 1];
}

function glanceEventsForUser(semester, session) {
  var assigned = session
    ? listMyAssignedSlots(semester, session)
    : listAllSlots(semester).filter(function (s) { return !s.open; });
  var subs = (semester.facultySchedule && semester.facultySchedule.substitutes) || [];
  var events = [];
  assigned.forEach(function (slot) {
    (slot.instances || []).forEach(function (inst) {
      var cover = subs.find(function (s) {
        return s.slotId === slot.slotId && s.date === inst.date;
      });
      events.push({
        date: inst.date,
        weekIndex: inst.weekIndex,
        weekday: inst.weekday || '',
        slot: slot,
        substitute: cover || null
      });
    });
  });
  return events;
}

function glanceHtml(semester, session) {
  var events = glanceEventsForUser(semester, session);
  var byWeek = {};
  for (var w = 0; w < 18; w++) byWeek[w] = {};

  events.forEach(function (ev) {
    var wi = ev.weekIndex;
    if (wi == null && ev.date && semester.calendar) {
      wi = CalendarEngine.getWeekIndexForDate
        ? CalendarEngine.getWeekIndexForDate(semester, ev.date)
        : null;
    }
    if (wi == null || wi < 0 || wi > 17) return;
    var wd = ev.weekday || '';
    if (!wd && ev.date) {
      var d = new Date(ev.date + 'T12:00:00');
      wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
    }
    if (!byWeek[wi][wd]) byWeek[wi][wd] = [];
    byWeek[wi][wd].push(ev);
  });

  var html = '<div id="facultyGlancePanel" class="faculty-glance">' +
    '<div class="faculty-glance-toolbar">' +
    '<button type="button" class="btn btn-sm" id="facultyExportIcsBtn">Export ICS</button> ' +
    '<button type="button" class="btn btn-sm" id="facultyExportPdfBtn">Export PDF</button>' +
    '</div>' +
    '<div class="faculty-glance-calendar custom-scrollbar">' +
    '<table class="data-table faculty-glance-table"><thead><tr><th>Week</th>' +
    WEEKDAYS.map(function (d) { return '<th>' + esc(d) + '</th>'; }).join('') +
    '</tr></thead><tbody>';

  for (var week = 0; week < 18; week++) {
    var label = CalendarEngine.getWeekDisplay
      ? CalendarEngine.getWeekDisplay(semester, week, true)
      : ('Wk ' + (week + 1));
    html += '<tr><td class="faculty-week-label">' + esc(label) + '</td>';
    WEEKDAYS.forEach(function (wd) {
      html += '<td class="faculty-glance-day">';
      (byWeek[week][wd] || []).forEach(function (ev) {
        html += slotChipHtml(ev.slot, {});
        if (ev.substitute) {
          html += '<div class="faculty-sub-marker">Sub: ' +
            esc(shortName(ev.substitute.coveringName)) +
            ' (' + esc(formatHhmmDisplay(ev.substitute.timeStart)) + '-' +
            esc(formatHhmmDisplay(ev.substitute.timeEnd)) + ')</div>';
        }
      });
      html += '</td>';
    });
    html += '</tr>';
  }
  html += '</tbody></table></div></div>';
  return html;
}

export {
  glanceHtml,
  glanceEventsForUser,
  shortName,
  kindLabel
};
