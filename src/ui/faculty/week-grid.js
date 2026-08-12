/**
 * Shared 18-week Sun–Sat faculty calendar grid (matches Master Calendar columns).
 */

import { escapeHtml } from '../dialogs.js';
import { formatDisplayDate } from '../../core/calendar-engine.js';
import { dateForWeekdayInWeek } from '../../core/theory-modules.js';
import { WEEK_COLS } from '../theory/master-calendar-layout.js';

var FULL_WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

function esc(s) {
  return escapeHtml(s == null ? '' : String(s));
}

function fullWeekday(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  var lower = s.toLowerCase();
  for (var i = 0; i < FULL_WEEKDAYS.length; i++) {
    if (FULL_WEEKDAYS[i].toLowerCase() === lower || WEEK_COLS[i].toLowerCase() === lower) {
      return FULL_WEEKDAYS[i];
    }
  }
  return '';
}

/**
 * Map ISO date → unique slots that have an instance on that date.
 */
function indexSlotsByDate(slots) {
  var byDate = {};
  (slots || []).forEach(function (slot) {
    (slot.instances || []).forEach(function (inst) {
      if (!inst || !inst.date) return;
      if (!byDate[inst.date]) byDate[inst.date] = [];
      var already = byDate[inst.date].some(function (s) {
        return s.slotId === slot.slotId;
      });
      if (!already) byDate[inst.date].push(slot);
    });
  });
  return byDate;
}

/**
 * 18-week Sun–Sat table. `renderDayHtml(ctx)` returns inner HTML for each day cell.
 * ctx: { weekLabel, weekIndex, wd, date, slots }
 */
function weekGridHtml(semester, byDate, renderDayHtml) {
  byDate = byDate || {};
  renderDayHtml = renderDayHtml || function () { return ''; };

  var html = '<div class="theory-master-wrap">' +
    '<table class="data-table theory-master-table faculty-week-grid-table">' +
    '<thead><tr><th>Week</th>' +
    WEEK_COLS.map(function (d) { return '<th>' + esc(d) + '</th>'; }).join('') +
    '</tr></thead><tbody>';

  for (var w = 1; w <= 18; w++) {
    var weekIndex = w - 1;
    var zebra = (w % 2 === 0) ? ' theory-week-even' : ' theory-week-odd';
    html += '<tr class="faculty-week-row' + zebra + '">';
    html += '<td class="theory-week-label faculty-week-label">Wk ' + w + '</td>';
    WEEK_COLS.forEach(function (wd) {
      var date = '';
      if (semester && semester.calendar && semester.calendar.weeks) {
        date = dateForWeekdayInWeek(semester, weekIndex, wd) || '';
      }
      var daySlots = date && byDate[date] ? byDate[date] : [];
      html += '<td class="theory-day-cell faculty-week-day" data-date="' + esc(date) +
        '" data-week="' + w + '" data-weekday="' + esc(wd) + '">';
      if (date) {
        html += '<div class="theory-day-date">' + esc(formatDisplayDate(date)) + '</div>';
      }
      html += renderDayHtml({
        weekLabel: w,
        weekIndex: weekIndex,
        wd: wd,
        date: date,
        slots: daySlots
      });
      html += '</td>';
    });
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  return html;
}

export {
  WEEK_COLS,
  FULL_WEEKDAYS,
  fullWeekday,
  indexSlotsByDate,
  weekGridHtml
};
