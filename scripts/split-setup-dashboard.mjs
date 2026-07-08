/**
 * Split js/ui/setup.js, setup-config.js, dashboard.js into src/ui modules.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function extractBody(path, name) {
  const src = readFileSync(join(ROOT, path), 'utf8');
  const re = new RegExp('App\\.UI\\.' + name + '\\s*=\\s*\\(function\\s*\\(\\)\\s*\\{([\\s\\S]*)\\n\\}\\)\\(\\);');
  const m = src.match(re);
  if (!m) throw new Error('no iife ' + name + ' in ' + path);
  let body = m[1];
  const ri = body.lastIndexOf('\n  return {');
  return body.slice(0, ri);
}

function getFn(body, fn) {
  const start = body.indexOf('\n  function ' + fn + '(');
  if (start < 0) throw new Error('fn missing ' + fn);
  let i = start + 1;
  let depth = 0;
  let started = false;
  for (; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') {
      depth--;
      if (started && depth === 0) { i++; break; }
    }
  }
  return body.slice(start, i).trim();
}

function xform(code) {
  const reps = [
    [/App\.getData\(\)/g, 'getData()'],
    [/App\.getFileRoot\(\)/g, 'getFileRoot()'],
    [/App\.notifyChange\(\)/g, 'notifyChange()'],
    [/App\.addSemester\(/g, 'addSemester('],
    [/App\.UI\.showAlert\(/g, 'showAlert('],
    [/App\.UI\.showConfirm\(/g, 'showConfirm('],
    [/App\.UI\.guardEditable\(/g, 'guardEditable('],
    [/App\.UI\.refresh\(\)/g, 'refresh()'],
    [/App\.UI\.switchTab\(/g, 'switchTab('],
    [/App\.UI\.updateSemesterDisplay\(/g, 'updateSemesterDisplay('],
    [/App\.UI\.buildSemesterLabelHtml/g, 'buildSemesterLabelHtml'],
    [/App\.UI\.DateInputs\.init\(/g, 'initDateInputs('],
    [/App\.UI\.SetupProposals\.renderSetupProposalsPanel\(/g, 'renderSetupProposalsPanel('],
    [/App\.UI\.SetupConfig\./g, 'SetupConfig.'],
    [/App\.UI\.Setup\./g, 'Setup.'],
    [/App\.UI\.Dashboard\./g, 'Dashboard.'],
    [/App\.DataModel\./g, 'DataModel.'],
    [/App\.CalendarEngine\./g, 'CalendarEngine.'],
    [/App\.ScheduleStatus\./g, 'ScheduleStatus.'],
    [/App\.ClinicalSites\./g, 'ClinicalSites.'],
    [/App\.ClinicalSites\b/g, 'ClinicalSites'],
    [/App\.SiteLibrary\./g, 'SiteLibrary.'],
    [/App\.SiteLibrary\b/g, 'SiteLibrary'],
    [/App\.RosterBalance\./g, 'RosterBalance.'],
    [/App\.UserDirectory\./g, 'UserDirectory.'],
    [/App\.UserDirectory\b/g, 'UserDirectory'],
    [/App\.UsersRegistryStorage\./g, 'UsersRegistryStorage.'],
    [/App\.UsersRegistryStorage\b/g, 'UsersRegistryStorage'],
    [/App\.Permissions\./g, 'Permissions.'],
    [/App\.Permissions\b/g, 'Permissions'],
    [/App\.UserSession\./g, 'UserSession.'],
    [/App\.UserSession\b/g, 'UserSession'],
    [/App\.SetupDraft\./g, 'SetupDraft.'],
    [/App\.SetupDraft\b/g, 'SetupDraft'],
    [/App\.Audit\./g, 'Audit.'],
    [/App\.Audit\b/g, 'Audit'],
    [/App\.Scheduler\./g, 'Scheduler.'],
    [/App\.Validator\./g, 'Validator.'],
    [/App\.Orientation\./g, 'Orientation.'],
    [/App\.Orientation\b/g, 'Orientation'],
    [/App\.MakeupDisplay\./g, 'MakeupDisplay.'],
    [/App\.DashboardExport\./g, 'DashboardExport.'],
    [/App\.CourseDefaults\./g, 'CourseDefaults.'],
    [/App\.Proposals\./g, 'Proposals.'],
    [/typeof Chart === 'undefined'/g, 'false']
  ];
  let out = code;
  for (const [re, rep] of reps) out = out.replace(re, rep);
  return out;
}

function writeModule(rel, header, imports, fns, body, exports) {
  const parts = fns.map((fn) => xform(getFn(body, fn)));
  const content = header + imports + '\n' + parts.join('\n\n') + '\n\nexport {\n  ' + exports.join(',\n  ') + '\n};\n';
  writeFileSync(join(ROOT, rel), content, 'utf8');
  console.log(rel, content.split('\n').length, 'lines');
}

const setupBody = extractBody('js/ui/setup.js', 'Setup');

writeModule(
  'src/ui/setup/facilities-faculty.js',
  '/** Facilities, sections, and faculty fields on setup. */\n\n',
  `import { getData } from '../../core/state.js';
import { showAlert, showConfirm } from '../dialogs.js';
import * as DataModel from '../../core/data-model/index.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import * as UserDirectory from '../../storage/user-directory.js';
import * as UsersRegistryStorage from '../../storage/users-registry-storage.js';
import { escAttr, escHtml, configListAddRow } from './dom-utils.js';
import { guardSetupEdit, resolveSetupData, setupAfterChange, collectFromForm, markSetupDraft } from './index.js';
`,
  ['renderSections', 'facilitySiteSelectHtml', 'facilityTagsHtml', 'renderFacilities', 'renderFaculty',
    'updateAdjunctFacultyDatalist', 'syncLeadFacultyEmailFromSelect', 'renderLeadFaculty',
    'applyGroupFacilitiesFromConfig', 'removeFacility', 'removeSection'],
  setupBody,
  ['renderSections', 'renderFacilities', 'renderFaculty', 'renderLeadFaculty', 'applyGroupFacilitiesFromConfig',
    'removeFacility', 'removeSection', 'syncLeadFacultyEmailFromSelect']
);

