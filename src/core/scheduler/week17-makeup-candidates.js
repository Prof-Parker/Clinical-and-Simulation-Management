/**
 * Eligibility helpers for Week 17 clinical makeup: site lock, days, guest-sim safety.
 */

import {
  getCanonicalFacilityId,
  getClinicalDayForGroup,
  getClinicalGroups,
  getSimDays,
  sameFacilitySite
} from '../data-model/index.js';
import * as CalendarEngine from '../calendar-engine.js';
import * as ClinicalSites from '../clinical-sites.js';
import { getStudentClinicalDay } from './helpers.js';

export var WEEK17_MODES = {
  current: 'current',
  byAssignedDay: 'byAssignedDay',
  byTargetDay: 'byTargetDay',
  byPreferredSite: 'byPreferredSite'
};

export function normalizeWeek17Mode(mode) {
  if (mode === WEEK17_MODES.byAssignedDay ||
      mode === WEEK17_MODES.byTargetDay ||
      mode === WEEK17_MODES.byPreferredSite) {
    return mode;
  }
  return WEEK17_MODES.current;
}

/**
 * End-of-semester clinical makeup cluster week (typically Week 17).
 * Uses clinical makeup target / primary week — not last-resort week 18.
 */
export function getWeek17Index(data) {
  return CalendarEngine.resolveMakeupWeeks(data).clinicalPrimary;
}

export function getStudentAssignedSite(data, student) {
  if (!student) return null;
  var primary = ClinicalSites.getPrimaryGroupFacility(data, student.clinicalGroup);
  var raw = primary || student.facilityId || null;
  return raw ? getCanonicalFacilityId(data, raw) : null;
}

export function week17CellIsOccupied(cell) {
  if (!cell || cell.inactive) return true;
  if (cell.clinical && !cell.clinicalMissed) return true;
  if (cell.makeupClinical) return true;
  return false;
}

export function studentHasSameDaySim(student, weekIndex, day) {
  var cell = student && student.schedule && student.schedule[weekIndex];
  if (!cell || !cell.sim || !cell.simDay) return false;
  return cell.simDay === day;
}

export function isGuestSimSafeDay(student, weekIndex, day) {
  return !studentHasSameDaySim(student, weekIndex, day);
}

export function canStudentTakeWeek17Day(data, student, weekIndex, day, opts) {
  opts = opts || {};
  if (!student || weekIndex == null || !day) return false;
  if (CalendarEngine.isSchedulingBlockedWeek(data, weekIndex)) return false;
  if (CalendarEngine.isSchedulingBlockedDay(data, weekIndex, day)) return false;
  var cell = student.schedule[weekIndex];
  if (!cell || cell.inactive) return false;
  if (cell.clinical && !cell.clinicalMissed) return false;
  if (cell.makeupClinical && !opts.ignoreExistingMakeup) return false;
  if (studentHasSameDaySim(student, weekIndex, day)) return false;
  return true;
}

export function allowedDaysForStudent(data, student, mode, cfg) {
  var assigned = getStudentClinicalDay(student, cfg);
  var simDays = getSimDays(cfg);
  var target = cfg.week17MakeupTargetDay || 'Mon';
  var m = normalizeWeek17Mode(mode);
  if (m === WEEK17_MODES.byTargetDay) {
    return [target];
  }
  if (m === WEEK17_MODES.byAssignedDay) {
    return [assigned];
  }
  if (m === WEEK17_MODES.byPreferredSite) {
    var days = [];
    var seen = {};
    function add(d) {
      if (!d || seen[d]) return;
      seen[d] = true;
      days.push(d);
    }
    add(assigned);
    simDays.forEach(add);
    // Guest-sim-safe days first for preferred-site planning.
    var wi = getWeek17Index(data);
    days.sort(function (a, b) {
      var sa = isGuestSimSafeDay(student, wi, a) ? 0 : 1;
      var sb = isGuestSimSafeDay(student, wi, b) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return String(a).localeCompare(String(b));
    });
    return days;
  }
  return [assigned];
}

export function hostGroupsForSiteDay(data, facilityId, day) {
  var cfg = data.config;
  var groups = getClinicalGroups(cfg);
  var dayMatch = [];
  var siteMatch = [];
  groups.forEach(function (g) {
    var gFac = ClinicalSites.getPrimaryGroupFacility(data, g);
    if (!gFac || !sameFacilitySite(data, gFac, facilityId)) return;
    siteMatch.push(g);
    if (getClinicalDayForGroup(g, cfg) === day) dayMatch.push(g);
  });
  return dayMatch.length ? dayMatch : siteMatch;
}

export function facilityDisplayLabel(data, facilityId) {
  if (!facilityId || !data.facilities) return 'Site';
  for (var i = 0; i < data.facilities.length; i++) {
    var f = data.facilities[i];
    if (sameFacilitySite(data, f.id, facilityId)) {
      return f.shortName || f.name || 'Site';
    }
  }
  return 'Site';
}

/**
 * Students who currently have (or need) a Week 17 clinical makeup after standard placement.
 * Call after clearing is optional — when collecting before clear, includes existing makeupClinical.
 */
export function collectWeek17MakeupNeeds(data, opts) {
  opts = opts || {};
  var wi = getWeek17Index(data);
  var needed = data.config.clinicalDaysRequired || 10;
  var list = [];
  (data.students || []).forEach(function (s) {
    var cell = s.schedule && s.schedule[wi];
    var hasMk = !!(cell && cell.makeupClinical);
    if (!hasMk && opts.includeShortfall) {
      var counted = 0;
      s.schedule.forEach(function (c) {
        if (!c || c.inactive) return;
        if (c.clinical && !c.clinicalMissed) counted++;
        if (c.makeupClinical) counted++;
      });
      var shortfall = needed - counted;
      if (shortfall <= 0 || !cell || week17CellIsOccupied(cell)) return;
    } else if (!hasMk) {
      return;
    }
    list.push({
      student: s,
      studentId: s.id,
      clinicalGroup: s.clinicalGroup,
      assignedSiteId: getStudentAssignedSite(data, s),
      assignedDay: getStudentClinicalDay(s, data.config),
      weekIndex: wi,
      hadMakeup: hasMk,
      clinicalConflict: !!(s.makeups || []).some(function (m) {
        return m.type === 'clinical' && m.weekIndex === wi && m.clinicalConflict;
      })
    });
  });
  list.sort(function (a, b) {
    return String(a.studentId).localeCompare(String(b.studentId));
  });
  return list;
}
