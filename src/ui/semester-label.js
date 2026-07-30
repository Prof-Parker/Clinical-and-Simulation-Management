/**
 * Semester season/year label HTML shared by header status and semester picker.
 */

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

var COURSE_STATUS_CHEVRON =
  '<svg class="course-status-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2.5" aria-hidden="true">' +
  '<path stroke-linecap="round" d="M6 9l6 6 6-6"/></svg>';

export function buildSemesterLabelHtml(parts) {
  var draftTip = 'Information for this semester hasn\'t been finalized yet, proceed with caution';
  var html = '<span class="semester-label-inner">';
  if (parts.season) {
    var seasonLabel = parts.season === 'fall' ? 'Fall' : 'Spring';
    html += '<span class="season-name season-' + parts.season + '">' + seasonLabel + '</span>';
    html += '<span class="season-year">' + esc(parts.year) + '</span>';
  } else {
    html += '<span class="season-year">' + esc(parts.name || 'Semester') + '</span>';
  }
  if (!parts.finalized) {
    html += '<span class="semester-draft" title="' + draftTip + '">*</span>';
  }
  html += '</span>';
  return html;
}

/** Course-switcher row only — semester lives in #semesterPickerBtn. */
export function buildCourseStatusHtml(parts, code, phase) {
  var value = esc(code || '—');
  var phaseText = String(phase || '').replace(/_/g, ' ').trim();
  if (phaseText) value += ' · ' + esc(phaseText);
  return '<span class="course-status-context">' +
    '<span class="course-status-context-label">Switch course</span>' +
    '<span class="course-status-context-row">' +
    '<span class="course-status-context-value">' + value + '</span>' +
    COURSE_STATUS_CHEVRON +
    '</span></span>';
}

export function courseStatusAriaLabel(parts, code, phase) {
  var label = 'Switch course, ' + (code || '—');
  var phaseText = String(phase || '').replace(/_/g, ' ').trim();
  if (phaseText) label += ', ' + phaseText;
  return label;
}
