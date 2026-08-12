/**
 * Faculty semester-at-a-glance calendar (18-week Sun–Sat, Master Calendar layout).
 */

import { escapeHtml } from '../dialogs.js';
import { listAllSlots } from '../../core/faculty-schedule/slot-inventory.js';
import { listMyAssignedSlots } from '../../proposals/substitute-proposals.js';
import { slotChipHtml, kindLabel } from './chips.js';
import { formatHhmmDisplay } from '../../core/schedule-hours.js';
import { indexSlotsByDate, weekGridHtml } from './week-grid.js';

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
  var byDate = {};
  var subByDateSlot = {};

  events.forEach(function (ev) {
    if (!ev.date || !ev.slot) return;
    if (!byDate[ev.date]) byDate[ev.date] = [];
    var already = byDate[ev.date].some(function (s) {
      return s.slotId === ev.slot.slotId;
    });
    if (!already) byDate[ev.date].push(ev.slot);
    if (ev.substitute) {
      subByDateSlot[ev.date + '|' + ev.slot.slotId] = ev.substitute;
    }
  });

  // Also index via list so weeks without assigned slots still render the shell.
  if (!Object.keys(byDate).length) {
    byDate = indexSlotsByDate([]);
  }

  var grid = weekGridHtml(semester, byDate, function (ctx) {
    var inner = '';
    (ctx.slots || []).forEach(function (slot) {
      inner += slotChipHtml(slot, {});
      var cover = subByDateSlot[ctx.date + '|' + slot.slotId];
      if (cover) {
        inner += '<div class="faculty-sub-marker">Sub: ' +
          esc(shortName(cover.coveringName)) +
          ' (' + esc(formatHhmmDisplay(cover.timeStart)) + '-' +
          esc(formatHhmmDisplay(cover.timeEnd)) + ')</div>';
      }
    });
    return inner;
  });

  return '<div id="facultyGlancePanel" class="faculty-glance">' +
    '<div class="faculty-glance-toolbar">' +
    '<button type="button" class="btn btn-sm" id="facultyExportIcsBtn">Export ICS</button> ' +
    '<button type="button" class="btn btn-sm" id="facultyExportPdfBtn">Export PDF</button>' +
    '</div>' +
    '<section class="card faculty-browse-card" style="padding:1.25rem">' +
    '<p class="section-sub" style="margin-top:0">Sun–Sat week grid — your assigned faculty schedule.</p>' +
    grid +
    '</section></div>';
}

export {
  glanceHtml,
  glanceEventsForUser,
  shortName,
  kindLabel
};
