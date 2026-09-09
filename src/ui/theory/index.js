/**
 * Theory Management — sub-nav router and shared init.
 */

import { getData, onStateChange } from '../../core/state.js';
import * as TheoryLibrary from '../../storage/theory-library-storage.js';
import { showAlert } from '../dialogs.js';
import { render as renderMaster, renderTopicLibraryPanel } from './master-calendar.js';
import { render as renderLecture } from './lecture-assignments.js';
import { render as renderCoordinator } from './coordinator.js';
import { init as initHourSettings } from './hour-settings.js';
import { init as initMasterSetup } from './master-setup.js';
import { init as initContentLibrary } from './content-library.js';
import { init as initCoordinatorExport } from './coordinator-export.js';

function initTheoryLibraryButtons() {
  var connectBtn = document.getElementById('theoryLibraryConnectBtn');
  var createBtn = document.getElementById('theoryLibraryCreateBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', function () {
      TheoryLibrary.openFilePicker().then(function () {
        renderTopicLibraryPanel();
        showAlert('Connected', 'Program content library loaded.');
      }).catch(function () {});
    });
  }
  if (createBtn) {
    createBtn.addEventListener('click', function () {
      TheoryLibrary.createFilePicker(null).then(function () {
        renderTopicLibraryPanel();
        showAlert('Created', 'New program content library saved.');
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
  initMasterSetup();
  initContentLibrary();
  initCoordinatorExport();
  initTheoryLibraryButtons();
  onStateChange(function () {
    var data = getData();
    if (data && data.theory) {
      import('./coordinator.js').then(function (m) { m.render(data); });
    }
  });
}

export { renderMaster, renderLecture, renderCoordinator };
