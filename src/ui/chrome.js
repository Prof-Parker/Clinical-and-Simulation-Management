/** App chrome — semester label, menus, tab router, closeout banner, semester switch. */

import {
  state,
  getData,
  notifyChange,
  syncSemesterToFile,
  getFileRoot,
  setFileRoot
} from '../core/state.js';
import { rebuildWeeks } from '../core/calendar-engine.js';
import * as DataModel from '../core/data-model/index.js';
import * as CourseDefaults from '../core/course-defaults.js';
import { regenerateAll } from '../core/scheduler/index.js';
import { populateFilters, render as renderDashboard, setScheduleFullscreen } from './dashboard/index.js';
import { render as renderSetup } from './setup/index.js';
import { render as renderStudentView } from './student-view.js';
import { render as renderSimRoles } from './sim-roles.js';
import { render as renderMakeupFinder } from './makeup-finder.js';
import { render as renderAuditCloseout } from './audit-closeout.js';
import { render as renderPlaygroundDashboard } from './playground/dashboard.js';
import { renderSetupTab } from './playground/index.js';
import { isPlaygroundShell } from './playground-shell.js';
import { render as renderUsersAdmin } from './users-admin.js';
import { render as renderClinicalSitesTab } from './clinical-sites-tab.js';
import * as Theory from './theory/index.js';
import {
  updateCourseStatusLabel,
  applyNavShell,
  getNavShell,
  initCourseSelector,
  renderCourseDropdown
} from './course-selector.js';
import { showAlert } from './dialogs.js';
import * as Permissions from '../auth/permissions.js';
import * as UserTemplate from '../auth/user-template.js';
import * as UserSession from '../auth/user-session.js';
import * as Audit from '../audit/audit.js';
import * as Storage from '../storage/semester-storage.js';
import * as Theme from './theme.js';
import { buildSemesterLabelHtml } from './semester-label.js';

export { buildSemesterLabelHtml };

export function updateCourseStatusLine() {
  updateCourseStatusLabel();
}

