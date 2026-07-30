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

export function readFormIntoConfig(cfg, data) {
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
  var holBlockEl = setupEl('cfgHolidayBlocksWeek');
  if (holBlockEl) cfg.holidayBlocksFullWeek = !!holBlockEl.checked;
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
