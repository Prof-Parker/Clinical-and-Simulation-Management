/**
 * Simulation calendar, slot candidates, placement, and batch sim scheduling.
 */

import {
  defaultConfig,
  getSimGroupDay,
  getSimGroupPattern,
  getSimGroups,
  getSimDays,
  getClinicalGroups,
  getClinicalDayForGroup
} from '../data-model/index.js';
import * as CalendarEngine from '../calendar-engine.js';
import {
  getSimCaps,
  getDaySimAttendanceCount,
  getSessionCount,
  getStudentClinicalDay,
  wouldSimClinicalConflict,
  findSimWeek,
  getSimSchedulingOptions,
  createSimSchedulingState,
  getGuestCountFromSchedule,
  sortCandidatesWithinTier,
  blockHasRegularCapacity,
  shouldDeferWeek18,
  simDaysOrderForWeek
} from './helpers.js';
import { withProvenance } from './makeup.js';
import { getWeek18SimFallback } from './makeup.js';
import { resolveSimBlockWeeks } from './sim-block-weeks.js';

export { resolveSimBlockWeeks } from './sim-block-weeks.js';

export var SIM_GROUP_SCHEDULE = {
  SG1: { weeks: [4, 6, 8, 10, 12, 14, 16], day: 'Mon' },
  SG2: { weeks: [4, 6, 8, 10, 12, 14, 16], day: 'Tue' },
  SG3: { weeks: [5, 7, 9, 11, 13, 15, 17], day: 'Mon' },
  SG4: { weeks: [5, 7, 9, 11, 13, 15, 17], day: 'Tue' }
};

export function getSimWeekPatterns(cfg) {
  var start = (cfg.simStartWeek || 5) - 1;
  var evenWeeks = [];
  var oddWeeks = [];
  for (var i = 0; i < 9; i++) {
    var ew = start + i * 2;
    var ow = start + 1 + i * 2;
    if (ew < 18) evenWeeks.push(ew);
    if (ow < 18) oddWeeks.push(ow);
  }
  return { evenWeeks: evenWeeks, oddWeeks: oddWeeks };
}

export function getSimGroupSchedule(hostSimGroup, simGroups, cfg) {
  if (!cfg) cfg = defaultConfig();
  var patterns = getSimWeekPatterns(cfg);
  var day = getSimGroupDay(hostSimGroup, cfg);
  var pattern = getSimGroupPattern(hostSimGroup, cfg);
  return {
    weeks: (pattern === 'odd' ? patterns.oddWeeks : patterns.evenWeeks).slice(),
    day: day
  };
}

export function usesOddPatternWeek(simGroup, simGroups, cfg) {
  if (!cfg) cfg = defaultConfig();
  return getSimGroupPattern(simGroup, cfg) === 'odd';
}

export function alternateSimDay(day, cfg) {
  var simDays = getSimDays(cfg);
  if (simDays.length < 2) return day;
  var idx = simDays.indexOf(day);
  if (idx < 0) return simDays[0];
  return simDays[(idx + 1) % simDays.length];
}

export function buildProgramSimCalendar(data, cfg) {
  var patterns = getSimWeekPatterns(cfg);
  var evenWeeks = patterns.evenWeeks.slice();
  var oddWeeks = patterns.oddWeeks.slice();
  var needed = cfg.simDaysRequired || 5;
  var blocks = [];
  var weekToSim = {};

  for (var i = 0; i < needed; i++) {
    var resolved = resolveSimBlockWeeks(data, evenWeeks, oddWeeks, i);
    var block = {
      simNum: i + 1,
      evenWeekIndex: resolved.evenWeekIndex,
      oddWeekIndex: resolved.oddWeekIndex,
      nominalEvenWeekIndex: resolved.nominalEvenWeekIndex,
      nominalOddWeekIndex: resolved.nominalOddWeekIndex,
      weeks: []
    };
    if (resolved.evenWeekIndex != null) {
      block.weeks.push(resolved.evenWeekIndex);
      weekToSim[resolved.evenWeekIndex] = i + 1;
    }
    if (resolved.oddWeekIndex != null && block.weeks.indexOf(resolved.oddWeekIndex) < 0) {
      block.weeks.push(resolved.oddWeekIndex);
      weekToSim[resolved.oddWeekIndex] = i + 1;
    }
    block.weeks.sort(function (a, b) { return a - b; });
    blocks.push(block);
  }
  return { blocks: blocks, weekToSim: weekToSim };
}

