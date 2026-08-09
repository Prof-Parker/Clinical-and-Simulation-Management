/** Dashboard scheduling-conflicts panel rendering. */

var CONFLICT_MSG_KEYS = [
  'groupErrors', 'simSessions', 'clinicalSessions', 'doubleBooking',
  'orientationConflicts', 'simClinicalConflicts', 'simGroupExceptions',
  'simWeekOrder', 'programSimWeeks', 'studentSimParticipation', 'simBlockNoRepeat'
];

export function renderConflictsPanel(conflictsEl, validation, escapeHtml) {
  if (!conflictsEl) return;
  var msgs = [];
  CONFLICT_MSG_KEYS.forEach(function (key) {
    (validation[key] || []).forEach(function (v) {
      msgs.push(typeof v === 'string' ? v : v.message);
    });
  });
  if (!msgs.length) {
    conflictsEl.classList.add('hidden');
    return;
  }
  conflictsEl.classList.remove('hidden');
  conflictsEl.innerHTML = '<strong>Scheduling conflicts:</strong><ul><li>' +
    msgs.map(escapeHtml).join('</li><li>') + '</li></ul>';
}
