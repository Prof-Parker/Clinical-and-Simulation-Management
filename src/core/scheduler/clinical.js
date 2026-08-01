/**
 * Clinical day scheduling and conflict makeup placement.
 */

import { getCanonicalFacilityId } from '../data-model/index.js';
import * as CalendarEngine from '../calendar-engine.js';
import * as ClinicalSites from '../clinical-sites.js';
import { assignClinicalCellFacility } from './assignments.js';
import {
  countedClinicals,
  getStudentClinicalDay,
  getFacilityName
} from './helpers.js';
import { withProvenance } from './makeup.js';

export function getWeek18ClinicalSlot(data, student) {
  var makeupWeeks = CalendarEngine.resolveMakeupWeeks(data);
  var wi = makeupWeeks.clinicalFallback;
  if (CalendarEngine.isSchedulingBlockedWeek(data, wi)) return null;
  var cell = student.schedule[wi];
  if (!cell || cell.inactive) return null;
  if (cell.sim || cell.clinical || cell.makeupClinical) return null;
  var facId = ClinicalSites
    ? ClinicalSites.getPrimaryGroupFacility(data, student.clinicalGroup) || student.facilityId
    : student.facilityId;
  return {
    weekIndex: wi,
    week: wi + 1,
    week18Fallback: true,
    facilityId: facId ? getCanonicalFacilityId(data, facId) : null,
    reason: 'Makeup clinical at ' + getFacilityName(data, facId) + ' — last resort',
    day: getStudentClinicalDay(student, data.config)
  };
}

export function scheduleClinicalForStudent(student, data) {
  var cfg = data.config;
  var needed = cfg.clinicalDaysRequired || 10;
  var clinStart = (cfg.clinicalStartWeek || 5) - 1;
  var clinDay = getStudentClinicalDay(student, cfg);
  var weeks = CalendarEngine.getClinicalEligibleWeeks(data, clinStart);
  var makeupWeeks = CalendarEngine.resolveMakeupWeeks(data);

  for (var i = 0; i < weeks.length && countedClinicals(student) < needed; i++) {
    var wi = weeks[i];
    if (CalendarEngine.isSchedulingBlockedDay(data, wi, clinDay)) continue;
    var cell = student.schedule[wi];
    if (cell.inactive || cell.makeupClinical) continue;
    if (cell.clinical && !cell.clinicalMissed) continue;
    var ordinal = countedClinicals(student);
    cell.clinical = true;
    assignClinicalCellFacility(data, student, cell, wi, ordinal);
  }

  for (var j = makeupWeeks.clinicalFallback; j >= clinStart && countedClinicals(student) < needed; j--) {
    if (CalendarEngine.isSchedulingBlockedDay(data, j, clinDay)) continue;
    var c = student.schedule[j];
    if (c.inactive || c.sim || c.clinical || c.makeupClinical) continue;
    c.makeupClinical = true;
    if (ClinicalSites) {
      var mkFac = ClinicalSites.resolveFacilityForWeek(
        data, student.clinicalGroup, j, countedClinicals(student)
      );
      if (mkFac) c.facilityId = mkFac;
    }
  }
}

export function scheduleConflictClinicalMakeups(student, data, state) {
  if (!state || !state.conflictWeeks.length) return;
  var cfg = data.config;
  var clinDay = getStudentClinicalDay(student, cfg);
  var makeupWeeks = CalendarEngine.resolveMakeupWeeks(data);
  var targets = [makeupWeeks.clinicalPrimary, makeupWeeks.clinicalFallback];
  state.conflictWeeks.forEach(function (missedWi) {
    for (var ti = 0; ti < targets.length; ti++) {
      var target = targets[ti];
      if (target == null || target === missedWi) continue;
      var cell = student.schedule[target];
      if (!cell || cell.inactive) continue;
      if (cell.sim || cell.clinical || cell.makeupClinical) continue;
      cell.makeupClinical = true;
      var conflictFac = ClinicalSites
        ? ClinicalSites.resolveFacilityForWeek(data, student.clinicalGroup, missedWi, 0)
        : student.facilityId;
      if (conflictFac) {
        cell.facilityId = getCanonicalFacilityId(data, conflictFac);
      }
      student.makeups.push(withProvenance({
        weekIndex: target,
        type: 'clinical',
        clinicalConflict: true,
        facilityId: conflictFac
          ? getCanonicalFacilityId(data, conflictFac)
          : null,
        joinedDay: clinDay,
        hostGroup: student.clinicalGroup,
        week18Fallback: target === makeupWeeks.clinicalFallback
      }, ''));
      break;
    }
  });
}

export function scheduleMissedMakeups(student, data) {
  var needed = data.config.clinicalDaysRequired || 10;
  var clinStart = (data.config.clinicalStartWeek || 5) - 1;
  var makeupWeeks = CalendarEngine.resolveMakeupWeeks(data);
  var shortfall = needed - countedClinicals(student);
  for (var j = makeupWeeks.clinicalFallback; j >= clinStart && shortfall > 0; j--) {
    if (CalendarEngine.isSchedulingBlockedWeek(data, j)) continue;
    var c = student.schedule[j];
    if (c.inactive || c.sim || c.clinical || c.makeupClinical) continue;
    c.makeupClinical = true;
    if (ClinicalSites) {
      var mkFacMissed = ClinicalSites.resolveFacilityForWeek(
        data, student.clinicalGroup, j, countedClinicals(student)
      );
      if (mkFacMissed) c.facilityId = mkFacMissed;
    }
    shortfall--;
  }
}
