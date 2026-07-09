/**
 * Lecture Assignments table view.
 */

import * as TheoryData from '../../core/theory-data.js';
import * as UserSession from '../../auth/user-session.js';
import { formatDisplayDate } from '../../core/calendar-engine.js';

export function render(data) {
  var tbody = document.getElementById('theoryLectureTableBody');
  var filterEl = document.getElementById('theoryLectureMyFilter');
  if (!tbody || !data.theory) return;
  var options = {};
  if (filterEl && filterEl.checked) {
    var session = UserSession.getSession();
    if (session && session.name) options.facultyFilter = session.name;
  }
  var rows = TheoryData.projectLectureAssignments(data.theory, options);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted">No lecture assignments in this term.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function (r) {
    return '<tr><td>' + r.week + '</td><td>' + formatDisplayDate(r.date) + '</td><td>' + r.weekday +
      '</td><td>' + esc(r.topic) + '</td><td>' + esc(r.lecturer) + '</td><td>' + esc(r.skillsLab) + '</td></tr>';
  }).join('');
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

export function init() {
  var filter = document.getElementById('theoryLectureMyFilter');
  if (filter) {
    filter.addEventListener('change', function () {
      var data = document.getElementById('theoryLectureTableBody');
      if (data) {
        import('../chrome.js').then(function (m) { m.refresh(); });
      }
    });
  }
}