writeModule(
  'src/ui/setup/holidays-orientations.js',
  '/** Holidays and orientation day editors on setup. */\n\n',
  `import { getData, notifyChange } from '../../core/state.js';
import * as DataModel from '../../core/data-model/index.js';
import * as CalendarEngine from '../../core/calendar-engine.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import { escAttr, escHtml, configListAddRow } from './dom-utils.js';
import {
  markSetupDraft, resolveRenderData, guardSetupEdit, resolveSetupData, setupAfterChange, collectFromForm,
  getCohortFacilityIdForGroup
} from './index.js';
`,
  ['syncBreakHolidayDate', 'weekSelectHtml', 'semesterWeekHintText', 'semesterWeekHintForIndex',
    'updateHolidayWeekHint', 'updateAllHolidayWeekHints', 'renderHolidays', 'collectHolidaysFromDom',
    'bindHolidayEditor', 'orientationFacilitySelectHtml', 'orientationWeekHintText', 'updateOrientationWeekHint',
    'updateAllOrientationWeekHints', 'nextOrientationDefault', 'renderOrientations'],
  setupBody,
  ['weekSelectHtml', 'semesterWeekHintForIndex', 'renderHolidays', 'collectHolidaysFromDom', 'bindHolidayEditor',
    'renderOrientations', 'updateAllHolidayWeekHints', 'updateAllOrientationWeekHints', 'updateOrientationWeekHint',
    'nextOrientationDefault']
);

const rosterFns = [
  'sectionSelectHtml', 'facilityName', 'getCohortFacilityIdForGroup', 'getCohortFacilityId', 'applyGroupFacility',
  'cohortFacilitySelectHtml', 'predominantSection', 'cohortSectionSummaryText', 'cohortSectionBulkSelectHtml',
  'applyCohortSection', 'defaultSectionForNewStudent', 'moveCohortSelectHtml', 'studentRowHtml',
  'createNewStudentForGroup', 'needsRebalance', 'rebalanceStudents', 'updateRebalanceButton', 'renderRoster',
  'addStudent', 'removeStudent', 'moveStudentToGroup', 'initRosterDragDrop'
];
const rosterParts = rosterFns.map((fn) => xform(getFn(setupBody, fn)));
const rosterContent = `/** Student roster editor and drag-drop on setup. */

import { getData } from '../../core/state.js';
import { showAlert, showConfirm } from '../dialogs.js';
import * as DataModel from '../../core/data-model/index.js';
import * as RosterBalance from '../../core/roster-balance.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import { escAttr, escHtml } from './dom-utils.js';
import { guardSetupEdit, resolveSetupData, setupAfterChange, collectFromForm } from './index.js';

var dragStudentId = null;

` + rosterParts.join('\n\n') + `

export {
  renderRoster,
  initRosterDragDrop,
  needsRebalance,
  rebalanceStudents,
  getCohortFacilityIdForGroup,
  cohortFacilitySelectHtml,
  addStudent,
  removeStudent,
  moveStudentToGroup
};
`;
writeFileSync(join(ROOT, 'src/ui/setup/roster.js'), rosterContent, 'utf8');
console.log('src/ui/setup/roster.js', rosterContent.split('\n').length, 'lines');

