/** Dashboard — master schedule, sim tables, and occupancy. */

import { getData } from '../../core/state.js';
import * as DataModel from '../../core/data-model/index.js';
import * as CalendarEngine from '../../core/calendar-engine.js';
import * as Validator from '../../core/validator.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import * as Orientation from '../../core/orientation.js';
import * as MakeupDisplay from '../../core/makeup-display.js';
import * as Scheduler from '../../core/scheduler/index.js';
import * as DashboardExport from '../../export/dashboard-export.js';
import { buildSemesterLabelHtml, refresh } from '../chrome.js';
import { renderChart } from './chart.js';
import { getScheduleFilteredStudents, populateFilters, escapeHtml } from './schedule-filters.js';

var scheduleFullscreenActive = false;
var tallyScrollSyncing = false;
var scheduleSearchDebounce = null;

function updateSchedulePanelSemester(data) {
    var el = document.getElementById('schedulePanelSemester');
    if (!el || !data) return;
    var parts = DataModel.parseSemesterDisplay(data);
    if (buildSemesterLabelHtml) {
      el.innerHTML = buildSemesterLabelHtml(parts);
    } else {
      el.textContent = parts.name || 'Semester';
    }
  }

function syncFullscreenScheduleLayout() {
    var panel = document.getElementById('masterSchedulePanel');
    if (!panel) return;
    var body = panel.querySelector('.dashboard-panel-body');
    var summary = panel.querySelector('.dashboard-panel-summary');
    if (!body || !summary) return;

    if (!scheduleFullscreenActive) {
      body.style.removeProperty('height');
      body.style.removeProperty('max-height');
      return;
    }

    var bodyHeight = Math.max(0, panel.clientHeight - summary.offsetHeight);
    body.style.height = bodyHeight + 'px';
    body.style.maxHeight = bodyHeight + 'px';
  }

function setScheduleFullscreen(active) {
    var panel = document.getElementById('masterSchedulePanel');
    var openBtn = document.getElementById('scheduleFullscreenBtn');
    var closeBtn = document.getElementById('scheduleFullscreenCloseBtn');
    var semesterEl = document.getElementById('schedulePanelSemester');
    if (!panel) return;

    scheduleFullscreenActive = !!active;
    document.documentElement.classList.toggle('schedule-fullscreen-mode', scheduleFullscreenActive);

    if (scheduleFullscreenActive) {
      panel.setAttribute('open', '');
      if (semesterEl) semesterEl.setAttribute('aria-hidden', 'false');
      if (openBtn) openBtn.classList.add('hidden');
      if (closeBtn) closeBtn.classList.remove('hidden');
      updateSchedulePanelSemester(getData());
      requestAnimationFrame(function () {
        syncFullscreenScheduleLayout();
        syncScheduleTallyScroll();
        var bodyScroll = document.getElementById('scheduleBodyScroll');
        if (bodyScroll) bodyScroll.focus();
      });
    } else {
      syncFullscreenScheduleLayout();
      if (semesterEl) semesterEl.setAttribute('aria-hidden', 'true');
      if (openBtn) openBtn.classList.remove('hidden');
      if (closeBtn) closeBtn.classList.add('hidden');
    }
  }

function bindScheduleFullscreen() {
    var openBtn = document.getElementById('scheduleFullscreenBtn');
    var closeBtn = document.getElementById('scheduleFullscreenCloseBtn');
    var panel = document.getElementById('masterSchedulePanel');
    if (!openBtn || !closeBtn || !panel || panel.dataset.fullscreenBound) return;
    panel.dataset.fullscreenBound = '1';

    openBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setScheduleFullscreen(true);
    });

    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setScheduleFullscreen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && scheduleFullscreenActive) {
        setScheduleFullscreen(false);
      }
    });

    window.addEventListener('resize', function () {
      if (scheduleFullscreenActive) {
        syncFullscreenScheduleLayout();
        syncScheduleTallyScroll();
      }
    });
  }

