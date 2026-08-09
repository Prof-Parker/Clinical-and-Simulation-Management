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

import { getData } from './core/state.js';
import * as Storage from './storage/semester-storage.js';
import * as SimFacultyStorage from './storage/sim-faculty-storage.js';
import * as ClinicalSitesLibraryStorage from './storage/clinical-sites-library-storage.js';
import * as TheoryLibraryStorage from './storage/theory-library-storage.js';
import * as UserSession from './auth/user-session.js';
import * as Theme from './ui/theme.js';
import * as Dashboard from './ui/dashboard/index.js';
import { getNavShell } from './ui/course-selector.js';
import { switchTab } from './ui/chrome.js';
import { wireAppShell } from './ui/app-shell-wiring.js';
import { wireFileMenu } from './ui/file-menu-wiring.js';

export function initUI() {
  wireAppShell();
  wireFileMenu();
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
