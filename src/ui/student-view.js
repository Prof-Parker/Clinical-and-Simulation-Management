/**
 * Per-student schedule view tab — Clinical and Sim Summary / Detailed Weekly.
 */

import { getData } from '../core/state.js';
import { refresh } from './chrome.js';
import { buildCalendarHtml } from '../export/student-calendar-html.js';
import { promptBatchExport } from '../export/student-calendar-batch.js';

function selectedCalendarType() {
  var el = document.getElementById('studentCalendarType');
  return el && el.value === 'detailed' ? 'detailed' : 'summary';
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

  var sid = select.value;
  if (!sid) {
    container.innerHTML = '<p class="section-sub">Select a student to view their calendar.</p>';
    return;
  }

  var student = data.students.find(function (s) { return s.id === sid; });
  if (!student) return;

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
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
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