function renderCellHtml(cell, student, data, weekIndex) {
    if (!cell) return '<div class="cell-empty">-</div>';
    if (cell.inactive) return '<div class="cell-holiday">Holiday</div>';

    var cfg = data.config;
    var cDay = DataModel.getClinicalDayForGroup(student.clinicalGroup, cfg);
    var clinMeta = MakeupDisplay.findMakeupRecord(student, weekIndex, 'clinical');
    var hasScheduledClin = cell.clinical || cell.clinicalMissed;
    var hasMakeupClin = cell.makeupClinical;
    var hasSim = cell.sim;
    var isOrientWeek = Orientation && Orientation.isOrientationWeek(data, student, weekIndex);
    var orientHtml = isOrientWeek
      ? '<span class="badge-orient">' + Orientation.getOrientationLabel(data, student, weekIndex) + '</span>'
      : '';

    if (hasMakeupClin && !hasScheduledClin && !hasSim && !isOrientWeek) {
      var clinTier = MakeupDisplay.getClinicalMakeupTier(cell, student, weekIndex);
      var clinStar = clinMeta && clinMeta.overload ? '*' : '';
      var joinDay = clinMeta && clinMeta.joinedDay ? ' (' + clinMeta.joinedDay.toUpperCase() + ')' : '';
      return '<div class="cell-makeup ' + MakeupDisplay.tierClass(clinTier) + '">Make-Up CLIN' + joinDay + clinStar + '</div>';
    }

    if (!hasScheduledClin && !hasSim && !hasMakeupClin) {
      if (isOrientWeek) return '<div class="flex-col">' + orientHtml + '</div>';
      return '<div class="cell-empty">-</div>';
    }

    var html = '<div class="flex-col">';
    if (orientHtml) html += orientHtml;
    if (hasScheduledClin) {
      var cls = cell.clinicalMissed ? 'badge-clin badge-clin-missed' : 'badge-clin';
      var siteSuffix = ClinicalSites
        ? ClinicalSites.facilityInitialsForCell(data, student, weekIndex)
        : '';
      var siteText = siteSuffix ? ' ' + siteSuffix : '';
      html += '<span class="' + cls + '">CLIN (' + cDay.toUpperCase() + ')' + siteText + '</span>';
    }
    if (hasMakeupClin && (hasScheduledClin || hasSim)) {
      var mTier = MakeupDisplay.getClinicalMakeupTier(cell, student, weekIndex);
      var star = clinMeta && clinMeta.overload ? '*' : '';
      var day = clinMeta && clinMeta.joinedDay ? clinMeta.joinedDay.toUpperCase() : cDay.toUpperCase();
      html += '<span class="badge-clin badge-clin-makeup ' + MakeupDisplay.tierClass(mTier) + '">MAKEUP (' + day + ')' + star + '</span>';
    }
    if (hasSim) {
      var simTier = cell.simMakeup ? MakeupDisplay.getSimMakeupTier(cell, student, weekIndex) : null;
      var simCls = 'badge-sim';
      if (simTier) {
        simCls += ' badge-sim-makeup ' + MakeupDisplay.tierClass(simTier);
      } else if (cell.simOverload) {
        simCls += ' badge-sim-overload';
      }
      var simStar = cell.simMakeup && cell.simOverload ? '*' : '';
      var guestNote = cell.simGuestGroup
        ? ' (' + cell.simGuestGroup + '*)'
        : '';
      var guestTitle = cell.simGuestGroup
        ? ' title="Primary: ' + student.simGroup + ' · Guest: ' + cell.simGuestGroup + '"'
        : '';
      html += '<span class="' + simCls + '"' + guestTitle + '>SIM ' + cell.sim + guestNote +
        ' (' + (cell.simDay || 'Mon').toUpperCase() + ')' + simStar + '</span>';
    }
    html += '</div>';
    return html;
  }

function scheduleRightColsHtml(vr) {
    var badge = Validator.statusBadge(vr);
    return '<td class="sticky-col-r-clin" style="text-align:center"><span class="stat-pill stat-clin">' +
      vr.stats.clinicals + '</span></td>' +
      '<td class="sticky-col-r-sims" style="text-align:center"><span class="stat-pill stat-sim">' +
      vr.stats.sims + '</span></td>' +
      '<td class="sticky-col-r-status"><span class="' + badge.cls + '">' + badge.text + '</span></td>';
  }

function scheduleRightPadCells() {
    return '<td class="sticky-col-r-clin"></td><td class="sticky-col-r-sims"></td><td class="sticky-col-r-status"></td>';
  }