export function getWeekSimNumber(calendar, weekIndex) {
  return calendar && calendar.weekToSim ? calendar.weekToSim[weekIndex] : null;
}

/** Sim group that owns the canonical week+day slot for this sim block. */
export function resolveSimSessionHost(simNum, weekIndex, day, calendar, simGroups, cfg) {
  var block = calendar.blocks[simNum - 1];
  if (!block) return null;
  for (var i = 0; i < simGroups.length; i++) {
    var sg = simGroups[i];
    var sch = getSimGroupSchedule(sg, simGroups, cfg);
    if (sch.day !== day) continue;
    var odd = usesOddPatternWeek(sg, simGroups, cfg);
    var wi = odd ? block.oddWeekIndex : block.evenWeekIndex;
    if (wi === weekIndex) return sg;
  }
  return null;
}

export function getStudentSimSlot(student, simNum, calendar, simGroups, data) {
  var cfg = data && data.config ? data.config : defaultConfig();
  var candidates = getStudentSimSlotCandidates(student, data, simNum, calendar, simGroups, cfg);
  return candidates.length ? candidates[0] : null;
}

export function getStudentSimSlotCandidates(student, data, simNum, calendar, simGroups, cfg) {
  var block = calendar.blocks[simNum - 1];
  if (!block) return [];
  if (!cfg) cfg = defaultConfig();
  var sch = getSimGroupSchedule(student.simGroup, simGroups, cfg);
  var odd = usesOddPatternWeek(student.simGroup, simGroups, cfg);
  var primaryWi = odd ? block.oddWeekIndex : block.evenWeekIndex;
  var slots = [];

  function pushWeekSlots(wi, tier) {
    if (wi == null || wi >= 18) return;
    if (CalendarEngine.isWeekInactive(data, wi)) return;
    var days = simDaysOrderForWeek(student, wi, sch, cfg);
    var cell = student.schedule[wi];
    var clinDay = getStudentClinicalDay(student, cfg);
    if (wouldSimClinicalConflict(cell, student, cfg, clinDay)) {
      days = days.filter(function (d) { return d !== clinDay; });
    }
    days.forEach(function (day) {
      slots.push({
        weekIndex: wi,
        day: day,
        simNum: simNum,
        hostSimGroup: student.simGroup,
        tier: tier
      });
    });
  }

  if (primaryWi != null) pushWeekSlots(primaryWi, 'primary');
  block.weeks.forEach(function (wi) {
    if (wi !== primaryWi) pushWeekSlots(wi, 'primaryAlt');
  });
  return slots;
}

export function buildGuestFallbackSlots(student, data, block, simNum, simGroups, cfg) {
  var slots = [];
  simGroups.forEach(function (sg) {
    if (sg === student.simGroup) return;
    var sch = getSimGroupSchedule(sg, simGroups, cfg);
    block.weeks.forEach(function (wi) {
      if (CalendarEngine.isWeekInactive(data, wi)) return;
      var days = simDaysOrderForWeek(student, wi, sch, cfg);
      var cell = student.schedule[wi];
      var clinDay = getStudentClinicalDay(student, cfg);
      if (wouldSimClinicalConflict(cell, student, cfg, clinDay)) {
        days = days.filter(function (d) { return d !== clinDay; });
      }
      days.forEach(function (day) {
        slots.push({ weekIndex: wi, day: day, simNum: simNum, hostSimGroup: sg, tier: 'guest' });
      });
    });
  });
  return slots;
}

