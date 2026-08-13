/**
 * Setup modal host — shows #view-setup over the practicum calendar.
 */

import { state } from '../core/state.js';
import * as Permissions from '../auth/permissions.js';
import { showAlert } from './dialogs.js';

var returnTab = 'practicum';

export function isSetupModalOpen() {
  var modal = document.getElementById('setupModal');
  return !!(modal && !modal.classList.contains('hidden'));
}

export function getSetupReturnTab() {
  return returnTab || 'practicum';
}

/**
 * Show the setup modal and mark setup as the current tab.
 * Caller should invoke chrome.refresh() afterward.
 * @param {{ returnTab?: string }} [opts]
 * @returns {boolean}
 */
export function openSetupModal(opts) {
  opts = opts || {};
  if (!Permissions.canTab('setup')) {
    showAlert('Not permitted', 'Your role cannot access Setup.');
    return false;
  }
  if (state.currentTab && state.currentTab !== 'setup') {
    returnTab = state.currentTab;
  } else if (opts.returnTab) {
    returnTab = opts.returnTab;
  } else {
    returnTab = 'practicum';
  }

  var modal = document.getElementById('setupModal');
  var view = document.getElementById('view-setup');
  if (!modal || !view) return false;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('setup-modal-open');

  state.currentTab = 'setup';
  document.querySelectorAll('.view-panel').forEach(function (el) {
    if (el.id === 'view-setup') {
      el.classList.add('active');
    } else if (el.id === 'view-' + returnTab) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
  view.classList.add('active');
  return true;
}

export function hideSetupModalShell() {
  var modal = document.getElementById('setupModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('setup-modal-open');
}

export function closeSetupModal() {
  hideSetupModalShell();
  var target = returnTab || 'practicum';
  if (target === 'setup') target = 'practicum';
  import('./chrome.js').then(function (m) {
    m.switchTab(target);
  });
}

export function initSetupModal() {
  var closeBtn = document.getElementById('setupModalClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      closeSetupModal();
    });
  }
  var modal = document.getElementById('setupModal');
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeSetupModal();
    });
  }
  var openBtn = document.getElementById('practicumOpenSetupBtn');
  if (openBtn) {
    openBtn.addEventListener('click', function () {
      import('./chrome.js').then(function (m) {
        m.switchTab('setup');
      });
    });
  }
}