function appendScheduleRightPadCells(tr) {
    var tmp = document.createElement('tbody');
    tmp.innerHTML = '<tr>' + scheduleRightPadCells() + '</tr>';
    var cells = tmp.querySelector('tr').children;
    while (cells.length) tr.appendChild(cells[0]);
  }

function exportScheduleXlsx() {
    var data = getData();
    if (!data) return;
    var validation = Validator.validateAll(data);
    var students = getScheduleFilteredStudents(data, validation);
    DashboardExport.download(data, students, validation);
  }

function refreshScheduleView() {
    var data = getData();
    if (!data) return;
    render(data, { preserveView: true });
  }

function render(data, options) {
    options = options || {};
    var preserveView = !!options.preserveView;
    var panel = preserveView ? document.getElementById('masterSchedulePanel') : null;
    var bodyScroll = preserveView ? document.getElementById('scheduleBodyScroll') : null;
    var anchorTop = panel ? panel.getBoundingClientRect().top : null;
    var bodyScrollTop = bodyScroll ? bodyScroll.scrollTop : 0;
    var bodyScrollLeft = bodyScroll ? bodyScroll.scrollLeft : 0;
    if (!data) return;
    var validation = Validator.validateAll(data);
    var scheduleStudents = getScheduleFilteredStudents(data, validation);
    var cfg = data.config;

    document.getElementById('reqClinLabel').textContent = cfg.clinicalDaysRequired;
    document.getElementById('reqSimLabel').textContent = cfg.simDaysRequired;

    var conflictsEl = document.getElementById('conflictsPanel');
    var msgs = [];
    validation.groupErrors.forEach(function (e) { msgs.push(e); });
    validation.simSessions.forEach(function (v) { msgs.push(v.message); });
    (validation.clinicalSessions || []).forEach(function (v) { msgs.push(v.message); });
    (validation.doubleBooking || []).forEach(function (v) { msgs.push(v.message); });
    (validation.orientationConflicts || []).forEach(function (v) { msgs.push(v.message); });
    (validation.simClinicalConflicts || []).forEach(function (v) { msgs.push(v.message); });
    (validation.simGroupExceptions || []).forEach(function (v) { msgs.push(v.message); });
    (validation.simWeekOrder || []).forEach(function (v) { msgs.push(v.message); });
    (validation.programSimWeeks || []).forEach(function (v) { msgs.push(v.message); });
    (validation.studentSimParticipation || []).forEach(function (v) { msgs.push(v.message); });
    (validation.simBlockNoRepeat || []).forEach(function (v) { msgs.push(v.message); });
    if (msgs.length) {
      conflictsEl.classList.remove('hidden');
      conflictsEl.innerHTML = '<strong>Scheduling conflicts:</strong><ul><li>' + msgs.join('</li><li>') + '</li></ul>';
    } else {
      conflictsEl.classList.add('hidden');
    }

    var scheduleHead = document.getElementById('scheduleHeadRow');
    var headHtml = '<th class="sticky-col schedule-sticky-corner">Name</th><th class="sticky-col-grp schedule-sticky-corner">Grp</th>';
    for (var i = 0; i < 18; i++) {
      headHtml += '<th style="text-align:center">' + CalendarEngine.getWeekDisplay(data, i, false) + '</th>';
    }
    headHtml += '<th class="sticky-col-r-clin" style="text-align:center">Clinicals</th>' +
      '<th class="sticky-col-r-sims" style="text-align:center">Sims</th>' +
      '<th class="sticky-col-r-status">Status</th>';
    scheduleHead.innerHTML = headHtml;

    var scheduleBody = document.getElementById('scheduleBody');
    scheduleBody.innerHTML = '';
    scheduleStudents.forEach(function (student) {
      var vr = validation.students[student.id];
      var tr = document.createElement('tr');
      if (!vr.valid) tr.className = 'schedule-row-pending';
      else if (vr.warnings && vr.warnings.length) tr.className = 'schedule-row-warning';
      var cells = '<td class="sticky-col"><strong>' + escapeHtml(student.name) + '</strong></td>' +
        '<td class="sticky-col-grp">' + student.clinicalGroup + '</td>';
      student.schedule.forEach(function (cell, wi) {
        var tdClass = 'cell-editable';
        if (Orientation && Orientation.weekHasOrientationConflict(data, student, wi)) {
          tdClass += ' cell-orientation-conflict';
        }
        cells += '<td class="' + tdClass + '" data-student="' + student.id + '" data-week="' + wi + '">' +
          renderCellHtml(cell, student, data, wi) + '</td>';
      });
      cells += scheduleRightColsHtml(vr);
      tr.innerHTML = cells;
      scheduleBody.appendChild(tr);
    });

    renderOccupancy(data, scheduleStudents);
    renderSimTable(data, scheduleStudents);
    if (!preserveView) {
      renderSimRoster(data);
      renderChart(data);
    }
    updateSchedulePanelSemester(data);
    if (preserveView) {
      requestAnimationFrame(function () {
        if (panel && anchorTop != null) {
          var delta = panel.getBoundingClientRect().top - anchorTop;
          if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
        }
        if (bodyScroll) {
          bodyScroll.scrollTop = bodyScrollTop;
          bodyScroll.scrollLeft = bodyScrollLeft;
          syncScheduleTallyScroll();
        }
        if (scheduleFullscreenActive) syncFullscreenScheduleLayout();
      });
    } else if (scheduleFullscreenActive) {
      syncScheduleTallyScroll();
    }
  }

