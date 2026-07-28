/**
 * Batch export student calendars as ZIP (PDFs + ICS + Power Automate CSV).
 */

import JSZip from 'jszip';
import { getData } from '../core/state.js';
import * as DataModel from '../core/data-model/index.js';
import * as CalendarEngine from '../core/calendar-engine.js';
import { showAlert, showDialog } from '../ui/dialogs.js';
import { canAction } from '../auth/permissions.js';
import { buildCalendarHtml } from './student-calendar-html.js';
import {
  DEFAULT_SUBJECT, DEFAULT_BODY, buildEmailRows, rowsToCsv
} from './power-automate-csv.js';
import { htmlToPdfBlob } from './student-calendar-pdf.js';
import { buildStudentIcs, icsFilename } from './student-calendar-ics.js';

function slugName(name) {
  return String(name || 'student')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'student';
}

function attachmentFilename(semester, student, calendarType) {
  var meta = semester.meta || {};
  var season = meta.semesterSeason === 'fall' ? 'Fall' : 'Spring';
  var year = meta.semesterYear || '';
  var course = meta.courseId || 'COURSE';
  var kind = calendarType === 'detailed' ? 'detailed' : 'summary';
  var idTail = String(student.id || '').slice(-6);
  return course + '_' + season + year + '_' + slugName(student.name) +
    '_' + idTail + '_' + kind + '.pdf';
}