const indexFns = [
  'updateSetupStickyOffset', 'scrollSetupToTop', 'guardSetupEdit', 'isProposeOnlyMode', 'resolveSetupData',
  'resolveRenderData', 'setupAfterChange', 'updateReadOnlyButtons', 'markSetupDraft', 'isSetupDraftArea',
  'handleSetupDraftInput', 'renderScheduleWarnings', 'render', 'init'
];
writeModule(
  'src/ui/setup/index.js',
  '/** Setup tab — init, render orchestration, guards, and draft mode. */\n\n',
  `import { getData, notifyChange } from '../../core/state.js';
import { showAlert, showConfirm, guardEditable } from '../dialogs.js';
import { canAction } from '../../auth/permissions.js';
import { isValidated } from '../../auth/user-session.js';
import * as SetupDraft from '../../proposals/setup-draft.js';
import * as Audit from '../../audit/audit.js';
import * as ScheduleStatus from '../../core/schedule-status.js';
import * as Scheduler from '../../core/scheduler.js';
import * as DataModel from '../../core/data-model/index.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import { reloadFromHandle } from '../../storage/users-registry-storage.js';
import { init as initDateInputs } from '../date-inputs.js';
import { renderSetupProposalsPanel } from '../setup-proposals.js';
import { refresh, updateSemesterDisplay } from '../chrome.js';
import * as SetupConfig from '../setup-config/index.js';
import { escAttr, escHtml } from './dom-utils.js';
import {
  renderSemesterFields, updateFinalizeButtonState, updateStartDateFromSeasonYear
} from './semester-fields.js';
import {
  renderSections, renderFacilities, renderFaculty, renderLeadFaculty, removeFacility, removeSection,
  syncLeadFacultyEmailFromSelect
} from './facilities-faculty.js';
import {
  renderHolidays, bindHolidayEditor, renderOrientations, updateAllHolidayWeekHints,
  updateAllOrientationWeekHints, updateOrientationWeekHint, nextOrientationDefault,
  weekSelectHtml, semesterWeekHintForIndex, collectHolidaysFromDom
} from './holidays-orientations.js';
import {
  renderRoster, initRosterDragDrop, needsRebalance, rebalanceStudents, getCohortFacilityIdForGroup,
  cohortFacilitySelectHtml
} from './roster.js';
import { collectFromForm, collectFromFormInto } from './form-collect.js';
`,
  indexFns,
  setupBody,
  [
    'render', 'init', 'collectFromForm', 'collectFromFormInto', 'resolveSetupData', 'isProposeOnlyMode',
    'setupAfterChange', 'collectHolidaysFromDom', 'renderHolidays', 'bindHolidayEditor', 'markSetupDraft',
    'needsRebalance', 'rebalanceStudents', 'getCohortFacilityIdForGroup', 'cohortFacilitySelectHtml',
    'weekSelectHtml', 'semesterWeekHintForIndex', 'guardSetupEdit', 'resolveRenderData'
  ]
);

// setup-config split
const cfgBody = extractBody('js/ui/setup-config.js', 'SetupConfig');

writeModule(
  'src/ui/setup-config/sim-groups.js',
  '/** Simulation days and groups configuration lists. */\n\n',
  `import * as DataModel from '../../core/data-model/index.js';
`,
  ['daySelectHtml', 'simDayRow', 'renderSimDaysList', 'patternSelectHtml', 'simGroupRow', 'renderSimGroupsList'],
  cfgBody,
  ['renderSimDaysList', 'renderSimGroupsList', 'daySelectHtml']
);

