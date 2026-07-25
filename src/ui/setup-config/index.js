/** Advanced scheduling configuration panel on setup. */

import { getData, getFileRoot, notifyChange, addSemester } from '../../core/state.js';
import { showAlert, showConfirm } from '../dialogs.js';
import * as DataModel from '../../core/data-model/index.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import * as SiteLibrary from '../../core/clinical-sites-library.js';
import * as Scheduler from '../../core/scheduler/index.js';
import * as Setup from '../setup/index.js';
import * as CourseDefaults from '../../core/course-defaults.js';
import * as SetupDraft from '../../proposals/setup-draft.js';
import { canAction } from '../../auth/permissions.js';
import { refresh, switchTab } from '../chrome.js';
import {
  LIVE, PLAYGROUND, getSetupScope, setSetupScope, setupEl, setupQueryAll, resolveScopeFileRoot
} from '../setup/scope.js';
import {
  renderClinicalGroupsList, refreshDynamicLists, getGroupFacilityIds, addSiteToGroup, addRangeToGroup,
  updateWeekRangeHint, updateAllWeekRangeHints
} from './clinical-groups.js';
import {
  renderSimDaysList, renderSimGroupsList, collectSimTimesIntoConfig
} from './sim-groups.js';
import {
  renderSiteLibrary, collectSiteLibraryFromDom, siteLibraryRow
} from './site-library.js';
import { handleSetupClick } from './actions.js';

var pendingNewSemester = false;

function resolveSetupData() {
    if (Setup.resolveSetupData) return Setup.resolveSetupData();
    if (SetupDraft && SetupDraft.resolveData) return SetupDraft.resolveData();
    return getData();
  }

function finishSetupEdit(data, opts) {
    opts = opts || {};
    if (SetupDraft && SetupDraft.persistAfterEdit) {
      SetupDraft.persistAfterEdit(data, opts);
      return;
    }
    if (Setup.setupAfterChange) {
      Setup.setupAfterChange(data, opts);
      return;
    }
    notifyChange();
    Setup.render(data);
  }

function touchSetupEdit(data) {
    Setup.markSetupDraft(data);
    if (SetupDraft && SetupDraft.usesDraftMode()) SetupDraft.markDirty();
  }

function collectFormInto(data) {
    if (Setup.collectFromFormInto) {
      return Setup.collectFromFormInto(data);
    }
    if (Setup.collectFromForm) {
      return Setup.collectFromForm(data);
    }
    return null;
  }

function configModeBadge(customized) {
    if (customized) {
      return '<span class="config-mode-badge custom">Semester-specific</span>';
    }
    return '<span class="config-mode-badge default">Using program defaults</span>';
  }

function readOptionalWeekInput(id) {
    var el = setupEl(id);
    if (!el || el.value === '') return null;
    var n = parseInt(el.value, 10);
    return isNaN(n) ? null : n;
  }

