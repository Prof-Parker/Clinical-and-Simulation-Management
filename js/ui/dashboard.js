/* global App, Chart */
var App = App || {};
App.UI = App.UI || {};

App.UI.Dashboard = (function () {
  var chartInstance = null;

  function renderCellHtml(cell, student, data, weekIndex) {
    if (!cell) return '<div class="cell-empty">-</div>';
    if (cell.inactive) return '<div class="cell-holiday">Holiday</div>';

    var cfg = data.config;
    var cDay = App.DataModel.getClinicalDayForGroup(student.clinicalGroup, cfg);
    var clinMeta = App.MakeupDisplay.findMakeupRecord(student, weekIndex, 'clinical');
    var hasScheduledClin = cell.clinical || cell.clinicalMissed;
    var hasMakeupClin = cell.makeupClinical;
    var hasSim = cell.sim;

    if (hasMakeupClin && !hasScheduledClin && !hasSim) {
      var clinTier = App.MakeupDisplay.getClinicalMakeupTier(cell, student, weekIndex);
      var clinStar = clinMeta && clinMeta.overload ? '*' : '';
      var joinDay = clinMeta && clinMeta.joinedDay ? ' (' + clinMeta.joinedDay.toUpperCase() + ')' : '';
      return '<div class="cell-makeup ' + App.MakeupDisplay.tierClass(clinTier) + '">Make-Up CLIN' + joinDay + clinStar + '</div>';
    }

    if (!hasScheduledClin && !hasSim && !hasMakeupClin) {
      return '<div class="cell-empty">-</div>';
    }

    var html = '<div class="flex-col">';
    if (hasScheduledClin) {
      var cls = cell.clinicalMissed ? 'badge-clin badge-clin-missed' : 'badge-clin';
      html += '<span class="' + cls + '">CLIN (' + cDay.toUpperCase() + ')</span>';
    }
    if (hasMakeupClin && (hasScheduledClin || hasSim)) {
      var mTier = App.MakeupDisplay.getClinicalMakeupTier(cell, student, weekIndex);
      var star = clinMeta && clinMeta.overload ? '*' : '';
      var day = clinMeta && clinMeta.joinedDay ? clinMeta.joinedDay.toUpperCase() : cDay.toUpperCase();
      html += '<span class="badge-clin badge-clin-makeup ' + App.MakeupDisplay.tierClass(mTier) + '">MAKEUP (' + day + ')' + star + '</span>';
    }
    if (hasSim) {
      var simTier = cell.simMakeup ? App.MakeupDisplay.getSimMakeupTier(cell, student, weekIndex) : null;
      var simCls = 'badge-sim';
      if (simTier) {
        simCls += ' badge-sim-makeup ' + App.MakeupDisplay.tierClass(simTier);
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

  function studentStatusKey(vr) {
    if (!vr.valid) return 'pending';
    if (vr.warnings && vr.warnings.length) return 'warning';
    return 'complete';
  }

  function getScheduleFilteredStudents(data, validation) {
    var groupEl = document.getElementById('scheduleGroupFilter');
    var simEl = document.getElementById('scheduleSimGroupFilter');
    var facEl = document.getElementById('scheduleFacilityFilter');
    var sectionEl = document.getElementById('scheduleSectionFilter');
    var statusEl = document.getElementById('scheduleStatusFilter');
    var searchEl = document.getElementById('scheduleStudentSearch');
    if (!groupEl || !simEl || !facEl) return data.students.slice();
    var groupVal = groupEl.value;
    var simVal = simEl.value;
    var facilityVal = facEl.value;
    var sectionVal = sectionEl ? sectionEl.value : 'all';
    var statusVal = statusEl ? statusEl.value : 'all';
    var searchVal = searchEl ? (searchEl.value || '').toLowerCase() : '';
    return data.students.filter(function (s) {
      if (groupVal !== 'all' && s.clinicalGroup !== groupVal) return false;
      if (simVal !== 'all' && s.simGroup !== simVal) return false;
      if (facilityVal !== 'all' && !App.DataModel.sameFacilitySite(data, s.facilityId, facilityVal)) return false;
      if (sectionVal !== 'all' && s.section !== sectionVal) return false;
      if (searchVal && s.name.toLowerCase().indexOf(searchVal) < 0) return false;
      if (statusVal !== 'all' && validation) {
        var vr = validation.students[s.id];
        if (!vr || studentStatusKey(vr) !== statusVal) return false;
      }
      return true;
    });
  }

  function scheduleRightColsHtml(vr) {
    var badge = App.Validator.statusBadge(vr);
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

  function render(data) {
    if (!data) return;
    var validation = App.Validator.validateAll(data);
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
      headHtml += '<th style="text-align:center">' + App.CalendarEngine.getWeekDisplay(data, i, false) + '</th>';
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
        cells += '<td class="cell-editable" data-student="' + student.id + '" data-week="' + wi + '">' +
          renderCellHtml(cell, student, data, wi) + '</td>';
      });
      cells += scheduleRightColsHtml(vr);
      tr.innerHTML = cells;
      scheduleBody.appendChild(tr);
    });

    renderOccupancy(data, scheduleStudents);
    renderSimTable(data, scheduleStudents);
    renderSimRoster(data);
    renderChart(data);
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
    var caps = App.Scheduler.getSimCaps(data.config);
    var simDays = App.DataModel.getSimDays(data.config);
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

  var tallyScrollSyncing = false;

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
            content = App.CalendarEngine.getWeekDisplay(data, wi, true) + ' (' + (cell.simDay || 'Mon') + ')';
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

  function renderChart(data) {
    var canvas = document.getElementById('loadChart');
    if (!canvas || typeof Chart === 'undefined') return;
    var caps = App.Scheduler.getSimCaps(data.config);
    var counts = [];
    var labels = [];
    var simWeekdays = App.DataModel.getSimDays(data.config);
    for (var w = 0; w < 18; w++) {
      var max = 0;
      simWeekdays.forEach(function (day) {
        max = Math.max(max, App.Scheduler.getDaySimAttendanceCount(data, w, day));
      });
      counts.push(max);
      labels.push('W' + (w + 1));
    }
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Peak sim session load', data: counts, backgroundColor: '#059669', borderRadius: 4 }] },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: Math.max(caps.overload + 1, 10), ticks: { stepSize: 1 } } }
      }
    });
  }

  function populateFilters(data) {
    var cfg = data.config;
    var weekFilter = document.getElementById('weekFilter');
    var weekVal = weekFilter.value;
    weekFilter.innerHTML = '';
    for (var i = 0; i < 18; i++) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = App.CalendarEngine.getWeekDisplay(data, i, true);
      weekFilter.appendChild(opt);
    }
    if (weekVal !== '' && weekFilter.querySelector('option[value="' + weekVal + '"]')) {
      weekFilter.value = weekVal;
    }

    var gf = document.getElementById('scheduleGroupFilter');
    var groupVal = gf ? gf.value : 'all';
    if (gf) {
      gf.innerHTML = '<option value="all">All Clinical Groups</option>';
      App.DataModel.getClinicalGroups(cfg).forEach(function (g) {
        var day = App.DataModel.getClinicalDayForGroup(g, cfg);
        gf.innerHTML += '<option value="' + g + '">' + g + ' (' + day + ')</option>';
      });
      if (groupVal && gf.querySelector('option[value="' + groupVal + '"]')) gf.value = groupVal;
    }

    var sgf = document.getElementById('scheduleSimGroupFilter');
    var simVal = sgf ? sgf.value : 'all';
    if (sgf) {
      sgf.innerHTML = '<option value="all">All Sim Groups</option>';
      App.DataModel.getSimGroups(cfg).forEach(function (g) {
        sgf.innerHTML += '<option value="' + g + '">' + g + '</option>';
      });
      if (simVal && sgf.querySelector('option[value="' + simVal + '"]')) sgf.value = simVal;
    }

    var sf = document.getElementById('scheduleSectionFilter');
    var sectionVal = sf ? sf.value : 'all';
    if (sf) {
      sf.innerHTML = '<option value="all">All Sections</option>';
      var sectionNames = [];
      if (data.sections && data.sections.length) {
        data.sections.forEach(function (sec) {
          if (sec.name) sectionNames.push(sec.name);
        });
      } else {
        data.students.forEach(function (s) {
          if (s.section && sectionNames.indexOf(s.section) < 0) sectionNames.push(s.section);
        });
      }
      sectionNames.sort().forEach(function (sec) {
        sf.innerHTML += '<option value="' + escapeHtml(sec) + '">' + escapeHtml(sec) + '</option>';
      });
      if (sectionVal && sf.querySelector('option[value="' + sectionVal + '"]')) sf.value = sectionVal;
    }

    var sff = document.getElementById('scheduleFacilityFilter');
    if (sff) {
      var facVal = sff.value;
      sff.innerHTML = '<option value="all">All Facilities</option>';
      (App.DataModel.getUniqueFacilitiesForSelect(data) || []).forEach(function (f) {
        sff.innerHTML += '<option value="' + f.id + '">' + escapeHtml(f.name) + '</option>';
      });
      if (facVal && sff.querySelector('option[value="' + facVal + '"]')) sff.value = facVal;
    }
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function init() {
    bindScheduleScrollSync();
    ['scheduleGroupFilter', 'scheduleSimGroupFilter', 'scheduleFacilityFilter',
      'scheduleSectionFilter', 'scheduleStatusFilter', 'weekFilter'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () { App.UI.refresh(); });
    });
    var searchEl = document.getElementById('scheduleStudentSearch');
    if (searchEl) searchEl.addEventListener('keyup', function () { App.UI.refresh(); });
  }

  return { render: render, populateFilters: populateFilters, init: init, renderCellHtml: renderCellHtml };
})();