function daySimCount(students, weekIndex, day) {
    var n = 0;
    students.forEach(function (s) {
      var c = s.schedule[weekIndex];
      if (c && c.sim && c.simDay === day) n++;
    });
    return n;
  }

function renderOccupancy(data, scheduleStudents) {
    var students = scheduleStudents || data.students;
    var caps = Scheduler.getSimCaps(data.config);
    var simDays = DataModel.getSimDays(data.config);
    var tfoot = document.getElementById('scheduleOccupancyFoot');
    if (!tfoot) return;
    tfoot.innerHTML = '';

    simDays.forEach(function (day) {
      var tr = document.createElement('tr');
      tr.className = 'occupancy-sim-row';
      var label = document.createElement('td');
      label.className = 'sticky-col schedule-footer-label';
      label.textContent = 'Sim (' + day + ')';
      tr.appendChild(label);
      var grpPad = document.createElement('td');
      grpPad.className = 'sticky-col-grp';
      tr.appendChild(grpPad);
      for (var w = 0; w < 18; w++) {
        var count = daySimCount(students, w, day);
        var simCell = document.createElement('td');
        simCell.style.textAlign = 'center';
        var cls = count > caps.overload ? 'cap-over' : (count > caps.normal ? 'cap-overload' : 'cap-ok');
        simCell.innerHTML = '<span class="' + cls + '">' + count + '</span>';
        tr.appendChild(simCell);
      }
      appendScheduleRightPadCells(tr);
      tfoot.appendChild(tr);
    });

    var clinTr = document.createElement('tr');
    clinTr.className = 'occupancy-clin-row';
    var clinLabel = document.createElement('td');
    clinLabel.className = 'sticky-col schedule-footer-label';
    clinLabel.textContent = 'Students in clin';
    clinTr.appendChild(clinLabel);
    var clinGrpPad = document.createElement('td');
    clinGrpPad.className = 'sticky-col-grp';
    clinTr.appendChild(clinGrpPad);
    for (var cw = 0; cw < 18; cw++) {
      var clinCount = 0;
      students.forEach(function (s) {
        var c = s.schedule[cw];
        if (c && ((c.clinical && !c.clinicalMissed) || c.makeupClinical)) clinCount++;
      });
      var clinCell = document.createElement('td');
      clinCell.style.textAlign = 'center';
      clinCell.textContent = clinCount;
      clinTr.appendChild(clinCell);
    }
    appendScheduleRightPadCells(clinTr);
    tfoot.appendChild(clinTr);
    syncScheduleTallyScroll();
  }

function syncScheduleTallyScroll() {
    var bodyScroll = document.getElementById('scheduleBodyScroll');
    var tallyScroll = document.getElementById('scheduleTallyScroll');
    if (!bodyScroll || !tallyScroll) return;
    tallyScroll.scrollLeft = bodyScroll.scrollLeft;
  }

