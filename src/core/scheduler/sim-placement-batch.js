/**
 * Batch sim scheduling: cohort ordering and scheduleSimsForAllStudents.
 */

import {
  getSimGroups,
  getSimDays,
  getClinicalGroups,
  getClinicalDayForGroup
} from '../data-model/index.js';
import {
  getSimSchedulingOptions,
  createSimSchedulingState,
  getGuestCountFromSchedule,
  wouldSimClinicalConflict
} from './helpers.js';
import {
  buildProgramSimCalendar,
  getStudentSimSlotCandidates,
  buildGuestFallbackSlots,
  resolveSimSessionHost,
  usesOddPatternWeek,
  canPlaceSimSlot,
  scheduleOneSimForStudent
} from './sim-placement.js';

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