function buildOverloadJoinSlots(student, data, calendar, simNum, cfg) {
  var block = calendar.blocks[simNum - 1];
  if (!block) return [];
  var caps = getSimCaps(cfg);
  var simDays = getSimDays(cfg);
  var slots = [];
  block.weeks.forEach(function (wi) {
    if (CalendarEngine.isWeekInactive(data, wi)) return;
    simDays.forEach(function (day) {
      var count = getDaySimAttendanceCount(data, wi, day);
      if (count < caps.normal || count >= caps.overload) return;
      if (getSessionCount(data, wi, simNum, day) <= 0) return;
      slots.push({
        weekIndex: wi,
        day: day,
        simNum: simNum,
        hostSimGroup: student.simGroup,
        tier: 'overload',
        overload: true
      });
    });
  });
  return slots;
}

function sortGuestSlotsByExistingSessions(data, slots) {
  return slots.slice().sort(function (a, b) {
    var ca = getDaySimAttendanceCount(data, a.weekIndex, a.day);
    var cb = getDaySimAttendanceCount(data, b.weekIndex, b.day);
    if (ca !== cb) return ca - cb;
    return a.weekIndex - b.weekIndex;
  });
}

function blockHasSoftHeadroom(data, calendar, simNum, cfg) {
  var block = calendar.blocks[simNum - 1];
  if (!block) return false;
  var normal = getSimCaps(cfg).normal;
  var reserve = cfg.simMakeupHeadroomReserved;
  if (reserve == null || isNaN(reserve)) reserve = 1;
  reserve = Math.max(0, parseInt(reserve, 10) || 0);
  if (reserve <= 0) return false;
  var softCap = Math.max(1, normal - reserve);
  var simDays = getSimDays(cfg);
  for (var i = 0; i < block.weeks.length; i++) {
    var wi = block.weeks[i];
    if (CalendarEngine.isWeekInactive(data, wi)) continue;
    for (var d = 0; d < simDays.length; d++) {
      if (getDaySimAttendanceCount(data, wi, simDays[d]) < softCap) return true;
    }
  }
  return false;
}

export function buildSimPlacementCandidates(student, data, calendar, simNum, state, placementOptions) {
  var cfg = data.config;
  var simGroups = getSimGroups(cfg);
  var block = calendar.blocks[simNum - 1];
  var primary = [];
  var primaryAlt = [];
  var guest = [];
  var overload = [];
  var conflictAllow = [];
  var w18 = [];

  getStudentSimSlotCandidates(student, data, simNum, calendar, simGroups, cfg).forEach(function (slot) {
    var entry = {
      weekIndex: slot.weekIndex,
      day: slot.day,
      simNum: simNum,
      hostSimGroup: slot.hostSimGroup,
      tier: slot.tier || 'primary'
    };
    if (entry.tier === 'primaryAlt') primaryAlt.push(entry);
    else primary.push(entry);
  });

  var guestSoftCap = cfg.maxGuestSimsPerStudent;
  if (guestSoftCap == null || isNaN(guestSoftCap) || guestSoftCap < 0) guestSoftCap = 1;
  var atGuestSoftCap = (state && state.guestCount >= guestSoftCap);

  if (block && !atGuestSoftCap) {
    guest = sortGuestSlotsByExistingSessions(data,
      buildGuestFallbackSlots(student, data, block, simNum, simGroups, cfg)
    );
  }

  buildOverloadJoinSlots(student, data, calendar, simNum, cfg).forEach(function (slot) {
    if (!blockHasSoftHeadroom(data, calendar, simNum, cfg)) {
      overload.push(slot);
    }
  });

  if (state.simClinicalConflicts < 1 && block) {
    var clinDay = getStudentClinicalDay(student, cfg);
    block.weeks.forEach(function (wi) {
      if (CalendarEngine.isWeekInactive(data, wi)) return;
      var cell = student.schedule[wi];
      if (!wouldSimClinicalConflict(cell, student, cfg, clinDay)) return;
      conflictAllow.push({
        weekIndex: wi,
        day: clinDay,
        simNum: simNum,
        hostSimGroup: student.simGroup,
        tier: 'conflictAllow'
      });
    });
  }

  if (!blockHasRegularCapacity(data, calendar, simNum, cfg) &&
      !shouldDeferWeek18(student, data, calendar, simNum, cfg)) {
    getWeek18SimFallback(data, cfg, simNum, student).forEach(function (w18Slot) {
      w18.push({
        weekIndex: w18Slot.weekIndex,
        day: w18Slot.day,
        simNum: simNum,
        hostSimGroup: student.simGroup,
        tier: 'week18',
        week18Fallback: true,
        mixedSim: !!w18Slot.mixedSim,
        replacesWeek18Sim: !!w18Slot.replacesWeek18Sim
      });
    });
  }

  primary = sortCandidatesWithinTier(student, data, primary, cfg);
  primaryAlt = sortCandidatesWithinTier(student, data, primaryAlt, cfg);
  guest = sortCandidatesWithinTier(student, data, guest, cfg);
  overload = sortCandidatesWithinTier(student, data, overload, cfg);
  conflictAllow = sortCandidatesWithinTier(student, data, conflictAllow, cfg);
  w18 = sortCandidatesWithinTier(student, data, w18, cfg);

  return primary.concat(primaryAlt).concat(guest).concat(overload)
    .concat(conflictAllow).concat(w18);
}

