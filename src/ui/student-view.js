/**
 * Per-student schedule view tab — Clinical and Sim Summary / Detailed Weekly.
 */

import { getData } from '../core/state.js';
import { refresh } from './chrome.js';
import * as DataModel from '../core/data-model/index.js';
import * as ClinicalSites from '../core/clinical-sites.js';
import { buildCalendarHtml } from '../export/student-calendar-html.js';
import { promptBatchExport } from '../export/student-calendar-batch.js';
import { exportStudentIcs } from '../export/student-calendar-ics.js';
import { showAlert } from './dialogs.js';

function selectedCalendarType() {
  var el = document.getElementById('studentCalendarType');
  return el && el.value === 'detailed' ? 'detailed' : 'summary';
}

function selectedStudent(data) {
  var select = document.getElementById('studentViewSelect');
  if (!select || !select.value || !data || !data.students) return null;
  return data.students.find(function (s) { return s.id === select.value; }) || null;
}

function clinicalGroupFilterLabel(data, group) {
  var day = DataModel.getClinicalDayForGroup(group, data.config);
  var siteLabel = '';
  var facId = ClinicalSites.getPrimaryGroupFacility(data, group);
  if (facId) {
    var fac = DataModel.findFacilityById(data, facId);
    if (fac) siteLabel = fac.shortName || fac.name || '';
  }
  return [group, day, siteLabel].filter(Boolean).join(' ');
}

function populateStudentFilters(data) {
  var clinEl = document.getElementById('studentClinicalGroupFilter');
  var simEl = document.getElementById('studentSimGroupFilter');
  if (clinEl) {
    var prevClin = clinEl.value || 'all';
    clinEl.innerHTML = '<option value="all">All clinical groups</option>';
    DataModel.getClinicalGroups(data.config).forEach(function (g) {
      clinEl.innerHTML += '<option value="' + g + '">' + clinicalGroupFilterLabel(data, g) + '</option>';
    });
    if (prevClin && (prevClin === 'all' || DataModel.getClinicalGroups(data.config).indexOf(prevClin) >= 0)) {
      clinEl.value = prevClin;
    }
  }
  if (simEl) {
    var prevSim = simEl.value || 'all';
    simEl.innerHTML = '<option value="all">All sim groups</option>';
    DataModel.getSimGroups(data.config).forEach(function (sg) {
      simEl.innerHTML += '<option value="' + sg + '">' + sg + '</option>';
    });
    if (prevSim && (prevSim === 'all' || DataModel.getSimGroups(data.config).indexOf(prevSim) >= 0)) {
      simEl.value = prevSim;
    }
  }
}

function filteredStudents(data) {
  var clinEl = document.getElementById('studentClinicalGroupFilter');
  var simEl = document.getElementById('studentSimGroupFilter');
  var searchEl = document.getElementById('studentNameSearch');
  var clin = clinEl ? clinEl.value : 'all';
  var sim = simEl ? simEl.value : 'all';
  var q = searchEl ? String(searchEl.value || '').trim().toLowerCase() : '';
  return (data.students || []).filter(function (s) {
    if (clin && clin !== 'all' && s.clinicalGroup !== clin) return false;
    if (sim && sim !== 'all' && s.simGroup !== sim) return false;
    if (q) {
      var hay = [
        s.name,
        s.lastName,
        s.firstName,
        [s.lastName, s.firstName].filter(Boolean).join(' ')
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
}

function syncActionButtons(hasStudent) {
  var printBtn = document.getElementById('printStudentBtn');
  var icsBtn = document.getElementById('exportStudentIcsBtn');
  if (printBtn) {
    printBtn.disabled = !hasStudent;
    printBtn.title = hasStudent
      ? 'Print selected student calendar'
      : 'Select a student to print their calendar';
  }
  if (icsBtn) {
    icsBtn.disabled = !hasStudent;
    icsBtn.title = hasStudent
      ? 'Export Outlook/iCal (.ics) calendar for selected student'
      : 'Select a student to export an Outlook/iCal calendar';
  }
}

function render(data) {
  var select = document.getElementById('studentViewSelect');
  var container = document.getElementById('studentCalendarPrint');
  if (!select || !container) return;

  populateStudentFilters(data);

  var prev = select.value;
  var list = filteredStudents(data);
  select.innerHTML = '<option value="">Select student...</option>';
  list.forEach(function (s) {
    select.innerHTML += '<option value="' + s.id + '">' + s.name + ' (' + s.clinicalGroup + ')</option>';
  });
  if (prev && list.some(function (s) { return s.id === prev; })) select.value = prev;
  else select.value = '';

  var student = selectedStudent(data);
  syncActionButtons(!!student);
  if (!student) {
    container.innerHTML = '<p class="section-sub">Select a student to view their calendar.</p>';
    return;
  }

  var showMarkup = document.getElementById('showMarkupToggle');
  var markup = showMarkup ? showMarkup.checked : false;
  container.innerHTML = buildCalendarHtml(data, student, selectedCalendarType(), {
    showMarkup: markup
  });
}

function init() {
  var select = document.getElementById('studentViewSelect');
  if (select) select.addEventListener('change', function () { refresh(); });
  ['studentClinicalGroupFilter', 'studentSimGroupFilter'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function () { refresh(); });
  });
  var search = document.getElementById('studentNameSearch');
  if (search) {
    search.addEventListener('input', function () { refresh(); });
  }
  var markup = document.getElementById('showMarkupToggle');
  if (markup) markup.addEventListener('change', function () { refresh(); });
  var typeEl = document.getElementById('studentCalendarType');
  if (typeEl) typeEl.addEventListener('change', function () { refresh(); });
  var printBtn = document.getElementById('printStudentBtn');
  if (printBtn) {
    printBtn.disabled = true;
    printBtn.title = 'Select a student to print their calendar';
    printBtn.addEventListener('click', function () {
      var sel = document.getElementById('studentViewSelect');
      if (!sel || !sel.value) return;
      window.print();
    });
  }
  var icsBtn = document.getElementById('exportStudentIcsBtn');
  if (icsBtn) {
    icsBtn.disabled = true;
    icsBtn.title = 'Select a student to export an Outlook/iCal calendar';
    icsBtn.addEventListener('click', function () {
      var data = getData();
      var student = selectedStudent(data);
      if (!student) {
        showAlert('Select a student', 'Choose a student before exporting an .ics calendar.');
        return;
      }
      var result = exportStudentIcs(data, student);
      if (result) {
        showAlert('Calendar exported',
          'Downloaded ' + result.filename +
          '.\n\nOpen the file in Outlook, Apple Calendar, or Google Calendar to import events.');
      }
    });
  }
  var batchBtn = document.getElementById('batchExportStudentCalBtn');
  if (batchBtn) {
    batchBtn.addEventListener('click', function () {
      promptBatchExport(getData());
    });
  }
}

export {
  render,
  init
};
