/**
 * Theory Management — sub-nav router and shared init.
 */

import { getData, onStateChange } from '../../core/state.js';
import { refresh } from '../chrome.js';
import { render as renderMaster } from './master-calendar.js';
import { render as renderLecture } from './lecture-assignments.js';
import { render as renderCoordinator } from './coordinator.js';
import { init as initHourSettings } from './hour-settings.js';

export function renderTheoryTab(tabId) {
  var data = getData();
  if (!data || !data.theory) return;
  if (tabId === 'theory-master') renderMaster(data);
  if (tabId === 'theory-lecture') renderLecture(data);
  if (tabId === 'theory-coordinator') renderCoordinator(data);
}

export function init() {
  initHourSettings();
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
