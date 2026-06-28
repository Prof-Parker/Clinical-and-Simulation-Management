/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.StudentView = (function () {
  function render(data) {
    var select = document.getElementById('studentViewSelect');
    var container = document.getElementById('studentCalendarPrint');
    if (!select || !container) return;

    var prev = select.value;
    select.innerHTML = '<option value="">Select student...</option>';
    data.students.forEach(function (s) {
      select.innerHTML += '<option value="' + s.id + '">' + s.name + ' (' + s.clinicalGroup + ')</option>';
    });
    if (prev && data.students.some(function (s) { return s.id === prev; })) select.value = prev;

    var sid = select.value;
    if (!sid) {
      container.innerHTML = '<p class="section-sub">Select a student to view their 18-week calendar.</p>';
      return;
    }

    var student = data.students.find(function (s) { return s.id === sid; });
    if (!student) return;

    var showMarkup = document.getElementById('showMarkupToggle').checked;
    var vr = App.Validator.validateStudent(student, data);
    var cfg = data.config;

    var html = '<div class="print-student-calendar card" style="padding:1.25rem">' +
      '<h2 style="margin:0 0 0.25rem">' + esc(student.name) + '</h2>' +
      '<p class="section-sub">' + student.clinicalGroup + ' · ' + (student.section || 'No section') + ' · ' +
      'Clinical: ' + vr.stats.clinicals + '/' + cfg.clinicalDaysRequired + ' · Sim: ' + vr.stats.sims + '/' + cfg.simDaysRequired + '</p>' +
      '<table class="data-table"><thead><tr><th>Week</th><th>Date</th><th>Activity</th></tr></thead><tbody>';

    for (var i = 0; i < 18; i++) {
      var cell = student.schedule[i];
      var week = data.calendar.weeks[i];
      var rowCls = '';
      var activity = '—';
      if (cell.inactive) activity = 'Holiday / Break';
      else if (cell.makeupClinical) activity = 'Makeup Clinical';
      else {
        var parts = [];
        if (cell.clinicalMissed && showMarkup) rowCls = 'markup-missed';
        if (cell.makeupClinical && showMarkup) rowCls = 'markup-makeup';
        if (cell.clinical || cell.clinicalMissed) {
          parts.push('Clinical (' + App.DataModel.getClinicalDayForGroup(student.clinicalGroup, cfg) + ')' + (cell.clinicalMissed ? ' [MISSED]' : ''));
        }
        if (cell.sim) parts.push('Simulation ' + cell.sim + ' (' + (cell.simDay || 'Mon') + ')');
        activity = parts.join(' + ') || '—';
      }
      html += '<tr class="' + rowCls + '"><td>Week ' + (i + 1) + '</td><td>' +
        (week ? App.CalendarEngine.formatDisplayDate(week.startDate) : '') + '</td><td>' + activity + '</td></tr>';
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function init() {
    document.getElementById('studentViewSelect').addEventListener('change', function () { App.UI.refresh(); });
    document.getElementById('showMarkupToggle').addEventListener('change', function () { App.UI.refresh(); });
    document.getElementById('printStudentBtn').addEventListener('click', function () { window.print(); });
  }

  return { render: render, init: init };
})();
