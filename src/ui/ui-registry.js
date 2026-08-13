/**
 * UI surface registry — contract between index.html, tab routing, and smoke tests.
 */

export var UI_REGISTRY_VERSION = 3;

export var UI_NAV_CLINICAL = [
  'dashboard', 'practicum', 'student', 'faculty', 'roles', 'makeup', 'audit', 'setup'
];

export var UI_NAV_PLAYGROUND = [
  'playground-dashboard', 'playground-setup'
];

export var UI_NAV_THEORY = [
  'theory-master', 'theory-lecture', 'theory-coordinator'
];

export var UI_NAV_LIBRARY = [
  'users', 'clinical-sites', 'theory-content-search'
];

export var UI_NAV_AUDIT = [
  'audit', 'curriculum-crosswalk'
];

/** Nav tabs: id must match .nav-tab[data-tab] and #view-{id} (setup uses modal host). */
export var UI_TABS = [
  {
    id: 'dashboard',
    shell: 'clinical',
    workspace: 'dashboard',
    anchors: [
      'dashOverviewConflicts', 'dashOverviewTheory', 'dashOverviewPracticum'
    ]
  },
  {
    id: 'practicum',
    shell: 'clinical',
    workspace: 'calendars',
    anchors: [
      'practicumOpenSetupBtn',
      'scheduleBody', 'scheduleHeadRow', 'scheduleExportXlsxBtn', 'scheduleFullscreenBtn',
      'week17MakeupToggleBtn', 'week17MakeupPanel', 'week17MakeupMode', 'week17MakeupApplyBtn',
      'thinSimConsolidateBtn',
      'scheduleGroupFilter', 'scheduleFilterMakeupWeek', 'simTableBody', 'loadChart', 'weekFilter'
    ]
  },
  {
    id: 'student',
    shell: 'clinical',
    workspace: 'student',
    anchors: [
      'studentClinicalGroupFilter', 'studentSimGroupFilter', 'studentNameSearch',
      'studentViewSelect', 'studentCalendarType', 'showMarkupToggle',
      'printStudentBtn', 'exportStudentIcsBtn', 'batchExportStudentCalBtn', 'studentCalendarPrint'
    ]
  },
  {
    id: 'faculty',
    shell: 'clinical',
    workspace: 'calendars',
    anchors: ['facultyScheduleRoot']
  },
  {
    id: 'roles',
    shell: 'clinical',
    workspace: 'student',
    anchors: ['simFacultyBanner', 'roleSimSelect', 'roleGroupSelect', 'roleSessionMeta', 'roleTableBody']
  },
  {
    id: 'makeup',
    shell: 'clinical',
    workspace: 'student',
    anchors: [
      'makeupClinicalGroupFilter', 'makeupSimGroupFilter', 'makeupNameSearch',
      'makeupStudentSelect', 'makeupTypeSelect', 'makeupSimSelect', 'makeupMissedClinicalSelect', 'makeupResults'
    ]
  },
  {
    id: 'audit',
    shell: 'clinical',
    workspace: 'audit',
    anchors: ['auditCloseout']
  },
  {
    id: 'curriculum-crosswalk',
    shell: 'clinical',
    workspace: 'audit',
    anchors: ['curriculumCrosswalkStub']
  },
  {
    id: 'setup',
    shell: 'clinical',
    workspace: 'calendars',
    anchors: [
      'saveSetupBtn', 'regenerateSchedulesBtn', 'setupAdvancedConfigBtn', 'finalizeSemesterBtn',
      'setupSections', 'setupFaculty', 'setupSimInstructors', 'setupFacilities', 'setupHolidays', 'setupRoster',
      'sortRosterAzBtn', 'showStudentEmailDomain', 'cfgStudentEmailDomain',
      'cfgClinicalGroupsList', 'cfgSimGroupsList', 'cfgSimDaysList', 'cfgSimDefaultStart',
      'cfgSimDefaultEnd', 'cfgSimLunchBreakMinutes', 'cfgSimTimeOverrides', 'cfgSimContentTags',
      'setupAdvancedPanel'
    ]
  },
  {
    id: 'playground-dashboard',
    shell: 'playground',
    workspace: 'playground',
    anchors: [
      'playgroundStatus', 'playgroundLoadSemesterBtn', 'playgroundCourseSelect',
      'playgroundSaveBtn', 'playgroundSaveAsBtn', 'playgroundImportBtn',
      'pgDashEmptyState', 'pgDashContent',
      'pgDashConflictsPanel', 'pgDashScheduleHeadRow', 'pgDashScheduleBody', 'pgDashSimTableBody',
      'pgDashLoadChart', 'pgDashReqClinLabel', 'pgDashReqSimLabel'
    ]
  },
  {
    id: 'playground-setup',
    shell: 'playground',
    workspace: 'playground',
    anchors: ['playgroundSetupRoot']
  },
  {
    id: 'theory-master',
    shell: 'theory',
    workspace: 'calendars',
    anchors: [
      'theoryMasterGrid', 'theoryTopicLibraryPanel', 'theoryTopicLibraryList', 'theorySkillsLibraryList',
      'theoryLibraryConnectPrompt', 'theoryLibraryConnectBtn', 'theoryLibraryCreateBtn', 'theoryLibraryStatus',
      'theoryLibrarySections', 'theoryLibraryUnlockBtn', 'theoryLibraryLockBtn', 'theoryLibraryUnlockedBanner',
      'theoryMasterSetup', 'theorySaveSetupBtn', 'theoryResyncPracticumBtn', 'theoryAdvancedConfigBtn',
      'theoryLectureSessions', 'theorySkillsSessions', 'theoryDefaultSkillsFacultyRequired',
      'theoryFacultyRoster', 'theorySkillsFacultyRoster', 'theoryModuleSeedBlank', 'theoryModuleSeedPull',
      'theoryModuleSeedSemester', 'theoryModuleSeedApplyBtn', 'theoryMasterToolbar',
      'theoryShowLecturers', 'theoryShowPracticumFaculty', 'theoryShowSkillsLabContent',
      'theorySkillCoverageSection', 'theorySkillCoverage'
    ]
  },
  {
    id: 'theory-lecture',
    shell: 'theory',
    workspace: 'calendars',
    anchors: ['theoryLectureTableBody', 'theoryLectureMyFilter']
  },
  {
    id: 'theory-coordinator',
    shell: 'theory',
    workspace: 'calendars',
    anchors: ['theoryCoordinatorGrid', 'theoryCoordinatorStatusChip', 'theoryHourSettingsBtn', 'theorySimWarnBanner']
  },
  {
    id: 'users',
    shell: 'library',
    workspace: 'libraries',
    anchors: ['usersAdminPanel']
  },
  {
    id: 'clinical-sites',
    shell: 'library',
    workspace: 'libraries',
    anchors: ['clinicalSitesConnectBtn', 'clinicalSitesTabLibrary', 'clinicalSitesProposals']
  },
  {
    id: 'theory-content-search',
    shell: 'library',
    workspace: 'libraries',
    anchors: ['theoryContentSearchStub']
  }
];

