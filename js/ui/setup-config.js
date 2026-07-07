/* global App */
var App = App || {};
App.UI = App.UI || {};

App.UI.SetupConfig = (function () {
  function resolveSetupData() {
    if (App.UI.Setup && App.UI.Setup.resolveSetupData) return App.UI.Setup.resolveSetupData();
    if (App.SetupDraft && App.SetupDraft.resolveData) return App.SetupDraft.resolveData();
    return App.getData();
  }

  function finishSetupEdit(data, opts) {
    opts = opts || {};
    if (App.SetupDraft && App.SetupDraft.persistAfterEdit) {
      App.SetupDraft.persistAfterEdit(data, opts);
      return;
    }
    if (App.UI.Setup && App.UI.Setup.setupAfterChange) {
      App.UI.Setup.setupAfterChange(data, opts);
      return;
    }
    App.notifyChange();
    if (App.UI.Setup) App.UI.Setup.render(data);
  }

  function touchSetupEdit(data) {
    if (App.UI.Setup && App.UI.Setup.markSetupDraft) App.UI.Setup.markSetupDraft(data);
    if (App.SetupDraft && App.SetupDraft.usesDraftMode()) App.SetupDraft.markDirty();
  }

  function collectFormInto(data) {
    if (App.UI.Setup && App.UI.Setup.collectFromFormInto) {
      return App.UI.Setup.collectFromFormInto(data);
    }
    if (App.UI.Setup && App.UI.Setup.collectFromForm) {
      return App.UI.Setup.collectFromForm(data);
    }
    return null;
  }

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

  function getGroupFacilityIds(data, group) {
    if (App.ClinicalSites) {
      return App.ClinicalSites.getGroupFacilities(data, group);
    }
    var facId = App.UI.Setup
      ? App.UI.Setup.getCohortFacilityIdForGroup(data, group)
      : null;
    return facId ? [facId] : [];
  }

  function groupFacilitySelectHtml(data, group, selectedId) {
    var facIds = getGroupFacilityIds(data, group);
    var unique = App.DataModel.getUniqueFacilitiesForSelect(data);
    var html = '';
    unique.forEach(function (f) {
      var allowed = facIds.some(function (id) {
        return App.DataModel.sameFacilitySite(data, id, f.id);
      });
      if (!allowed) return;
      html += '<option value="' + f.id + '"' +
        (App.DataModel.sameFacilitySite(data, selectedId, f.id) ? ' selected' : '') + '>' +
        f.name + '</option>';
    });
    return html;
  }

  function weekSelectForGroup(data, selectedWeek) {
    if (App.UI.Setup && App.UI.Setup.weekSelectHtml) {
      return App.UI.Setup.weekSelectHtml(data, selectedWeek);
    }
    var html = '';
    for (var i = 0; i < 18; i++) {
      html += '<option value="' + i + '"' +
        (String(selectedWeek) === String(i) ? ' selected' : '') + '>Wk ' + (i + 1) + '</option>';
    }
    return html;
  }

  function weekHintText(data, weekIndex) {
    if (App.UI.Setup && App.UI.Setup.semesterWeekHintForIndex) {
      return App.UI.Setup.semesterWeekHintForIndex(data, weekIndex);
    }
    return '';
  }

  function defaultRangeStart(data) {
    return Math.max(0, (data.config.clinicalStartWeek || 5) - 1);
  }

  function siteWeekRangeRow(data, group, range, rangeIndex, canRemove) {
    var facId = range.facilityId || getGroupFacilityIds(data, group)[0];
    var start = range.startWeekIndex != null ? range.startWeekIndex : defaultRangeStart(data);
    var end = range.endWeekIndex != null ? range.endWeekIndex : Math.min(17, start + 2);
    return '<div class="clin-site-range-row" data-clin-site-range-row="' + group + '" data-clin-range-index="' + rangeIndex + '">' +
      '<select data-clin-site-range-facility data-clin-group="' + group + '" aria-label="' + group + ' range facility">' +
      groupFacilitySelectHtml(data, group, facId) + '</select>' +
      '<div class="clin-site-range-week-field">' +
      '<select data-clin-site-range-start data-clin-group="' + group + '" aria-label="From week">' +
      weekSelectForGroup(data, start) + '</select>' +
      '<span class="clin-site-range-week-hint" data-clin-range-start-hint>' + weekHintText(data, start) + '</span>' +
      '</div>' +
      '<div class="clin-site-range-week-field">' +
      '<select data-clin-site-range-end data-clin-group="' + group + '" aria-label="To week">' +
      weekSelectForGroup(data, end) + '</select>' +
      '<span class="clin-site-range-week-hint" data-clin-range-end-hint>' + weekHintText(data, end) + '</span>' +
      '</div>' +
      (canRemove
        ? '<button type="button" class="btn btn-icon-remove remove-clin-site-range" data-clin-group="' + group + '" aria-label="Remove week range">&times;</button>'
        : '<span class="section-sub" style="font-size:0.75rem">Min. 1</span>') +
      '</div>';
  }

  function renderGroupWeekPlan(data, group) {
    if (!App.ClinicalSites || !App.ClinicalSites.groupHasMultipleSites(data, group)) return '';
    var cfg = data.config;
    var usesRanges = App.ClinicalSites.groupUsesWeekRanges(data, group);
    var ranges = (cfg.clinicalGroupSiteWeeks && cfg.clinicalGroupSiteWeeks[group]) || [];
    if (!usesRanges) ranges = [];
    if (!ranges.length && usesRanges) {
      var facIds = getGroupFacilityIds(data, group);
      var start = defaultRangeStart(data);
      ranges = [{ facilityId: facIds[0], startWeekIndex: start, endWeekIndex: Math.min(17, start + 2) }];
    }
    var bodyClass = usesRanges ? '' : ' hidden';
    var rowsHtml = '';
    ranges.forEach(function (r, idx) {
      rowsHtml += siteWeekRangeRow(data, group, r, idx, ranges.length > 1 || usesRanges);
    });
    return '<div class="clin-group-week-plan" data-clin-group-week-plan="' + group + '">' +
      '<label class="filter-check clin-week-ranges-toggle" for="clinWeekRanges-' + group + '">' +
      '<input type="checkbox" id="clinWeekRanges-' + group + '" data-clin-week-ranges-toggle data-clin-group="' + group + '"' +
      (usesRanges ? ' checked' : '') + '> Use week ranges</label>' +
      '<p class="section-sub clin-week-ranges-hint">Assign each site to semester weeks (e.g. Cal Vet Wk 4–6, SRMC Wk 7–15). ' +
      'Weeks outside ranges use the primary site.</p>' +
      '<div class="clin-group-week-plan-body' + bodyClass + '">' +
      '<div class="clin-site-ranges-head" aria-hidden="true">' +
      '<span>Facility</span><span>From</span><span>To</span><span></span></div>' +
      rowsHtml +
      '<button type="button" class="btn btn-sm add-clin-site-range" data-clin-group="' + group + '">Add range</button>' +
      '</div></div>';
  }

  function clinicalSiteRow(data, group, day, siteIndex, facId, canRemoveGroup, canRemoveSite) {
    var isPrimary = siteIndex === 0;
    var facilityHtml = App.UI.Setup
      ? App.UI.Setup.cohortFacilitySelectHtml(data, group, facId)
      : '';
    var labelHtml = isPrimary
      ? '<span class="config-group-label">' + group + '</span>'
      : '<span class="config-group-label config-group-label-empty" aria-hidden="true"></span>';
    var dayHtml = isPrimary
      ? '<select data-clin="day" class="clin-day-select" aria-label="' + group + ' clinical day">' +
        daySelectHtml(day) + '</select>'
      : '<span class="clin-day-spacer" aria-hidden="true"></span>';
    var removeHtml = '';
    var addSiteHtml = '<span class="clin-row-add-site-spacer" aria-hidden="true"></span>';
    if (isPrimary) {
      addSiteHtml = '<button type="button" class="btn btn-sm add-clin-group-site clin-row-add-site" data-clin-group="' + group + '" ' +
        'aria-label="Add site for ' + group + '">Add site</button>';
      removeHtml = canRemoveGroup
        ? '<button type="button" class="btn btn-icon-remove remove-clin-group" aria-label="Remove clinical group" title="Remove clinical group">&times;</button>'
        : '<span class="section-sub" style="font-size:0.75rem">Min. 1</span>';
    } else if (canRemoveSite) {
      removeHtml = '<button type="button" class="btn btn-icon-remove remove-clin-site" ' +
        'data-clin-group="' + group + '" data-clin-site-index="' + siteIndex + '" ' +
        'aria-label="Remove site for ' + group + '" title="Remove site">&times;</button>';
    } else {
      removeHtml = '<span class="section-sub" style="font-size:0.75rem">Min. 1</span>';
    }
    var rowClass = 'config-list-row' + (isPrimary ? '' : ' clin-site-continuation');
    return '<div class="' + rowClass + '" data-clin-group-row="' + group + '" data-clin-site-index="' + siteIndex + '">' +
      labelHtml +
      dayHtml +
      '<select data-clin-site-facility data-clin-group="' + group + '" data-clin-site-index="' + siteIndex + '" ' +
      'aria-label="' + group + ' clinical site ' + (siteIndex + 1) + '">' + facilityHtml + '</select>' +
      addSiteHtml +
      removeHtml +
      '</div>';
  }

  function renderClinicalGroupsList(data) {
    var cfg = data.config;
    var groups = App.DataModel.getClinicalGroups(cfg);
    var canRemoveGroup = groups.length > 1;
    var html = '';
    groups.forEach(function (g) {
      var day = cfg.clinicalGroupDays[g] || 'Mon';
      var facIds = getGroupFacilityIds(data, g);
      if (!facIds.length) facIds = [''];
      html += '<div class="clin-group-block" data-clin-group-block="' + g + '">';
      facIds.forEach(function (facId, siteIndex) {
        html += clinicalSiteRow(
          data, g, day, siteIndex, facId,
          canRemoveGroup,
          facIds.length > 1
        );
      });
      html += renderGroupWeekPlan(data, g);
      html += '</div>';
    });
    html += '<div class="config-list-add-row clin-groups-add-row">' +
      '<button type="button" class="btn btn-sm add-clin-group">Add group</button>' +
      '</div>';
    return html;
  }

  function simDayRow(day, canRemove) {
    return '<div class="config-list-row" data-sim-day-row="1">' +
      '<select data-sim-day="value" aria-label="Simulation day">' + daySelectHtml(day) + '</select>' +
      (canRemove
        ? '<button type="button" class="btn btn-icon-remove remove-sim-day" aria-label="Remove simulation day" title="Remove simulation day">&times;</button>'
        : '<span class="section-sub" style="font-size:0.75rem">Min. 1</span>') +
      '</div>';
  }

  function renderSimDaysList(cfg) {
    var days = App.DataModel.getSimDays(cfg);
    var canRemove = days.length > 1;
    var rowsHtml = days.map(function (d) {
      return simDayRow(d, canRemove);
    }).join('');
    return rowsHtml +
      '<div class="config-list-add-row">' +
      '<button type="button" class="btn btn-sm add-sim-day">Add day</button>' +
      '</div>';
  }

  function patternSelectHtml(selected) {
    return '<option value="even"' + (selected === 'even' ? ' selected' : '') + '>Even weeks</option>' +
      '<option value="odd"' + (selected === 'odd' ? ' selected' : '') + '>Odd weeks</option>';
  }

  function simGroupRow(group, day, pattern, canRemove) {
    return '<div class="config-list-row" data-sim-group-row="' + group + '">' +
      '<span class="config-group-label">' + group + '</span>' +
      '<select data-sim-group="day" class="clin-day-select" aria-label="' + group + ' primary weekday">' +
      daySelectHtml(day) + '</select>' +
      '<select data-sim-group="pattern" aria-label="' + group + ' week pattern">' +
      patternSelectHtml(pattern) + '</select>' +
      (canRemove
        ? '<button type="button" class="btn btn-icon-remove remove-sim-group" aria-label="Remove simulation group" title="Remove simulation group">&times;</button>'
        : '<span class="section-sub" style="font-size:0.75rem">Min. 1</span>') +
      '</div>';
  }

  function renderSimGroupsList(cfg) {
    var groups = App.DataModel.getSimGroups(cfg);
    var canRemove = groups.length > 1;
    var html = groups.map(function (g) {
      return simGroupRow(
        g,
        App.DataModel.getSimGroupDay(g, cfg),
        App.DataModel.getSimGroupPattern(g, cfg),
        canRemove
      );
    }).join('');
    return html +
      '<div class="config-list-add-row">' +
      '<button type="button" class="btn btn-sm add-sim-group">Add group</button>' +
      '</div>';
  }

  function readOptionalWeekInput(id) {
    var el = document.getElementById(id);
    if (!el || el.value === '') return null;
    var n = parseInt(el.value, 10);
    return isNaN(n) ? null : n;
  }

  function readFormIntoConfig(cfg, data) {
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
    cfg.clinicalMakeupPrimaryWeek = readOptionalWeekInput('cfgClinMakeupPrimary');
    cfg.clinicalMakeupFallbackWeek = readOptionalWeekInput('cfgClinMakeupFallback');
    cfg.simMakeupLastResortWeek = readOptionalWeekInput('cfgSimMakeupLastResort');

    cfg.clinicalGroups = [];
    cfg.clinicalGroupDays = {};
    cfg.clinicalGroupFacilities = {};
    document.querySelectorAll('#cfgClinicalGroupsList [data-clin-group-row]').forEach(function (row) {
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
    document.querySelectorAll('#cfgSimDaysList [data-sim-day-row]').forEach(function (row) {
      cfg.simDays.push(row.querySelector('[data-sim-day="value"]').value);
    });

    cfg.simGroups = [];
    cfg.simGroupDays = {};
    cfg.simGroupPattern = {};
    document.querySelectorAll('#cfgSimGroupsList [data-sim-group-row]').forEach(function (row) {
      var g = row.getAttribute('data-sim-group-row');
      cfg.simGroups.push(g);
      var dayEl = row.querySelector('[data-sim-group="day"]');
      var patEl = row.querySelector('[data-sim-group="pattern"]');
      cfg.simGroupDays[g] = dayEl ? dayEl.value : 'Mon';
      cfg.simGroupPattern[g] = patEl ? patEl.value : 'even';
    });

    var normalized = App.DataModel.normalizeConfig(cfg);
    if (data && App.ClinicalSites) {
      data.config = normalized;
      App.ClinicalSites.collectGroupFacilitiesFromDom(data);
      normalized.clinicalGroupFacilities = data.config.clinicalGroupFacilities;
    }
    return App.DataModel.normalizeConfig(normalized);
  }

  function draftConfigFromForm(baseCfg, data) {
    return readFormIntoConfig(App.DataModel.cloneConfig(baseCfg), data);
  }

  function refreshDynamicLists(data) {
    var clinList = document.getElementById('cfgClinicalGroupsList');
    var simGroupsList = document.getElementById('cfgSimGroupsList');
    var simList = document.getElementById('cfgSimDaysList');
    var cfg = data.config;
    if (clinList) clinList.innerHTML = renderClinicalGroupsList(data);
    if (simGroupsList) simGroupsList.innerHTML = renderSimGroupsList(cfg);
    if (simList) simList.innerHTML = renderSimDaysList(cfg);
    updateAllWeekRangeHints(data);
  }

  function nextFacilityForGroup(data, group) {
    var existing = getGroupFacilityIds(data, group);
    var unique = App.DataModel.getUniqueFacilitiesForSelect(data);
    for (var i = 0; i < unique.length; i++) {
      var id = unique[i].id;
      var used = existing.some(function (e) {
        return App.DataModel.sameFacilitySite(data, e, id);
      });
      if (!used) return id;
    }
    return existing[0] || (unique[0] && unique[0].id) || null;
  }

  function addSiteToGroup(data, group) {
    if (!data.config.clinicalGroupFacilities) data.config.clinicalGroupFacilities = {};
    if (!data.config.clinicalGroupFacilities[group]) {
      data.config.clinicalGroupFacilities[group] = getGroupFacilityIds(data, group);
    }
    var nextFac = nextFacilityForGroup(data, group);
    if (nextFac) data.config.clinicalGroupFacilities[group].push(nextFac);
    refreshDynamicLists(data);
  }

  function escAttrLocal(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function siteLibraryRow(site, referenced) {
    var tagsHtml = App.SiteLibrary.ALLOWED_TAGS.map(function (tag) {
      var checked = site.contentTags.indexOf(tag) >= 0 ? ' checked' : '';
      return '<label class="filter-check site-lib-tag">' +
        '<input type="checkbox" data-site-lib-tag="' + tag + '"' + checked + '> ' + tag + '</label>';
    }).join('');
    var removeHtml = referenced
      ? '<span class="section-sub site-lib-in-use" title="Referenced by a semester facility list">In use</span>'
      : '<button type="button" class="btn btn-icon-remove remove-site-lib" data-site-id="' + site.id + '" aria-label="Remove site" title="Remove site">&times;</button>';
    return '<div class="site-lib-row" data-site-lib-row data-site-id="' + site.id + '">' +
      '<input type="text" data-site-lib="name" value="' + escAttrLocal(site.name) + '" placeholder="Site name" aria-label="Site name">' +
      '<input type="text" data-site-lib="short" value="' + escAttrLocal(site.shortName) + '" placeholder="Short" maxlength="10" aria-label="Short name">' +
      '<span class="site-lib-tags">' + tagsHtml + '</span>' +
      removeHtml +
      '</div>';
  }

  function siteLibraryContainer() {
    return document.getElementById('clinicalSitesTabLibrary') ||
      document.getElementById('cfgSiteLibrary');
  }

  function renderSiteLibrary() {
    var container = siteLibraryContainer();
    if (!container || !App.SiteLibrary) return;
    var fileRoot = App.getFileRoot();
    var rowsHtml = App.SiteLibrary.list().map(function (site) {
      return siteLibraryRow(site, App.SiteLibrary.isSiteReferenced(fileRoot, site.id));
    }).join('');
    container.innerHTML = rowsHtml +
      '<div class="config-list-add-row">' +
      '<button type="button" class="btn btn-sm add-site-lib">Add site</button>' +
      '</div>';
  }

  // Read the library editor rows back into fileRoot.meta.siteLibrary.
  function collectSiteLibraryFromDom() {
    var container = siteLibraryContainer();
    if (!container || !App.SiteLibrary) return;
    var rows = container.querySelectorAll('[data-site-lib-row]');
    if (!rows.length) return;
    var sites = [];
    rows.forEach(function (row) {
      var tags = [];
      row.querySelectorAll('[data-site-lib-tag]').forEach(function (cb) {
        if (cb.checked) tags.push(cb.getAttribute('data-site-lib-tag'));
      });
      sites.push({
        id: row.getAttribute('data-site-id'),
        name: row.querySelector('[data-site-lib="name"]').value,
        shortName: row.querySelector('[data-site-lib="short"]').value,
        contentTags: tags
      });
    });
    App.SiteLibrary.replaceAll(sites);
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
    set('cfgClinMakeupPrimary', cfg.clinicalMakeupPrimaryWeek != null ? cfg.clinicalMakeupPrimaryWeek : '');
    set('cfgClinMakeupFallback', cfg.clinicalMakeupFallbackWeek != null ? cfg.clinicalMakeupFallbackWeek : '');
    set('cfgSimMakeupLastResort', cfg.simMakeupLastResortWeek != null ? cfg.simMakeupLastResortWeek : '');
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
    var courseLabel = document.getElementById('setupNewSemesterCourseLabel');
    if (banner) banner.classList.toggle('hidden', !pendingNewSemester);
    if (saveAddBtn) saveAddBtn.classList.toggle('hidden', !pendingNewSemester);
    if (courseLabel) {
      courseLabel.classList.toggle('hidden', !pendingNewSemester);
      if (pendingNewSemester) populateNewSemesterCourseSelect();
    }
  }

  function populateNewSemesterCourseSelect() {
    var select = document.getElementById('setupNewSemesterCourse');
    if (!select || !App.CourseDefaults) return;
    var data = App.getData();
    var current = (data && data.meta && data.meta.courseId) || 'REGN15P';
    select.innerHTML = App.CourseDefaults.list().map(function (c) {
      return '<option value="' + c.courseId + '"' + (c.courseId === current ? ' selected' : '') + '>' +
        c.displayName + '</option>';
    }).join('');
  }

  function render(data) {
    if (!data) return;
    var cfg = App.DataModel.normalizeConfig(App.DataModel.cloneConfig(data.config));
    data.config = cfg;
    App.DataModel.migrateClinicalGroupFacilities(data);
    renderAdvancedFields(cfg);
    refreshDynamicLists(data);
    renderSiteLibrary();
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
    collectSiteLibraryFromDom();
    var draft = draftConfigFromForm(data.config, data);
    var before = applyConfigToData(data, draft);
    data.meta.configCustomized = true;
    if (App.ClinicalSites) App.ClinicalSites.applyPrimarySitesToStudents(data);
    App.DataModel.linkFacilitiesToSiteLibrary(data.facilities);
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
      App.UI.showConfirm('Regenerate schedules?', msg, function () {
        App.Scheduler.regenerateAll(data);
      }, { confirmLabel: 'Regenerate' });
    }
  }

  function resetToDefaults() {
    var fileRoot = App.getFileRoot();
    var data = App.getData();
    var defaults = App.DataModel.normalizeConfig(App.DataModel.getSchedulingDefaults(fileRoot));
    var before = applyConfigToData(data, defaults);
    data.meta.configCustomized = false;
    if (App.UI.Setup && App.UI.Setup.markSetupDraft) App.UI.Setup.markSetupDraft(data);
    render(data);
    App.notifyChange();
    maybeRegenerateAfterChange(data, before);
    App.UI.refresh();
  }

  function applyToFutureSemesters() {
    var fileRoot = App.getFileRoot();
    var data = App.getData();
    var draft = draftConfigFromForm(data.config, data);
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
    App.UI.showConfirm('Apply settings?', message, function () {
      applyConfigToData(data, draft);
      data.meta.configCustomized = true;
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(data);
      App.DataModel.setSchedulingDefaults(fileRoot, data.config);
      future.forEach(function (sem) {
        App.DataModel.applyConfigToSemester(sem, data.config, true);
        App.DataModel.syncSemesterForConfig(sem);
      });

      render(data);
      App.notifyChange();
      maybeRegenerateAfterChange(data, before);
      App.UI.refresh();
      App.UI.showAlert('Applied', 'Configuration applied to program defaults' +
        (future.length ? ' and ' + future.length + ' future semester(s).' : '.'));
    }, { confirmLabel: 'Apply' });
  }

  function saveAndAddSemester() {
    var data = App.getData();
    var before = App.UI.Setup && App.UI.Setup.collectFromForm
      ? collectFormInto(data)
      : collectIntoData(data);
    App.DataModel.setSchedulingDefaults(App.getFileRoot(), data.config);
    var courseSelect = document.getElementById('setupNewSemesterCourse');
    var courseId = courseSelect ? courseSelect.value : undefined;
    pendingNewSemester = false;
    updateNewSemesterBanner();
    App.notifyChange();
    maybeRegenerateAfterChange(data, before);
    App.addSemester(undefined, undefined, courseId);
    App.UI.switchTab('setup');
    App.UI.refresh();
  }

  function beginNewSemesterFlow() {
    pendingNewSemester = true;
    App.UI.switchTab('setup');
    openAdvanced();
    render(App.getData());
  }

  function addRangeToGroup(data, group) {
    if (!data.config.clinicalGroupSiteWeeks) data.config.clinicalGroupSiteWeeks = {};
    if (!App.ClinicalSites.groupUsesWeekRanges(data, group)) {
      data.config.clinicalGroupSiteWeeks[group] = [];
    }
    var ranges = data.config.clinicalGroupSiteWeeks[group] || [];
    var facIds = getGroupFacilityIds(data, group);
    var facId = facIds[ranges.length % facIds.length] || facIds[0];
    var start = defaultRangeStart(data);
    if (ranges.length) {
      var last = ranges[ranges.length - 1];
      start = Math.min(17, (last.endWeekIndex != null ? last.endWeekIndex : start) + 1);
    }
    ranges.push({
      facilityId: facId,
      startWeekIndex: start,
      endWeekIndex: Math.min(17, start + 2)
    });
    data.config.clinicalGroupSiteWeeks[group] = ranges;
    refreshDynamicLists(data);
  }

  function updateWeekRangeHint(data, selectEl) {
    if (!selectEl) return;
    var row = selectEl.closest('.clin-site-range-row');
    if (!row) return;
    var hint = row.querySelector(
      selectEl.hasAttribute('data-clin-site-range-start')
        ? '[data-clin-range-start-hint]'
        : '[data-clin-range-end-hint]'
    );
    if (hint) hint.textContent = weekHintText(data, selectEl.value);
  }

  function updateAllWeekRangeHints(data) {
    document.querySelectorAll('#cfgClinicalGroupsList [data-clin-site-range-start], ' +
      '#cfgClinicalGroupsList [data-clin-site-range-end]').forEach(function (el) {
      updateWeekRangeHint(data, el);
    });
  }

  function handleSetupClick(e) {
    if (e.target.classList.contains('add-site-lib')) {
      if (!App.SiteLibrary) return;
      collectSiteLibraryFromDom();
      App.SiteLibrary.upsertSite({ name: 'New Site', shortName: '', contentTags: ['MS'] });
      renderSiteLibrary();
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(App.getData());
      App.notifyChange();
      return;
    }

    if (e.target.closest('.remove-site-lib')) {
      if (!App.SiteLibrary) return;
      var siteBtnLib = e.target.closest('.remove-site-lib');
      var libSiteId = siteBtnLib.getAttribute('data-site-id');
      collectSiteLibraryFromDom();
      if (App.SiteLibrary.isSiteReferenced(App.getFileRoot(), libSiteId)) {
        App.UI.showAlert('Site in use',
          'This site is referenced by a semester facility list and cannot be removed. Remove it from all semesters first.');
        renderSiteLibrary();
        return;
      }
      App.SiteLibrary.removeSite(libSiteId);
      renderSiteLibrary();
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(App.getData());
      App.notifyChange();
      return;
    }

    if (e.target.classList.contains('add-clin-site-range')) {
      var dataRange = resolveSetupData();
      collectFormInto(dataRange);
      var rangeGroup = e.target.getAttribute('data-clin-group');
      if (!dataRange.config.clinicalGroupSiteWeeks) dataRange.config.clinicalGroupSiteWeeks = {};
      dataRange.config.clinicalGroupSiteWeeks[rangeGroup] = dataRange.config.clinicalGroupSiteWeeks[rangeGroup] || [];
      addRangeToGroup(dataRange, rangeGroup);
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(dataRange);
      return;
    }

    if (e.target.closest('.remove-clin-site-range')) {
      var rangeBtn = e.target.closest('.remove-clin-site-range');
      var rg = rangeBtn.getAttribute('data-clin-group');
      var dataRangeRemove = resolveSetupData();
      collectFormInto(dataRangeRemove);
      var rangeRow = rangeBtn.closest('.clin-site-range-row');
      var plan = document.querySelector('[data-clin-group-week-plan="' + rg + '"]');
      var rows = plan ? plan.querySelectorAll('.clin-site-range-row') : [];
      var rIdx = Array.prototype.indexOf.call(rows, rangeRow);
      if (rIdx >= 0 && dataRangeRemove.config.clinicalGroupSiteWeeks[rg]) {
        dataRangeRemove.config.clinicalGroupSiteWeeks[rg].splice(rIdx, 1);
      }
      refreshDynamicLists(dataRangeRemove);
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(dataRangeRemove);
      return;
    }

    if (e.target.classList.contains('add-clin-group-site')) {
      var dataSite = resolveSetupData();
      collectFormInto(dataSite);
      var groupForSite = e.target.getAttribute('data-clin-group');
      if (!groupForSite) {
        var siteRow = e.target.closest('[data-clin-group-row]');
        if (siteRow) groupForSite = siteRow.getAttribute('data-clin-group-row');
      }
      if (!groupForSite) return;
      addSiteToGroup(dataSite, groupForSite);
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(dataSite);
      return;
    }

    if (e.target.classList.contains('add-clin-group')) {
      var dataAdd = resolveSetupData();
      collectFormInto(dataAdd);
      var cfg = App.DataModel.cloneConfig(dataAdd.config);
      var name = App.DataModel.nextClinicalGroupName(cfg.clinicalGroups);
      cfg.clinicalGroups.push(name);
      cfg.clinicalGroupDays[name] = 'Mon';
      if (!cfg.clinicalGroupFacilities) cfg.clinicalGroupFacilities = {};
      if (!cfg.clinicalGroupSiteWeeks) cfg.clinicalGroupSiteWeeks = {};
      var defaultFac = App.DataModel.getDefaultFacilityIdForClinicalGroup(name, dataAdd.facilities || []);
      cfg.clinicalGroupFacilities[name] = defaultFac ? [defaultFac] : [];
      cfg.clinicalGroupSiteWeeks[name] = [];
      dataAdd.config = App.DataModel.normalizeConfig(cfg);
      refreshDynamicLists(dataAdd);
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(dataAdd);
      return;
    }

    if (e.target.closest('.remove-clin-site')) {
      var siteBtn = e.target.closest('.remove-clin-site');
      var siteGroup = siteBtn.getAttribute('data-clin-group');
      var siteIdx = parseInt(siteBtn.getAttribute('data-clin-site-index'), 10);
      var dataSiteRemove = resolveSetupData();
      collectFormInto(dataSiteRemove);
      var list = getGroupFacilityIds(dataSiteRemove, siteGroup);
      if (list.length <= 1) return;
      list.splice(siteIdx, 1);
      dataSiteRemove.config.clinicalGroupFacilities[siteGroup] = list;
      refreshDynamicLists(dataSiteRemove);
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(dataSiteRemove);
      return;
    }

    if (e.target.closest('.remove-clin-group')) {
      var row = e.target.closest('[data-clin-group-row]');
      if (!row) return;
      var dataRemove = resolveSetupData();
      collectFormInto(dataRemove);
      var cfgRemove = App.DataModel.cloneConfig(dataRemove.config);
      if (cfgRemove.clinicalGroups.length <= 1) return;
      var group = row.getAttribute('data-clin-group-row');
      cfgRemove.clinicalGroups = cfgRemove.clinicalGroups.filter(function (g) { return g !== group; });
      delete cfgRemove.clinicalGroupDays[group];
      if (cfgRemove.clinicalGroupFacilities) delete cfgRemove.clinicalGroupFacilities[group];
      if (cfgRemove.clinicalGroupSiteWeeks) delete cfgRemove.clinicalGroupSiteWeeks[group];
      dataRemove.config = App.DataModel.normalizeConfig(cfgRemove);
      refreshDynamicLists(dataRemove);
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(dataRemove);
      return;
    }

    if (e.target.classList.contains('add-sim-group')) {
      var dataAddSg = resolveSetupData();
      collectFormInto(dataAddSg);
      var cfgAddSg = draftConfigFromForm(dataAddSg.config, dataAddSg);
      var sgName = App.DataModel.nextSimGroupName(cfgAddSg.simGroups);
      cfgAddSg.simGroups.push(sgName);
      dataAddSg.config = App.DataModel.normalizeConfig(cfgAddSg);
      refreshDynamicLists(dataAddSg);
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(dataAddSg);
      return;
    }

    if (e.target.closest('.remove-sim-group')) {
      var sgRow = e.target.closest('[data-sim-group-row]');
      if (!sgRow) return;
      var dataRemoveSg = resolveSetupData();
      collectFormInto(dataRemoveSg);
      var cfgRemoveSg = draftConfigFromForm(dataRemoveSg.config, dataRemoveSg);
      if (cfgRemoveSg.simGroups.length <= 1) return;
      var sgGroup = sgRow.getAttribute('data-sim-group-row');
      cfgRemoveSg.simGroups = cfgRemoveSg.simGroups.filter(function (g) { return g !== sgGroup; });
      dataRemoveSg.config = App.DataModel.normalizeConfig(cfgRemoveSg);
      refreshDynamicLists(dataRemoveSg);
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(dataRemoveSg);
      return;
    }

    if (e.target.classList.contains('add-sim-day')) {
      var dataSim = resolveSetupData();
      collectFormInto(dataSim);
      var cfgSim = draftConfigFromForm(dataSim.config, dataSim);
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
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(dataSim);
      return;
    }

    if (e.target.closest('.remove-sim-day')) {
      var simRow = e.target.closest('[data-sim-day-row]');
      if (!simRow) return;
      var dataSimRemove = resolveSetupData();
      collectFormInto(dataSimRemove);
      var cfgSimRemove = draftConfigFromForm(dataSimRemove.config, dataSimRemove);
      if (cfgSimRemove.simDays.length <= 1) return;
      var idx = Array.prototype.indexOf.call(
        document.querySelectorAll('#cfgSimDaysList [data-sim-day-row]'),
        simRow
      );
      if (idx >= 0) cfgSimRemove.simDays.splice(idx, 1);
      dataSimRemove.config = App.DataModel.normalizeConfig(cfgSimRemove);
      refreshDynamicLists(dataSimRemove);
      if (App.UI.Setup && App.UI.Setup.markSetupDraft) touchSetupEdit(dataSimRemove);
    }
  }

  function init() {
    var viewSetup = document.getElementById('view-setup');
    if (viewSetup) {
      viewSetup.addEventListener('click', handleSetupClick);
      viewSetup.addEventListener('change', function (e) {
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

  function applyRoleMode() {
    var canEdit = App.Permissions.canAction('setup.edit');
    var canDraft = App.Permissions.canAction('setup.saveDraft');
    var canPropose = App.Permissions.canAction('proposals.submit');
    var canImportPg = App.Permissions.canAction('setup.importPlayground');
    var isEngineer = App.Permissions.canAction('*');
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
    if (App.SetupDraft && App.SetupDraft.collectSnapshotFromDom) {
      var snap = App.SetupDraft.collectSnapshotFromDom();
      return snap ? snap.config : (data && data.config);
    }
    return draftConfigFromForm(data.config, data);
  }

  function renderIntoPlayground(data) {
    renderAdvancedFields(data.config);
    var el = document.getElementById('playgroundConfigSummary');
    if (el) {
      el.textContent = 'Clinical days: ' + data.config.clinicalDaysRequired +
        ', Sim days: ' + data.config.simDaysRequired;
    }
  }

  return {
    render: render,
    collectIntoData: collectIntoData,
    collectDraftConfig: collectDraftConfig,
    maybeRegenerateAfterChange: maybeRegenerateAfterChange,
    openAdvanced: openAdvanced,
    toggleAdvanced: toggleAdvanced,
    beginNewSemesterFlow: beginNewSemesterFlow,
    applyRoleMode: applyRoleMode,
    siteLibraryRow: siteLibraryRow,
    renderIntoPlayground: renderIntoPlayground,
    init: init
  };
})();
