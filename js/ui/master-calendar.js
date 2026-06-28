/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.MasterCalendar = (function () {
  function openCellEditor(studentId, weekIndex) {
    var data = App.getData();
    var student = data.students.find(function (s) { return s.id === studentId; });
    if (!student) return;
    var cell = student.schedule[weekIndex];
    if (cell.inactive) return;

    var simVal = cell.sim || '';
    var clinChecked = cell.clinical ? 'checked' : '';
    var missedChecked = cell.clinicalMissed ? 'checked' : '';
    var makeupChecked = cell.makeupClinical ? 'checked' : '';
    var simDay = cell.simDay || 'Mon';

    var html =
      '<p><strong>' + student.name + '</strong> — Week ' + (weekIndex + 1) + '</p>' +
      '<label><input type="checkbox" id="editClin" ' + clinChecked + '> Clinical</label><br>' +
      '<label><input type="checkbox" id="editMissed" ' + missedChecked + '> Missed clinical</label><br>' +
      '<label><input type="checkbox" id="editMakeup" ' + makeupChecked + '> Makeup clinical</label><br>' +
      '<label>Sim: <select id="editSim"><option value="">None</option>';
    for (var i = 1; i <= 5; i++) {
      html += '<option value="' + i + '"' + (simVal == i ? ' selected' : '') + '>Sim ' + i + '</option>';
    }
    html += '</select></label><br>' +
      '<label>Sim day: <select id="editSimDay"><option value="Mon"' + (simDay === 'Mon' ? ' selected' : '') + '>Monday</option>' +
      '<option value="Tue"' + (simDay === 'Tue' ? ' selected' : '') + '>Tuesday</option></select></label>';

    App.UI.showDialog('Edit Schedule Cell', html, function () {
      cell.clinical = document.getElementById('editClin').checked;
      cell.clinicalMissed = document.getElementById('editMissed').checked;
      cell.makeupClinical = document.getElementById('editMakeup').checked;
      var sv = document.getElementById('editSim').value;
      cell.sim = sv ? parseInt(sv, 10) : null;
      cell.simDay = document.getElementById('editSimDay').value;
      cell.simMakeup = false;
      cell.simOverload = false;
      App.notifyChange();
      App.UI.refresh();
    });
  }

  function init() {
    document.addEventListener('click', function (e) {
      var td = e.target.closest('.cell-editable');
      if (!td || !td.dataset.student) return;
      openCellEditor(td.dataset.student, parseInt(td.dataset.week, 10));
    });
  }

  return { init: init, openCellEditor: openCellEditor };
})();
