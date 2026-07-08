/** Semester season/year/start-date fields on the setup tab. */

import { getData } from '../../core/state.js';
import { startDateForSeason, buildSemesterName } from '../../core/data-model/index.js';
import { init as initDateInputs } from '../date-inputs.js';
import * as ScheduleStatus from '../../core/schedule-status.js';
import { escHtml } from './dom-utils.js';

export function populateYearSelect(selectedYear) {
  var yearSelect = document.getElementById('semesterYearSelect');
  if (!yearSelect) return;
  var curYear = new Date().getFullYear();
  if (!yearSelect.options.length) {
    for (var y = curYear - 2; y <= curYear + 5; y++) {
      var opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      yearSelect.appendChild(opt);
    }
  }
  yearSelect.value = String(selectedYear || curYear);
}

export function updateFinalizeButtonState(data) {
  var finalizeBtn = document.getElementById('finalizeSemesterBtn');
  if (!finalizeBtn) return;
  finalizeBtn.disabled = !!(data && data.meta && data.meta.finalized);
  finalizeBtn.title = finalizeBtn.disabled ? 'This semester has been finalized' : '';
}

export function updateStartDateFromSeasonYear() {
  var season = document.getElementById('semesterSeasonSelect').value;
  var year = parseInt(document.getElementById('semesterYearSelect').value, 10);
  document.getElementById('semesterStartDate').value = startDateForSeason(season, year);
  var data = getData();
  if (data) {
    initDateInputs(document.getElementById('view-setup'), data);
  }
}

export function renderSemesterFields(data) {
  var season = data.meta.semesterSeason || 'spring';
  var year = data.meta.semesterYear || new Date().getFullYear();
  document.getElementById('semesterSeasonSelect').value = season;
  populateYearSelect(year);
  document.getElementById('semesterStartDate').value =
    data.calendar.semesterStartDate || startDateForSeason(season, year);

  var finalizeBtn = document.getElementById('finalizeSemesterBtn');
  if (finalizeBtn) {
    updateFinalizeButtonState(data);
  }
}

export function renderScheduleWarnings(data) {
    var panel = document.getElementById('setupScheduleWarnings');
    var section = document.getElementById('setupScheduleWarningsSection');
    if (!panel) return;
    var summary = ScheduleStatus.summarize(data);
    if (!ScheduleStatus.shouldShowPanel(summary)) {
      panel.className = 'setup-schedule-warnings setup-schedule-status hidden';
      panel.innerHTML = '';
      if (section) section.classList.add('hidden');
      return;
    }

    if (section) section.classList.remove('hidden');
    panel.classList.remove('hidden');
    panel.className = 'setup-schedule-warnings setup-schedule-status setup-schedule-status-' + summary.tier;

    var html = '';
    if (summary.tier === 'green') {
      html += '<strong>Schedule status: Complete</strong>' +
        '<p class="section-sub" style="margin:0.35rem 0 0">All ' + summary.totalStudents +
        ' students meet clinical and simulation requirements with no substitutions or makeups.</p>';
    } else if (summary.tier === 'yellow') {
      html += '<strong>Schedule status: Complete with adjustments</strong>';
      if (summary.generated) {
        html += '<p class="section-sub" style="margin:0.35rem 0 0.5rem">All ' + summary.totalStudents +
          ' students meet clinical and simulation requirements. Adjustments used:</p><ul>';
        var adj = summary.adjustments;
        if (adj.makeupClinicalCount) {
          html += '<li>' + adj.makeupClinicalCount + ' student(s) with makeup clinical day(s)</li>';
        }
        if (adj.nonPrimarySimCount) {
          html += '<li>' + adj.nonPrimarySimCount + ' student(s) with non-primary sim week/day placement</li>';
        }
        if (adj.guestSimCount) {
          html += '<li>' + adj.guestSimCount + ' student(s) attending sim as guest in another group</li>';
        }
        if (adj.overloadCount) {
          html += '<li>' + adj.overloadCount + ' student(s) with sim overload placement</li>';
        }
        if (adj.simMakeupCount) {
          html += '<li>' + adj.simMakeupCount + ' student(s) with sim makeup placement</li>';
        }
        if (adj.makeupRecordCount) {
          html += '<li>' + adj.makeupRecordCount + ' student(s) with recorded makeup entries</li>';
        }
        if (html.indexOf('<li>') < 0) {
          html += '<li>Substitutions or makeup days were applied during generation</li>';
        }
        html += '</ul>';
      } else {
        html += '<p class="section-sub" style="margin:0.35rem 0 0.5rem">Schedules have not been generated yet. Review the notes below, then click Regenerate Schedules.</p>';
      }
      if (summary.notes.length) {
        html += '<p class="section-sub" style="margin:0.5rem 0 0.25rem"><strong>Notes</strong></p><ul>';
        summary.notes.forEach(function (note) {
          html += '<li>' + escHtml(note) + '</li>';
        });
        html += '</ul>';
      }
    } else {
      html += '<strong>Schedule status: Incomplete</strong>';
      if (summary.generated && summary.orientationConflicts && summary.orientationConflicts.length) {
        html += '<p class="section-sub" style="margin:0.35rem 0 0.5rem">Orientation day conflicts with scheduled clinical or simulation — manually reassign affected students in the Master Schedule.</p><ul>';
        summary.orientationConflicts.forEach(function (v) {
          html += '<li>' + escHtml(v.message) + '</li>';
        });
        html += '</ul>';
      }
      if (summary.generated && summary.incompleteCount) {
        html += '<p class="section-sub" style="margin:0.35rem 0 0.5rem">' + summary.incompleteCount +
          ' of ' + summary.totalStudents + ' students cannot meet requirements:</p><ul>';
        summary.incompleteStudents.forEach(function (student) {
          html += '<li><strong>' + escHtml(student.name) + '</strong>: ' +
            escHtml(student.errors.join('; ')) + '</li>';
        });
        html += '</ul>';
      } else if (summary.blockingIssues.length) {
        html += '<p class="section-sub" style="margin:0.35rem 0 0.5rem">Configuration may prevent schedule generation:</p><ul>';
        summary.blockingIssues.forEach(function (issue) {
          html += '<li>' + escHtml(ScheduleStatus.formatBlockingIssue(issue)) + '</li>';
        });
        html += '</ul>';
      }
    }

    panel.innerHTML = html;
  }

export function collectSemesterMeta(data, opts, markSetupDraft) {
  opts = opts || {};
  var season = document.getElementById('semesterSeasonSelect').value;
  var year = parseInt(document.getElementById('semesterYearSelect').value, 10);
  var prevSeason = data.meta.semesterSeason;
  var prevYear = data.meta.semesterYear;
  data.meta.semesterSeason = season;
  data.meta.semesterYear = year;
  data.meta.semesterName = buildSemesterName(season, year);
  if (!opts.skipSideEffects && (prevSeason !== season || prevYear !== year) && markSetupDraft) {
    markSetupDraft(data);
  }
}