export function buildStateFromStudentSchedule(student, cfg) {
  var state = createSimSchedulingState();
  student.schedule.forEach(function (cell, wi) {
    if (cell.simGuestGroup) state.guestCount++;
    if (cell.sim && cell.clinicalMissed && cell.clinical &&
        cell.simDay === getStudentClinicalDay(student, cfg)) {
      state.simClinicalConflicts++;
      state.conflictWeeks.push(wi);
    }
  });
  return state;
}

function canPlaceSimSlot(student, data, wi, simNum, day, hostSimGroup, state, options) {
  options = options || {};
  var cfg = data.config;
  var caps = getSimCaps(cfg);
  var count = getDaySimAttendanceCount(data, wi, day);
  if (options.overload) {
    if (count >= caps.overload || count < caps.normal) return false;
  } else if (count >= caps.normal) {
    return false;
  }
  var cell = student.schedule[wi];
  if (!cell || cell.inactive || cell.sim) return false;
  var conflict = wouldSimClinicalConflict(cell, student, cfg, day);
  if (conflict && state.simClinicalConflicts >= 1) return false;
  return true;
}

function countRemainingSimSlots(student, data, calendar, simNum, state, cfg) {
  var simGroups = getSimGroups(cfg);
  var count = 0;
  var block = calendar.blocks[simNum - 1];
  if (!block) return 0;
  var placeOpts = getSimSchedulingOptions(data);
  getStudentSimSlotCandidates(student, data, simNum, calendar, simGroups, cfg).forEach(function (slot) {
    if (canPlaceSimSlot(student, data, slot.weekIndex, simNum, slot.day, slot.hostSimGroup, state, placeOpts)) {
      count++;
    }
  });
  buildGuestFallbackSlots(student, data, block, simNum, simGroups, cfg).forEach(function (slot) {
    if (canPlaceSimSlot(student, data, slot.weekIndex, simNum, slot.day, slot.hostSimGroup, state, placeOpts)) {
      count++;
    }
  });
  return count;
}

