/** Application entry — boot storage, auth, and UI event wiring. */

window.__regnAppBooted = true;

import '../css/app.css';
import '../css/print.css';
import '../css/audit-print.css';
import './pwa.js';

import {
  state,
  getData,
  setFileRoot,
  markClean,
  onStateChange
} from './core/state.js';
import { rebuildWeeks } from './core/calendar-engine.js';
import { regenerateAll } from './core/scheduler/index.js';
import * as Storage from './storage/semester-storage.js';
import * as SimFacultyStorage from './storage/sim-faculty-storage.js';
import * as ClinicalSitesLibraryStorage from './storage/clinical-sites-library-storage.js';
import * as TheoryLibraryStorage from './storage/theory-library-storage.js';
import * as UserStorage from './storage/user-storage.js';
import * as UsersRegistryStorage from './storage/users-registry-storage.js';
import * as UserSession from './auth/user-session.js';
import * as Permissions from './auth/permissions.js';
import * as Theme from './ui/theme.js';
import * as Dashboard from './ui/dashboard/index.js';
import * as MasterCalendar from './ui/master-calendar.js';
import * as StudentView from './ui/student-view.js';
import * as SimRoles from './ui/sim-roles.js';
import * as MakeupFinder from './ui/makeup-finder.js';
import * as AuditCloseout from './ui/audit-closeout.js';
import * as SetupConfig from './ui/setup-config/index.js';
import * as Setup from './ui/setup/index.js';
import * as ConfigModal from './ui/config-modal.js';
import * as SetupProposals from './ui/setup-proposals.js';
import * as Playground from './ui/playground.js';
import { initToolbar } from './ui/playground/toolbar.js';
import { enterPlaygroundShell, exitPlaygroundShell } from './ui/playground-shell.js';
import * as NewSemesterBatch from './ui/new-semester-batch.js';
import * as UsersAdmin from './ui/users-admin.js';
import * as ClinicalSitesTab from './ui/clinical-sites-tab.js';
import * as PlaygroundImport from './ui/playground-import.js';
import * as Theory from './ui/theory/index.js';
import { init as initLectureAssignments } from './ui/theory/lecture-assignments.js';
import * as DateInputs from './ui/date-inputs.js';
import { openLibraryTab, getNavShell } from './ui/course-selector.js';
import {
  initSemesterMenu,
  initCourseSelector,
  refresh,
  switchTab,
  closeMenu,
  toggleMenu,
  toggleDarkMode,
  updateUserStatusLine
} from './ui/chrome.js';
import { closeDialog, showAlert, showConfirm } from './ui/dialogs.js';

function persistSemesterFiles() {
  return Promise.all([
    Storage.saveCurrent(),
    ClinicalSitesLibraryStorage.isReady()
      ? ClinicalSitesLibraryStorage.saveCurrent() : Promise.resolve()
  ]);
}

function syncSemesterToOneDrive() {
  if (state.fileHandle) {
    return persistSemesterFiles().then(function () {
      showAlert('Synced', 'Changes saved to OneDrive.');
    });
  }
  if (Storage.supportsFS()) {
    return Storage.createFilePicker().then(function (fileRoot) {
      setFileRoot(fileRoot);
      SimFacultyStorage.hydrateFromFileRoot(fileRoot);
      Dashboard.populateFilters(getData());
      refresh();
      showAlert('Synced', 'Semester file saved to OneDrive.');
    }).catch(function () {});
  }
  Storage.exportDownload();
}

