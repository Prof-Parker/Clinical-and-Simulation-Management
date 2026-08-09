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
  var rounded = Math.round((n || 0) * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.001) return String(Math.round(rounded));
  return String(rounded);
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

function courseStatusChipHtml(v) {
  var code = esc(v.courseCode || 'Course');
  var line;
  if (v.target == null) {
    line = 'Scheduled: ' + formatHour(v.scheduled) + ' h (no target set)';
  } else {
    line = 'Scheduled: ' + formatHour(v.scheduled) + ' h / Target: ' + formatHour(v.target) + ' h';
  }
  return '<div class="theory-coordinator-chip theory-chip-' + (v.status || 'unknown') + '">' +
    '<div class="theory-coord-chip-code">' + code + '</div>' +
    '<div class="theory-coord-chip-line">' + line + '</div>' +
    '</div>';
}

export function render(data) {
  var chip = document.getElementById('theoryCoordinatorStatusChip');
  var grid = document.getElementById('theoryCoordinatorGrid');
  var warnEl = document.getElementById('theorySimWarnBanner');
  if (!data.theory || !grid) return;

  var theory = data.theory;
  var practicumCode = TheoryData.practicumCourseCode(theory);
  if (chip) {
    var validations = TheoryData.contactHourValidations(theory, data);
    chip.className = 'theory-coordinator-status';
    chip.innerHTML = validations.map(courseStatusChipHtml).join('');
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
  html += '<tr class="theory-coord-semester-totals">' +
    '<td class="theory-week-label theory-coord-semester-label"><strong>Semester</strong></td>' +
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