function tryPlaceSim(student, data, wi, simNum, day, hostSimGroup, state, options) {
  options = options || {};
  if (!canPlaceSimSlot(student, data, wi, simNum, day, hostSimGroup, state, options)) return false;

  var cfg = data.config;
  var cell = student.schedule[wi];
  var simGroups = getSimGroups(cfg);
  var calendar = data._simCalendar || buildProgramSimCalendar(data, cfg);
  var sessionHost = resolveSimSessionHost(simNum, wi, day, calendar, simGroups, cfg) ||
    hostSimGroup;
  var isGuest = sessionHost && sessionHost !== student.simGroup;
  // Soft-cap hard reject during rebalance (when sim groups can be nudged).
  // Everyday regenerate may still exceed briefly so all required sims can place.
  if (isGuest && data && data._enforceGuestSoftCap) {
    var guestSoftCap = cfg.maxGuestSimsPerStudent;
    if (guestSoftCap == null || isNaN(guestSoftCap) || guestSoftCap < 0) guestSoftCap = 1;
    if (state.guestCount >= guestSoftCap) return false;
  }
  var conflict = wouldSimClinicalConflict(cell, student, cfg, day);
  var overload = !!options.overload;

  cell.sim = simNum;
  cell.simDay = day;
  cell.simGuestGroup = isGuest ? sessionHost : null;
  cell.simOverload = overload;
  if (isGuest) state.guestCount++;

  if (conflict) {
    cell.clinicalMissed = true;
    state.simClinicalConflicts++;
    state.conflictWeeks.push(wi);
  }

  if (options.week18Fallback) {
    student.makeups.push(withProvenance({
      weekIndex: wi,
      type: 'sim',
      simNum: simNum,
      week18Fallback: true,
      mixedSim: !!options.mixedSim,
      replacesWeek18Sim: !!options.replacesWeek18Sim,
      clinicalConflict: conflict
    }, ''));
  }

  return true;
}

export function getSimPlacements(student) {
  var list = [];
  student.schedule.forEach(function (cell, wi) {
    if (cell.sim) list.push({ weekIndex: wi, week: wi + 1, sim: cell.sim, day: cell.simDay });
  });
  list.sort(function (a, b) { return a.weekIndex - b.weekIndex; });
  return list;
}

function scheduleOneSimForStudent(student, data, state, calendar, simNum) {
  if (findSimWeek(student, simNum) >= 0) return true;
  var placeOpts = getSimSchedulingOptions(data);
  var candidates = buildSimPlacementCandidates(student, data, calendar, simNum, state, placeOpts);
  for (var i = 0; i < candidates.length; i++) {
    var slot = candidates[i];
    var options = {
      applyHeadroom: placeOpts.applyHeadroom,
      overload: slot.tier === 'overload',
      week18Fallback: slot.tier === 'week18',
      mixedSim: slot.mixedSim,
      replacesWeek18Sim: slot.replacesWeek18Sim
    };
    if (tryPlaceSim(student, data, slot.weekIndex, simNum, slot.day, slot.hostSimGroup, state, options)) {
      return true;
    }
  }
  return false;
}

export function scheduleSimForStudent(student, data, state, calendar) {
  state = state || createSimSchedulingState();
  var cfg = data.config;
  calendar = calendar || data._simCalendar || buildProgramSimCalendar(data, cfg);
  var needed = cfg.simDaysRequired || 5;

  for (var simNum = 1; simNum <= needed; simNum++) {
    scheduleOneSimForStudent(student, data, state, calendar, simNum);
  }
  return state;
}

/** Clinical groups that share this group's clinical weekday. */
export function clinicalWeekdayPeers(clinicalGroup, config) {
  var day = getClinicalDayForGroup(clinicalGroup, config);
  if (!day) return [clinicalGroup];
  return getClinicalGroups(config).filter(function (cg) {
    return getClinicalDayForGroup(cg, config) === day;
  }).slice().sort();
}

export function cohortGuestCount(clinicalGroup, students) {
  var n = 0;
  (students || []).forEach(function (s) {
    if (s.clinicalGroup === clinicalGroup) n += getGuestCountFromSchedule(s);
  });
  return n;
}

function buildCohortGuestMap(students) {
  var map = {};
  (students || []).forEach(function (s) {
    var cg = s.clinicalGroup;
    if (!cg) return;
    map[cg] = (map[cg] || 0) + getGuestCountFromSchedule(s);
  });
  return map;
}

