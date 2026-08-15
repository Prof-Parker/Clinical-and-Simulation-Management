/**
 * Theory Calendar Seeding panel — mode radios + Apply seed dispatch.
 */

import { getData, getFileRoot, notifyChange } from '../../core/state.js';
import * as TheoryData from '../../core/theory-data.js';
import * as Permissions from '../../auth/permissions.js';
import { showAlert, showConfirm } from '../dialogs.js';
import { refresh } from '../chrome.js';

function canEdit() {
  return Permissions.canAction('theory.edit') || Permissions.canAction('*');
}

function selectedMode() {
  var checked = document.querySelector('input[name="theoryModuleSeedMode"]:checked');
  return checked ? checked.value : 'blank';
}

function selectNoSeeding() {
  var blank = document.getElementById('theoryModuleSeedBlank');
  if (blank) blank.checked = true;
}

export function fillSeedSemesterSelect(data) {
  var sel = document.getElementById('theoryModuleSeedSemester');
  if (!sel) return;
  var root = getFileRoot();
  var semesters = (root && root.semesters) || [];
  var html = '<option value="">Select semester…</option>';
  semesters.forEach(function (sem) {
    if (!sem || sem.id === data.id || !sem.theory) return;
    var label = (sem.meta && sem.meta.semesterName) || sem.id;
    html += '<option value="' + escAttr(sem.id) + '">' + esc(label) + '</option>';
  });
  sel.innerHTML = html;
}

export function syncSeedControls() {
  var mode = selectedMode();
  var needsSource = mode === 'pull' || mode === 'full';
  var seedSel = document.getElementById('theoryModuleSeedSemester');
  var seedLabel = document.getElementById('theoryModuleSeedSemesterLabel');
  var applyBtn = document.getElementById('theoryModuleSeedApplyBtn');
  if (seedSel) seedSel.disabled = !needsSource;
  if (seedLabel) seedLabel.classList.toggle('hidden', !needsSource);
  if (!applyBtn) return;
  if (mode === 'blank') {
    applyBtn.disabled = true;
  } else if (mode === 'sessions') {
    applyBtn.disabled = false;
  } else if (needsSource) {
    applyBtn.disabled = !(seedSel && seedSel.value);
  } else {
    applyBtn.disabled = true;
  }
}

function sourceSemester() {
  var sel = document.getElementById('theoryModuleSeedSemester');
  var root = getFileRoot();
  if (!root || !root.semesters || !sel || !sel.value) return null;
  return root.semesters.find(function (s) { return s.id === sel.value; }) || null;
}

function applyPull(data) {
  var source = sourceSemester();
  if (!source || !source.theory) {
    showAlert('Module topics', 'Select a source semester that has theory calendar data.');
    return;
  }
  var result = TheoryData.seedTopicsFromTheory(data.theory, source.theory);
  notifyChange();
  refresh();
  showAlert('Module topics', 'Filled ' + result.filled + ' empty lecture slot(s) from the selected semester.');
}

function applySessions(data, collectInto) {
  if (typeof collectInto === 'function') collectInto(data);
  var result = TheoryData.seedEmptySessionEvents(data);
  notifyChange();
  refresh();
  showAlert(
    'Calendar seeding',
    'Added ' + result.lectureAdded + ' lecture and ' + result.skillsAdded +
      ' skills lab event(s). Existing events were left unchanged.'
  );
}

function applyFullImport(data) {
  var source = sourceSemester();
  if (!source || !source.theory) {
    showAlert('Import topics', 'Select a source semester that has theory calendar data.');
    return;
  }
  showConfirm(
    'Replace theory events?',
    'Warning: this will erase all existing events in this course and replace them with content from the selected semester.',
    function () {
      var result = TheoryData.importTheoryEventsFromSemester(data, source.theory);
      notifyChange();
      refresh();
      showAlert(
        'Import complete',
        'Removed ' + result.removed + ', imported ' + result.imported +
          ', skipped ' + result.skipped + ' event(s).'
      );
    },
    {
      onCancel: function () {
        selectNoSeeding();
        syncSeedControls();
      }
    }
  );
}

export function applySeed(collectInto) {
  if (!canEdit()) {
    showAlert('Apply seed', 'You do not have permission to edit theory.');
    return;
  }
  var data = getData();
  if (!data || !data.theory) return;
  var mode = selectedMode();
  if (mode === 'blank') return;
  if (mode === 'pull') {
    applyPull(data);
    return;
  }
  if (mode === 'sessions') {
    applySessions(data, collectInto);
    return;
  }
  if (mode === 'full') {
    applyFullImport(data);
  }
}

export function bindSeedPanel(setupEl, collectInto) {
  if (!setupEl) return;
  setupEl.addEventListener('change', function (e) {
    if (!e.target) return;
    var id = e.target.id;
    if (id === 'theoryModuleSeedBlank' || id === 'theoryModuleSeedPull' ||
        id === 'theoryModuleSeedSessions' || id === 'theoryModuleSeedFullImport' ||
        id === 'theoryModuleSeedSemester') {
      syncSeedControls();
    }
  });
  var applyBtn = document.getElementById('theoryModuleSeedApplyBtn');
  if (applyBtn) {
    applyBtn.addEventListener('click', function () {
      applySeed(collectInto);
    });
  }
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
