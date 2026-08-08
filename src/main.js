/** Application entry — boot storage, auth, and UI event wiring. */

window.__regnAppBooted = true;

import '../css/app.css';
import '../css/print.css';
import '../css/audit-print.css';
import './pwa.js';
import { formatAppVersionLabel } from './app-version.js';
import { runBootTail } from './boot-finish.js';

function paintAppVersionBadge() {
  var el = document.getElementById('appVersionBadge');
  if (el) el.textContent = formatAppVersionLabel();
}
paintAppVersionBadge();

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
import { openLibraryTab, getNavShell, initCourseSelector } from './ui/course-selector.js';
import { initSemesterPicker } from './ui/semester-picker.js';
import {
  initSemesterMenu,
  refresh,
  switchTab,
  closeMenu,
  toggleMenu,
  closeUserMenu,
  toggleUserMenu,
  toggleDarkMode,
  updateUserStatusLine
} from './ui/chrome.js';
import * as ProgramData from './storage/program-data.js';
import { isCancelError } from './ui/hybrid-save-ui.js';
import { closeDialog, showAlert, showConfirm } from './ui/dialogs.js';

function persistSemesterFiles() {
  return Promise.all([
    Storage.saveCurrent(),
    ClinicalSitesLibraryStorage.isReady()
      ? ClinicalSitesLibraryStorage.saveCurrent() : Promise.resolve()
  ]).then(function (results) {
    return results[0] || { ok: true };
  });
}

function confirmDownloadBackup() {
  var name = Storage.suggestedDownloadName
    ? Storage.suggestedDownloadName()
    : (state.fileName || 'semester.json');
  var folder = state.appShell === 'playground' ? 'playgrounds/' : 'semesters/';
  var isEngineer = Permissions.canAction('*');
  var msg = 'Save to Files → OneDrive → ' + folder + ' and replace only:\n\n' + name +
    '\n\nThe browser cannot check the target file before you replace it.';
  if (isEngineer) {
    Storage.exportDownload();
    if (!Storage.supportsFS()) {
      Storage.flashStatus('Download started — replace ' + name + ' in ' + folder, 'warn');
    }
    return;
  }
  showConfirm('Download backup', msg, function () {
    Storage.exportDownload();
    if (!Storage.supportsFS()) {
      Storage.flashStatus('Download started — replace ' + name + ' in ' + folder, 'warn');
    }
  }, { confirmLabel: 'Download backup' });
}