function buildCohortInterleaveKeys(students, config) {
  var keys = {};
  var byDay = {};
  (students || []).forEach(function (s) {
    var cg = s.clinicalGroup;
    if (!cg) return;
    var day = getClinicalDayForGroup(cg, config);
    if (!byDay[day]) byDay[day] = {};
    if (!byDay[day][cg]) byDay[day][cg] = [];
    byDay[day][cg].push(s);
  });
  Object.keys(byDay).forEach(function (day) {
    var peers = Object.keys(byDay[day]).sort();
    peers.forEach(function (cg, peerIdx) {
      byDay[day][cg].sort(function (a, b) {
        return a.id < b.id ? -1 : 1;
      }).forEach(function (s, idxInCohort) {
        // Round-robin across peer cohorts: C2[0], C3[0], C4[0], C2[1], ...
        keys[s.id] = idxInCohort * peers.length + peerIdx;
      });
    });
  });
  return keys;
}

function clinicalDayCompetesForSimSeats(clinicalGroup, config) {
  var day = getClinicalDayForGroup(clinicalGroup, config);
  return getSimDays(config).indexOf(day) >= 0;
}

function getGuestSoftCapValue(cfg) {
  var softCap = cfg && cfg.maxGuestSimsPerStudent;
  if (softCap == null || isNaN(softCap) || softCap < 0) return 1;
  return softCap;
}

/** True when the student still has an open non-guest, non-conflict own-host seat. */
function studentCanPlaceAsHost(student, data, calendar, simNum, state) {
  var cfg = data.config;
  var simGroups = getSimGroups(cfg);
  var placeOpts = getSimSchedulingOptions(data);
  var slots = getStudentSimSlotCandidates(student, data, simNum, calendar, simGroups, cfg);
  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    var sessionHost = resolveSimSessionHost(
      simNum, slot.weekIndex, slot.day, calendar, simGroups, cfg
    ) || slot.hostSimGroup;
    if (sessionHost && sessionHost !== student.simGroup) continue;
    var cell = student.schedule[slot.weekIndex];
    if (wouldSimClinicalConflict(cell, student, cfg, slot.day)) continue;
    if (canPlaceSimSlot(
      student, data, slot.weekIndex, simNum, slot.day, slot.hostSimGroup, state, placeOpts
    )) {
      return true;
    }
  }
  return false;
}

/**
 * Nested guest round-robin ordering for a sim block.
 * Schedule earlier ⇒ more likely to claim a host seat.
 * Prefer protecting students/cohorts already carrying guests (and anyone at soft cap),
 * so the next guest lands on the lowest-guest cohort, then lowest-guest student.
 *
 * @param {object} [opts]
 * @param {object[]} [opts.cohortStudents] full roster for cohort guest totals
 * @param {boolean} [opts.guestAssignment] if true, invert nested keys (lowest first)
 */
