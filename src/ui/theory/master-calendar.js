/**
 * Master Calendar view (Sun–Sat grid).
 */

import * as TheoryData from '../../core/theory-data.js';
import { notifyChange } from '../../core/state.js';
import * as Permissions from '../../auth/permissions.js';
import { openEventEditor } from './event-editor.js';
import { render as renderSetup } from './master-setup.js';
import { render as renderContentLibrary } from './content-library.js';
import { renderSkillCoveragePanel } from './skill-coverage-panel.js';
import { refresh } from '../chrome.js';
import { buildMasterCalendarHtml } from './master-calendar-html.js';

var dragEventId = null;
var suppressClick = false;

export function render(data) {
  renderSetup(data);
  renderSkillCoveragePanel(data && data.theory);
  var grid = document.getElementById('theoryMasterGrid');
  if (!grid || !data.theory) return;
  var theory = data.theory;
  grid.innerHTML = buildMasterCalendarHtml(data, { readOnly: false });

  grid.querySelectorAll('.theory-day-cell').forEach(function (cell) {
    cell.addEventListener('click', function (e) {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      var date = cell.dataset.date;
      if (!date) return;
      var chip = e.target.closest('[data-event-id]');
      if (chip) {
        openEventEditor(data, date, chip.getAttribute('data-event-id'));
        return;
      }
      openEventEditor(data, date);
    });
    cell.addEventListener('dragover', function (e) {
      e.preventDefault();
      cell.classList.add('theory-day-drop-target');
    });
    cell.addEventListener('dragleave', function () {
      cell.classList.remove('theory-day-drop-target');
    });
    cell.addEventListener('drop', function (e) {
      e.preventDefault();
      cell.classList.remove('theory-day-drop-target');
      if (!Permissions.canAction('theory.edit') && !Permissions.canAction('*')) return;
      var toDate = cell.dataset.date;
      var eventId = dragEventId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      if (!toDate || !eventId) return;
      if (TheoryData.moveEventToDate(theory, data, eventId, toDate)) {
        suppressClick = true;
        notifyChange();
        refresh();
      }
      dragEventId = null;
    });
  });

  grid.querySelectorAll('[data-event-id]').forEach(function (chip) {
    chip.addEventListener('dragstart', function (e) {
      dragEventId = chip.getAttribute('data-event-id');
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', dragEventId);
        e.dataTransfer.effectAllowed = 'move';
      }
      chip.classList.add('theory-track-dragging');
    });
    chip.addEventListener('dragend', function () {
      chip.classList.remove('theory-track-dragging');
      dragEventId = null;
    });
  });

  renderTopicLibraryPanel();
}

export function renderTopicLibraryPanel() {
  renderContentLibrary();
}