export var UI_SHELL = [
  'appMain', 'workspaceRail', 'railFlyout', 'railFlyoutHead', 'theoryViewToggle',
  'headerSaveBtn', 'playgroundExitFlyoutBtn', 'playgroundExitSubnavBtn',
  'fileStatus', 'storageModeBadge', 'syncOneDriveBtn',
  'contextChipWrap', 'contextChip', 'contextChipStrong', 'contextChipPhase', 'contextPop',
  'contextSemSelect', 'contextCourseSelect', 'contextPhaseValue',
  'contextSearchSemestersBtn', 'contextOpenSemesterFileBtn', 'semesterPickerFileInput',
  'menuToggle', 'menuDropdown', 'closeoutBanner', 'pwaInstallBanner', 'pwaIosInstallBanner', 'pwaOnedriveBanner'
];

/** Header user menu: avatar toggle, identity labels, and account actions. */
export var UI_USER_MENU = [
  'userMenuToggle', 'userStatusLine', 'userMenuDropdown', 'userMenuName', 'userMenuRole',
  'darkModeToggle', 'changePasswordBtn', 'switchUserMenuBtn', 'loadRegistryMenuBtn', 'logoutUserMenuBtn'
];

export var UI_MENU = [
  'newSemesterBatchBtn', 'semesterSwitchMenu', 'menuFileManagementGroup',
  'menuFileClassicGuide', 'connectProgramDataBtn', 'reconnectProgramDataBtn',
  'saveAsBtn', 'menuFileDangerZone', 'openFileBtn', 'newFileBtn', 'importBtn',
  'exportBtn', 'menuFileAdvancedGroup', 'menuFileEngineerNote',
  'menuUsersLibraryBtn', 'menuClinicalSitesBtn', 'menuPlaygroundBtn',
  'menuExitPlaygroundBtn', 'clearStorageBtn', 'saveBtn'
];

export var UI_FILE_INPUTS = [
  'importFileInput', 'importUserFileInput', 'importRegistryFileInput', 'importPlaygroundInput',
  'importTheoryLibraryInput'
];

export var UI_MODALS = {
  userGate: [
    'userGateModal', 'userGateTitle', 'userGateLimitedBadge', 'userGateConnectProgramDataBtn',
    'userGateLoadRegistryBtn', 'userGateConfirmUserBtn', 'userGateEmail',
    'userGatePassword', 'userGateForgotPasswordBtn', 'userGateBackStep2Btn',
    'userGateStep1Lead', 'userGateStep2Lead', 'userGateStep3Lead',
    'userGateRegistryName', 'userGateProgramDataHint', 'userGateProgramDataSemester',
    'userGateConfirmSemesterBtn', 'userGateSemesterSelect',
    'userGateLoadSemesterBtn', 'userGateBackStep3Btn', 'userGateStep1', 'userGateStep2', 'userGateStepChangePassword',
    'userGateChangePasswordLead', 'userGateNewPassword', 'userGateNewPasswordConfirm',
    'userGateChangePasswordBtn',
    'userGateStep3', 'userGateSemesterFileInput', 'userGateUserName'
  ],
  config: ['configModal', 'configModalClose', 'configModalCancel', 'configModalSave', 'configModalBody'],
  dialog: ['dialogModal', 'dialogTitle', 'dialogBody', 'dialogCancel', 'dialogExtra', 'dialogSave'],
  setup: ['setupModal', 'setupModalTitle', 'setupModalClose']
};

export function viewIdForTab(tabId) {
  return 'view-' + tabId;
}

export function tabIds() {
  return UI_TABS.map(function (t) { return t.id; });
}

export function flattenModalIds() {
  return UI_MODALS.userGate.concat(UI_MODALS.config, UI_MODALS.dialog, UI_MODALS.setup || []);
}

export function allRegisteredElementIds() {
  var ids = UI_SHELL.concat(UI_USER_MENU, UI_MENU, UI_FILE_INPUTS, flattenModalIds());
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