function readFormIntoConfig(cfg, data) {
    cfg.clinicalDaysRequired = parseInt(setupEl('cfgClinDays').value, 10);
    cfg.simDaysRequired = parseInt(setupEl('cfgSimDays').value, 10);
    cfg.maxStudents = parseInt(setupEl('cfgMaxStudents').value, 10);
    cfg.maxPerClinicalGroup = parseInt(setupEl('cfgMaxClinGroup').value, 10);
    cfg.maxPerClinicalGroupOverload = parseInt(setupEl('cfgMaxClinOverload').value, 10);
    cfg.maxStudentsPerSimSession = parseInt(setupEl('cfgMaxSimSession').value, 10);
    cfg.maxStudentsPerSimSessionOverload = parseInt(setupEl('cfgMaxSimOverload').value, 10);
    var guestSoftEl = setupEl('cfgMaxGuestSims');
    if (guestSoftEl) cfg.maxGuestSimsPerStudent = parseInt(guestSoftEl.value, 10);
    cfg.simMakeupHeadroomReserved = parseInt(setupEl('cfgSimHeadroom').value, 10);
    cfg.clinicalStartWeek = parseInt(setupEl('cfgClinStart').value, 10);
    cfg.simStartWeek = parseInt(setupEl('cfgSimStart').value, 10);
    cfg.clinicalMakeupPrimaryWeek = readOptionalWeekInput('cfgClinMakeupPrimary');
    cfg.clinicalMakeupFallbackWeek = readOptionalWeekInput('cfgClinMakeupFallback');
    cfg.simMakeupLastResortWeek = readOptionalWeekInput('cfgSimMakeupLastResort');

    cfg.clinicalGroups = [];
    cfg.clinicalGroupDays = {};
    cfg.clinicalGroupFacilities = {};
    setupQueryAll('cfgClinicalGroupsList', '[data-clin-group-row]').forEach(function (row) {
      var g = row.getAttribute('data-clin-group-row');
      var siteIndex = parseInt(row.getAttribute('data-clin-site-index'), 10) || 0;
      if (siteIndex === 0) {
        cfg.clinicalGroups.push(g);
        var dayEl = row.querySelector('[data-clin="day"]');
        cfg.clinicalGroupDays[g] = dayEl ? dayEl.value : 'Mon';
        cfg.clinicalGroupFacilities[g] = [];
      }
      var facEl = row.querySelector('[data-clin-site-facility]');
      if (facEl && facEl.value && cfg.clinicalGroupFacilities[g]) {
        cfg.clinicalGroupFacilities[g].push(facEl.value);
      }
    });

    cfg.simDays = [];
    setupQueryAll('cfgSimDaysList', '[data-sim-day-row]').forEach(function (row) {
      cfg.simDays.push(row.querySelector('[data-sim-day="value"]').value);
    });

    cfg.simGroups = [];
    cfg.simGroupDays = {};
    cfg.simGroupPattern = {};
    setupQueryAll('cfgSimGroupsList', '[data-sim-group-row]').forEach(function (row) {
      var g = row.getAttribute('data-sim-group-row');
      cfg.simGroups.push(g);
      var dayEl = row.querySelector('[data-sim-group="day"]');
      var patEl = row.querySelector('[data-sim-group="pattern"]');
      cfg.simGroupDays[g] = dayEl ? dayEl.value : 'Mon';
      cfg.simGroupPattern[g] = patEl ? patEl.value : 'even';
    });

    collectSimTimesIntoConfig(cfg);

    var normalized = DataModel.normalizeConfig(cfg);
    if (data && ClinicalSites) {
      data.config = normalized;
      ClinicalSites.collectGroupFacilitiesFromDom(data);
      normalized.clinicalGroupFacilities = data.config.clinicalGroupFacilities;
    }
    return DataModel.normalizeConfig(normalized);
  }

function draftConfigFromForm(baseCfg, data) {
    return readFormIntoConfig(DataModel.cloneConfig(baseCfg), data);
  }

function renderAdvancedFields(cfg) {
    var set = function (id, val) {
      var el = setupEl(id);
      if (el) el.value = val;
    };
    set('cfgClinDays', cfg.clinicalDaysRequired);
    set('cfgSimDays', cfg.simDaysRequired);
    set('cfgMaxStudents', cfg.maxStudents);
    set('cfgMaxClinGroup', cfg.maxPerClinicalGroup);
    set('cfgMaxClinOverload', cfg.maxPerClinicalGroupOverload);
    set('cfgMaxSimSession', cfg.maxStudentsPerSimSession);
    set('cfgMaxSimOverload', cfg.maxStudentsPerSimSessionOverload);
    set('cfgMaxGuestSims', cfg.maxGuestSimsPerStudent != null ? cfg.maxGuestSimsPerStudent : 1);
    set('cfgSimHeadroom', cfg.simMakeupHeadroomReserved != null ? cfg.simMakeupHeadroomReserved : 1);
    set('cfgClinStart', cfg.clinicalStartWeek);
    set('cfgSimStart', cfg.simStartWeek);
    set('cfgClinMakeupPrimary', cfg.clinicalMakeupPrimaryWeek != null ? cfg.clinicalMakeupPrimaryWeek : '');
    set('cfgClinMakeupFallback', cfg.clinicalMakeupFallbackWeek != null ? cfg.clinicalMakeupFallbackWeek : '');
    set('cfgSimMakeupLastResort', cfg.simMakeupLastResortWeek != null ? cfg.simMakeupLastResortWeek : '');
  }

function updateSubtitle(data) {
    var parts = DataModel.parseSemesterDisplay(data);
    var subtitle = setupEl('setupConfigSubtitle');
    if (!subtitle) return;
    subtitle.innerHTML = 'Scheduling settings for <strong>' + parts.name + '</strong> ' +
      configModeBadge(!!data.meta.configCustomized);
  }

