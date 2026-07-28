/**
 * UI surface registry — contract between index.html, tab routing, and smoke tests.
 */

export var UI_REGISTRY_VERSION = 2;

export var UI_NAV_CLINICAL = [
  'dashboard', 'student', 'roles', 'makeup', 'audit', 'setup'
];

export var UI_NAV_PLAYGROUND = [
  'playground-dashboard', 'playground-setup'
];

export var UI_NAV_THEORY = [
  'theory-master', 'theory-lecture', 'theory-coordinator'
];

export var UI_NAV_LIBRARY = [
  'users', 'clinical-sites'
];

/** Nav tabs: id must match .nav-tab[data-tab] and #view-{id}. */
export var UI_TABS = [
  {
    id: 'dashboard',
    shell: 'clinical',
    anchors: [
      'scheduleBody', 'scheduleHeadRow', 'scheduleExportXlsxBtn', 'scheduleFullscreenBtn',
      'scheduleGroupFilter', 'simTableBody', 'loadChart', 'weekFilter'
    ]
  },
  {
    id: 'student',
    shell: 'clinical',
    anchors: [
      'studentViewSelect', 'studentCalendarType', 'showMarkupToggle',
      'printStudentBtn', 'exportStudentIcsBtn', 'batchExportStudentCalBtn', 'studentCalendarPrint'
    ]
  },
  {
    id: 'roles',
    shell: 'clinical',
    anchors: ['simFacultyBanner', 'roleSimSelect', 'roleGroupSelect', 'roleSessionMeta', 'roleTableBody']
  },
  {
    id: 'makeup',
    shell: 'clinical',
    anchors: ['makeupStudentSelect', 'makeupTypeSelect', 'makeupResults']
  },
  {
    id: 'audit',
    shell: 'clinical',
    anchors: ['auditCloseout']
  },
  {
    id: 'setup',
    shell: 'clinical',
    anchors: [
      'saveSetupBtn', 'regenerateSchedulesBtn', 'setupAdvancedConfigBtn', 'finalizeSemesterBtn',
      'setupSections', 'setupFaculty', 'setupSimInstructors', 'setupFacilities', 'setupHolidays', 'setupRoster',
      'cfgClinicalGroupsList', 'cfgSimGroupsList', 'cfgSimDaysList', 'cfgSimDefaultStart',
      'cfgSimDefaultEnd', 'cfgSimTimeOverrides', 'setupAdvancedPanel'
    ]
  },
  {
    id: 'playground-dashboard',
    shell: 'playground',
    anchors: [
      'playgroundStatus', 'playgroundLoadSemesterBtn', 'playgroundCourseSelect',
      'playgroundSaveBtn', 'playgroundImportBtn', 'pgDashEmptyState', 'pgDashContent',
      'pgDashConflictsPanel', 'pgDashScheduleHeadRow', 'pgDashScheduleBody', 'pgDashSimTableBody',
      'pgDashLoadChart', 'pgDashReqClinLabel', 'pgDashReqSimLabel'
    ]
  },
  {
    id: 'playground-setup',
    shell: 'playground',
    anchors: ['playgroundSetupRoot']
  },
  {
    id: 'theory-master',
    shell: 'theory',
    anchors: [
      'theoryMasterGrid', 'theoryTopicLibraryPanel', 'theoryTopicLibraryList', 'theorySkillsLibraryList',
      'theoryLibraryConnectPrompt', 'theoryLibraryConnectBtn', 'theoryLibraryCreateBtn', 'theoryLibraryStatus',
      'theoryLibrarySections', 'theoryLibraryUnlockBtn', 'theoryLibraryLockBtn', 'theoryLibraryUnlockedBanner',
      'theoryMasterSetup', 'theorySaveSetupBtn', 'theoryAdvancedConfigBtn',
      'theoryLectureWeekdays', 'theoryDefaultLectureStart', 'theoryDefaultLectureEnd',
      'theoryDefaultSkillsStart', 'theoryDefaultSkillsEnd', 'theoryDefaultSkillsFacultyRequired',
      'theoryFacultyRoster', 'theorySkillsFacultyRoster', 'theoryModuleSeedBlank', 'theoryModuleSeedPull',
      'theoryModuleSeedSemester', 'theoryModuleSeedApplyBtn', 'theoryMasterToolbar',
      'theoryShowLecturers', 'theoryShowPracticumFaculty', 'theoryShowSkillsLabContent'
    ]
  },
  {
    id: 'theory-lecture',
    shell: 'theory',
    anchors: ['theoryLectureTableBody', 'theoryLectureMyFilter']
  },
  {
    id: 'theory-coordinator',
    shell: 'theory',
    anchors: ['theoryCoordinatorGrid', 'theoryCoordinatorStatusChip', 'theoryHourSettingsBtn', 'theorySimWarnBanner']
  },
  {
    id: 'users',
    shell: 'library',
    anchors: ['usersAdminPanel']
  },
  {
    id: 'clinical-sites',
    shell: 'library',
    anchors: ['clinicalSitesConnectBtn', 'clinicalSitesTabLibrary', 'clinicalSitesProposals']
  }
];

export var UI_SHELL = [
  'appMain', 'fileStatus', 'syncOneDriveBtn', 'userStatusLine', 'courseStatusLine', 'courseStatusDropdown',
  'menuToggle', 'menuDropdown', 'closeoutBanner', 'pwaInstallBanner', 'pwaIosInstallBanner', 'pwaOnedriveBanner'
];

export var UI_MENU = [
  'darkModeToggle', 'loadUserFileMenuBtn', 'loadRegistryMenuBtn', 'logoutUserMenuBtn',
  'newSemesterBatchBtn', 'semesterSwitchMenu', 'openFileBtn', 'newFileBtn', 'importBtn',
  'exportBtn', 'menuUsersLibraryBtn', 'menuClinicalSitesBtn', 'menuPlaygroundBtn',
  'menuExitPlaygroundBtn', 'clearStorageBtn', 'saveBtn'
];

export var UI_FILE_INPUTS = [
  'importFileInput', 'importUserFileInput', 'importRegistryFileInput', 'importPlaygroundInput',
  'importTheoryLibraryInput'
];

export var UI_MODALS = {
  userGate: [
    'userGateModal', 'userGateTitle', 'userGateLoadRegistryBtn', 'userGateLoadUserBtn',
    'userGateLoadSemesterBtn', 'userGateChangeUserBtn', 'userGateStep1', 'userGateStep2',
    'userGateStep3', 'userGateSemesterFileInput'
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
  });
  return errors;
}