writeModule(
  'src/ui/setup-config/site-library.js',
  '/** Clinical site library editor in advanced setup. */\n\n',
  `import { getData, getFileRoot, notifyChange } from '../../core/state.js';
import { showAlert } from '../dialogs.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import { touchSetupEdit } from './index.js';
`,
  ['escAttrLocal', 'siteLibraryRow', 'siteLibraryContainer', 'renderSiteLibrary', 'collectSiteLibraryFromDom'],
  cfgBody,
  ['siteLibraryRow', 'renderSiteLibrary', 'collectSiteLibraryFromDom', 'siteLibraryContainer']
);

writeModule(
  'src/ui/setup-config/clinical-groups.js',
  '/** Clinical groups, sites, and week-range configuration. */\n\n',
  `import * as DataModel from '../../core/data-model/index.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import * as Setup from '../setup/index.js';
import { daySelectHtml } from './sim-groups.js';
`,
  [
    'getGroupFacilityIds', 'groupFacilitySelectHtml', 'weekSelectForGroup', 'weekHintText', 'defaultRangeStart',
    'siteWeekRangeRow', 'renderGroupWeekPlan', 'clinicalSiteRow', 'renderClinicalGroupsList',
    'updateWeekRangeHint', 'updateAllWeekRangeHints', 'nextFacilityForGroup', 'addSiteToGroup', 'addRangeToGroup',
    'refreshDynamicLists'
  ],
  cfgBody,
  [
    'renderClinicalGroupsList', 'refreshDynamicLists', 'getGroupFacilityIds', 'addSiteToGroup', 'addRangeToGroup',
    'updateWeekRangeHint', 'updateAllWeekRangeHints', 'nextFacilityForGroup'
  ]
);

writeModule(
  'src/ui/setup-config/actions.js',
  '/** Click/change handlers for advanced setup configuration lists. */\n\n',
  `import { getData, getFileRoot, notifyChange, addSemester } from '../../core/state.js';
import { showAlert, showConfirm } from '../dialogs.js';
import * as DataModel from '../../core/data-model/index.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import * as Setup from '../setup/index.js';
import {
  resolveSetupData, collectFormInto, finishSetupEdit, touchSetupEdit, draftConfigFromForm,
  readFormIntoConfig, refreshDynamicLists, getGroupFacilityIds, addSiteToGroup, addRangeToGroup,
  collectSiteLibraryFromDom, renderSiteLibrary
} from './index.js';
`,
  ['handleSetupClick'],
  cfgBody,
  ['handleSetupClick']
);

const cfgIndexFns = [
  'resolveSetupData', 'finishSetupEdit', 'touchSetupEdit', 'collectFormInto', 'field', 'configModeBadge',
  'readOptionalWeekInput', 'readFormIntoConfig', 'draftConfigFromForm', 'renderAdvancedFields', 'updateSubtitle',
  'updateNewSemesterBanner', 'populateNewSemesterCourseSelect', 'render', 'isAdvancedOpen', 'setAdvancedOpen',
  'toggleAdvanced', 'openAdvanced', 'applyConfigToData', 'collectIntoData', 'siteWeeksStructureChanged',
  'facilitiesStructureChanged', 'maybeRegenerateAfterChange', 'resetToDefaults', 'applyToFutureSemesters',
  'saveAndAddSemester', 'beginNewSemesterFlow', 'applyRoleMode', 'collectDraftConfig', 'renderIntoPlayground', 'init'
];
writeModule(
  'src/ui/setup-config/index.js',
  '/** Advanced scheduling configuration panel on setup. */\n\n',
  `import { getData, getFileRoot, notifyChange, addSemester } from '../../core/state.js';
import { showAlert, showConfirm } from '../dialogs.js';
import * as DataModel from '../../core/data-model/index.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import * as Scheduler from '../../core/scheduler.js';
import * as Setup from '../setup/index.js';
import * as CourseDefaults from '../../core/course-defaults.js';
import * as SetupDraft from '../../proposals/setup-draft.js';
import { refresh, switchTab } from '../chrome.js';
import { WEEKDAY_OPTIONS } from '../../core/data-model/index.js';
import {
  renderClinicalGroupsList, refreshDynamicLists, getGroupFacilityIds, addSiteToGroup, addRangeToGroup,
  updateWeekRangeHint, updateAllWeekRangeHints, nextFacilityForGroup
} from './clinical-groups.js';
import { renderSimDaysList, renderSimGroupsList, daySelectHtml } from './sim-groups.js';
import {
  renderSiteLibrary, collectSiteLibraryFromDom, siteLibraryRow, siteLibraryContainer
} from './site-library.js';
import { handleSetupClick } from './actions.js';

var pendingNewSemester = false;
var dayOptions = WEEKDAY_OPTIONS;
`,
  cfgIndexFns.filter((f) => f !== 'field' || true),
  cfgBody.replace(/\n  var dayOptions = App\.DataModel\.WEEKDAY_OPTIONS;\n  var pendingNewSemester = false;\n/, '\n'),
  [
    'render', 'collectIntoData', 'collectDraftConfig', 'maybeRegenerateAfterChange', 'openAdvanced',
    'toggleAdvanced', 'beginNewSemesterFlow', 'applyRoleMode', 'siteLibraryRow', 'renderIntoPlayground', 'init',
    'resolveSetupData', 'finishSetupEdit', 'touchSetupEdit', 'collectFormInto', 'draftConfigFromForm',
    'readFormIntoConfig', 'refreshDynamicLists', 'getGroupFacilityIds', 'addSiteToGroup', 'addRangeToGroup',
    'collectSiteLibraryFromDom', 'renderSiteLibrary', 'renderClinicalGroupsList', 'renderSimDaysList',
    'renderSimGroupsList', 'updateAllWeekRangeHints'
  ]
);

