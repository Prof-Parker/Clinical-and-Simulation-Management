/* global App, Chart */
var App = App || {};
App.UI = App.UI || {};

App.UI.Dashboard = (function () {
  var chartInstance = null;

  function renderCellHtml(cell, student, data) {
    if (!cell) return '<div class="cell-empty">-</div>';
    if (cell.inactive) return '<div class="cell-holiday">Holiday</div>';
    if (cell.makeupClinical) return '<div class="cell-makeup">Make-Up</div>';
    if (!cell.clinical && !cell.sim) return '<div class="cell-empty">-</div>';
    var cfg = data.config;
    var cDay = App.DataModel.getClinicalDayForGroup(student.clinicalGroup, cfg);
    var html = '<div class="flex-col">';
    if (cell.clinical || cell.clinicalMissed) {
      var cls = cell.clinicalMissed ? 'badge-clin badge-clin-missed' : 'badge-clin';
      html += '<span class="' + cls + '">CLIN (' + cDay.toUpperCase() + ')</span>';
    }
    if (cell.sim) {
      var simCls = cell.simOverload ? 'badge-sim badge-sim-overload' : 'badge-sim';
      html += '<span class="' + simCls + '">SIM ' + cell.sim + ' (' + (cell.simDay || 'Mon').toUpperCase() + ')' +
        (cell.simOverload ? ' +1' : '') + '</span>';
    }
    html += '</div>';
    return html;
  }

  function getFilteredStudents(data) {
    var groupVal = document.getElementById('groupFilter').value;
    var simVal = document.getElementById('simGroupFilter').value;
    var searchVal = (document.getElementById('studentSearch').value || '').toLowerCase();
    var sectionVal = document.getElementById('sectionFilter').value;
    return data.students.filter(function (s) {
      if (groupVal !== 'all' && s.clinicalGroup !== groupVal) return false;
      if (simVal !== 'all' && s.simGroup !== simVal) return false;
      if (sectionVal !== 'all' && s.section !== sectionVal) return false;
      if (searchVal && s.name.toLowerCase().indexOf(searchVal) < 0) return false;
      return true;
    });
  }

  function render(data) {
    if (!data) return;
    var validation = App.Validator.validateAll(data);
    var students = getFilteredStudents(data);
    var cfg = data.config;

    document.getElementById('reqClinLabel').textContent = cfg.clinicalDaysRequired;
    document.getElementById('reqSimLabel').textContent = cfg.simDaysRequired;

    var conflictsEl = document.getElementById('conflictsPanel');
    var msgs = [];
    validation.groupErrors.forEach(function (e) { msgs.push(e); });
    validation.simSessions.forEach(function (v) { msgs.push(v.message); });
    if (msgs.length) {
      conflictsEl.classList.remove('hidden');
      conflictsEl.innerHTML = '<strong>Scheduling conflicts:</strong><ul><li>' + msgs.join('</li><li>') + '</li></ul>';
    } else {
      conflictsEl.classList.add('hidden');
    }

    var rosterBody = document.getElementById('rosterBody');
    rosterBody.innerHTML = '';
    students.forEach(function (student) {
      var vr = validation.students[student.id];
      var badge = App.Validator.statusBadge(vr);
      var clinDay = App.DataModel.getClinicalDayForGroup(student.clinicalGroup, cfg);
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="sticky-col"><strong>' + escapeHtml(student.name) + '</strong></td>' +
        '<td>' + student.clinicalGroup + '</td>' +
        '<td>' + (student.section || '—') + '</td>' +
        '<td style="text-align:center"><span class="stat-pill stat-clin">' + vr.stats.clinicals + '</span></td>' +
        '<td style="text-align:center"><span class="stat-pill stat-sim">' + vr.stats.sims + '</span></td>' +
        '<td><span class="' + badge.cls + '">' + badge.text + '</span></td>';
      rosterBody.appendChild(tr);
    });

    var scheduleHead = document.getElementById('scheduleHeadRow');
    var headHtml = '<th class="sticky-col">Name</th><th>Grp</th>';
    for (var i = 0; i < 18; i++) {
      headHtml += '<th style="text-align:center">' + App.CalendarEngine.getWeekDisplay(data, i, false) + '</th>';
    }
    scheduleHead.innerHTML = headHtml;

    var scheduleBody = document.getElementById('scheduleBody');
    scheduleBody.innerHTML = '';
    students.forEach(function (student) {
      var tr = document.createElement('tr');
      var cells = '<td class="sticky-col"><strong>' + escapeHtml(student.name) + '</strong></td><td>' + student.clinicalGroup + '</td>';
      student.schedule.forEach(function (cell, wi) {
        cells += '<td class="cell-editable" data-student="' + student.id + '" data-week="' + wi + '">' + renderCellHtml(cell, student, data) + '</td>';
      });
      tr.innerHTML = cells;
      scheduleBody.appendChild(tr);
    });

    renderOccupancy(data, students);
    renderSimTable(data, students, validation);
    renderSimRoster(data);
    renderChart(data);
  }

  function renderOccupancy(data) {
    var caps = App.Scheduler.getSimCaps(data.config);
    var footerSim = document.getElementById('occupancyFooterSim');
    var footerClin = document.getElementById('occupancyFooterClin');
    while (footerSim.cells.length > 1) footerSim.deleteCell(1);
    while (footerClin.cells.length > 1) footerClin.deleteCell(1);

    var simWeekdays = App.DataModel.getSimDays(data.config);
    for (var w = 0; w < 18; w++) {
      var simMax = 0;
      for (var sim = 1; sim <= 5; sim++) {
        simWeekdays.forEach(function (day) {
          simMax = Math.max(simMax, App.Scheduler.getSessionCount(data, w, sim, day));
        });
      }
      var simCell = footerSim.insertCell();
      var cls = simMax > caps.overload ? 'cap-over' : (simMax > caps.normal ? 'cap-overload' : 'cap-ok');
      simCell.innerHTML = '<span class="' + cls + '">' + simMax + '</span>';

      var clinCount = 0;
      data.students.forEach(function (s) {
        var c = s.schedule[w];
        if (c && ((c.clinical && !c.clinicalMissed) || c.makeupClinical)) clinCount++;
      });
      var clinCell = footerClin.insertCell();
      clinCell.textContent = clinCount;
    }
  }

  function renderSimTable(data, students) {
    var tbody = document.getElementById('simTableBody');
    tbody.innerHTML = '';
    students.forEach(function (student) {
      var simCols = '';
      for (var n = 1; n <= 5; n++) {
        var found = '';
        student.schedule.forEach(function (cell, wi) {
          if (cell.sim === n) {
            found = App.CalendarEngine.getWeekDisplay(data, wi, true) + ' (' + (cell.simDay || 'Mon') + ')';
          }
        });
        simCols += '<td style="text-align:center">' + (found || '—') + '</td>';
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
      for (var sim = 1; sim <= 5; sim++) {
        simWeekdays.forEach(function (day) {
          max = Math.max(max, App.Scheduler.getSessionCount(data, w, sim, day));
        });
      }
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

    var gf = document.getElementById('groupFilter');
    var groupVal = gf.value;
    gf.innerHTML = '<option value="all">All Clinical Groups</option>';
    App.DataModel.getClinicalGroups(cfg).forEach(function (g) {
      var day = App.DataModel.getClinicalDayForGroup(g, cfg);
      gf.innerHTML += '<option value="' + g + '">' + g + ' (' + day + ')</option>';
    });
    if (groupVal && gf.querySelector('option[value="' + groupVal + '"]')) gf.value = groupVal;

    var sgf = document.getElementById('simGroupFilter');
    var simVal = sgf.value;
    sgf.innerHTML = '<option value="all">All Sim Groups</option>';
    App.DataModel.getSimGroups(cfg).forEach(function (g) {
      sgf.innerHTML += '<option value="' + g + '">' + g + '</option>';
    });
    if (simVal && sgf.querySelector('option[value="' + simVal + '"]')) sgf.value = simVal;

    var sf = document.getElementById('sectionFilter');
    var sectionVal = sf.value;
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

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function init() {
    ['groupFilter', 'simGroupFilter', 'sectionFilter', 'studentSearch', 'weekFilter'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () { App.UI.refresh(); });
      if (el && id === 'studentSearch') el.addEventListener('keyup', function () { App.UI.refresh(); });
    });
  }

  return { render: render, populateFilters: populateFilters, init: init, renderCellHtml: renderCellHtml };
})();
