/**
 * Power Automate email CSV for student calendar batch export.
 */

function csvEscape(value) {
  var s = String(value == null ? '' : value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function applyTemplate(template, fields) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, function (_, key) {
    return fields[key] != null ? String(fields[key]) : '';
  });
}

var DEFAULT_SUBJECT = '{{semesterName}} — Your {{calendarType}} calendar';

var DEFAULT_BODY =
  'Hello {{studentName}},\n\n' +
  'Attached is your {{calendarType}} for {{semesterName}}.\n' +
  'Please review clinical, simulation, orientation, and holiday dates.\n\n' +
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

  return (students || []).map(function (s) {
    var attachmentName = attachmentFor(s);
    var fields = {
      studentName: s.name || '',
      email: s.email || '',
      semesterName: semesterName,
      calendarType: calendarTypeLabel,
      attachmentName: attachmentName,
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
      ClinicalGroup: s.clinicalGroup || '',
      SimGroup: s.simGroup || '',
      Section: s.section || ''
    };
  });
}

function rowsToCsv(rows) {
  var headers = [
    'Email', 'StudentName', 'Subject', 'Body', 'AttachmentFilename',
    'ClinicalGroup', 'SimGroup', 'Section'
  ];
  var lines = [headers.join(',')];
  (rows || []).forEach(function (row) {
    lines.push(headers.map(function (h) { return csvEscape(row[h]); }).join(','));
  });
  // UTF-8 BOM helps Excel / Power Automate recognize encoding
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export {
  csvEscape,
  applyTemplate,
  DEFAULT_SUBJECT,
  DEFAULT_BODY,
  buildEmailRows,
  rowsToCsv
};
