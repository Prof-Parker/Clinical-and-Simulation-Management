/**
 * Faculty semester-at-a-glance PDF export.
 */

import { htmlToPdfBlob } from './student-calendar-pdf.js';
import { glanceEventsForUser, shortName } from '../ui/faculty/glance.js';
import { summarizeSlot } from '../proposals/schedule-proposals.js';
import { escapeHtml } from '../ui/dialogs.js';

function esc(s) {
  return escapeHtml(s == null ? '' : String(s));
}

function buildFacultyGlanceHtml(semester, session) {
  var events = glanceEventsForUser(semester, session);
  var name = (session && session.name) || 'Faculty';
  var semName = (semester.meta && semester.meta.semesterName) || 'Semester';
  var rows = events.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return 0;
  }).map(function (ev) {
    var sub = ev.substitute
      ? ' — Sub: ' + shortName(ev.substitute.coveringName)
      : '';
    return '<tr><td>' + esc(ev.date) + '</td><td>' +
      esc(summarizeSlot(ev.slot)) + esc(sub) + '</td></tr>';
  }).join('');
  return '<div class="faculty-pdf-root" style="font-family:Segoe UI,sans-serif;padding:16px;color:#111">' +
    '<h1 style="font-size:18px;margin:0 0 8px">Faculty Schedule — ' + esc(name) + '</h1>' +
    '<p style="margin:0 0 16px">' + esc(semName) + '</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    '<thead><tr><th style="text-align:left;border-bottom:1px solid #ccc">Date</th>' +
    '<th style="text-align:left;border-bottom:1px solid #ccc">Assignment</th></tr></thead>' +
    '<tbody>' + (rows || '<tr><td colspan="2">No assignments</td></tr>') +
    '</tbody></table></div>';
}

function downloadFacultyPdf(semester, session, filename) {
  var html = buildFacultyGlanceHtml(semester, session);
  return htmlToPdfBlob(html).then(function (blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'faculty-schedule.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
}

export {
  buildFacultyGlanceHtml,
  downloadFacultyPdf
};
