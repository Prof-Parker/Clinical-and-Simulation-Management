/**
 * Per-student schedule view tab — Clinical and Sim Summary / Detailed Weekly.
 */

import { getData } from '../core/state.js';
import { refresh } from './chrome.js';
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

  var prev = select.value;
  select.innerHTML = '<option value="">Select student...</option>';
  data.students.forEach(function (s) {
    select.innerHTML += '<option value="' + s.id + '">' + s.name + ' (' + s.clinicalGroup + ')</option>';
  });
  if (prev && data.students.some(function (s) { return s.id === prev; })) select.value = prev;

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