export function orderStudentsForSimBlock(students, simGroups, data, calendar, simNum, states, opts) {
  var cfg = data.config;
  var softCap = getGuestSoftCapValue(cfg);
  var cohortSource = (opts && opts.cohortStudents) || students;
  var guestAssignment = !!(opts && opts.guestAssignment);
  var cohortGuests = buildCohortGuestMap(cohortSource);
  var interleave = buildCohortInterleaveKeys(students, cfg);
  return students.slice().sort(function (a, b) {
    var stateA = states[a.id] || createSimSchedulingState();
    var stateB = states[b.id] || createSimSchedulingState();
    var conflictA = stateA.simClinicalConflicts >= 1 ? 0 : 1;
    var conflictB = stateB.simClinicalConflicts >= 1 ? 0 : 1;
    if (conflictA !== conflictB) return conflictA - conflictB;

    var guestA = getGuestCountFromSchedule(a);
    var guestB = getGuestCountFromSchedule(b);

    if (!guestAssignment) {
      var atCapA = guestA >= softCap ? 0 : 1;
      var atCapB = guestB >= softCap ? 0 : 1;
      if (atCapA !== atCapB) return atCapA - atCapB;
    } else {
      // Guest assignment: prefer students still under the soft cap.
      var underA = guestA < softCap ? 0 : 1;
      var underB = guestB < softCap ? 0 : 1;
      if (underA !== underB) return underA - underB;
    }

    var aCompetes = clinicalDayCompetesForSimSeats(a.clinicalGroup, cfg);
    var bCompetes = clinicalDayCompetesForSimSeats(b.clinicalGroup, cfg);
    if (aCompetes || bCompetes) {
      if (aCompetes !== bCompetes) return aCompetes ? -1 : 1;
      var cgA = cohortGuests[a.clinicalGroup] || 0;
      var cgB = cohortGuests[b.clinicalGroup] || 0;
      if (cgA !== cgB) {
        // Host phase: high cohort guests first. Guest phase: low cohort first.
        return guestAssignment ? (cgA - cgB) : (cgB - cgA);
      }
      if (guestA !== guestB) {
        return guestAssignment ? (guestA - guestB) : (guestB - guestA);
      }
      var keyA = interleave[a.id];
      var keyB = interleave[b.id];
      if (keyA == null) keyA = 0;
      if (keyB == null) keyB = 0;
      if (keyA !== keyB) return keyA - keyB;
    } else if (guestA !== guestB) {
      return guestAssignment ? (guestA - guestB) : (guestB - guestA);
    }

    // Prefer fewer remaining slots only after nested fairness keys.
    var remA = countRemainingSimSlots(a, data, calendar, simNum, stateA, cfg);
    var remB = countRemainingSimSlots(b, data, calendar, simNum, stateB, cfg);
    if (remA !== remB) return remA - remB;

    var aOdd = usesOddPatternWeek(a.simGroup, simGroups, cfg) ? 0 : 1;
    var bOdd = usesOddPatternWeek(b.simGroup, simGroups, cfg) ? 0 : 1;
    if (aOdd !== bOdd) return aOdd - bOdd;
    if (a.simGroup !== b.simGroup) return a.simGroup < b.simGroup ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

export function scheduleSimsForAllStudents(data, calendar) {
  var cfg = data.config;
  calendar = calendar || data._simCalendar || buildProgramSimCalendar(data, cfg);
  var needed = cfg.simDaysRequired || 5;
  var simGroups = getSimGroups(cfg);
  var states = {};
  data.students.forEach(function (s) {
    states[s.id] = createSimSchedulingState();
  });
  for (var simNum = 1; simNum <= needed; simNum++) {
    var remaining = data.students.slice();
    // Alternate host-capable and host-incapable picks so day-overlap cohorts
    // still get seats before host pools consume all day capacity.
    var preferHost = true;
    while (remaining.length) {
      var hostAble = remaining.filter(function (s) {
        return studentCanPlaceAsHost(s, data, calendar, simNum, states[s.id]);
      });
      var needGuest = remaining.filter(function (s) {
        return !studentCanPlaceAsHost(s, data, calendar, simNum, states[s.id]);
      });
      var next;
      if (preferHost && hostAble.length) {
        next = orderStudentsForSimBlock(
          hostAble, simGroups, data, calendar, simNum, states,
          { cohortStudents: data.students, guestAssignment: false }
        )[0];
        preferHost = needGuest.length > 0 ? false : true;
      } else if (needGuest.length) {
        next = orderStudentsForSimBlock(
          needGuest, simGroups, data, calendar, simNum, states,
          { cohortStudents: data.students, guestAssignment: true }
        )[0];
        preferHost = hostAble.length > 0;
      } else if (hostAble.length) {
        next = orderStudentsForSimBlock(
          hostAble, simGroups, data, calendar, simNum, states,
          { cohortStudents: data.students, guestAssignment: false }
        )[0];
      } else {
        next = orderStudentsForSimBlock(
          remaining, simGroups, data, calendar, simNum, states,
          { cohortStudents: data.students, guestAssignment: true }
        )[0];
      }
      scheduleOneSimForStudent(next, data, states[next.id], calendar, simNum);
      remaining = remaining.filter(function (s) { return s.id !== next.id; });
    }
  }
  return states;
}

export { scheduleOneSimForStudent };