function userInitials(name) {
  var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  var first = parts[0].charAt(0);
  var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

export function updateUserStatusLine() {
  var initialsEl = document.getElementById('userStatusLine');
  var toggle = document.getElementById('userMenuToggle');
  var nameEl = document.getElementById('userMenuName');
  var roleEl = document.getElementById('userMenuRole');
  var session = UserSession.getSession();
  if (!session) {
    if (initialsEl) initialsEl.textContent = '';
    if (nameEl) nameEl.textContent = '';
    if (roleEl) roleEl.textContent = '';
    if (toggle) toggle.classList.add('hidden');
    closeUserMenu();
    return;
  }
  var roleName = UserTemplate.roleDisplayName(session.role);
  if (initialsEl) initialsEl.textContent = userInitials(session.name);
  if (nameEl) nameEl.textContent = session.name;
  if (roleEl) roleEl.textContent = roleName;
  if (toggle) {
    toggle.classList.remove('hidden');
    toggle.setAttribute('aria-label', 'User menu — ' + session.name + ' (' + roleName + ')');
    toggle.title = session.name + ' (' + roleName + ')';
  }
}

export function updateSemesterDisplay() {
  updateCourseStatusLine();
}

export function initSemesterMenu() {
  var menu = document.getElementById('semesterSwitchMenu');
  if (!menu) return;
  menu.addEventListener('click', function (e) {
    var opt = e.target.closest('[data-semester-id]');
    if (!opt || !getFileRoot()) return;
    if (opt.dataset.semesterId !== getFileRoot().meta.activeSemesterId) {
      switchSemester(opt.dataset.semesterId);
    }
    closeMenu();
  });
}

export function refreshSemesterSwitchMenu() {
  var menu = document.getElementById('semesterSwitchMenu');
  var fileRoot = getFileRoot();
  if (!menu || !fileRoot) return;
  if (!Permissions.canAction('semester.switch') || fileRoot.semesters.length < 2) {
    menu.innerHTML = '';
    return;
  }
  var activeId = fileRoot.meta.activeSemesterId;
  menu.innerHTML = fileRoot.semesters.map(function (sem) {
    var parts = DataModel.parseSemesterDisplay(sem);
    var label = buildSemesterLabelHtml(parts);
    return '<button type="button" class="menu-item menu-item-nested" role="menuitem" data-semester-id="' +
      sem.id + '"' + (sem.id === activeId ? ' aria-current="true"' : '') + '>' + label + '</button>';
  }).join('');
}

export function closeMenu() {
  var dropdown = document.getElementById('menuDropdown');
  var toggle = document.getElementById('menuToggle');
  if (dropdown) dropdown.classList.add('hidden');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

export function toggleMenu() {
  var dropdown = document.getElementById('menuDropdown');
  var toggle = document.getElementById('menuToggle');
  if (!dropdown || !toggle) return;
  var open = dropdown.classList.toggle('hidden');
  toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
  if (!open) {
    closeUserMenu();
    refreshSemesterSwitchMenu();
    if (Permissions.applyMenuGating) Permissions.applyMenuGating();
  }
}

export function closeUserMenu() {
  var dropdown = document.getElementById('userMenuDropdown');
  var toggle = document.getElementById('userMenuToggle');
  if (dropdown) dropdown.classList.add('hidden');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

export function toggleUserMenu() {
  var dropdown = document.getElementById('userMenuDropdown');
  var toggle = document.getElementById('userMenuToggle');
  if (!dropdown || !toggle) return;
  var open = dropdown.classList.toggle('hidden');
  toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
  if (!open) {
    closeMenu();
    if (Permissions.applyMenuGating) Permissions.applyMenuGating();
  }
}

export function refreshPlaygroundViews() {
  if (state.currentTab === 'playground-dashboard') renderPlaygroundDashboard();
  if (state.currentTab === 'playground-setup') renderSetupTab();
  updateCourseStatusLabel();
}

export function refreshPlaygroundDashboard() {
  renderPlaygroundDashboard();
}

export function refresh() {
  if (isPlaygroundShell()) {
    Storage.updateStatusUI();
    updateUserStatusLine();
    refreshPlaygroundViews();
    applyNavShell(getNavShell());
    Permissions.apply();
    updatePlaygroundMenuState();
    return;
  }
  var data = getData();
  Storage.updateStatusUI();
  updateSemesterDisplay();
  updateUserStatusLine();
  if (!data) return;
  populateFilters(data);
  var tab = state.currentTab;
  if (tab === 'dashboard') renderDashboard(data);
  if (tab === 'student') renderStudentView(data);
  if (tab === 'roles') renderSimRoles(data);
  if (tab === 'makeup') renderMakeupFinder(data);
  if (tab === 'audit') renderAuditCloseout(data);
  if (tab === 'setup') renderSetup(data);
  if (tab === 'playground-dashboard') renderPlaygroundDashboard();
  if (tab === 'playground-setup') renderSetupTab();
  if (tab === 'users') renderUsersAdmin();
  if (tab === 'clinical-sites') renderClinicalSitesTab();
  if (tab === 'theory-master' || tab === 'theory-lecture' || tab === 'theory-coordinator') {
    Theory.renderTheoryTab(tab);
  }
  applyNavShell(getNavShell());
  renderCourseDropdown();
  updateCloseoutBanner(data);
  Permissions.apply();
  updateCourseStatusLine();
  updateUserStatusLine();
  updatePlaygroundMenuState();
}

function updatePlaygroundMenuState() {
  var enterBtn = document.getElementById('menuPlaygroundBtn');
  var exitBtn = document.getElementById('menuExitPlaygroundBtn');
  if (enterBtn) enterBtn.classList.toggle('hidden', isPlaygroundShell());
  if (exitBtn) exitBtn.classList.toggle('hidden', !isPlaygroundShell());
}

export function guardEditable(action) {
  if (UserSession.isValidated()) {
    if (action === 'masterCell' && Permissions.isDashboardReadOnly()) return false;
    if (action === 'setup') {
      if (!Permissions.canAction('setup.edit') &&
          !Permissions.canAction('setup.saveDraft') &&
          !Permissions.canAction('proposals.submit')) return false;
    }
    if (action === 'regenerate' && !Permissions.canAction('setup.edit')) return false;
    if (action === 'makeup' &&
        !Permissions.canAction('setup.edit') &&
        !Permissions.canAction('makeup.edit')) return false;
  }
  var data = getData();
  if (!data || Audit.canEdit(data, action)) return true;
  showAlert('Semester in closeout',
    'Semester in closeout — editing disabled. Reopen from the Audit tab if corrections are needed.');
  return false;
}

export function updateCloseoutBanner(data) {
  var banner = document.getElementById('closeoutBanner');
  if (!banner) return;
  var readOnly = !!(data && Audit.isReadOnly(data));
  banner.classList.toggle('hidden', !readOnly);
  if (readOnly) {
    banner.textContent = Audit.isLocked(data)
      ? 'Semester locked — editing disabled. Dashboard, Student View, print, and Excel export remain available.'
      : 'Audit exported — editing disabled pending signatures. Reopen for corrections from the Audit tab if changes are needed.';
  }
}

export function switchTab(tabId) {
  if (!Permissions.canTab(tabId)) {
    showAlert('Not permitted', 'Your role cannot access this tab.');
    return;
  }
  if (tabId !== 'dashboard' && tabId !== 'theory-master' && tabId !== 'playground-dashboard' && setScheduleFullscreen) {
    setScheduleFullscreen(false);
  }
  state.currentTab = tabId;
  document.querySelectorAll('.view-panel').forEach(function (el) {
    el.classList.toggle('active', el.id === 'view-' + tabId);
  });
  document.querySelectorAll('.nav-tab').forEach(function (el) {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });
  refresh();
}

export function toggleDarkMode() {
  Theme.toggle();
}

export function switchSemester(semesterId) {
  if (!state.fileRoot) return;
  syncSemesterToFile();
  var sem = state.fileRoot.semesters.find(function (s) { return s.id === semesterId; });
  if (!sem) return;
  state.fileRoot.meta.activeSemesterId = semesterId;
  state.data = sem;
  rebuildWeeks(sem);
  notifyChange();
  populateFilters(sem);
  refresh();
}

export function addSemester(season, year, courseId) {
  if (!state.fileRoot || !state.data) return null;
  syncSemesterToFile();
  var cur = state.data.meta;
  var nextSeason = season || (cur.semesterSeason === 'spring' ? 'fall' : 'spring');
  var nextYear = year || (nextSeason === 'fall' && cur.semesterSeason === 'spring'
    ? cur.semesterYear
    : (nextSeason === 'spring' && cur.semesterSeason === 'fall' ? cur.semesterYear + 1 : cur.semesterYear));
  var newSem = DataModel.createNewSemesterFromTemplate(state.data, nextSeason, nextYear);
  var curCourse = cur.courseId || '';
  var nextCourse = courseId !== undefined ? (courseId || '') : curCourse;
  if (nextCourse && nextCourse !== curCourse) {
    CourseDefaults.applyToSemester(newSem, nextCourse);
  } else {
    newSem.meta.courseId = nextCourse;
    DataModel.applyConfigToSemester(
      newSem,
      DataModel.getSchedulingDefaults(state.fileRoot),
      false
    );
  }
  regenerateAll(newSem);
  state.fileRoot.semesters.push(newSem);
  state.fileRoot.meta.activeSemesterId = newSem.id;
  state.data = newSem;
  notifyChange();
  populateFilters(newSem);
  refresh();
  return newSem;
}

export { initCourseSelector } from './course-selector.js';
