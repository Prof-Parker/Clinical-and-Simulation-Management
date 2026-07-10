/**
 * Theory Management — sub-nav router and shared init.
 */

import { getData, getFileRoot, onStateChange } from '../../core/state.js';
import * as TheoryData from '../../core/theory-data.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import { refresh } from '../chrome.js';
import { showAlert } from '../dialogs.js';
import { render as renderMaster, renderTopicLibraryPanel } from './master-calendar.js';
import { render as renderLecture } from './lecture-assignments.js';
import { render as renderCoordinator } from './coordinator.js';
import { init as initHourSettings } from './hour-settings.js';

function theoryLibraryCourseId() {
  var root = getFileRoot();
  var code = root && root.meta && root.meta.activeCourseCode;
  if (code && TheoryData.isTheoryCourseCode(code)) return code;
  return 'REGN15';
}

function initTheoryLibraryButtons() {
  var connectBtn = document.getElementById('theoryLibraryConnectBtn');
  var createBtn = document.getElementById('theoryLibraryCreateBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', function () {
      TheoryLibrary.openFilePicker().then(function () {
        renderTopicLibraryPanel();
        showAlert('Connected', 'Theory content library loaded.');
      }).catch(function () {});
    });
  }
  if (createBtn) {
    createBtn.addEventListener('click', function () {
      TheoryLibrary.createFilePicker(theoryLibraryCourseId()).then(function () {
        renderTopicLibraryPanel();
        showAlert('Created', 'New theory content library saved.');
      }).catch(function () {});
    });
  }
  renderTopicLibraryPanel();
}

export function renderTheoryTab(tabId) {
  var data = getData();
  if (!data || !data.theory) return;
  if (tabId === 'theory-master') renderMaster(data);
  if (tabId === 'theory-lecture') renderLecture(data);
  if (tabId === 'theory-coordinator') renderCoordinator(data);
}

export function init() {
  initHourSettings();
  initTheoryLibraryButtons();
  onStateChange(function () {
    var data = getData();
    if (data && data.theory) {
      import('./coordinator.js').then(function (m) { m.render(data); });
    }
  });
  document.querySelectorAll('.nav-tab[data-shell="theory"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      refresh();
    });
  });
}

export { renderMaster, renderLecture, renderCoordinator };
