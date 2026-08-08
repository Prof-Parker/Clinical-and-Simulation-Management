/** Clinical groups, sites, and week-range configuration. */

import * as DataModel from '../../core/data-model/index.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import { getCohortFacilityIdForGroup, cohortFacilitySelectHtml } from '../setup/roster.js';
import { weekSelectHtml, semesterWeekHintForIndex } from '../setup/holidays-orientations.js';
import {
  daySelectHtml, renderSimGroupsList, renderSimDaysList, renderSimTimeOverrides
} from './sim-groups.js';
import { setupEl, setupQueryAll } from '../setup/scope.js';
import { escAttr, escHtml } from '../setup/dom-utils.js';
import * as ScheduleHours from '../../core/schedule-hours.js';

function getGroupFacilityIds(data, group) {
    if (ClinicalSites) {
      return ClinicalSites.getGroupFacilities(data, group);
    }
    var facId = getCohortFacilityIdForGroup(data, group);
    return facId ? [facId] : [];
  }

function groupFacilitySelectHtml(data, group, selectedId) {
    var facIds = getGroupFacilityIds(data, group);
    var unique = DataModel.getUniqueFacilitiesForSelect(data);
    var html = '';
    var matched = false;
    unique.forEach(function (f) {
      var allowed = facIds.some(function (id) {
        return DataModel.sameFacilitySite(data, id, f.id);
      });
      if (!allowed) return;
      var isSelected = DataModel.sameFacilitySite(data, selectedId, f.id);
      if (isSelected) matched = true;
      html += '<option value="' + escAttr(f.id) + '"' +
        (isSelected ? ' selected' : '') + '>' +
        escHtml(f.name) + '</option>';
    });
    if (selectedId && !matched) {
      html = '<option value="' + escAttr(selectedId) + '" selected>' +
        escHtml(String(selectedId)) + ' (missing)</option>' + html;
    }
    if (!html) html = '<option value="">No sites available</option>';
    return html;
  }

function weekSelectForGroup(data, selectedWeek) {
    if (weekSelectHtml) {
      return weekSelectHtml(data, selectedWeek);
    }
    var html = '';
    for (var i = 0; i < 18; i++) {
      html += '<option value="' + i + '"' +
        (String(selectedWeek) === String(i) ? ' selected' : '') + '>Wk ' + (i + 1) + '</option>';
    }
    return html;
  }

function weekHintText(data, weekIndex) {
    if (semesterWeekHintForIndex) {
      return semesterWeekHintForIndex(data, weekIndex);
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
    if (!ClinicalSites || !ClinicalSites.groupHasMultipleSites(data, group)) return '';
    var cfg = data.config;
    var usesRanges = ClinicalSites.groupUsesWeekRanges(data, group);
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
    var facilityHtml = cohortFacilitySelectHtml(data, group, facId);
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
    var groups = DataModel.getClinicalGroups(cfg);
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
    setupQueryAll('cfgClinicalGroupsList', '[data-clin-site-range-start], [data-clin-site-range-end]')
      .forEach(function (el) {
        updateWeekRangeHint(data, el);
      });
  }

function nextFacilityForGroup(data, group) {
    var existing = getGroupFacilityIds(data, group);
    var unique = DataModel.getUniqueFacilitiesForSelect(data);
    for (var i = 0; i < unique.length; i++) {
      var id = unique[i].id;
      var used = existing.some(function (e) {
        return DataModel.sameFacilitySite(data, e, id);
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

function addRangeToGroup(data, group) {
    if (!data.config.clinicalGroupSiteWeeks) data.config.clinicalGroupSiteWeeks = {};
    if (!ClinicalSites.groupUsesWeekRanges(data, group)) {
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

function refreshDynamicLists(data) {
    var clinList = setupEl('cfgClinicalGroupsList');
    var simGroupsList = setupEl('cfgSimGroupsList');
    var simList = setupEl('cfgSimDaysList');
    var simOverrides = setupEl('cfgSimTimeOverrides');
    var cfg = data.config;
    ScheduleHours.ensureSimTimes(cfg);
    if (clinList) clinList.innerHTML = renderClinicalGroupsList(data);
    if (simGroupsList) simGroupsList.innerHTML = renderSimGroupsList(cfg);
    if (simList) simList.innerHTML = renderSimDaysList(cfg);
    if (simOverrides) simOverrides.innerHTML = renderSimTimeOverrides(cfg);
    var startEl = setupEl('cfgSimDefaultStart');
    var endEl = setupEl('cfgSimDefaultEnd');
    if (startEl) startEl.value = ScheduleHours.hhmmToTimeInput(cfg.simDefaultStart);
    if (endEl) endEl.value = ScheduleHours.hhmmToTimeInput(cfg.simDefaultEnd);
    updateAllWeekRangeHints(data);
  }

export {
  renderClinicalGroupsList,
  refreshDynamicLists,
  getGroupFacilityIds,
  addSiteToGroup,
  addRangeToGroup,
  updateWeekRangeHint,
  updateAllWeekRangeHints,
  nextFacilityForGroup
};