function bindScheduleScrollSync() {
    var bodyScroll = document.getElementById('scheduleBodyScroll');
    var tallyScroll = document.getElementById('scheduleTallyScroll');
    if (!bodyScroll || !tallyScroll || bodyScroll.dataset.scrollBound) return;
    bodyScroll.dataset.scrollBound = '1';
    bodyScroll.addEventListener('scroll', function () {
      if (tallyScrollSyncing) return;
      tallyScrollSyncing = true;
      tallyScroll.scrollLeft = bodyScroll.scrollLeft;
      tallyScrollSyncing = false;
    });
    tallyScroll.addEventListener('scroll', function () {
      if (tallyScrollSyncing) return;
      tallyScrollSyncing = true;
      bodyScroll.scrollLeft = tallyScroll.scrollLeft;
      tallyScrollSyncing = false;
    });
  }

function renderSimTable(data, students) {
    var tbody = document.getElementById('simTableBody');
    tbody.innerHTML = '';
    students.forEach(function (student) {
      var simCols = '';
      for (var n = 1; n <= 5; n++) {
        var content = '—';
        var tdClass = '';
        var title = '';
        student.schedule.forEach(function (cell, wi) {
          if (cell.sim === n) {
            content = CalendarEngine.getWeekDisplay(data, wi, true) + ' (' + (cell.simDay || 'Mon') + ')';
            if (cell.simGuestGroup) {
              tdClass = 'sim-prog-cell-guest';
              content += ' · ' + cell.simGuestGroup;
              title = 'Guest in ' + cell.simGuestGroup + ' (primary: ' + student.simGroup + ')';
            }
          }
        });
        simCols += '<td class="' + tdClass + '" style="text-align:center"' +
          (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' + content + '</td>';
      }
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="sticky-col"><strong>' + escapeHtml(student.name) + '</strong></td>' +
        '<td>' + student.clinicalGroup + '</td>' +
        '<td>' + student.simGroup + '</td>' + simCols;
      tbody.appendChild(tr);
    });
  }

function renderSimRoster(data) {
    var weekIdx = parseInt(document.getElementById('weekFilter').value, 10) || 0;
    var monList = document.getElementById('monSimList');
    var tueList = document.getElementById('tueSimList');
    monList.innerHTML = '';
    tueList.innerHTML = '';
    var monCount = 0, tueCount = 0;

    data.students.forEach(function (s) {
      var cell = s.schedule[weekIdx];
      if (!cell || !cell.sim) return;
      var li = '<li><span><strong>' + escapeHtml(s.name) + '</strong> <small>' + s.clinicalGroup + '</small></span><span class="stat-pill stat-sim">Sim ' + cell.sim + '</span></li>';
      if (cell.simDay === 'Tue') { tueList.innerHTML += li; tueCount++; }
      else { monList.innerHTML += li; monCount++; }
    });

    document.getElementById('monCount').textContent = monCount + ' students';
    document.getElementById('tueCount').textContent = tueCount + ' students';
    document.getElementById('monEmpty').classList.toggle('hidden', monCount > 0);
    document.getElementById('tueEmpty').classList.toggle('hidden', tueCount > 0);
  }

function init() {
    bindScheduleScrollSync();
    bindScheduleFullscreen();
    var exportBtn = document.getElementById('scheduleExportXlsxBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        exportScheduleXlsx();
      });
    }
    ['scheduleGroupFilter', 'scheduleSimGroupFilter', 'scheduleFacilityFilter',
      'scheduleSectionFilter', 'scheduleStatusFilter'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', refreshScheduleView);
    });
    ['scheduleFilterMakeupClean', 'scheduleFilterMakeupConflict', 'scheduleFilterGuestSim'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', refreshScheduleView);
    });
    var weekFilter = document.getElementById('weekFilter');
    if (weekFilter) weekFilter.addEventListener('change', function () { refresh(); });
    var searchEl = document.getElementById('scheduleStudentSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        clearTimeout(scheduleSearchDebounce);
        scheduleSearchDebounce = setTimeout(refreshScheduleView, 200);
      });
    }
  }

export {
  render,
  populateFilters,
  init,
  renderCellHtml,
  setScheduleFullscreen,
  exportScheduleXlsx
};
