/**
 * Coordinator view — weekly calendar grid with per-category hour totals.
 */

import * as TheoryData from '../../core/theory-data.js';
import * as Permissions from '../../auth/permissions.js';

var WEEK_COLS = TheoryData.WEEKDAYS;

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function formatHour(n) {
  return (Math.round((n || 0) * 100) / 100).toFixed(2);
}

function weekTotalsHtml(summary) {
  return '<div class="theory-coord-total-line">Lecture: ' + formatHour(summary.lecture) + '</div>' +
    '<div class="theory-coord-total-line">Skills: ' + formatHour(summary.skills_lab) + '</div>' +
    '<div class="theory-coord-total-line">Clinical: ' + formatHour(summary.clinical) + '</div>' +
    '<div class="theory-coord-total-line">Sim: ' + formatHour(summary.simulation) + '</div>';
}

function semesterTotalsHtml(totals) {
  return '<div class="theory-coord-total-line"><strong>Lecture:</strong> ' + formatHour(totals.lecture) + '</div>' +
    '<div class="theory-coord-total-line"><strong>Skills lab:</strong> ' + formatHour(totals.skills_lab) + '</div>' +
    '<div class="theory-coord-total-line"><strong>Clinical:</strong> ' + formatHour(totals.clinical) + '</div>' +
    '<div class="theory-coord-total-line"><strong>Sim:</strong> ' + formatHour(totals.simulation) + '</div>' +
    '<div class="theory-coord-total-line theory-coord-practicum-total"><strong>Practicum:</strong> ' +
    formatHour(totals.practicum) + '</div>';
}

export function render(data) {
  var chip = document.getElementById('theoryCoordinatorStatusChip');
  var grid = document.getElementById('theoryCoordinatorGrid');
  var warnEl = document.getElementById('theorySimWarnBanner');
  if (!data.theory || !grid) return;

  var theory = data.theory;
  var practicumCode = TheoryData.practicumCourseCode(theory);
  var validation = TheoryData.contactHourValidation(theory, data, practicumCode);
  if (chip) {
    if (validation.target == null) {
      chip.textContent = 'Scheduled: ' + validation.scheduled + ' h (no target set)';
    } else {
      var statusLabel = validation.status === 'on_target' ? 'on target'
        : validation.status === 'under' ? validation.delta + ' h under'
          : validation.delta + ' h over';
      chip.textContent = 'Scheduled: ' + validation.scheduled + ' h / Target: ' + validation.target +
        ' h — ' + statusLabel;
      chip.className = 'theory-coordinator-chip theory-chip-' + validation.status;
    }
  }

  var html = '<div class="theory-coordinator-wrap custom-scrollbar"><table class="data-table theory-coordinator-table">' +
    '<thead><tr><th>Week</th>' +
    WEEK_COLS.map(function (d) { return '<th>' + d + '</th>'; }).join('') +
    '<th class="theory-coord-totals-col">Weekly totals</th></tr></thead><tbody>';

  for (var w = 1; w <= 18; w++) {
    var summary = TheoryData.weekSummaryForLabel(theory, data, w, practicumCode);
    html += '<tr><td class="theory-week-label">Wk ' + w + '</td>';
    WEEK_COLS.forEach(function (wd) {
      html += '<td class="theory-coord-day-cell">';
      TheoryData.coordinatorItemsForDay(theory, data, w, wd, practicumCode).forEach(function (item) {
        html += '<div class="theory-coord-item theory-coord-item-' + item.kind + '">' +
          esc(item.label) + '</div>';
      });
      html += '</td>';
    });
    html += '<td class="theory-coord-week-totals">' + weekTotalsHtml(summary) + '</td></tr>';
  }

  var semesterTotals = TheoryData.semesterHourTotals(theory, data, practicumCode);
  html += '<tr class="theory-coord-semester-totals"><td><strong>Semester</strong></td>' +
    '<td colspan="' + WEEK_COLS.length + '"></td>' +
    '<td class="theory-coord-week-totals">' + semesterTotalsHtml(semesterTotals) + '</td></tr>';

  html += '</tbody></table></div>';
  grid.innerHTML = html;

  var settingsBtn = document.getElementById('theoryHourSettingsBtn');
  if (settingsBtn) {
    settingsBtn.classList.toggle('hidden', !Permissions.canAction('theory.hourTargets.edit') &&
      !Permissions.canAction('*'));
  }

  var warnings = TheoryData.simCrossCheckWarnings(data);
  if (warnEl) {
    if (warnings.length) {
      warnEl.textContent = warnings[0];
      warnEl.classList.remove('hidden');
    } else {
      warnEl.classList.add('hidden');
    }
  }
}
