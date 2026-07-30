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
  sortCandidatesWithinTier,
  blockHasRegularCapacity,
  shouldDeferWeek18,
  simDaysOrderForWeek
} from './helpers.js';
import { withProvenance } from './makeup.js';
import { getWeek18SimFallback } from './makeup.js';
import {
  resolveSimBlockWeeks,
  buildProgramSimBlocks,
  weekIndexForPatternDay,
  getNominalSimWeekStreams
} from './sim-block-weeks.js';

export { resolveSimBlockWeeks, weekIndexForPatternDay } from './sim-block-weeks.js';

export var SIM_GROUP_SCHEDULE = {
  SG1: { weeks: [4, 6, 8, 10, 12, 14, 16], day: 'Mon' },
  SG2: { weeks: [4, 6, 8, 10, 12, 14, 16], day: 'Tue' },
  SG3: { weeks: [5, 7, 9, 11, 13, 15, 17], day: 'Mon' },
  SG4: { weeks: [5, 7, 9, 11, 13, 15, 17], day: 'Tue' }
};

export function getSimWeekPatterns(cfg) {
  return getNominalSimWeekStreams(cfg);
}

export function getSimGroupSchedule(hostSimGroup, simGroups, cfg) {
  if (!cfg) cfg = defaultConfig();
  var patterns = getSimWeekPatterns(cfg);
  var day = getSimGroupDay(hostSimGroup, cfg);
  var pattern = getSimGroupPattern(hostSimGroup, cfg);
  return {
    weeks: (pattern === 'odd' ? patterns.oddWeeks : patterns.evenWeeks).slice(),
    day: day,
    pattern: pattern
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
  return buildProgramSimBlocks(data, cfg || data.config);
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
    var pattern = getSimGroupPattern(sg, cfg);
    var wi = weekIndexForPatternDay(block, pattern, day);
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
  var pattern = getSimGroupPattern(student.simGroup, cfg);
  var primaryWi = weekIndexForPatternDay(block, pattern, sch.day);
  var slots = [];

  function pushWeekSlots(wi, tier, preferDay) {
    if (wi == null || wi >= 18) return;
    var days = simDaysOrderForWeek(student, wi, sch, cfg);
    if (preferDay) {
      days = days.slice();
      days.sort(function (a, b) {
        if (a === preferDay) return -1;
        if (b === preferDay) return 1;
        return 0;
      });
    }
    var cell = student.schedule[wi];
    var clinDay = getStudentClinicalDay(student, cfg);
    if (wouldSimClinicalConflict(cell, student, cfg, clinDay)) {
      days = days.filter(function (d) { return d !== clinDay; });
    }
    days.forEach(function (day) {
      if (CalendarEngine.isSchedulingBlockedDay(data, wi, day)) return;
      slots.push({
        weekIndex: wi,
        day: day,
        simNum: simNum,
        hostSimGroup: student.simGroup,
        tier: tier
      });
    });
  }

  if (primaryWi != null) pushWeekSlots(primaryWi, 'primary', sch.day);

  // Alternate week(s) for this group's day stream, then other block weeks.
  if (block.weeksByDay && block.weeksByDay[sch.day]) {
    var dayEntry = block.weeksByDay[sch.day];
    [dayEntry.evenWeekIndex, dayEntry.oddWeekIndex].forEach(function (wi) {
      if (wi != null && wi !== primaryWi) pushWeekSlots(wi, 'primaryAlt', sch.day);
    });
  }
  block.weeks.forEach(function (wi) {
    if (wi === primaryWi) return;
    if (block.weeksByDay && block.weeksByDay[sch.day]) {
      var de = block.weeksByDay[sch.day];
      if (wi === de.evenWeekIndex || wi === de.oddWeekIndex) return;
    }
    pushWeekSlots(wi, 'primaryAlt', null);
  });
  return slots;
}

export function buildGuestFallbackSlots(student, data, block, simNum, simGroups, cfg) {
  var slots = [];
  simGroups.forEach(function (sg) {
    if (sg === student.simGroup) return;
    var sch = getSimGroupSchedule(sg, simGroups, cfg);
    var pattern = getSimGroupPattern(sg, cfg);
    var hostWi = weekIndexForPatternDay(block, pattern, sch.day);
    var weekList = [];
    if (hostWi != null) weekList.push(hostWi);
    if (block.weeksByDay && block.weeksByDay[sch.day]) {
      var de = block.weeksByDay[sch.day];
      [de.evenWeekIndex, de.oddWeekIndex].forEach(function (wi) {
        if (wi != null && weekList.indexOf(wi) < 0) weekList.push(wi);
      });
    }
    block.weeks.forEach(function (wi) {
      if (weekList.indexOf(wi) < 0) weekList.push(wi);
    });
    weekList.forEach(function (wi) {
      var days = simDaysOrderForWeek(student, wi, sch, cfg);
      var cell = student.schedule[wi];
      var clinDay = getStudentClinicalDay(student, cfg);
      if (wouldSimClinicalConflict(cell, student, cfg, clinDay)) {
        days = days.filter(function (d) { return d !== clinDay; });
      }
      days.forEach(function (day) {
        if (CalendarEngine.isSchedulingBlockedDay(data, wi, day)) return;
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
    if (CalendarEngine.isSchedulingBlockedWeek(data, wi)) return;
    simDays.forEach(function (day) {
      if (CalendarEngine.isSchedulingBlockedDay(data, wi, day)) return;
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
    if (CalendarEngine.isSchedulingBlockedWeek(data, wi)) continue;
    for (var d = 0; d < simDays.length; d++) {
      if (CalendarEngine.isSchedulingBlockedDay(data, wi, simDays[d])) continue;
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
      if (CalendarEngine.isSchedulingBlockedDay(data, wi, clinDay)) return;
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
  if (CalendarEngine.isSchedulingBlockedDay(data, wi, day)) return false;
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

export { canPlaceSimSlot };

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

export { scheduleOneSimForStudent };

export {
  clinicalWeekdayPeers,
  cohortGuestCount,
  orderStudentsForSimBlock,
  scheduleSimsForAllStudents
} from './sim-placement-batch.js';