function filterStudents(semester, filter) {
  filter = filter || { mode: 'all' };
  var list = (semester.students || []).slice().sort(function (a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  if (filter.mode === 'simGroup') {
    return list.filter(function (s) { return s.simGroup === filter.value; });
  }
  if (filter.mode === 'clinicalGroup') {
    return list.filter(function (s) { return s.clinicalGroup === filter.value; });
  }
  if (filter.mode === 'section') {
    return list.filter(function (s) { return s.section === filter.value; });
  }
  return list;
}

function onedriveReadme(semester, calendarType) {
  var meta = semester.meta || {};
  var course = meta.courseId || 'COURSE';
  var season = meta.semesterSeason === 'fall' ? 'Fall' : 'Spring';
  var year = meta.semesterYear || '';
  var date = new Date().toISOString().slice(0, 10);
  return [
    'Student calendar batch export',
    '============================',
    '',
    'Suggested OneDrive folder:',
    'Student Calendar Mailings/' + course + '/' + season + year + '/' + date + '/',
    '',
    'Contents:',
    '  power-automate-email.csv  — import rows into Power Automate',
    '  pdfs/                     — one PDF per student (' + calendarType + ')',
    '  ics/                      — one Outlook/iCal .ics calendar per student',
    '',
    'Power Automate sketch:',
    '  1. Place this folder in OneDrive/SharePoint.',
    '  2. For each CSV row: send Outlook email To=Email, Subject, Body.',
    '  3. Attach pdfs/{AttachmentFilename} and ics/{IcsFilename} from this folder.',
    '',
    'See docs/POWER_AUTOMATE_STUDENT_CALENDARS.md in the app repository.',
    ''
  ].join('\n');
}

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}

function zipFilename(semester, calendarType) {
  var meta = semester.meta || {};
  var season = meta.semesterSeason === 'fall' ? 'Fall' : 'Spring';
  var kind = calendarType === 'detailed' ? 'detailed' : 'summary';
  return 'student-calendars-' + (meta.courseId || 'COURSE') + '-' +
    season + (meta.semesterYear || '') + '-' + kind + '-' +
    new Date().toISOString().slice(0, 10) + '.zip';
}

function buildZip(semester, students, calendarType, emailOpts, showMarkup) {
  var zip = new JSZip();
  var folderName = zipFilename(semester, calendarType).replace(/\.zip$/, '');
  var root = zip.folder(folderName);
  var pdfs = root.folder('pdfs');
  var icsFolder = root.folder('ics');
  var rows = buildEmailRows(students, {
    calendarType: calendarType,
    semesterName: (semester.meta && semester.meta.semesterName) || '',
    leadFacultyName: (semester.meta && semester.meta.leadFaculty && semester.meta.leadFaculty.name) || '',
    subjectTemplate: emailOpts.subjectTemplate,
    bodyTemplate: emailOpts.bodyTemplate,
    attachmentFor: function (s) {
      return attachmentFilename(semester, s, calendarType);
    },
    icsFor: function (s) {
      return icsFilename(semester, s);
    }
  });
  root.file('power-automate-email.csv', rowsToCsv(rows));
  root.file('README-onedrive.txt', onedriveReadme(semester, calendarType));

  var chain = Promise.resolve();
  students.forEach(function (student) {
    chain = chain.then(function () {
      if (!semester.calendar.weeks || !semester.calendar.weeks.length) {
        CalendarEngine.rebuildWeeks(semester);
      }
      var html = buildCalendarHtml(semester, student, calendarType, { showMarkup: showMarkup });
      var name = attachmentFilename(semester, student, calendarType);
      icsFolder.file(icsFilename(semester, student), buildStudentIcs(semester, student));
      return htmlToPdfBlob(html).then(function (blob) {
        pdfs.file(name, blob);
      });
    });
  });

  return chain.then(function () {
    return zip.generateAsync({ type: 'blob' });
  }).then(function (blob) {
    return { blob: blob, filename: zipFilename(semester, calendarType), count: students.length };
  });
}

function filterOptionsHtml(semester) {
  var simOpts = DataModel.getSimGroups(semester.config).map(function (g) {
    return '<option value="' + g + '">' + g + '</option>';
  }).join('');
  var clinOpts = DataModel.getClinicalGroups(semester.config).map(function (g) {
    return '<option value="' + g + '">' + g + '</option>';
  }).join('');
  var secOpts = (semester.sections || []).map(function (s) {
    return '<option value="' + s.name + '">' + s.name + '</option>';
  }).join('');
  return '<label>Calendar type' +
    '<select id="batchCalType" class="select-control">' +
    '<option value="summary">Clinical and Sim Summary</option>' +
    '<option value="detailed">Detailed Weekly</option></select></label>' +
    '<label>Students' +
    '<select id="batchCalScope" class="select-control">' +
    '<option value="all">All students</option>' +
    '<option value="simGroup">Filter by sim group</option>' +
    '<option value="clinicalGroup">Filter by clinical group</option>' +
    '<option value="section">Filter by registrar section</option></select></label>' +
    '<label id="batchCalFilterWrap" class="hidden">Group / section' +
    '<select id="batchCalFilter" class="select-control"></select></label>' +
    '<div id="batchCalFilterData" class="hidden" ' +
    'data-sim="' + encodeURIComponent(simOpts) + '" ' +
    'data-clin="' + encodeURIComponent(clinOpts) + '" ' +
    'data-sec="' + encodeURIComponent(secOpts) + '"></div>' +
    '<label>Email subject' +
    '<input type="text" id="batchCalSubject" value="' + DEFAULT_SUBJECT.replace(/"/g, '&quot;') + '"></label>' +
    '<label>Email body' +
    '<textarea id="batchCalBody" rows="6">' + DEFAULT_BODY + '</textarea></label>' +
    '<p class="section-sub" id="batchCalPreview">Merge fields: {{studentName}}, {{email}}, {{semesterName}}, ' +
    '{{calendarType}}, {{attachmentName}}, {{icsFilename}}, {{clinicalGroup}}, {{simGroup}}, ' +
    '{{section}}, {{leadFacultyName}}</p>';
}

function bindBatchDialogUi(semester) {
  var scope = document.getElementById('batchCalScope');
  var wrap = document.getElementById('batchCalFilterWrap');
  var filter = document.getElementById('batchCalFilter');
  var dataEl = document.getElementById('batchCalFilterData');
  if (!scope || !wrap || !filter || !dataEl) return;

  function refreshFilter() {
    var mode = scope.value;
    var show = mode !== 'all';
    wrap.classList.toggle('hidden', !show);
    if (!show) return;
    var html = '';
    if (mode === 'simGroup') html = decodeURIComponent(dataEl.getAttribute('data-sim') || '');
    if (mode === 'clinicalGroup') html = decodeURIComponent(dataEl.getAttribute('data-clin') || '');
    if (mode === 'section') html = decodeURIComponent(dataEl.getAttribute('data-sec') || '');
    filter.innerHTML = html;
  }
  scope.addEventListener('change', refreshFilter);
  refreshFilter();

  function updatePreview() {
    var mode = scope.value;
    var students = filterStudents(semester, {
      mode: mode,
      value: filter.value
    });
    var missing = students.filter(function (s) { return !String(s.email || '').trim(); }).length;
    var el = document.getElementById('batchCalPreview');
    if (el) {
      el.textContent = students.length + ' student' + (students.length === 1 ? '' : 's') +
        (missing ? ' · ' + missing + ' missing email' : '') +
        '. Merge fields: {{studentName}}, {{semesterName}}, {{calendarType}}, {{attachmentName}}, …';
    }
  }
  scope.addEventListener('change', updatePreview);
  filter.addEventListener('change', updatePreview);
  updatePreview();
}

function promptBatchExport(semester) {
  if (!canAction('student.calendar.export')) {
    showAlert('Not allowed', 'Your role cannot export student calendars.');
    return;
  }
  semester = semester || getData();
  if (!semester || !semester.students || !semester.students.length) {
    showAlert('No students', 'Open a semester with a roster before exporting calendars.');
    return;
  }

  showDialog('Batch export student calendars', filterOptionsHtml(semester), function () {
    var typeEl = document.getElementById('batchCalType');
    var scopeEl = document.getElementById('batchCalScope');
    var filterEl = document.getElementById('batchCalFilter');
    var subjectEl = document.getElementById('batchCalSubject');
    var bodyEl = document.getElementById('batchCalBody');
    var calendarType = typeEl ? typeEl.value : 'summary';
    var mode = scopeEl ? scopeEl.value : 'all';
    var students = filterStudents(semester, {
      mode: mode,
      value: filterEl ? filterEl.value : ''
    });
    if (!students.length) {
      showAlert('No students', 'No students match the selected filter.');
      return;
    }
    var missing = students.filter(function (s) { return !String(s.email || '').trim(); });
    var markupEl = document.getElementById('showMarkupToggle');
    var showMarkup = markupEl ? !!markupEl.checked : false;
    var subject = subjectEl ? subjectEl.value : DEFAULT_SUBJECT;
    var body = bodyEl ? bodyEl.value : DEFAULT_BODY;
    var missingNote = missing.length
      ? missing.length + ' student(s) missing email (PDF included; blank Email in CSV).\n\n'
      : '';

    buildZip(semester, students, calendarType, {
      subjectTemplate: subject,
      bodyTemplate: body
    }, showMarkup).then(function (result) {
      downloadBlob(result.blob, result.filename);
      showAlert('Export ready',
        missingNote +
        'Downloaded ' + result.filename + ' (' + result.count +
        ' calendars).\n\nUnzip into OneDrive under Student Calendar Mailings/… ' +
        'and import power-automate-email.csv into your flow.');
    }).catch(function (err) {
      showAlert('Export failed', String(err && err.message || err));
    });
  });

  setTimeout(function () { bindBatchDialogUi(semester); }, 0);
}

export {
  slugName,
  attachmentFilename,
  filterStudents,
  buildZip,
  promptBatchExport,
  zipFilename
};
