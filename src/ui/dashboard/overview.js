/**
 * Dashboard overview — stacked read-only master + practicum calendars (full width).
 */

import * as CalendarEngine from '../../core/calendar-engine.js';
import * as Validator from '../../core/validator.js';
import * as Orientation from '../../core/orientation.js';
import { buildMasterCalendarHtml } from '../theory/master-calendar-html.js';
import { openEventDetails } from './event-details.js';
import { renderCellHtml, scheduleRightColsHtml } from './schedule-cell-html.js';
import { getScheduleFilteredStudents, escapeHtml } from './schedule-filters.js';
import { renderConflictsPanel as renderConflictsPanelHtml } from './conflicts-panel.js';

function renderConflicts(data) {
  var el = document.getElementById('dashOverviewConflicts');
  if (!el) return;
  renderConflictsPanelHtml(el, Validator.validateAll(data), escapeHtml);
}

function bindTheoryChipDetails(root, data) {
  if (!root) return;
  root.querySelectorAll('.theory-day-cell').forEach(function (cell) {
    cell.addEventListener('click', function (e) {
      var date = cell.dataset.date;
      if (!date) return;
      var chip = e.target.closest('[data-event-id]');
      if (!chip) return;
      openEventDetails(data, date, chip.getAttribute('data-event-id'));
    });
  });
}

function renderTheoryPreview(data) {
  var el = document.getElementById('dashOverviewTheory');
  if (!el) return;
  el.innerHTML = buildMasterCalendarHtml(data, { readOnly: true });
  bindTheoryChipDetails(el, data);
}

function renderPracticumPreview(data) {
  var el = document.getElementById('dashOverviewPracticum');
  if (!el) return;
  var validation = Validator.validateAll(data);
  var students = getScheduleFilteredStudents(data, validation);
  if (!students.length) {
    el.textContent = 'No students on the practicum roster yet.';
    return;
  }

  var headHtml = '<th class="sticky-col schedule-sticky-corner">Name</th>' +
    '<th class="sticky-col-grp schedule-sticky-corner">Grp</th>';
  for (var i = 0; i < 18; i++) {
    headHtml += '<th style="text-align:center">' + CalendarEngine.getWeekDisplay(data, i, false) + '</th>';
  }
  headHtml += '<th class="sticky-col-r-clin" style="text-align:center">Clinicals</th>' +
    '<th class="sticky-col-r-sims" style="text-align:center">Sims</th>' +
    '<th class="sticky-col-r-status">Status</th>';

  var bodyHtml = '';
  students.forEach(function (student) {
    var vr = validation.students[student.id];
    var rowClass = '';
    if (!vr.valid) rowClass = ' class="schedule-row-pending"';
    else if (vr.warnings && vr.warnings.length) rowClass = ' class="schedule-row-warning"';
    var cells = '<td class="sticky-col"><strong>' + escapeHtml(student.name) + '</strong></td>' +
      '<td class="sticky-col-grp">' + escapeHtml(student.clinicalGroup) + '</td>';
    student.schedule.forEach(function (cell, wi) {
      var tdClass = 'cell-readonly';
      if (Orientation && Orientation.weekHasOrientationConflict(data, student, wi)) {
        tdClass += ' cell-orientation-conflict';
      }
      cells += '<td class="' + tdClass + '">' + renderCellHtml(cell, student, data, wi) + '</td>';
    });
    cells += scheduleRightColsHtml(vr);
    bodyHtml += '<tr' + rowClass + '>' + cells + '</tr>';
  });

  el.innerHTML =
    '<div class="schedule-table-outer">' +
    '<div class="schedule-table-scroll custom-scrollbar">' +
    '<table class="data-table schedule-master-table">' +
    '<thead><tr>' + headHtml + '</tr></thead>' +
    '<tbody>' + bodyHtml + '</tbody>' +
    '</table></div></div>';
}

/**
 * @param {object} data
 */
export function render(data) {
  if (!data) return;
  renderConflicts(data);
  renderTheoryPreview(data);
  renderPracticumPreview(data);
}
