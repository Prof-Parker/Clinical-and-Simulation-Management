/**
 * Header course dropdown helpers and workspace nav shell helpers.
 * Course UI lives in the context chip popover (`context-chip.js`).
 */

import { state, getData, getFileRoot, notifyChange } from '../core/state.js';
import * as TheoryData from '../core/theory-data.js';
import { showConfirm } from './dialogs.js';
import { resolveNavShell, isPlaygroundShell, updatePlaygroundStatusLine } from './playground-shell.js';
import * as Permissions from '../auth/permissions.js';

function chromeApi() {
  return import('./chrome.js');
}

function contextChipApi() {
  return import('./context-chip.js');
}

export function getActiveCourseCode() {
  var fileRoot = getFileRoot();
  if (fileRoot && fileRoot.meta && fileRoot.meta.activeCourseCode) {
    return fileRoot.meta.activeCourseCode;
  }
  var data = getData();
  return data && data.meta ? data.meta.courseId : null;
}

export function getActiveTheoryCourseCode() {
  var fileRoot = getFileRoot();
  var selected = fileRoot && fileRoot.meta
    ? String(fileRoot.meta.activeTheoryCourseCode || '').toUpperCase()
    : '';
  if (selected === 'REGN35' || selected === 'REGN36') return selected;
  return 'REGN35';
}

export function getNavShell() {
  return resolveNavShell();
}

export function updateCourseStatusLabel() {
  if (isPlaygroundShell()) {
    updatePlaygroundStatusLine();
  }
  contextChipApi().then(function (m) {
    if (m.updateContextChip) m.updateContextChip();
  });
}

/**
 * Playground-only shell filtering. Clinical/theory destinations are unified on the rail.
 * @param {string} shell
 */
export function applyNavShell(shell) {
  void shell;
}

/** @deprecated Course options render inside #contextCourseSelect via context-chip. */
export function renderCourseDropdown() {
  // Kept for chrome.refresh() callers.
}

export function setActiveCourseCode(code, skipConfirm) {
  var fileRoot = getFileRoot();
  if (!fileRoot || !code) return;
  function apply() {
    fileRoot.meta.activeCourseCode = code;
    state.appShell = null;
    applyNavShell(resolveNavShell());
    updateCourseStatusLabel();
    chromeApi().then(function (m) {
      var tab = state.currentTab;
      if (!tab || !Permissions.canTab(tab) || tab.indexOf('playground') === 0) {
        m.switchTab('dashboard');
      } else {
        m.refresh();
      }
    });
    notifyChange();
  }
  if (state.dirty && !skipConfirm) {
    showConfirm('Unsaved changes', 'Save or discard changes before switching course context?', function () {
      apply();
    }, { confirmLabel: 'Switch anyway' });
    return;
  }
  apply();
}

export function setActiveProgramSemesterId(semesterId, skipConfirm) {
  var fileRoot = getFileRoot();
  if (!fileRoot || !semesterId || semesterId === fileRoot.meta.activeSemesterId) return;
  function apply() {
    chromeApi().then(function (m) {
      m.switchSemester(semesterId);
      updateCourseStatusLabel();
    });
  }
  if (state.dirty && !skipConfirm) {
    showConfirm('Unsaved changes', 'Save or discard changes before switching program semester?', function () {
      apply();
    }, { confirmLabel: 'Switch anyway' });
    return;
  }
  apply();
}

export function setActiveTheoryCourseCode(code) {
  var fileRoot = getFileRoot();
  var normalized = String(code || '').toUpperCase().replace(/\s+/g, '');
  if (!fileRoot || (normalized !== 'REGN35' && normalized !== 'REGN36')) return;
  if (getActiveTheoryCourseCode() === normalized &&
      fileRoot.meta.activeTheoryCourseCode === normalized) {
    return;
  }
  fileRoot.meta.activeTheoryCourseCode = normalized;
  updateCourseStatusLabel();
  chromeApi().then(function (m) {
    m.refresh();
  });
}

export function initCourseSelector() {
  applyNavShell(getNavShell());
  updateCourseStatusLabel();
  void TheoryData;
}

export function openLibraryTab(tabId) {
  chromeApi().then(function (m) {
    m.closeMenu();
    m.switchTab(tabId);
  });
}