function syncSemesterToOneDrive() {
  if (state.fileHandle) {
    return persistSemesterFiles().then(function (result) {
      if (result && result.ok && result.synced) {
        Storage.flashStatus('Synced to OneDrive', 'ok');
        return;
      }
      if (result && result.reloaded) {
        showAlert('Reloaded', 'Loaded the newer copy from OneDrive. Make your edits again, then Sync.');
        return;
      }
      var msg = (result && result.error && result.error.message)
        ? result.error.message
        : 'Could not write to the connected OneDrive file. Changes were kept on this device only.';
      showAlert('Sync failed', msg);
    }).catch(function (err) {
      if (isCancelError(err)) return;
      showAlert('Sync failed', (err && err.message) || 'Could not sync to OneDrive.');
    });
  }
  if (Storage.supportsFS()) {
    return Storage.saveWithChooser({
      forceChooser: true,
      preferredDest: 'folder',
      title: 'Save as…',
      message: 'No semester file is linked for Sync yet. Prefer Save to the ProgramData semesters/ folder ' +
        'or Overwrite existing so the file type is checked before write.'
    }).then(function (fileRoot) {
      if (fileRoot) {
        setFileRoot(fileRoot);
        SimFacultyStorage.hydrateFromFileRoot(fileRoot);
        Dashboard.populateFilters(getData());
        refresh();
      }
      Storage.flashStatus('Semester file linked and saved', 'ok');
    }).catch(function (err) {
      if (isCancelError(err)) return;
      showAlert(
        'Save failed',
        (err && err.message) || 'Could not save to OneDrive.'
      );
    });
  }
  confirmDownloadBackup();
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

  document.querySelectorAll('.nav-tab').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
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

  document.getElementById('importBtn').addEventListener('click', function () {
    closeMenu();
    if (!Permissions.guard('files.openCopy')) return;
    document.getElementById('importFileInput').click();
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
      showAlert(
        'Opened copy',
        'Loaded "' + file.name + '" on this device only (not linked for Sync). ' +
        'Use Save as… or Connect ProgramData to link OneDrive writes.'
      );
    }).catch(function (err) {
      showAlert('Invalid file', (err && err.message) || 'Invalid semester file.');
    });
    e.target.value = '';
  });

  document.getElementById('exportBtn').addEventListener('click', function () {
    closeMenu();
    if (!Permissions.guard('files.downloadBackup')) return;
    confirmDownloadBackup();
  });

  document.getElementById('clearStorageBtn').addEventListener('click', function () {
    closeMenu();
    if (!Permissions.guard('files.clearStorage')) return;
    var msg = 'This will erase all semester data saved on this device and restore the default roster and settings. ' +
      'The connected OneDrive file, ProgramData folder, and cached users registry are disconnected, ' +
      'so you will sign in from the beginning. This cannot be undone.\n\nContinue?';
    showConfirm('Clear local data?', msg, function () {
      Storage.clearAndRestoreDefaults().then(function () {
        return UsersRegistryStorage.clearRegistry();
      }).then(function () {
        return UserStorage.clearProfile();
      }).then(function () {
        UserSession.clearSession();
        Dashboard.populateFilters(getData());
        refresh();
        UserSession.showGateModal('');
      });
    }, { confirmLabel: 'Continue' });
  });

  document.getElementById('saveBtn').addEventListener('click', function () {
    persistSemesterFiles().then(function (result) {
      if (Storage.supportsFS() && state.fileHandle) {
        if (result && result.ok === false) {
          showAlert(
            'Saved locally',
            (result.error && result.error.message) ||
              'Could not write to OneDrive. Changes are on this device only — try Sync or Save as…'
          );
        } else {
          Storage.flashStatus('Saved to linked file', 'ok');
        }
      } else {
        Storage.flashStatus('Saved on this device (not linked)', 'warn');
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

  function wireProgramDataMenu(btnId) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      closeMenu();
      if (!Permissions.canAction('files.programData') &&
          !Permissions.canAction('files.programDataReconnect') &&
          !Permissions.canAction('*')) {
        Permissions.guard('files.programData');
        return;
      }
      if (typeof window.showDirectoryPicker !== 'function') {
        showAlert('Unavailable', 'Folder picker is not available in this browser. Use Download backup or Open copy…');
        return;
      }
      ProgramData.connectProgramData().then(function () {
        Storage.flashStatus('ProgramData folder linked', 'ok');
        Storage.updateStatusUI();
        Permissions.apply();
      }).catch(function (err) {
        if (isCancelError(err)) return;
        showAlert('Could not connect', (err && err.message) || 'ProgramData folder picker failed.');
      });
    });
  }
  wireProgramDataMenu('connectProgramDataBtn');
  wireProgramDataMenu('reconnectProgramDataBtn');

  var saveAsBtn = document.getElementById('saveAsBtn');
  if (saveAsBtn) {
    saveAsBtn.addEventListener('click', function () {
      closeMenu();
      if (!Permissions.canAction('files.saveAs') && !Permissions.canAction('files.saveAsEscape') &&
          !Permissions.canAction('*')) {
        Permissions.guard('files.saveAs');
        return;
      }
      Storage.saveWithChooser({
        forceChooser: true,
        preferredDest: 'folder',
        title: 'Save as…',
        message: 'Prefer Save to the ProgramData semesters/ folder or Overwrite existing so the file type is checked before write.'
      }).then(function (fileRoot) {
        if (fileRoot) {
          setFileRoot(fileRoot);
          SimFacultyStorage.hydrateFromFileRoot(fileRoot);
          Dashboard.populateFilters(getData());
          refresh();
        }
      }).catch(function (err) {
        if (isCancelError(err)) return;
        showAlert('Save failed', (err && err.message) || 'Could not save.');
      });
    });
  }

  if (Storage.supportsFS()) {
    var openFileBtn = document.getElementById('openFileBtn');
    if (openFileBtn) {
      openFileBtn.addEventListener('click', function () {
        closeMenu();
        if (!Permissions.guard('files.connectRaw')) return;
        Storage.openFilePicker().then(function (fileRoot) {
          setFileRoot(fileRoot);
          SimFacultyStorage.hydrateFromFileRoot(fileRoot);
          Dashboard.populateFilters(getData());
          refresh();
        }).catch(function (err) {
          if (isCancelError(err)) return;
          showAlert('Open failed', (err && err.message) || 'Could not open semester file.');
        });
      });
    }
    var newFileBtn = document.getElementById('newFileBtn');
    if (newFileBtn) {
      newFileBtn.addEventListener('click', function () {
        closeMenu();
        if (!Permissions.guard('files.connectRaw')) return;
        Storage.createFilePicker().then(function (fileRoot) {
          var sem = getData();
          if (sem) regenerateAll(sem);
          setFileRoot(fileRoot);
          Dashboard.populateFilters(sem);
          refresh();
        }).catch(function (err) {
          if (isCancelError(err)) return;
          showAlert('Save failed', (err && err.message) || 'Could not create OneDrive file.');
        });
      });
    }
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
    return runBootTail({
      UserSession: UserSession,
      Storage: Storage,
      getNavShell: getNavShell,
      switchTab: switchTab
    });
  });
}

if (!import.meta.env.VITEST) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
}
