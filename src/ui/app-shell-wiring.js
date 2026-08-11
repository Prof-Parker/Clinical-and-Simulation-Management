/**
 * App shell wiring — panel inits, nav tabs, menus, dialogs, user menu actions.
 */

import { getData, onStateChange } from '../core/state.js';
import * as Storage from '../storage/semester-storage.js';
import * as UsersRegistryStorage from '../storage/users-registry-storage.js';
import * as UserSession from '../auth/user-session.js';
import * as Permissions from '../auth/permissions.js';
import * as Dashboard from './dashboard/index.js';
import * as MasterCalendar from './master-calendar.js';
import * as StudentView from './student-view.js';
import * as SimRoles from './sim-roles.js';
import * as MakeupFinder from './makeup-finder.js';
import * as AuditCloseout from './audit-closeout.js';
import * as SetupConfig from './setup-config/index.js';
import * as Setup from './setup/index.js';
import * as ConfigModal from './config-modal.js';
import * as SetupProposals from './setup-proposals.js';
import * as Playground from './playground.js';
import { initToolbar } from './playground/toolbar.js';
import { enterPlaygroundShell, exitPlaygroundShell } from './playground-shell.js';
import * as NewSemesterBatch from './new-semester-batch.js';
import * as UsersAdmin from './users-admin.js';
import * as ClinicalSitesTab from './clinical-sites-tab.js';
import * as PlaygroundImport from './playground-import.js';
import * as Theory from './theory/index.js';
import { init as initLectureAssignments } from './theory/lecture-assignments.js';
import * as DateInputs from './date-inputs.js';
import { openLibraryTab, initCourseSelector } from './course-selector.js';
import { initSemesterPicker } from './semester-picker.js';
import { initWorkspaceNav } from './workspace-nav.js';
import {
  initSemesterMenu,
  refresh,
  switchTab,
  closeMenu,
  toggleMenu,
  closeUserMenu,
  toggleUserMenu,
  toggleDarkMode
} from './chrome.js';
import { closeDialog, showAlert } from './dialogs.js';

export function wireAppShell() {
  if (Storage.configureImportInput) Storage.configureImportInput();
  Dashboard.init();
  MasterCalendar.init();
  StudentView.init();
  SimRoles.init();
  MakeupFinder.init();
  AuditCloseout.init();
  SetupConfig.init();
  Setup.init();
  ConfigModal.init();
  SetupProposals.init();
  Playground.init();
  initToolbar();
  NewSemesterBatch.init();
  UsersAdmin.init();
  ClinicalSitesTab.init();
  PlaygroundImport.init();
  Theory.init();
  initLectureAssignments();
  initCourseSelector();
  initSemesterPicker();
  initSemesterMenu();

  var menuUsersBtn = document.getElementById('menuUsersLibraryBtn');
  if (menuUsersBtn) {
    menuUsersBtn.addEventListener('click', function () { openLibraryTab('users'); });
  }
  var menuSitesBtn = document.getElementById('menuClinicalSitesBtn');
  if (menuSitesBtn) {
    menuSitesBtn.addEventListener('click', function () { openLibraryTab('clinical-sites'); });
  }

  var menuPlaygroundBtn = document.getElementById('menuPlaygroundBtn');
  if (menuPlaygroundBtn) {
    menuPlaygroundBtn.addEventListener('click', function () { enterPlaygroundShell(); });
  }
  var menuExitPlaygroundBtn = document.getElementById('menuExitPlaygroundBtn');
  if (menuExitPlaygroundBtn) {
    menuExitPlaygroundBtn.addEventListener('click', function () { exitPlaygroundShell(); });
  }

  if (getData() && DateInputs.init) {
    DateInputs.init(document.getElementById('view-setup'), getData());
  }

  document.getElementById('dialogCancel').addEventListener('click', function () {
    closeDialog();
  });

  document.getElementById('dialogModal').addEventListener('click', function (e) {
    if (e.target.id === 'dialogModal') closeDialog();
  });

  initWorkspaceNav({
    switchTab: switchTab,
    onSandbox: enterPlaygroundShell,
    onExitPlayground: exitPlaygroundShell
  });

  document.getElementById('menuToggle').addEventListener('click', function (e) {
    e.stopPropagation();
    toggleMenu();
  });

  var userMenuToggle = document.getElementById('userMenuToggle');
  if (userMenuToggle) {
    userMenuToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleUserMenu();
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.menu-wrap')) closeMenu();
    if (!e.target.closest('.user-menu-wrap')) closeUserMenu();
  });

  document.getElementById('darkModeToggle').addEventListener('click', function () {
    toggleDarkMode();
    closeUserMenu();
  });

  var changePasswordBtn = document.getElementById('changePasswordBtn');
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', function () {
      closeUserMenu();
      showAlert(
        'Change password',
        'Changing your password from inside the app is not available yet. ' +
        'Ask your program engineer to reset it in the users registry.'
      );
    });
  }

  var switchUserMenuBtn = document.getElementById('switchUserMenuBtn');
  if (switchUserMenuBtn) {
    switchUserMenuBtn.addEventListener('click', function () {
      closeUserMenu();
      UserSession.beginUserSwitch();
      UserSession.showGateModal('');
    });
  }

  var loadRegistryMenuBtn = document.getElementById('loadRegistryMenuBtn');
  if (loadRegistryMenuBtn) {
    loadRegistryMenuBtn.addEventListener('click', function () {
      UsersRegistryStorage.openFilePicker().then(function () {
        UserSession.beginUserSwitch();
        UserSession.showGateModal('');
        refresh();
      }).catch(function () {});
      closeUserMenu();
    });
  }

  var logoutUserMenuBtn = document.getElementById('logoutUserMenuBtn');
  if (logoutUserMenuBtn) {
    logoutUserMenuBtn.addEventListener('click', function () {
      closeUserMenu();
      UserSession.logout();
    });
  }

  onStateChange(function () { Storage.updateStatusUI(); });
  Permissions.apply();
}
