/**
 * Playground dashboard — read-only visual schedule for sandbox data.
 */

import * as Validator from '../../core/validator.js';
import * as CalendarEngine from '../../core/calendar-engine.js';
import * as DataModel from '../../core/data-model/index.js';
import * as Scheduler from '../../core/scheduler/index.js';
import * as Orientation from '../../core/orientation.js';
import Chart from 'chart.js/auto';
import { renderCellHtml } from '../dashboard/index.js';
import { escapeHtml } from '../dashboard/schedule-filters.js';
import { getPlaygroundData } from './index.js';
import { updatePlaygroundToolbar } from './toolbar.js';

var chartInstance = null;

function el(id) {
  return document.getElementById('pgDash' + id);
}

function scheduleRightColsHtml(vr) {
  var badge = Validator.statusBadge(vr);
  return '<td class="sticky-col-r-clin" style="text-align:center"><span class="stat-pill stat-clin">' +
    vr.stats.clinicals + '</span></td>' +
    '<td class="sticky-col-r-sims" style="text-align:center"><span class="stat-pill stat-sim">' +
    vr.stats.sims + '</span></td>' +
    '<td class="sticky-col-r-status"><span class="' + badge.cls + '">' + badge.text + '</span></td>';
}

function renderConflicts(validation) {
  var panel = el('ConflictsPanel');
  if (!panel) return;
  var msgs = [];
  validation.groupErrors.forEach(function (e) { msgs.push(e); });
  validation.simSessions.forEach(function (v) { msgs.push(v.message); });
  (validation.clinicalSessions || []).forEach(function (v) { msgs.push(v.message); });
  (validation.doubleBooking || []).forEach(function (v) { msgs.push(v.message); });
  (validation.orientationConflicts || []).forEach(function (v) { msgs.push(v.message); });
  if (msgs.length) {
    panel.classList.remove('hidden');
    panel.innerHTML = '<strong>Scheduling conflicts:</strong><ul><li>' + msgs.join('</li><li>') + '</li></ul>';
  } else {
    panel.classList.add('hidden');
    panel.innerHTML = '';
  }
}

function renderMasterSchedule(data, validation) {
  var cfg = data.config;
  var reqClin = el('ReqClinLabel');
  var reqSim = el('ReqSimLabel');
  if (reqClin) reqClin.textContent = cfg.clinicalDaysRequired;
  if (reqSim) reqSim.textContent = cfg.simDaysRequired;

  var scheduleHead = el('ScheduleHeadRow');
  if (!scheduleHead) return;
  var headHtml = '<th class="sticky-col schedule-sticky-corner">Name</th><th class="sticky-col-grp schedule-sticky-corner">Grp</th>';
  for (var i = 0; i < 18; i++) {
    headHtml += '<th style="text-align:center">' + CalendarEngine.getWeekDisplay(data, i, false) + '</th>';
  }
  headHtml += '<th class="sticky-col-r-clin" style="text-align:center">Clinicals</th>' +
    '<th class="sticky-col-r-sims" style="text-align:center">Sims</th>' +
    '<th class="sticky-col-r-status">Status</th>';
  scheduleHead.innerHTML = headHtml;

  var scheduleBody = el('ScheduleBody');
  if (!scheduleBody) return;
  scheduleBody.innerHTML = '';
  data.students.forEach(function (student) {
    var vr = validation.students[student.id];
    var tr = document.createElement('tr');
    if (!vr.valid) tr.className = 'schedule-row-pending';
    else if (vr.warnings && vr.warnings.length) tr.className = 'schedule-row-warning';
    var cells = '<td class="sticky-col"><strong>' + escapeHtml(student.name) + '</strong></td>' +
      '<td class="sticky-col-grp">' + student.clinicalGroup + '</td>';
    student.schedule.forEach(function (cell, wi) {
      var tdClass = '';
      if (Orientation && Orientation.weekHasOrientationConflict(data, student, wi)) {
        tdClass = ' cell-orientation-conflict';
      }
      cells += '<td class="' + tdClass + '">' + renderCellHtml(cell, student, data, wi) + '</td>';
    });
    cells += scheduleRightColsHtml(vr);
    tr.innerHTML = cells;
    scheduleBody.appendChild(tr);
  });
}

function renderSimTable(data) {
  var tbody = el('SimTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.students.forEach(function (student) {
    var simCols = '';
    for (var n = 1; n <= 5; n++) {
      var content = '—';
      var tdClass = '';
      student.schedule.forEach(function (cell, wi) {
        if (cell.sim === n) {
          content = CalendarEngine.getWeekDisplay(data, wi, true) + ' (' + (cell.simDay || 'Mon') + ')';
          if (cell.simGuestGroup) {
            tdClass = 'sim-prog-cell-guest';
            content += ' · ' + cell.simGuestGroup;
          }
        }
      });
      simCols += '<td class="' + tdClass + '" style="text-align:center">' + content + '</td>';
    }
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="sticky-col"><strong>' + escapeHtml(student.name) + '</strong></td>' +
      '<td>' + student.clinicalGroup + '</td>' +
      '<td>' + student.simGroup + '</td>' + simCols;
    tbody.appendChild(tr);
  });
}

function renderLoadChart(data) {
  var canvas = el('LoadChart');
  if (!canvas) return;
  var caps = Scheduler.getSimCaps(data.config);
  var counts = [];
  var labels = [];
  var simWeekdays = DataModel.getSimDays(data.config);
  for (var w = 0; w < 18; w++) {
    var max = 0;
    simWeekdays.forEach(function (day) {
      max = Math.max(max, Scheduler.getDaySimAttendanceCount(data, w, day));
    });
    counts.push(max);
    labels.push('W' + (w + 1));
  }
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ label: 'Peak sim session load', data: counts, backgroundColor: '#059669', borderRadius: 4 }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: Math.max(caps.overload + 1, 10), ticks: { stepSize: 1 } } }
    }
  });
}

export function render() {
  var empty = el('EmptyState');
  var content = el('Content');
  var data = getPlaygroundData();
  updatePlaygroundToolbar(data);

  if (!data) {
    if (empty) empty.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  if (content) content.classList.remove('hidden');

  var validation = Validator.validateAll(data);
  renderConflicts(validation);
  renderMasterSchedule(data, validation);
  renderSimTable(data);
  renderLoadChart(data);
}

export function init() {}