// dashboard split
const dashBody = extractBody('js/ui/dashboard.js', 'Dashboard');

writeModule(
  'src/ui/dashboard/chart.js',
  '/** Peak sim load bar chart on the dashboard. */\n\n',
  `import Chart from 'chart.js/auto';
import * as Scheduler from '../../core/scheduler.js';
import * as DataModel from '../../core/data-model/index.js';

var chartInstance = null;
`,
  ['renderChart'],
  dashBody,
  ['renderChart']
);

writeModule(
  'src/ui/dashboard/schedule-filters.js',
  '/** Master schedule filter controls and student filtering. */\n\n',
  `import * as DataModel from '../../core/data-model/index.js';
import * as CalendarEngine from '../../core/calendar-engine.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
`,
  [
    'studentStatusKey', 'studentHasMakeupTier', 'studentHasGuestSim', 'getScheduleFilteredStudents',
    'populateFilters', 'escapeHtml'
  ],
  dashBody,
  ['getScheduleFilteredStudents', 'populateFilters', 'escapeHtml', 'studentStatusKey']
);

const dashIndexFns = [
  'updateSchedulePanelSemester', 'syncFullscreenScheduleLayout', 'setScheduleFullscreen', 'bindScheduleFullscreen',
  'renderCellHtml', 'scheduleRightColsHtml', 'scheduleRightPadCells', 'appendScheduleRightPadCells',
  'exportScheduleXlsx', 'refreshScheduleView', 'render', 'daySimCount', 'renderOccupancy',
  'syncScheduleTallyScroll', 'bindScheduleScrollSync', 'renderSimTable', 'renderSimRoster', 'init'
];
const dashIndexContent = `/** Dashboard — master schedule, sim tables, and occupancy. */

import { getData } from '../../core/state.js';
import * as DataModel from '../../core/data-model/index.js';
import * as CalendarEngine from '../../core/calendar-engine.js';
import * as Validator from '../../core/validator.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import * as Orientation from '../../core/orientation.js';
import * as MakeupDisplay from '../../core/makeup-display.js';
import * as Scheduler from '../../core/scheduler.js';
import * as DashboardExport from '../../export/dashboard-export.js';
import { buildSemesterLabelHtml, refresh } from '../chrome.js';
import { renderChart } from './chart.js';
import { getScheduleFilteredStudents, populateFilters, escapeHtml } from './schedule-filters.js';

var scheduleFullscreenActive = false;
var tallyScrollSyncing = false;
var scheduleSearchDebounce = null;

` + dashIndexFns.map((fn) => xform(getFn(dashBody, fn))).join('\n\n') + `

export {
  render,
  populateFilters,
  init,
  renderCellHtml,
  setScheduleFullscreen,
  exportScheduleXlsx
};
`;
writeFileSync(join(ROOT, 'src/ui/dashboard/index.js'), dashIndexContent, 'utf8');
console.log('src/ui/dashboard/index.js', dashIndexContent.split('\n').length, 'lines');

console.log('Split complete.');
