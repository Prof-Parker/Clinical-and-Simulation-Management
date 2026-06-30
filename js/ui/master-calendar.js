/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.MasterCalendar = (function () {
  function clinicalFacilitySelectHtml(data, student, weekIndex, cell) {
    var allowed = App.ClinicalSites
      ? App.ClinicalSites.getGroupFacilities(data, student.clinicalGroup)
      : [];
    if (!allowed.length && student.facilityId) allowed = [student.facilityId];
    var selected = (cell && cell.facilityId) ||
      (App.ClinicalSites
        ? App.ClinicalSites.resolveFacilityForWeek(data, student.clinicalGroup, weekIndex, 0)
        : student.facilityId);
    var html = '<label>Clinical site: <select id="editClinFacility">';
    allowed.forEach(function (facId) {
      var fac = App.DataModel.findFacilityById(data, facId);
      var name = fac ? fac.name : facId;
      html += '<option value="' + facId + '"' +
        (App.DataModel.sameFacilitySite(data, selected, facId) ? ' selected' : '') + '>' +
        name + '</option>';
    });
    html += '</select></label><br>';
    return html;
  }

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
    var isOrientWeek = App.Orientation && App.Orientation.isOrientationWeek(data, student, weekIndex);
    var orientChecked = isOrientWeek ? 'checked' : '';
    var groupOrient = App.Orientation && App.Orientation.getGroupOrientation(data, student.clinicalGroup);
    var usingGroupDefault = groupOrient && groupOrient.date &&
      (student.orientationWeekIndex == null || student.orientationWeekIndex === undefined) &&
      isOrientWeek;
    var orientHint = usingGroupDefault
      ? '<p class="section-sub" style="margin:0.25rem 0 0.75rem">Group default — save on another week to move orientation.</p>'
      : '';

    var html =
      '<p><strong>' + student.name + '</strong> — Week ' + (weekIndex + 1) + '</p>' +
      '<div class="dialog-check-list">' +
      '<label class="filter-check" for="editOrientation"><input type="checkbox" id="editOrientation" ' + orientChecked + '> Orientation day</label>' +
      orientHint +
      '<label class="filter-check" for="editClin"><input type="checkbox" id="editClin" ' + clinChecked + '> Clinical</label>' +
      '<label class="filter-check" for="editMissed"><input type="checkbox" id="editMissed" ' + missedChecked + '> Missed clinical</label>' +
      '<label class="filter-check" for="editMakeup"><input type="checkbox" id="editMakeup" ' + makeupChecked + '> Makeup clinical</label>' +
      '</div>' +
      clinicalFacilitySelectHtml(data, student, weekIndex, cell) +
      '<label>Sim: <select id="editSim"><option value="">None</option>';
    for (var i = 1; i <= 5; i++) {
      html += '<option value="' + i + '"' + (simVal == i ? ' selected' : '') + '>Sim ' + i + '</option>';
    }
    html += '</select></label><br>' +
      '<label>Sim day: <select id="editSimDay"><option value="Mon"' + (simDay === 'Mon' ? ' selected' : '') + '>Monday</option>' +
      '<option value="Tue"' + (simDay === 'Tue' ? ' selected' : '') + '>Tuesday</option></select></label>';

    App.UI.showDialog('Edit Schedule Cell', html, function () {
      var orientOn = document.getElementById('editOrientation').checked;
      if (orientOn) {
        student.orientationWeekIndex = weekIndex;
      } else if (App.Orientation && App.Orientation.isOrientationWeek(data, student, weekIndex)) {
        student.orientationWeekIndex = null;
      }
      cell.clinical = document.getElementById('editClin').checked;
      cell.clinicalMissed = document.getElementById('editMissed').checked;
      cell.makeupClinical = document.getElementById('editMakeup').checked;
      var facEl = document.getElementById('editClinFacility');
      if (facEl && (cell.clinical || cell.makeupClinical)) {
        cell.facilityId = facEl.value || null;
      } else if (!cell.clinical && !cell.makeupClinical) {
        cell.facilityId = null;
      }
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
