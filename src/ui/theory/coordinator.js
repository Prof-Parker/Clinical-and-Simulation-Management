/**
 * Coordinator view — weekly hours and contact-hour validation.
 */

import * as TheoryData from '../../core/theory-data.js';
import * as Permissions from '../../auth/permissions.js';

export function render(data) {
  var chip = document.getElementById('theoryCoordinatorStatusChip');
  var tbody = document.getElementById('theoryCoordinatorTableBody');
  var warnEl = document.getElementById('theorySimWarnBanner');
  if (!data.theory) return;

  var courseCode = 'REGN15';
  var validation = TheoryData.contactHourValidation(data.theory, data, courseCode);
  if (chip) {
    if (validation.target == null) {
      chip.textContent = 'Scheduled: ' + validation.scheduled + ' h (no target set)';
    } else {
      var statusLabel = validation.status === 'on_target' ? 'on target'
        : validation.status === 'under' ? validation.delta + ' h under'
          : validation.delta + ' h over';
      chip.textContent = 'Scheduled: ' + validation.scheduled + ' h / Target: ' + validation.target +
        ' h — ' + statusLabel;
      chip.className = 'theory-coordinator-chip theory-chip-' + validation.status;
    }
  }

  if (!tbody) return;
  var html = '';
  for (var w = 1; w <= 18; w++) {
    var s = TheoryData.weekSummaryForLabel(data.theory, data, w, 'REGN15P');
    html += '<tr><td>Week ' + w + '</td><td>' + s.lecture + '</td><td>' + s.skills_lab +
      '</td><td>' + s.clinical + '</td><td>' + s.simulation + '</td><td>' +
      (s.lecture + s.skills_lab + s.clinical + s.simulation).toFixed(2) + '</td></tr>';
  }
  tbody.innerHTML = html;

  var settingsBtn = document.getElementById('theoryHourSettingsBtn');
  if (settingsBtn) {
    settingsBtn.classList.toggle('hidden', !Permissions.canAction('theory.hourTargets.edit') &&
      !Permissions.canAction('*'));
  }

  var warnings = TheoryData.simCrossCheckWarnings(data);
  if (warnEl) {
    if (warnings.length) {
      warnEl.textContent = warnings[0];
      warnEl.classList.remove('hidden');
    } else {
      warnEl.classList.add('hidden');
    }
  }
}
