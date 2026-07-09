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
import { render as renderPlayground } from './playground.js';
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

export function buildSemesterLabelHtml(parts) {
  var draftTip = 'Information for this semester hasn\'t been finalized yet, proceed with caution';
  var html = '<span class="semester-label-inner">';
  if (parts.season) {
    var seasonLabel = parts.season === 'fall' ? 'Fall' : 'Spring';
    html += '<span class="season-name season-' + parts.season + '">' + seasonLabel + '</span>';
    html += '<span class="season-year">' + parts.year + '</span>';
  } else {
    html += '<span class="season-year">' + (parts.name || 'Semester') + '</span>';
  }
  if (!parts.finalized) {
    html += '<span class="semester-draft" title="' + draftTip + '">*</span>';
  }
  html += '</span>';
  return html;
}

export function updateCourseStatusLine() {
  updateCourseStatusLabel();
}

export function updateUserStatusLine() {
  var el = document.getElementById('userStatusLine');
  if (!el) return;
  var session = UserSession.getSession();
  if (!session) {
    el.textContent = '';
    return;
  }
  el.textContent = session.name + ' (' + UserTemplate.roleDisplayName(session.role) + ')';
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
    refreshSemesterSwitchMenu();
    if (Permissions.applyMenuGating) Permissions.applyMenuGating();
  }
}

export function refresh() {
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
  if (tab === 'playground') renderPlayground();
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
  if (tabId !== 'dashboard' && tabId !== 'theory-master' && setScheduleFullscreen) {
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
