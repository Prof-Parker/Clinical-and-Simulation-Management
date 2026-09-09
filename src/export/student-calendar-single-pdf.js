/**
 * Download one student's calendar as a PDF using the batch export pipeline
 * (off-screen light-theme render → html2canvas → jsPDF), so a single print
 * matches the layout of the files produced by Batch export.
 */

import * as CalendarEngine from '../core/calendar-engine.js';
import { buildCalendarHtml } from './student-calendar-html.js';
import { htmlToPdfBlob } from './student-calendar-pdf.js';
import { attachmentFilename } from './student-calendar-batch.js';

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

/**
 * @param {object} options - { calendarType: 'summary'|'detailed', showMarkup: boolean }
 * @returns {Promise<{filename: string, blob: Blob}|null>}
 */
function exportStudentCalendarPdf(semester, student, options) {
  options = options || {};
  if (!semester || !student) return Promise.resolve(null);
  if (!semester.calendar || !semester.calendar.weeks || !semester.calendar.weeks.length) {
    CalendarEngine.rebuildWeeks(semester);
  }
  var calendarType = options.calendarType === 'detailed' ? 'detailed' : 'summary';
  var html = buildCalendarHtml(semester, student, calendarType, {
    showMarkup: !!options.showMarkup
  });
  var filename = attachmentFilename(semester, student, calendarType);
  return htmlToPdfBlob(html).then(function (blob) {
    downloadBlob(blob, filename);
    return { filename: filename, blob: blob };
  });
}

export {
  exportStudentCalendarPdf
};
