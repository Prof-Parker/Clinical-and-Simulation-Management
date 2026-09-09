/**
 * First-pass sim placement when clinical and sim group counts match and
 * each aligned C↔SG pair has no weekday conflict (clinical day ≠ sim day).
 * Places students on their setup host day/pattern only — no guests or round-robin.
 */

import {
  getClinicalGroups,
  getSimGroups,
  getClinicalDayForGroup,
  getSimGroupDay,
  getSimGroupPattern
} from '../data-model/index.js';
import * as CalendarEngine from '../calendar-engine.js';
import { shouldForceClinicalSimAlignment } from '../roster-balance-assign.js';
import {
  wouldSimClinicalConflict,
  findSimWeek,
  createSimSchedulingState
} from './helpers.js';
import { weekIndexForPatternDay } from './sim-block-weeks.js';

/**
 * True when |clinical| === |sim|, every C_i → SG_i pair has distinct weekdays,
 * and each host cohort can fit in one session (no alternate-day overflow needed).
 * Clinical Mon + sim Tue is not a conflict; clinical Mon + sim Mon is.
 *
 * @param {object} config
 * @param {object[]} [students] when provided, use live sim-group sizes; else maxPerClinicalGroup
 */
export function canUseAlignedHostOnlySimPlacement(config, students) {
  if (!config) return false;
  var clinicalGroups = getClinicalGroups(config);
  var simGroups = getSimGroups(config);
  if (!shouldForceClinicalSimAlignment(clinicalGroups, simGroups)) return false;
  for (var i = 0; i < clinicalGroups.length; i++) {
    var clinDay = getClinicalDayForGroup(clinicalGroups[i], config);
    var simDay = getSimGroupDay(simGroups[i], config);
    if (clinDay && simDay && clinDay === simDay) return false;
  }
  var sessionCap = config.maxStudentsPerSimSession;
  if (sessionCap == null || isNaN(sessionCap) || sessionCap < 1) sessionCap = 8;
  if (students && students.length) {
    var counts = {};
    students.forEach(function (s) {
      if (!s || !s.simGroup) return;
      counts[s.simGroup] = (counts[s.simGroup] || 0) + 1;
    });
    var keys = Object.keys(counts);
    for (var k = 0; k < keys.length; k++) {
      if (counts[keys[k]] > sessionCap) return false;
    }
  } else {
    var maxPer = config.maxPerClinicalGroup;
    if (maxPer == null || isNaN(maxPer)) maxPer = 6;
    if (maxPer > sessionCap) return false;
  }
  return true;
}

/** Host-day candidates only: primary pattern week, then same-day block alts. */
export function buildAlignedHostOnlyCandidates(student, data, calendar, simNum) {
  var cfg = data.config;
  var block = calendar && calendar.blocks ? calendar.blocks[simNum - 1] : null;
  if (!block || !student.simGroup) return [];
  var hostDay = getSimGroupDay(student.simGroup, cfg);
  var pattern = getSimGroupPattern(student.simGroup, cfg);
  if (!hostDay) return [];
  var primaryWi = weekIndexForPatternDay(block, pattern, hostDay);
  var slots = [];
  var seen = {};

  function pushWeek(wi, tier) {
    if (wi == null || wi >= 18 || seen[wi]) return;
    if (CalendarEngine.isSchedulingBlockedDay(data, wi, hostDay)) return;
    var cell = student.schedule[wi];
    if (wouldSimClinicalConflict(cell, student, cfg, hostDay)) return;
    seen[wi] = true;
    slots.push({
      weekIndex: wi,
      day: hostDay,
      simNum: simNum,
      hostSimGroup: student.simGroup,
      tier: tier
    });
  }

  pushWeek(primaryWi, 'primary');
  if (block.weeksByDay && block.weeksByDay[hostDay]) {
    var dayEntry = block.weeksByDay[hostDay];
    [dayEntry.evenWeekIndex, dayEntry.oddWeekIndex].forEach(function (wi) {
      if (wi != null && wi !== primaryWi) pushWeek(wi, 'primaryAlt');
    });
  }
  return slots;
}

export function orderStudentsForAlignedHostPlacement(students) {
  return (students || []).slice().sort(function (a, b) {
    if (a.simGroup !== b.simGroup) {
      return String(a.simGroup || '') < String(b.simGroup || '') ? -1 : 1;
    }
    return a.id < b.id ? -1 : 1;
  });
}

export function clearPlacedSimsForAlignedFallback(students) {
  (students || []).forEach(function (s) {
    if (!s || !s.schedule) return;
    s.schedule.forEach(function (cell) {
      if (!cell || !cell.sim) return;
      cell.sim = null;
      cell.simDay = null;
      cell.simGuestGroup = null;
      cell.simMakeup = false;
      cell.simOverload = false;
      if (cell.clinicalMissed && cell.clinical) cell.clinicalMissed = false;
    });
    s.makeups = (s.makeups || []).filter(function (m) { return m.type !== 'sim'; });
  });
}

export function allRequiredSimsPlaced(students, needed) {
  needed = needed || 5;
  for (var i = 0; i < (students || []).length; i++) {
    var s = students[i];
    for (var simNum = 1; simNum <= needed; simNum++) {
      if (findSimWeek(s, simNum) < 0) return false;
    }
  }
  return true;
}

export function resetSimSchedulingStates(students) {
  var states = {};
  (students || []).forEach(function (s) {
    states[s.id] = createSimSchedulingState();
  });
  return states;
}
