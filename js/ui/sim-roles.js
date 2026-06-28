/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.SimRoles = (function () {
  var SIM_WEEKS = {
    1: { MonA: 4, TueA: 4, MonB: 5, TueB: 5 },
    2: { MonA: 6, TueA: 6, MonB: 7, TueB: 7 },
    3: { MonA: 8, TueA: 8, MonB: 9, TueB: 9 },
    4: { MonA: 10, TueA: 10, MonB: 11, TueB: 11 },
    5: { MonA: 12, TueA: 12, MonB: 14, TueB: 14 }
  };

  function getRoles(studentId) {
    var data = App.getData();
    if (!data.roles[studentId]) data.roles[studentId] = { flags: { primary: null, secondary: null } };
    return data.roles[studentId];
  }

  function getCumulative(studentId) {
    var data = App.getData();
    var counts = { Primary: 0, Secondary: 0, Evaluator: 0, Scribe: 0 };
    var rd = data.roles[studentId];
    if (!rd) return counts;
    Object.keys(rd).forEach(function (simKey) {
      if (simKey === 'flags') return;
      var sim = rd[simKey];
      Object.keys(sim).forEach(function (iter) {
        var role = sim[iter];
        if (counts[role] !== undefined) counts[role]++;
      });
    });
    return counts;
  }

  function render(data) {
    var simNum = document.getElementById('roleSimSelect').value;
    var groupCode = document.getElementById('roleGroupSelect').value;
    var tbody = document.getElementById('roleTableBody');
    tbody.innerHTML = '';

    var weekIdx = SIM_WEEKS[simNum][groupCode];
    var targetDay = groupCode.indexOf('Mon') === 0 ? 'Mon' : 'Tue';
    var sessionStudents = [];

    data.students.forEach(function (student) {
      var cell = student.schedule[weekIdx];
      if (cell && cell.sim == simNum && cell.simDay === targetDay) {
        sessionStudents.push(student);
      }
    });

    if (!sessionStudents.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-muted)">No students in this session.</td></tr>';
      return;
    }

    sessionStudents.forEach(function (student) {
      var counts = getCumulative(student.id);
      var sRoles = getRoles(student.id);
      if (!sRoles[simNum]) sRoles[simNum] = {};
      var flagPri = (sRoles.flags && sRoles.flags.primary) || '';
      var flagSec = (sRoles.flags && sRoles.flags.secondary) || '';
      var rowCls = flagPri === 'high' || flagSec === 'high' ? 'flag-high' : (flagPri === 'weak' || flagSec === 'weak' ? 'flag-weak' : '');

      var tr = document.createElement('tr');
      if (rowCls) tr.className = rowCls;
      var html = '<td class="sticky-col"><strong>' + esc(student.name) + '</strong><br><small>' + student.clinicalGroup + '</small></td>' +
        '<td style="text-align:center">' + counts.Primary + '</td>' +
        '<td style="text-align:center">' + counts.Secondary + '</td>' +
        '<td style="text-align:center">' + counts.Evaluator + '</td>' +
        '<td style="text-align:center">' + counts.Scribe + '</td>';

      for (var i = 1; i <= 4; i++) {
        var cur = sRoles[simNum]['iter' + i] || '';
        html += '<td><select class="role-select" data-student="' + student.id + '" data-sim="' + simNum + '" data-iter="iter' + i + '">';
        App.DataModel.ROLE_OPTIONS.forEach(function (r) {
          html += '<option value="' + r + '"' + (r === cur ? ' selected' : '') + '>' + (r || '—') + '</option>';
        });
        html += '</select></td>';
      }

      html += '<td><select class="flag-select" data-student="' + student.id + '" data-flag="primary">' +
        flagOptions(flagPri) + '</select></td>' +
        '<td><select class="flag-select" data-student="' + student.id + '" data-flag="secondary">' +
        flagOptions(flagSec) + '</select></td>';

      tr.innerHTML = html;
      tbody.appendChild(tr);
    });
  }

  function flagOptions(cur) {
    return ['', 'high', 'weak'].map(function (v) {
      var label = v === 'high' ? 'Strong' : v === 'weak' ? 'Weaker' : 'None';
      return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + label + '</option>';
    }).join('');
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function init() {
    document.getElementById('roleSimSelect').addEventListener('change', function () { App.UI.refresh(); });
    document.getElementById('roleGroupSelect').addEventListener('change', function () { App.UI.refresh(); });

    document.getElementById('roleTableBody').addEventListener('change', function (e) {
      var el = e.target;
      var data = App.getData();
      if (el.classList.contains('role-select')) {
        var rd = getRoles(el.dataset.student);
        if (!rd[el.dataset.sim]) rd[el.dataset.sim] = {};
        rd[el.dataset.sim][el.dataset.iter] = el.value;
        App.notifyChange();
        App.UI.SimRoles.render(data);
      }
      if (el.classList.contains('flag-select')) {
        var rdf = getRoles(el.dataset.student);
        if (!rdf.flags) rdf.flags = { primary: null, secondary: null };
        rdf.flags[el.dataset.flag] = el.value || null;
        App.notifyChange();
        App.UI.SimRoles.render(data);
      }
    });
  }

  return { render: render, init: init };
})();
