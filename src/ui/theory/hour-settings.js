/**
 * Course hour targets and contact hour rules drawer (stub editors).
 */

import { getData, notifyChange } from '../../core/state.js';
import { showDialog } from '../dialogs.js';
import * as Permissions from '../../auth/permissions.js';

export function init() {
  var btn = document.getElementById('theoryHourSettingsBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    if (!Permissions.canAction('theory.hourTargets.edit') && !Permissions.canAction('*')) return;
    var data = getData();
    if (!data || !data.theory) return;
    var targets = data.theory.settings.courseHourTargets || [];
    var body = targets.map(function (t, i) {
      return '<p><strong>' + t.courseCode + '</strong> ' +
        'Credit <input type="number" step="0.5" data-tgt-credit="' + i + '" value="' + t.creditHours + '"> ' +
        'Contact target <input type="number" step="0.1" data-tgt-contact="' + i + '" value="' + t.contactHoursTarget + '"></p>';
    }).join('') +
      '<p class="section-sub"><button type="button" class="btn btn-sm" disabled title="Coming soon">Calculate from credit hours</button> (Coming soon)</p>';

    showDialog('Course hour settings', body, function () {
      targets.forEach(function (t, i) {
        var cr = document.querySelector('[data-tgt-credit="' + i + '"]');
        var ct = document.querySelector('[data-tgt-contact="' + i + '"]');
        if (cr) t.creditHours = parseFloat(cr.value) || t.creditHours;
        if (ct) t.contactHoursTarget = parseFloat(ct.value) || t.contactHoursTarget;
      });
      notifyChange();
    });
  });
}