export function initUI() {
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

  document.querySelectorAll('.nav-tab').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
  });

  document.getElementById('menuToggle').addEventListener('click', function (e) {
    e.stopPropagation();
    toggleMenu();
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.menu-wrap')) closeMenu();
  });

  document.getElementById('darkModeToggle').addEventListener('click', function () {
    toggleDarkMode();
    closeMenu();
  });

  var loadUserMenuBtn = document.getElementById('loadUserFileMenuBtn');
  if (loadUserMenuBtn) {
    loadUserMenuBtn.addEventListener('click', function () {
      UserStorage.openFilePicker().then(function () {
        return UserSession.validateAndSetSession();
      }).then(function (r) {
        if (r.ok) {
          Permissions.apply();
          updateUserStatusLine();
        }
      }).catch(function () {});
      closeMenu();
    });
  }

  var loadRegistryMenuBtn = document.getElementById('loadRegistryMenuBtn');
  if (loadRegistryMenuBtn) {
    loadRegistryMenuBtn.addEventListener('click', function () {
      UsersRegistryStorage.openFilePicker().then(function () {
        return UserSession.validateAndSetSession();
      }).then(function (r) {
        if (r.ok) {
          Permissions.apply();
          refresh();
        } else if (UsersRegistryStorage.isReady()) {
          refresh();
        }
      }).catch(function () {});
      closeMenu();
    });
  }

  var logoutUserMenuBtn = document.getElementById('logoutUserMenuBtn');
  if (logoutUserMenuBtn) {
    logoutUserMenuBtn.addEventListener('click', function () {
      closeMenu();
      UserSession.logout();
    });
  }

  document.getElementById('importBtn').addEventListener('click', function () {
    document.getElementById('importFileInput').click();
    closeMenu();
  });

  document.getElementById('importFileInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    Storage.importFromFile(file).then(function (fileRoot) {
      var sem = fileRoot.semesters.find(function (s) {
        return s.id === fileRoot.meta.activeSemesterId;
      }) || fileRoot.semesters[0];
      rebuildWeeks(sem);
      setFileRoot(fileRoot);
      state.fileName = file.name;
      state.fileHandle = null;
      markClean();
      Storage.cacheData(fileRoot);
      Dashboard.populateFilters(sem);
      refresh();
    }).catch(function () { showAlert('Invalid file', 'Invalid semester file.'); });
    e.target.value = '';
  });

  document.getElementById('exportBtn').addEventListener('click', function () {
    Storage.exportDownload();
    closeMenu();
  });

  document.getElementById('clearStorageBtn').addEventListener('click', function () {
    closeMenu();
    var msg = 'This will erase all semester data saved on this device and restore the default roster and settings. ' +
      'Any connected OneDrive file will be disconnected. This cannot be undone.\n\nContinue?';
    showConfirm('Clear local data?', msg, function () {
      Storage.clearAndRestoreDefaults().then(function () {
        Dashboard.populateFilters(getData());
        refresh();
      });
    }, { confirmLabel: 'Continue' });
  });

  document.getElementById('saveBtn').addEventListener('click', function () {
    persistSemesterFiles().then(function () {
      if (Storage.supportsFS() && state.fileHandle) {
        showAlert('Saved', 'Saved to connected file(s).');
      } else {
        showAlert('Saved', 'Saved on this device. Export backup to OneDrive when finished.');
      }
    });
    closeMenu();
  });

  var syncOneDriveBtn = document.getElementById('syncOneDriveBtn');
  if (syncOneDriveBtn) {
    syncOneDriveBtn.addEventListener('click', function () {
      syncSemesterToOneDrive();
    });
  }

  if (Storage.supportsFS()) {
    document.getElementById('openFileBtn').addEventListener('click', function () {
      Storage.openFilePicker().then(function (fileRoot) {
        setFileRoot(fileRoot);
        SimFacultyStorage.hydrateFromFileRoot(fileRoot);
        Dashboard.populateFilters(getData());
        refresh();
      }).catch(function () {});
      closeMenu();
    });
    document.getElementById('newFileBtn').addEventListener('click', function () {
      if (!Permissions.guard('semester.batchCreate') && !Permissions.canAction('*')) {
        closeMenu();
        return;
      }
      Storage.createFilePicker().then(function (fileRoot) {
        var sem = getData();
        if (sem) regenerateAll(sem);
        setFileRoot(fileRoot);
        Dashboard.populateFilters(sem);
        refresh();
      }).catch(function () {});
      closeMenu();
    });
  } else {
    ['openFileBtn', 'newFileBtn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  onStateChange(function () { Storage.updateStatusUI(); });
  Permissions.apply();
}

export function main() {
  UserSession.initGateUI();
  UserSession.init().then(function (sessionResult) {
    if (sessionResult.needsGate) {
      UserSession.showGateModal(sessionResult.error);
    }
    return Storage.init();
  }).then(function (fileRoot) {
    return ClinicalSitesLibraryStorage.init().then(function () {
      if (fileRoot && ClinicalSitesLibraryStorage.migrateFromSemesterOverlay(fileRoot)) {
        ClinicalSitesLibraryStorage.saveCurrent();
      }
      return TheoryLibraryStorage.init().then(function () {
        return SimFacultyStorage.init(fileRoot).then(function () {
          return fileRoot;
        });
      });
    });
  }).then(function (fileRoot) {
    Theme.init(fileRoot);
    Dashboard.populateFilters(getData());
    initUI();
    if (UserSession.isValidated() && Storage.isSemesterFileConnected()) {
      UserSession.hideGateModal();
      var bootTab = getNavShell() === 'theory' ? 'theory-master' : 'dashboard';
      switchTab(bootTab);
    } else if (UserSession.isValidated()) {
      UserSession.showGateModal('');
      UserSession.updateGateStep('');
    }
    document.dispatchEvent(new Event('AppReady'));
  });
}

if (!import.meta.env.VITEST) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
}
