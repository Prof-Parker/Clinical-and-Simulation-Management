/**
 * Power Automate email JSON for student calendar batch export.
 */

function applyTemplate(template, fields) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, function (_, key) {
    return fields[key] != null ? String(fields[key]) : '';
  });
}

var DEFAULT_SUBJECT = '{{semesterName}} — Your {{calendarType}} calendar';

var DEFAULT_BODY =
  'Hello {{studentName}},\n\n' +
  'Attached is your {{calendarType}} for {{semesterName}} ' +
  '(PDF and Outlook/iCal .ics calendar).\n' +
  'Please review clinical, simulation, lecture, skills lab, and assignment dates.\n\n' +
  'Thank you,\n{{leadFacultyName}}';

function buildEmailRows(students, opts) {
  opts = opts || {};
  var subjectTpl = opts.subjectTemplate || DEFAULT_SUBJECT;
  var bodyTpl = opts.bodyTemplate || DEFAULT_BODY;
  var calendarTypeLabel = opts.calendarType === 'detailed'
    ? 'Detailed Weekly'
    : 'Clinical and Sim Summary';
  var semesterName = opts.semesterName || '';
  var leadFacultyName = opts.leadFacultyName || '';
  var attachmentFor = opts.attachmentFor || function () { return ''; };
  var icsFor = opts.icsFor || function () { return ''; };

  return (students || []).map(function (s) {
    var attachmentName = attachmentFor(s);
    var icsName = icsFor(s);
    var fields = {
      studentName: s.name || '',
      email: s.email || '',
      semesterName: semesterName,
      calendarType: calendarTypeLabel,
      attachmentName: attachmentName,
      icsFilename: icsName,
      clinicalGroup: s.clinicalGroup || '',
      simGroup: s.simGroup || '',
      section: s.section || '',
      leadFacultyName: leadFacultyName
    };
    return {
      Email: s.email || '',
      StudentName: s.name || '',
      Subject: applyTemplate(subjectTpl, fields),
      Body: applyTemplate(bodyTpl, fields),
      AttachmentFilename: attachmentName,
      IcsFilename: icsName,
      ClinicalGroup: s.clinicalGroup || '',
      SimGroup: s.simGroup || '',
      Section: s.section || ''
    };
  });
}

/**
 * Serialize email rows as JSON for Power Automate "Parse JSON".
 * Wrapped object (not a bare array) so Parse JSON + Apply to each is reliable.
 */
function rowsToJson(rows) {
  return JSON.stringify({ emails: rows || [] }, null, 2) + '\n';
}

export {
  applyTemplate,
  DEFAULT_SUBJECT,
  DEFAULT_BODY,
  buildEmailRows,
  rowsToJson
};
