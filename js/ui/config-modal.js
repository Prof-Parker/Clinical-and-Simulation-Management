/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.ConfigModal = (function () {
  var dayOptions = App.DataModel.WEEKDAY_OPTIONS;
  var addSemesterMode = false;

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

  function clinicalGroupRow(group, day, canRemove) {
    return '<div class="config-list-row" data-clin-group-row="' + group + '">' +
      '<span class="config-group-label">' + group + '</span>' +
      '<select data-clin="day" aria-label="' + group + ' clinical day">' + daySelectHtml(day) + '</select>' +
      (canRemove
        ? '<button type="button" class="btn btn-icon-remove remove-clin-group" aria-label="Remove clinical group" title="Remove clinical group">&times;</button>'
        : '<span class="section-sub" style="font-size:0.75rem">Min. 1</span>') +
      '</div>';
  }

  function simDayRow(day, canRemove) {
    return '<div class="config-list-row" data-sim-day-row="1">' +
      '<select data-sim-day="value" aria-label="Simulation weekday">' + daySelectHtml(day) + '</select>' +
      (canRemove
        ? '<button type="button" class="btn btn-icon-remove remove-sim-day" aria-label="Remove simulation day" title="Remove simulation day">&times;</button>'
        : '<span class="section-sub" style="font-size:0.75rem">Min. 1</span>') +
      '</div>';
  }

  function renderClinicalGroupsList(cfg) {
    var groups = App.DataModel.getClinicalGroups(cfg);
    var canRemove = groups.length > 1;
    return groups.map(function (g) {
      return clinicalGroupRow(g, cfg.clinicalGroupDays[g] || 'Mon', canRemove);
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
    cfg.maxStudentsPerSimSession = parseInt(document.getElementById('cfgMaxSimSession').value, 10);
    cfg.maxStudentsPerSimSessionOverload = parseInt(document.getElementById('cfgMaxSimOverload').value, 10);
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

  function refreshDynamicLists(cfg) {
    var clinList = document.getElementById('cfgClinicalGroupsList');
    var simList = document.getElementById('cfgSimDaysList');
    if (clinList) clinList.innerHTML = renderClinicalGroupsList(cfg);
    if (simList) simList.innerHTML = renderSimDaysList(cfg);
  }

  function draftConfigFromForm(baseCfg) {
    return readFormIntoConfig(App.DataModel.cloneConfig(baseCfg));
  }

  function updateSubtitle(data) {
    var parts = App.DataModel.parseSemesterDisplay(data);
    var subtitle = document.getElementById('configModalSubtitle');
    if (!subtitle) return;
    subtitle.innerHTML = 'Editing <strong>' + parts.name + '</strong>' +
      configModeBadge(!!data.meta.configCustomized);
  }

  function updateModalActions() {
    var saveBtn = document.getElementById('configModalSave');
    var cancelBtn = document.getElementById('configModalCancel');
    if (!saveBtn || !cancelBtn) return;
    if (addSemesterMode) {
      saveBtn.textContent = 'Save & Add Semester';
      cancelBtn.textContent = 'Cancel';
    } else {
      saveBtn.textContent = 'Save for this semester';
      cancelBtn.textContent = 'Cancel';
    }
  }

  function open(options) {
    options = options || {};
    if ('addSemester' in options) {
      addSemesterMode = !!options.addSemester;
    } else {
      addSemesterMode = false;
    }
    var data = App.getData();
    var cfg = App.DataModel.normalizeConfig(App.DataModel.cloneConfig(data.config));
    var body = document.getElementById('configModalBody');
    var intro = addSemesterMode
      ? '<p class="section-sub" style="margin-top:0">Review scheduling configuration before creating the next semester. ' +
        'Changes saved here update program defaults used by the new semester.</p>'
      : '<p class="section-sub" style="margin-top:0">Each semester can use program defaults or its own settings. ' +
        'New semesters start with program defaults unless you copy forward from a prior semester.</p>';
    body.innerHTML = intro +
      '<div class="grid-2">' +
      field('Clinical days required', 'cfgClinDays', cfg.clinicalDaysRequired, 'number') +
      field('Simulation days required', 'cfgSimDays', cfg.simDaysRequired, 'number') +
      field('Max students', 'cfgMaxStudents', cfg.maxStudents, 'number') +
      field('Max per clinical group', 'cfgMaxClinGroup', cfg.maxPerClinicalGroup, 'number') +
      field('Max students per sim session', 'cfgMaxSimSession', cfg.maxStudentsPerSimSession, 'number') +
      field('Max sim session (makeup overload only)', 'cfgMaxSimOverload', cfg.maxStudentsPerSimSessionOverload, 'number') +
      field('Clinical start week', 'cfgClinStart', cfg.clinicalStartWeek, 'number') +
      field('Simulation start week', 'cfgSimStart', cfg.simStartWeek, 'number') +
      '</div>' +
      '<div class="config-section-header">' +
      '<h4 style="margin:0">Clinical groups</h4>' +
      '<button type="button" class="btn btn-sm add-clin-group">Add group</button>' +
      '</div>' +
      '<p class="section-sub">Each clinical group has a dedicated weekday for rotations.</p>' +
      '<div id="cfgClinicalGroupsList" class="config-list">' + renderClinicalGroupsList(cfg) + '</div>' +
      '<div class="config-section-header">' +
      '<h4 style="margin:0">Simulation weekdays</h4>' +
      '<button type="button" class="btn btn-sm add-sim-day">Add day</button>' +
      '</div>' +
      '<p class="section-sub">Days of the week when simulation sessions may be scheduled.</p>' +
      '<div id="cfgSimDaysList" class="config-list">' + renderSimDaysList(cfg) + '</div>';

    updateSubtitle(data);
    updateModalActions();
    document.getElementById('configModal').classList.add('open');
  }

  function openForNewSemester() {
    open({ addSemester: true });
  }

  function close() {
    document.getElementById('configModal').classList.remove('open');
    addSemesterMode = false;
    updateModalActions();
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
        ? 'Clinical groups or simulation weekdays changed. Regenerate all schedules for this semester?'
        : 'Day requirements changed. Regenerate all schedules for this semester?';
      if (confirm(msg)) App.Scheduler.regenerateAll(data);
    }
  }

  function applyConfigToData(data, cfg) {
    var before = App.DataModel.cloneConfig(data.config);
    data.config = App.DataModel.cloneConfig(cfg);
    App.DataModel.syncSemesterForConfig(data);
    return before;
  }

  function save() {
    var data = App.getData();
    var draft = draftConfigFromForm(data.config);
    var before = applyConfigToData(data, draft);
    data.meta.configCustomized = true;
    var creatingSemester = addSemesterMode;

    if (creatingSemester) {
      App.DataModel.setSchedulingDefaults(App.getFileRoot(), data.config);
    }

    close();
    App.notifyChange();
    maybeRegenerateAfterChange(data, before);
    App.UI.refresh();

    if (creatingSemester) {
      App.addSemester();
      App.UI.switchTab('setup');
    }
  }

  function resetToDefaults() {
    var fileRoot = App.getFileRoot();
    var data = App.getData();
    var defaults = App.DataModel.normalizeConfig(App.DataModel.getSchedulingDefaults(fileRoot));
    var before = applyConfigToData(data, defaults);
    data.meta.configCustomized = false;
    var keepAdd = addSemesterMode;
    open({ addSemester: keepAdd });
    App.notifyChange();
    maybeRegenerateAfterChange(data, before);
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

    close();
    App.notifyChange();
    maybeRegenerateAfterChange(data, before);
    App.UI.refresh();
    alert('Configuration applied to program defaults' +
      (future.length ? ' and ' + future.length + ' future semester(s).' : '.'));
  }

  function handleBodyClick(e) {
    if (!document.getElementById('configModal').classList.contains('open')) return;

    if (e.target.classList.contains('add-clin-group')) {
      var cfg = draftConfigFromForm(App.getData().config);
      var name = App.DataModel.nextClinicalGroupName(cfg.clinicalGroups);
      cfg.clinicalGroups.push(name);
      cfg.clinicalGroupDays[name] = 'Mon';
      refreshDynamicLists(cfg);
      return;
    }

    if (e.target.closest('.remove-clin-group')) {
      var row = e.target.closest('[data-clin-group-row]');
      if (!row) return;
      var cfgRemove = draftConfigFromForm(App.getData().config);
      if (cfgRemove.clinicalGroups.length <= 1) return;
      var group = row.getAttribute('data-clin-group-row');
      cfgRemove.clinicalGroups = cfgRemove.clinicalGroups.filter(function (g) { return g !== group; });
      delete cfgRemove.clinicalGroupDays[group];
      refreshDynamicLists(cfgRemove);
      return;
    }

    if (e.target.classList.contains('add-sim-day')) {
      var cfgSim = draftConfigFromForm(App.getData().config);
      var unused = 'Mon';
      for (var di = 0; di < dayOptions.length; di++) {
        if (cfgSim.simDays.indexOf(dayOptions[di]) < 0) {
          unused = dayOptions[di];
          break;
        }
      }
      cfgSim.simDays.push(unused);
      refreshDynamicLists(cfgSim);
      return;
    }

    if (e.target.closest('.remove-sim-day')) {
      var simRow = e.target.closest('[data-sim-day-row]');
      if (!simRow) return;
      var cfgSimRemove = draftConfigFromForm(App.getData().config);
      if (cfgSimRemove.simDays.length <= 1) return;
      var idx = Array.prototype.indexOf.call(
        document.querySelectorAll('#cfgSimDaysList [data-sim-day-row]'),
        simRow
      );
      if (idx >= 0) cfgSimRemove.simDays.splice(idx, 1);
      refreshDynamicLists(cfgSimRemove);
    }
  }

  function init() {
    document.getElementById('configModalClose').addEventListener('click', close);
    document.getElementById('configModalCancel').addEventListener('click', close);
    document.getElementById('configModalSave').addEventListener('click', save);
    document.getElementById('configResetDefaultsBtn').addEventListener('click', resetToDefaults);
    document.getElementById('configApplyFutureBtn').addEventListener('click', applyToFutureSemesters);
    document.getElementById('configModalBody').addEventListener('click', handleBodyClick);
  }

  return { open: open, openForNewSemester: openForNewSemester, close: close, save: save, init: init };
})();
