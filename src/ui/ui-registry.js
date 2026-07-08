/**
 * UI surface registry — contract between index.html, tab routing, and smoke tests.
 *
 * When adding UI:
 * 1. Add markup to index.html (or a template partial).
 * 2. Register the tab, menu item, or anchor here.
 * 3. Wire behavior in main.js / feature module init.
 * 4. Run `npm test` — ui-smoke.test.js validates presence and routing.
 */

export var UI_REGISTRY_VERSION = 1;

/** Nav tabs: id must match .nav-tab[data-tab] and #view-{id}. */
export var UI_TABS = [
  {
    id: 'dashboard',
    anchors: [
      'scheduleBody', 'scheduleHeadRow', 'scheduleExportXlsxBtn', 'scheduleFullscreenBtn',
      'scheduleGroupFilter', 'simTableBody', 'loadChart', 'weekFilter'
    ]
  },
  {
    id: 'student',
    anchors: ['studentViewSelect', 'showMarkupToggle', 'printStudentBtn', 'studentCalendarPrint']
  },
  {
    id: 'roles',
    anchors: ['simFacultyBanner', 'roleSimSelect', 'roleGroupSelect', 'roleTableBody']
  },
  {
    id: 'makeup',
    anchors: ['makeupStudentSelect', 'makeupTypeSelect', 'makeupResults']
  },
  {
    id: 'audit',
    anchors: ['auditCloseout']
  },
  {
    id: 'setup',
    anchors: [
      'saveSetupBtn', 'regenerateSchedulesBtn', 'setupAdvancedConfigBtn', 'finalizeSemesterBtn',
      'setupSections', 'setupFaculty', 'setupFacilities', 'setupHolidays', 'setupRoster',
      'cfgClinicalGroupsList', 'cfgSimGroupsList', 'cfgSimDaysList', 'setupAdvancedPanel'
    ]
  },
  {
    id: 'playground',
    anchors: [
      'playgroundStatus', 'playgroundLoadSemesterBtn', 'playgroundCourseSelect',
      'playgroundSaveBtn', 'playgroundConfigSummary'
    ]
  },
  {
    id: 'users',
    anchors: ['usersAdminPanel']
  },
  {
    id: 'clinical-sites',
    anchors: ['clinicalSitesConnectBtn', 'clinicalSitesTabLibrary', 'clinicalSitesProposals']
  },
  {
    id: 'theory',
    anchors: ['theoryStubPanel']
  }
];

/** Header, menu, and global chrome (always present when app shell loads). */
export var UI_SHELL = [
  'appMain', 'fileStatus', 'userStatusLine', 'courseStatusLine', 'menuToggle', 'menuDropdown',
  'closeoutBanner', 'pwaInstallBanner', 'pwaIosInstallBanner', 'pwaOnedriveBanner'
];

/** Menu actions wired in main.js initUI (may be hidden by role or FS API). */
export var UI_MENU = [
  'darkModeToggle', 'loadUserFileMenuBtn', 'loadRegistryMenuBtn', 'logoutUserMenuBtn',
  'newSemesterBatchBtn', 'semesterSwitchMenu', 'openFileBtn', 'newFileBtn', 'importBtn',
  'exportBtn', 'clearStorageBtn', 'saveBtn'
];

/** Hidden file inputs triggered from menu or tabs. */
export var UI_FILE_INPUTS = [
  'importFileInput', 'importUserFileInput', 'importRegistryFileInput', 'importPlaygroundInput'
];

/** Modal overlays and primary dialog controls. */
export var UI_MODALS = {
  userGate: [
    'userGateModal', 'userGateTitle', 'userGateLoadRegistryBtn', 'userGateLoadUserBtn',
    'userGateStep1', 'userGateStep2'
  ],
  config: ['configModal', 'configModalClose', 'configModalCancel', 'configModalSave', 'configModalBody'],
  dialog: ['dialogModal', 'dialogTitle', 'dialogBody', 'dialogCancel', 'dialogSave']
};

export function viewIdForTab(tabId) {
  return 'view-' + tabId;
}

export function tabIds() {
  return UI_TABS.map(function (t) { return t.id; });
}

export function flattenModalIds() {
  return UI_MODALS.userGate.concat(UI_MODALS.config, UI_MODALS.dialog);
}

export function allRegisteredElementIds() {
  var ids = UI_SHELL.concat(UI_MENU, UI_FILE_INPUTS, flattenModalIds());
  UI_TABS.forEach(function (tab) {
    ids.push(viewIdForTab(tab.id));
    ids = ids.concat(tab.anchors);
  });
  return ids;
}

/** Registry self-check: no duplicate ids, valid tab id characters. */
export function validateRegistry() {
  var errors = [];
  var seen = {};
  allRegisteredElementIds().forEach(function (id) {
    if (seen[id]) errors.push('Duplicate registry id: ' + id);
    seen[id] = true;
  });
  UI_TABS.forEach(function (tab) {
    if (!tab.id || !/^[a-z][a-z0-9-]*$/.test(tab.id)) {
      errors.push('Invalid tab id: ' + tab.id);
    }
    if (viewIdForTab(tab.id) === 'view-') errors.push('Tab missing id');
  });
  return errors;
}
