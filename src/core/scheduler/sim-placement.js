/**
 * Simulation calendar, slot candidates, placement, and batch sim scheduling.
 */

import {
  defaultConfig,
  getSimGroupDay,
  getSimGroupPattern,
  getSimGroups,
  getSimDays
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

  if (block) {
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

export function orderStudentsForSimBlock(students, simGroups, data, calendar, simNum, states) {
  var cfg = data.config;
  return students.slice().sort(function (a, b) {
    var stateA = states[a.id] || createSimSchedulingState();
    var stateB = states[b.id] || createSimSchedulingState();
    var conflictA = stateA.simClinicalConflicts >= 1 ? 0 : 1;
    var conflictB = stateB.simClinicalConflicts >= 1 ? 0 : 1;
    if (conflictA !== conflictB) return conflictA - conflictB;
    var remA = countRemainingSimSlots(a, data, calendar, simNum, stateA, cfg);
    var remB = countRemainingSimSlots(b, data, calendar, simNum, stateB, cfg);
    if (remA !== remB) return remA - remB;
    var guestA = getGuestCountFromSchedule(a);
    var guestB = getGuestCountFromSchedule(b);
    if (guestA !== guestB) return guestA - guestB;
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
    orderStudentsForSimBlock(data.students, simGroups, data, calendar, simNum, states)
      .forEach(function (s) {
        scheduleOneSimForStudent(s, data, states[s.id], calendar, simNum);
      });
  }
  return states;
}

export { scheduleOneSimForStudent };
