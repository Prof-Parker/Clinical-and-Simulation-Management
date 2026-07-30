/**
 * Header course dropdown and clinical vs theory nav shell switching.
 */

import { state, getData, getFileRoot, notifyChange } from '../core/state.js';
import * as DataModel from '../core/data-model/index.js';
import * as TheoryData from '../core/theory-data.js';
import * as Audit from '../audit/audit.js';
import { showConfirm } from './dialogs.js';
import { buildCourseStatusHtml, courseStatusAriaLabel } from './semester-label.js';
import { updateSemesterPickerLabel } from './semester-picker.js';
import { resolveNavShell, isPlaygroundShell, updatePlaygroundStatusLine } from './playground-shell.js';

function chromeApi() {
  return import('./chrome.js');
}

export function getActiveCourseCode() {
  var fileRoot = getFileRoot();
  if (fileRoot && fileRoot.meta && fileRoot.meta.activeCourseCode) {
    return fileRoot.meta.activeCourseCode;
  }
  var data = getData();
  return data && data.meta ? data.meta.courseId : null;
}

export function getNavShell() {
  return resolveNavShell();
}

export function updateCourseStatusLabel() {
  if (isPlaygroundShell()) {
    updatePlaygroundStatusLine();
    updateSemesterPickerLabel();
    return;
  }
  var trigger = document.getElementById('courseStatusLine');
  var data = getData();
  updateSemesterPickerLabel();
  if (!trigger) return;
  if (!data || !data.meta) {
    trigger.textContent = 'No semester file connected';
    trigger.removeAttribute('aria-label');
    return;
  }
  var parts = DataModel.parseSemesterDisplay(data);
  var code = getActiveCourseCode() || data.meta.courseId || '—';
  var phase = Audit.getPhase(data);
  trigger.innerHTML = buildCourseStatusHtml(parts, code, phase);
  trigger.setAttribute('aria-label', courseStatusAriaLabel(parts, code, phase));
}

export function applyNavShell(shell) {
  document.querySelectorAll('.nav-tab[data-shell]').forEach(function (btn) {
    var show = btn.dataset.shell === shell;
    btn.classList.toggle('hidden', !show);
  });
}

export function renderCourseDropdown() {
  var menu = document.getElementById('courseStatusDropdown');
  var fileRoot = getFileRoot();
  if (!menu || !fileRoot) return;
  var options = TheoryData.listCourseOptions(fileRoot);
  if (!options.length) {
    menu.innerHTML = '';
    return;
  }
  var active = getActiveCourseCode();
  menu.innerHTML = options.map(function (opt) {
    return '<button type="button" class="menu-item menu-item-nested course-opt" role="option" data-course="' +
      opt.code + '"' + (opt.code === active ? ' aria-selected="true"' : '') + '>' + opt.label +
      (opt.shell === 'theory' ? ' (theory)' : '') + '</button>';
  }).join('');
}

export function setActiveCourseCode(code, skipConfirm) {
  var fileRoot = getFileRoot();
  if (!fileRoot || !code) return;
  function apply() {
    fileRoot.meta.activeCourseCode = code;
    state.appShell = null;
    var shell = TheoryData.isTheoryCourseCode(code) ? 'theory' : 'clinical';
    applyNavShell(shell);
    updateCourseStatusLabel();
    renderCourseDropdown();
    var defaultTab = shell === 'theory' ? 'theory-master' : 'dashboard';
    chromeApi().then(function (m) { m.switchTab(defaultTab); });
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

export function initCourseSelector() {
  var wrap = document.querySelector('.header-status-wrap');
  var trigger = document.getElementById('courseStatusLine');
  var menu = document.getElementById('courseStatusDropdown');
  if (!trigger || !menu) return;

  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'courseStatusDropdown');

  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    var semesterMenu = document.getElementById('semesterPickerMenu');
    var semesterBtn = document.getElementById('semesterPickerBtn');
    if (semesterMenu) semesterMenu.classList.add('hidden');
    if (semesterBtn) semesterBtn.setAttribute('aria-expanded', 'false');
    var open = menu.classList.toggle('hidden');
    trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
    if (!open) renderCourseDropdown();
  });

  menu.addEventListener('click', function (e) {
    var opt = e.target.closest('[data-course]');
    if (!opt) return;
    menu.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    setActiveCourseCode(opt.dataset.course);
  });

  document.addEventListener('click', function (e) {
    if (!wrap || !wrap.contains(e.target)) {
      menu.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  applyNavShell(getNavShell());
  updateCourseStatusLabel();
  renderCourseDropdown();
}

export function openLibraryTab(tabId) {
  chromeApi().then(function (m) {
    m.closeMenu();
    m.switchTab(tabId);
  });
}
