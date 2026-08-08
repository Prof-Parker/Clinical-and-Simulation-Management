/**
 * Advanced config form read/write helpers.
 */

import * as DataModel from '../../core/data-model/index.js';
import * as ClinicalSites from '../../core/clinical-sites.js';
import { setupEl, setupQueryAll } from '../setup/scope.js';
import { collectSimTimesIntoConfig } from './sim-groups.js';

function readOptionalWeekInput(id) {
  var el = setupEl(id);
  if (!el || el.value === '') return null;
  var n = parseInt(el.value, 10);
  return isNaN(n) ? null : n;
}

function readIntField(id, fallback) {
  var el = setupEl(id);
  if (!el || el.value === '') return fallback;
  var n = parseInt(el.value, 10);
  return isNaN(n) ? fallback : n;
}

export function readFormIntoConfig(cfg, data) {
  cfg.clinicalDaysRequired = readIntField('cfgClinDays', cfg.clinicalDaysRequired || 10);
  cfg.simDaysRequired = readIntField('cfgSimDays', cfg.simDaysRequired || 5);
  cfg.maxStudents = readIntField('cfgMaxStudents', cfg.maxStudents || 30);
  cfg.maxPerClinicalGroup = readIntField('cfgMaxClinGroup', cfg.maxPerClinicalGroup || 6);
  cfg.maxPerClinicalGroupOverload = readIntField(
    'cfgMaxClinOverload',
    cfg.maxPerClinicalGroupOverload || (cfg.maxPerClinicalGroup || 6) + 1
  );
  cfg.maxStudentsPerSimSession = readIntField(
    'cfgMaxSimSession',
    cfg.maxStudentsPerSimSession || 8
  );
  cfg.maxStudentsPerSimSessionOverload = readIntField(
    'cfgMaxSimOverload',
    cfg.maxStudentsPerSimSessionOverload || 9
  );
  var guestSoftEl = setupEl('cfgMaxGuestSims');
  if (guestSoftEl) {
    cfg.maxGuestSimsPerStudent = readIntField('cfgMaxGuestSims', cfg.maxGuestSimsPerStudent || 1);
  }
  cfg.simMakeupHeadroomReserved = readIntField(
    'cfgSimHeadroom',
    cfg.simMakeupHeadroomReserved != null ? cfg.simMakeupHeadroomReserved : 1
  );
  var holBlockEl = setupEl('cfgHolidayBlocksWeek');
  if (holBlockEl) cfg.holidayBlocksFullWeek = !!holBlockEl.checked;
  cfg.clinicalStartWeek = readIntField('cfgClinStart', cfg.clinicalStartWeek || 5);
  cfg.simStartWeek = readIntField('cfgSimStart', cfg.simStartWeek || 5);
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

export function draftConfigFromForm(baseCfg, data) {
  return readFormIntoConfig(DataModel.cloneConfig(baseCfg), data);
}

export function renderAdvancedFields(cfg) {
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
  var holBlockEl = setupEl('cfgHolidayBlocksWeek');
  if (holBlockEl) {
    holBlockEl.checked = cfg.holidayBlocksFullWeek !== false;
  }
  set('cfgClinStart', cfg.clinicalStartWeek);
  set('cfgSimStart', cfg.simStartWeek);
  set('cfgClinMakeupPrimary', cfg.clinicalMakeupPrimaryWeek != null ? cfg.clinicalMakeupPrimaryWeek : '');
  set('cfgClinMakeupFallback', cfg.clinicalMakeupFallbackWeek != null ? cfg.clinicalMakeupFallbackWeek : '');
  set('cfgSimMakeupLastResort', cfg.simMakeupLastResortWeek != null ? cfg.simMakeupLastResortWeek : '');
}
