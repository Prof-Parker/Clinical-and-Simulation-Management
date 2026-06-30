/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.SetupConfig = (function () {
  var dayOptions = App.DataModel.WEEKDAY_OPTIONS;
  var pendingNewSemester = false;

  function field(label, id, val, type) {
    return '<label>' + label + '<input type="' + type + '" id="' + id + '" value="' + val + '"></label>';
  }

  function daySelectHtml(selected) {
    return dayOptions.map(function (d) {
      return '<option value="' + d + '"' + (d === selected ? ' selected' : '') + '>' + d + '</option>';
    }).join('');
  }

  function configModeBadge(customized) {
    if (customized) {
      return '<span class="config-mode-badge custom">Semester-specific</span>';
    }
    return '<span class="config-mode-badge default">Using program defaults</span>';
  }

  function clinicalGroupRow(data, group, day, canRemove) {
    var facId = App.UI.Setup
      ? App.UI.Setup.getCohortFacilityIdForGroup(data, group)
      : null;
    var facilityHtml = App.UI.Setup
      ? App.UI.Setup.cohortFacilitySelectHtml(data, group, facId)
      : '';
    return '<div class="config-list-row" data-clin-group-row="' + group + '">' +
      '<span class="config-group-label">' + group + '</span>' +
      '<select data-clin="day" class="clin-day-select" aria-label="' + group + ' clinical day">' + daySelectHtml(day) + '</select>' +
      '<select data-cohort-facility="' + group + '" aria-label="' + group + ' clinical site">' + facilityHtml + '</select>' +
      (canRemove
        ? '<button type="button" class="btn btn-icon-remove remove-clin-group" aria-label="Remove clinical group" title="Remove clinical group">&times;</button>'
        : '<span class="section-sub" style="font-size:0.75rem">Min. 1</span>') +
      '</div>';
  }

  function simDayRow(day, canRemove) {
    return '<div class="config-list-row" data-sim-day-row="1">' +
      '<select data-sim-day="value" aria-label="Simulation day">' + daySelectHtml(day) + '</select>' +
      (canRemove
        ? '<button type="button" class="btn btn-icon-remove remove-sim-day" aria-label="Remove simulation day" title="Remove simulation day">&times;</button>'
        : '<span class="section-sub" style="font-size:0.75rem">Min. 1</span>') +
      '</div>';
  }

  function renderClinicalGroupsList(data) {
    var cfg = data.config;
    var groups = App.DataModel.getClinicalGroups(cfg);
    var canRemove = groups.length > 1;
    return groups.map(function (g) {
      return clinicalGroupRow(data, g, cfg.clinicalGroupDays[g] || 'Mon', canRemove);
    }).join('');
  }

  function renderSimDaysList(cfg) {
    var days = App.DataModel.getSimDays(cfg);
    var canRemove = days.length > 1;
    return days.map(function (d) {
      return simDayRow(d, canRemove);
    }).join('');
  }

  function readFormIntoConfig(cfg) {
    cfg.clinicalDaysRequired = parseInt(document.getElementById('cfgClinDays').value, 10);
    cfg.simDaysRequired = parseInt(document.getElementById('cfgSimDays').value, 10);
    cfg.maxStudents = parseInt(document.getElementById('cfgMaxStudents').value, 10);
    cfg.maxPerClinicalGroup = parseInt(document.getElementById('cfgMaxClinGroup').value, 10);
    cfg.maxPerClinicalGroupOverload = parseInt(document.getElementById('cfgMaxClinOverload').value, 10);
    cfg.maxStudentsPerSimSession = parseInt(document.getElementById('cfgMaxSimSession').value, 10);
    cfg.maxStudentsPerSimSessionOverload = parseInt(document.getElementById('cfgMaxSimOverload').value, 10);
    cfg.simMakeupHeadroomReserved = parseInt(document.getElementById('cfgSimHeadroom').value, 10);
    cfg.clinicalStartWeek = parseInt(document.getElementById('cfgClinStart').value, 10);
    cfg.simStartWeek = parseInt(document.getElementById('cfgSimStart').value, 10);

    cfg.clinicalGroups = [];
    cfg.clinicalGroupDays = {};
    document.querySelectorAll('#cfgClinicalGroupsList [data-clin-group-row]').forEach(function (row) {
      var g = row.getAttribute('data-clin-group-row');
      cfg.clinicalGroups.push(g);
      cfg.clinicalGroupDays[g] = row.querySelector('[data-clin="day"]').value;
    });

    cfg.simDays = [];
    document.querySelectorAll('#cfgSimDaysList [data-sim-day-row]').forEach(function (row) {
      cfg.simDays.push(row.querySelector('[data-sim-day="value"]').value);
    });

    return App.DataModel.normalizeConfig(cfg);
  }

  function draftConfigFromForm(baseCfg) {
    return readFormIntoConfig(App.DataModel.cloneConfig(baseCfg));
  }

  function refreshDynamicLists(data) {
    var clinList = document.getElementById('cfgClinicalGroupsList');
    var simList = document.getElementById('cfgSimDaysList');
    var cfg = data.config;
    if (clinList) clinList.innerHTML = renderClinicalGroupsList(data);
    if (simList) simList.innerHTML = renderSimDaysList(cfg);
  }

  function renderAdvancedFields(cfg) {
    var set = function (id, val) {
      var el = document.getElementById(id);
      if (el) el.value = val;
    };
    set('cfgClinDays', cfg.clinicalDaysRequired);
    set('cfgSimDays', cfg.simDaysRequired);
    set('cfgMaxStudents', cfg.maxStudents);
    set('cfgMaxClinGroup', cfg.maxPerClinicalGroup);
    set('cfgMaxClinOverload', cfg.maxPerClinicalGroupOverload);
    set('cfgMaxSimSession', cfg.maxStudentsPerSimSession);
    set('cfgMaxSimOverload', cfg.maxStudentsPerSimSessionOverload);
    set('cfgSimHeadroom', cfg.simMakeupHeadroomReserved != null ? cfg.simMakeupHeadroomReserved : 1);
    set('cfgClinStart', cfg.clinicalStartWeek);
    set('cfgSimStart', cfg.simStartWeek);
  }

  function updateSubtitle(data) {
    var parts = App.DataModel.parseSemesterDisplay(data);
    var subtitle = document.getElementById('setupConfigSubtitle');
    if (!subtitle) return;
    subtitle.innerHTML = 'Scheduling settings for <strong>' + parts.name + '</strong> ' +
      configModeBadge(!!data.meta.configCustomized);
  }

  function updateNewSemesterBanner() {
    var banner = document.getElementById('setupPendingNewSemesterBanner');
    var saveAddBtn = document.getElementById('setupSaveAddSemesterBtn');
    if (banner) banner.classList.toggle('hidden', !pendingNewSemester);
    if (saveAddBtn) saveAddBtn.classList.toggle('hidden', !pendingNewSemester);
  }

  function render(data) {
    if (!data) return;
    var cfg = App.DataModel.normalizeConfig(App.DataModel.cloneConfig(data.config));
    data.config = cfg;
    renderAdvancedFields(cfg);
    refreshDynamicLists(data);
    updateSubtitle(data);
    updateNewSemesterBanner();
  }

  function isAdvancedOpen() {
    var panel = document.getElementById('setupAdvancedPanel');
    return panel && !panel.classList.contains('hidden');
  }

  function setAdvancedOpen(open) {
    var panel = document.getElementById('setupAdvancedPanel');
    var btn = document.getElementById('setupAdvancedConfigBtn');
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
    var panel = document.getElementById('setupAdvancedPanel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function applyConfigToData(data, cfg) {
    var before = App.DataModel.cloneConfig(data.config);
    data.config = App.DataModel.cloneConfig(cfg);
    App.DataModel.syncSemesterForConfig(data);
    return before;
  }

  function collectIntoData(data) {
    var draft = draftConfigFromForm(data.config);
    var before = applyConfigToData(data, draft);
    data.meta.configCustomized = true;
    return before;
  }

  function maybeRegenerateAfterChange(data, before) {
    var cfg = data.config;
    var structureChanged =
      JSON.stringify(before.clinicalGroups) !== JSON.stringify(cfg.clinicalGroups) ||
      JSON.stringify(before.clinicalGroupDays) !== JSON.stringify(cfg.clinicalGroupDays) ||
      JSON.stringify(before.simDays) !== JSON.stringify(cfg.simDays);
    var reqsChanged =
      before.clinicalDaysRequired !== cfg.clinicalDaysRequired ||
      before.simDaysRequired !== cfg.simDaysRequired;

    if (reqsChanged || structureChanged) {
      var msg = structureChanged
        ? 'Clinical groups or simulation days changed. Regenerate all schedules for this semester?'
        : 'Day requirements changed. Regenerate all schedules for this semester?';
      if (confirm(msg)) App.Scheduler.regenerateAll(data);
    }
  }

  function resetToDefaults() {
    var fileRoot = App.getFileRoot();
    var data = App.getData();
    var defaults = App.DataModel.normalizeConfig(App.DataModel.getSchedulingDefaults(fileRoot));
    var before = applyConfigToData(data, defaults);
    data.meta.configCustomized = false;
    render(data);
    App.notifyChange();
    maybeRegenerateAfterChange(data, before);
    App.UI.refresh();
  }

  function applyToFutureSemesters() {
    var fileRoot = App.getFileRoot();
    var data = App.getData();
    var draft = draftConfigFromForm(data.config);
    var before = App.DataModel.cloneConfig(data.config);

    var future = App.DataModel.getFutureSemesters(fileRoot, data);
    var message = 'Apply these settings to program defaults';
    if (future.length) {
      message += ' and to ' + future.length + ' future semester' + (future.length === 1 ? '' : 's') + ' (' +
        future.map(function (sem) { return App.DataModel.parseSemesterDisplay(sem).name; }).join(', ') + ')';
    } else {
      message += ' (no later semesters in this file yet)';
    }
    message += '? Existing semester-specific settings on future semesters will be replaced.';
    if (!confirm(message)) return;

    applyConfigToData(data, draft);
    data.meta.configCustomized = true;
    App.DataModel.setSchedulingDefaults(fileRoot, data.config);
    future.forEach(function (sem) {
      App.DataModel.applyConfigToSemester(sem, data.config, true);
      App.DataModel.syncSemesterForConfig(sem);
    });

    render(data);
    App.notifyChange();
    maybeRegenerateAfterChange(data, before);
    App.UI.refresh();
    alert('Configuration applied to program defaults' +
      (future.length ? ' and ' + future.length + ' future semester(s).' : '.'));
  }

  function saveAndAddSemester() {
    var data = App.getData();
    var before = App.UI.Setup && App.UI.Setup.collectFromForm
      ? App.UI.Setup.collectFromForm(data)
      : collectIntoData(data);
    App.DataModel.setSchedulingDefaults(App.getFileRoot(), data.config);
    pendingNewSemester = false;
    updateNewSemesterBanner();
    App.notifyChange();
    maybeRegenerateAfterChange(data, before);
    App.addSemester();
    App.UI.switchTab('setup');
    App.UI.refresh();
  }

  function beginNewSemesterFlow() {
    pendingNewSemester = true;
    App.UI.switchTab('setup');
    openAdvanced();
    render(App.getData());
  }

  function handleSetupClick(e) {
    if (e.target.classList.contains('add-clin-group')) {
      var dataAdd = App.getData();
      if (App.UI.Setup && App.UI.Setup.collectFromForm) App.UI.Setup.collectFromForm(dataAdd);
      var cfg = App.DataModel.cloneConfig(dataAdd.config);
      var name = App.DataModel.nextClinicalGroupName(cfg.clinicalGroups);
      cfg.clinicalGroups.push(name);
      cfg.clinicalGroupDays[name] = 'Mon';
      dataAdd.config = App.DataModel.normalizeConfig(cfg);
      refreshDynamicLists(dataAdd);
      return;
    }

    if (e.target.closest('.remove-clin-group')) {
      var row = e.target.closest('[data-clin-group-row]');
      if (!row) return;
      var dataRemove = App.getData();
      if (App.UI.Setup && App.UI.Setup.collectFromForm) App.UI.Setup.collectFromForm(dataRemove);
      var cfgRemove = App.DataModel.cloneConfig(dataRemove.config);
      if (cfgRemove.clinicalGroups.length <= 1) return;
      var group = row.getAttribute('data-clin-group-row');
      cfgRemove.clinicalGroups = cfgRemove.clinicalGroups.filter(function (g) { return g !== group; });
      delete cfgRemove.clinicalGroupDays[group];
      dataRemove.config = App.DataModel.normalizeConfig(cfgRemove);
      refreshDynamicLists(dataRemove);
      return;
    }

    if (e.target.classList.contains('add-sim-day')) {
      var dataSim = App.getData();
      if (App.UI.Setup && App.UI.Setup.collectFromForm) App.UI.Setup.collectFromForm(dataSim);
      var cfgSim = draftConfigFromForm(dataSim.config);
      var unused = 'Mon';
      for (var di = 0; di < dayOptions.length; di++) {
        if (cfgSim.simDays.indexOf(dayOptions[di]) < 0) {
          unused = dayOptions[di];
          break;
        }
      }
      cfgSim.simDays.push(unused);
      dataSim.config = App.DataModel.normalizeConfig(cfgSim);
      refreshDynamicLists(dataSim);
      return;
    }

    if (e.target.closest('.remove-sim-day')) {
      var simRow = e.target.closest('[data-sim-day-row]');
      if (!simRow) return;
      var dataSimRemove = App.getData();
      if (App.UI.Setup && App.UI.Setup.collectFromForm) App.UI.Setup.collectFromForm(dataSimRemove);
      var cfgSimRemove = draftConfigFromForm(dataSimRemove.config);
      if (cfgSimRemove.simDays.length <= 1) return;
      var idx = Array.prototype.indexOf.call(
        document.querySelectorAll('#cfgSimDaysList [data-sim-day-row]'),
        simRow
      );
      if (idx >= 0) cfgSimRemove.simDays.splice(idx, 1);
      dataSimRemove.config = App.DataModel.normalizeConfig(cfgSimRemove);
      refreshDynamicLists(dataSimRemove);
    }
  }

  function init() {
    var viewSetup = document.getElementById('view-setup');
    if (viewSetup) {
      viewSetup.addEventListener('click', handleSetupClick);
      viewSetup.addEventListener('change', function (e) {
        if (!e.target.hasAttribute('data-cohort-facility')) return;
        var data = App.getData();
        if (App.UI.Setup && App.UI.Setup.collectFromForm) App.UI.Setup.collectFromForm(data);
        App.notifyChange();
        App.UI.refresh();
      });
    }

    var advBtn = document.getElementById('setupAdvancedConfigBtn');
    if (advBtn) advBtn.addEventListener('click', toggleAdvanced);

    var resetBtn = document.getElementById('setupConfigResetDefaultsBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetToDefaults);

    var futureBtn = document.getElementById('setupConfigApplyFutureBtn');
    if (futureBtn) futureBtn.addEventListener('click', applyToFutureSemesters);

    var saveAddBtn = document.getElementById('setupSaveAddSemesterBtn');
    if (saveAddBtn) saveAddBtn.addEventListener('click', saveAndAddSemester);
  }

  return {
    render: render,
    collectIntoData: collectIntoData,
    maybeRegenerateAfterChange: maybeRegenerateAfterChange,
    openAdvanced: openAdvanced,
    toggleAdvanced: toggleAdvanced,
    beginNewSemesterFlow: beginNewSemesterFlow,
    init: init
  };
})();
