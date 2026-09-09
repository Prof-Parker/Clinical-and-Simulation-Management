/**
 * Coordinator View — Export to Excel dialog (Faculty Needed names, session-only).
 */

import { getData } from '../../core/state.js';
import * as Permissions from '../../auth/permissions.js';
import { escapeHtml, showDialog, showAlert } from '../dialogs.js';
import { escAttr } from '../setup/dom-utils.js';
import { listExportFacultyFields } from '../../export/coordinator-day-lines.js';
import { downloadCoordinatorCalendar } from '../../export/coordinator-calendar-xlsx.js';

var STORAGE_KEY = 'coordinatorExportFacultyOverlay';

function readStoredOverlay() {
  try {
    var raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeStoredOverlay(overlay) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(overlay || {}));
  } catch (e) { /* ignore quota / private mode */ }
}

function dialogBodyHtml(fields, stored) {
  if (!fields.length) {
    return '<p class="section-sub">No open Faculty Needed slots. Export will use assigned faculty names where available.</p>';
  }
  var rows = fields.map(function (f, idx) {
    var val = stored[f.slotId] != null ? String(stored[f.slotId]) : '';
    var inputId = 'coordExportFac_' + idx;
    return '<div class="config-list-row" style="margin-bottom:0.5rem">' +
      '<label class="section-sub" for="' + inputId + '">' +
      escapeHtml(f.label) + '</label>' +
      '<input type="text" class="coord-export-faculty-input" id="' + inputId + '" ' +
      'data-slot-id="' + escAttr(f.slotId) + '" value="' + escAttr(val) + '" ' +
      'placeholder="Faculty name" autocomplete="off" style="width:100%;margin-top:0.25rem">' +
      '</div>';
  }).join('');
  return '<p class="section-sub">Enter names for Faculty Needed slots. Names apply to this export only.</p>' +
    '<div class="coord-export-faculty-list custom-scrollbar" style="max-height:20rem;overflow:auto">' +
    rows + '</div>';
}

function collectOverlayFromDom() {
  var overlay = {};
  var inputs = document.querySelectorAll('.coord-export-faculty-input');
  for (var i = 0; i < inputs.length; i++) {
    var el = inputs[i];
    var id = el.getAttribute('data-slot-id');
    if (!id) continue;
    var name = String(el.value || '').trim();
    if (name) overlay[id] = name;
  }
  return overlay;
}

export function openExportDialog() {
  if (!Permissions.canAction('theory.export') && !Permissions.canAction('*')) {
    showAlert('Not allowed', 'You do not have permission to export the theory calendar.');
    return;
  }
  var data = getData();
  if (!data || !data.theory) {
    showAlert('Nothing to export', 'Load a semester with a theory calendar first.');
    return;
  }

  var fields = listExportFacultyFields(data);
  var stored = readStoredOverlay();
  var content = document.querySelector('#dialogModal .modal-content');
  if (content) content.style.maxWidth = '32rem';

  showDialog('Export coordinator calendar', dialogBodyHtml(fields, stored), function () {
    var overlay = collectOverlayFromDom();
    writeStoredOverlay(Object.assign({}, stored, overlay));
    downloadCoordinatorCalendar(data, overlay);
  });
}

export function init() {
  var btn = document.getElementById('theoryCoordinatorExportBtn');
  if (!btn || btn.dataset.coordExportBound) return;
  btn.dataset.coordExportBound = '1';
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    openExportDialog();
  });
}

export function updateExportButtonVisibility() {
  var btn = document.getElementById('theoryCoordinatorExportBtn');
  if (!btn) return;
  var allowed = Permissions.canAction('theory.export') || Permissions.canAction('*');
  btn.classList.toggle('hidden', !allowed);
}