function updateNewSemesterBanner() {
    if (getSetupScope().isPlayground) return;
    var banner = setupEl('setupPendingNewSemesterBanner');
    var saveAddBtn = setupEl('setupSaveAddSemesterBtn');
    var courseLabel = setupEl('setupNewSemesterCourseLabel');
    if (banner) banner.classList.toggle('hidden', !pendingNewSemester);
    if (saveAddBtn) saveAddBtn.classList.toggle('hidden', !pendingNewSemester);
    if (courseLabel) {
      courseLabel.classList.toggle('hidden', !pendingNewSemester);
      if (pendingNewSemester) populateNewSemesterCourseSelect();
    }
  }

function populateNewSemesterCourseSelect() {
    var select = document.getElementById('setupNewSemesterCourse');
    if (!select) return;
    var data = getData();
    var current = (data && data.meta && data.meta.courseId) || 'REGN15P';
    select.innerHTML = CourseDefaults.list().map(function (c) {
      return '<option value="' + c.courseId + '"' + (c.courseId === current ? ' selected' : '') + '>' +
        c.displayName + '</option>';
    }).join('');
  }

function render(data) {
    if (!data) return;
    var cfg = DataModel.normalizeConfig(DataModel.cloneConfig(data.config));
    data.config = cfg;
    DataModel.migrateClinicalGroupFacilities(data);
    renderAdvancedFields(cfg);
    refreshDynamicLists(data);
    renderSiteLibrary();
    updateSubtitle(data);
    updateNewSemesterBanner();
  }

function isAdvancedOpen() {
    var panel = setupEl('setupAdvancedPanel');
    return panel && !panel.classList.contains('hidden');
  }

function setAdvancedOpen(open) {
    var panel = setupEl('setupAdvancedPanel');
    var btn = setupEl('setupAdvancedConfigBtn');
    if (!panel || !btn) return;
    panel.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? 'Hide Advanced Configuration' : 'Advanced Configuration';
  }

function toggleAdvanced() {
    setAdvancedOpen(!isAdvancedOpen());
  }

