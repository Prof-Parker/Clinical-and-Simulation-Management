/**
 * Course hour targets and contact hour rules drawer.
 */

import { getData, notifyChange } from '../../core/state.js';
import { showDialog } from '../dialogs.js';
import * as Permissions from '../../auth/permissions.js';
import * as TheoryData from '../../core/theory-data.js';
import {
  contactTargetFromCredits,
  contactFormulaNote,
  semesterWeekCount
} from '../../core/contact-hours.js';

export function init() {
  var btn = document.getElementById('theoryHourSettingsBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    if (!Permissions.canAction('theory.hourTargets.edit') && !Permissions.canAction('*')) return;
    var data = getData();
    if (!data || !data.theory) return;
    var targets = data.theory.settings.courseHourTargets || [];
    var weeks = semesterWeekCount(data);
    var body = targets.map(function (t, i) {
      return '<p><strong>' + t.courseCode + '</strong> ' +
        'Credit <input type="number" step="0.5" data-tgt-credit="' + i + '" value="' + t.creditHours + '"> ' +
        'Contact target <input type="number" step="0.1" data-tgt-contact="' + i + '" value="' + t.contactHoursTarget + '"></p>';
    }).join('') +
      '<p class="section-sub">Weeks for calculation: <strong data-tgt-weeks>' + weeks + '</strong> ' +
      '(from semester calendar, default 18). Theory = credits × weeks; practicum = credits × 3 × weeks.</p>' +
      '<p class="section-sub"><button type="button" class="btn btn-sm" id="theoryCalcContactBtn">' +
      'Calculate from credit hours</button></p>';

    showDialog('Course hour settings', body, function () {
      targets.forEach(function (t, i) {
        var cr = document.querySelector('[data-tgt-credit="' + i + '"]');
        var ct = document.querySelector('[data-tgt-contact="' + i + '"]');
        if (cr) t.creditHours = parseFloat(cr.value) || t.creditHours;
        if (ct) t.contactHoursTarget = parseFloat(ct.value) || t.contactHoursTarget;
      });
      notifyChange();
    });

    var calcBtn = document.getElementById('theoryCalcContactBtn');
    if (calcBtn) {
      calcBtn.addEventListener('click', function () {
        var w = semesterWeekCount(getData());
        targets.forEach(function (t, i) {
          var cr = document.querySelector('[data-tgt-credit="' + i + '"]');
          var ct = document.querySelector('[data-tgt-contact="' + i + '"]');
          var credits = cr ? parseFloat(cr.value) : t.creditHours;
          var isPrac = TheoryData.isPracticumCourseCode(t.courseCode);
          var contact = contactTargetFromCredits(credits, w, isPrac);
          if (ct) ct.value = String(contact);
          t.creditHours = credits;
          t.contactHoursTarget = contact;
          t.contactHoursAutoCalculate = true;
          t.contactHoursFormulaNote = contactFormulaNote(credits, w, isPrac);
        });
      });
    }
  });
}