function openAdvanced() {
    setAdvancedOpen(true);
    var panel = setupEl('setupAdvancedPanel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

function applyConfigToData(data, cfg) {
    var before = DataModel.cloneConfig(data.config);
    data.config = DataModel.cloneConfig(cfg);
    DataModel.syncSemesterForConfig(data);
    return before;
  }

function collectIntoData(data) {
    collectSiteLibraryFromDom();
    var draft = draftConfigFromForm(data.config, data);
    var before = applyConfigToData(data, draft);
    data.meta.configCustomized = true;
    if (ClinicalSites) ClinicalSites.applyPrimarySitesToStudents(data);
    DataModel.linkFacilitiesToSiteLibrary(data.facilities);
    return before;
  }

function siteWeeksStructureChanged(before, cfg) {
    return JSON.stringify(before.clinicalGroupSiteWeeks || {}) !==
      JSON.stringify(cfg.clinicalGroupSiteWeeks || {});
  }

function facilitiesStructureChanged(before, cfg) {
    if (!before.clinicalGroupFacilities && !cfg.clinicalGroupFacilities) return false;
    return JSON.stringify(before.clinicalGroupFacilities || {}) !==
      JSON.stringify(cfg.clinicalGroupFacilities || {});
  }

function maybeRegenerateAfterChange(data, before) {
    var cfg = data.config;
    var structureChanged =
      JSON.stringify(before.clinicalGroups) !== JSON.stringify(cfg.clinicalGroups) ||
      JSON.stringify(before.clinicalGroupDays) !== JSON.stringify(cfg.clinicalGroupDays) ||
      JSON.stringify(before.simGroups) !== JSON.stringify(cfg.simGroups) ||
      JSON.stringify(before.simGroupDays) !== JSON.stringify(cfg.simGroupDays) ||
      JSON.stringify(before.simGroupPattern) !== JSON.stringify(cfg.simGroupPattern) ||
      JSON.stringify(before.simDays) !== JSON.stringify(cfg.simDays) ||
      facilitiesStructureChanged(before, cfg) ||
      siteWeeksStructureChanged(before, cfg);
    var reqsChanged =
      before.clinicalDaysRequired !== cfg.clinicalDaysRequired ||
      before.simDaysRequired !== cfg.simDaysRequired;

    if (reqsChanged || structureChanged) {
      var msg = structureChanged
        ? 'Clinical groups, simulation groups, sites, week ranges, or simulation days changed. Regenerate all schedules for this semester?'
        : 'Day requirements changed. Regenerate all schedules for this semester?';
      showConfirm('Regenerate schedules?', msg, function () {
        Scheduler.regenerateAll(data);
      }, { confirmLabel: 'Regenerate' });
    }
  }

function resetToDefaults() {
    var fileRoot = resolveScopeFileRoot();
    var data = getData();
    var defaults = DataModel.normalizeConfig(DataModel.getSchedulingDefaults(fileRoot));
    var before = applyConfigToData(data, defaults);
    data.meta.configCustomized = false;
    Setup.markSetupDraft(data);
    render(data);
    if (getSetupScope().isPlayground) {
      Setup.setupAfterChange(data);
    } else {
      notifyChange();
      maybeRegenerateAfterChange(data, before);
      refresh();
    }
  }

function applyToFutureSemesters() {
    if (getSetupScope().isPlayground) return;
    var fileRoot = getFileRoot();
    var data = getData();
    var draft = draftConfigFromForm(data.config, data);
    var before = DataModel.cloneConfig(data.config);

    var future = DataModel.getFutureSemesters(fileRoot, data);
    var message = 'Apply these settings to program defaults';
    if (future.length) {
      message += ' and to ' + future.length + ' future semester' + (future.length === 1 ? '' : 's') + ' (' +
        future.map(function (sem) { return DataModel.parseSemesterDisplay(sem).name; }).join(', ') + ')';
    } else {
      message += ' (no later semesters in this file yet)';
    }
    message += '? Existing semester-specific settings on future semesters will be replaced.';
    showConfirm('Apply settings?', message, function () {
      applyConfigToData(data, draft);
      data.meta.configCustomized = true;
      touchSetupEdit(data);
      DataModel.setSchedulingDefaults(fileRoot, data.config);
      future.forEach(function (sem) {
        DataModel.applyConfigToSemester(sem, data.config, true);
        DataModel.syncSemesterForConfig(sem);
      });

      render(data);
      notifyChange();
      maybeRegenerateAfterChange(data, before);
      refresh();
      showAlert('Applied', 'Configuration applied to program defaults' +
        (future.length ? ' and ' + future.length + ' future semester(s).' : '.'));
    }, { confirmLabel: 'Apply' });
  }

function saveAndAddSemester() {
    var data = getData();
    var before = Setup.collectFromForm
      ? collectFormInto(data)
      : collectIntoData(data);
    DataModel.setSchedulingDefaults(getFileRoot(), data.config);
    var courseSelect = document.getElementById('setupNewSemesterCourse');
    var courseId = courseSelect ? courseSelect.value : undefined;
    pendingNewSemester = false;
    updateNewSemesterBanner();
    notifyChange();
    maybeRegenerateAfterChange(data, before);
    addSemester(undefined, undefined, courseId);
    switchTab('setup');
    refresh();
  }

function beginNewSemesterFlow() {
    pendingNewSemester = true;
    switchTab('setup');
    openAdvanced();
    render(getData());
  }

function applyRoleMode() {
    var canEdit = canAction('setup.edit');
    var canDraft = canAction('setup.saveDraft');
    var canPropose = canAction('proposals.submit');
    var canImportPg = canAction('setup.importPlayground');
    var isEngineer = canAction('*');
    var saveBtn = document.getElementById('saveSetupBtn');
    var proposeBtn = document.getElementById('proposeSetupChangesBtn');
    var importPgBtn = document.getElementById('importPlaygroundSetupBtn');
    var templateBtn = document.getElementById('createCourseTemplateBtn');
    if (saveBtn) {
      saveBtn.textContent = canEdit ? 'Save Setup' : 'Save draft';
      saveBtn.classList.toggle('hidden', !canEdit && !canDraft);
    }
    if (proposeBtn) proposeBtn.classList.toggle('hidden', !canPropose);
    if (importPgBtn) importPgBtn.classList.toggle('hidden', !canImportPg);
    if (templateBtn) templateBtn.classList.toggle('hidden', !isEngineer);
    var readOnly = !canEdit && !canDraft;
    document.querySelectorAll('#view-setup input, #view-setup select, #view-setup textarea').forEach(function (el) {
      if (readOnly && !el.closest('.setup-actions-sticky')) el.disabled = readOnly;
    });
  }

function collectDraftConfig(data) {
    if (SetupDraft && SetupDraft.collectSnapshotFromDom) {
      var snap = SetupDraft.collectSnapshotFromDom();
      return snap ? snap.config : (data && data.config);
    }
    return draftConfigFromForm(data.config, data);
  }

function renderIntoPlayground(data) {
    if (!data || !data.config) return;
    setSetupScope(PLAYGROUND);
    render(data);
    setSetupScope(LIVE);
    var el = document.getElementById('playgroundConfigSummary');
    if (el) {
      el.textContent = 'Clinical days: ' + data.config.clinicalDaysRequired +
        ', Sim days: ' + data.config.simDaysRequired +
        ' — use Save playground to persist changes to your playground file.';
    }
  }

function bindScopedConfig(logicalId, event, handler) {
  [LIVE, PLAYGROUND].forEach(function (scope) {
    var el = document.getElementById(scope.prefix + logicalId);
    if (!el) return;
    el.addEventListener(event, function (e) {
      setSetupScope(scope);
      handler(e);
    });
  });
}

function init() {
    document.querySelectorAll('#view-setup, #playgroundSetupRoot').forEach(function (view) {
      view.addEventListener('click', function (e) {
        setSetupScope(view.id === 'playgroundSetupRoot' ? PLAYGROUND : LIVE);
        handleSetupClick(e);
      });
      view.addEventListener('change', function (e) {
        setSetupScope(view.id === 'playgroundSetupRoot' ? PLAYGROUND : LIVE);
        var data = resolveSetupData();
        if (e.target.hasAttribute('data-clin-week-ranges-toggle')) {
          collectFormInto(data);
          var tg = e.target.getAttribute('data-clin-group');
          if (!data.config.clinicalGroupSiteWeeks) data.config.clinicalGroupSiteWeeks = {};
          if (!e.target.checked) {
            data.config.clinicalGroupSiteWeeks[tg] = [];
          } else if (!data.config.clinicalGroupSiteWeeks[tg] || !data.config.clinicalGroupSiteWeeks[tg].length) {
            addRangeToGroup(data, tg);
          } else {
            refreshDynamicLists(data);
          }
          touchSetupEdit(data);
          finishSetupEdit(data, { rerender: false, refresh: true });
          return;
        }
        if (e.target.hasAttribute('data-clin-site-range-start') ||
            e.target.hasAttribute('data-clin-site-range-end')) {
          updateWeekRangeHint(data, e.target);
          collectFormInto(data);
          touchSetupEdit(data);
          finishSetupEdit(data, { rerender: false });
          return;
        }
        if (e.target.hasAttribute('data-clin-site-range-facility') ||
            e.target.hasAttribute('data-clin-site-facility')) {
          collectFormInto(data);
          touchSetupEdit(data);
          finishSetupEdit(data, { rerender: false, refresh: true });
        }
      });
    });

    bindScopedConfig('setupAdvancedConfigBtn', 'click', toggleAdvanced);
    bindScopedConfig('setupConfigResetDefaultsBtn', 'click', resetToDefaults);
    bindScopedConfig('setupConfigApplyFutureBtn', 'click', applyToFutureSemesters);

    var saveAddBtn = setupEl('setupSaveAddSemesterBtn');
    if (saveAddBtn) saveAddBtn.addEventListener('click', saveAndAddSemester);
  }

export {
  render,
  collectIntoData,
  collectDraftConfig,
  maybeRegenerateAfterChange,
  openAdvanced,
  toggleAdvanced,
  beginNewSemesterFlow,
  applyRoleMode,
  siteLibraryRow,
  renderIntoPlayground,
  init,
  resolveSetupData,
  finishSetupEdit,
  touchSetupEdit,
  collectFormInto,
  draftConfigFromForm,
  readFormIntoConfig,
  refreshDynamicLists,
  getGroupFacilityIds,
  addSiteToGroup,
  addRangeToGroup,
  collectSiteLibraryFromDom,
  renderSiteLibrary,
  renderClinicalGroupsList,
  renderSimDaysList,
  renderSimGroupsList,
  updateAllWeekRangeHints
};
