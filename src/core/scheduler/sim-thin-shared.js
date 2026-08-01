/**
 * Shared helpers for thin-sim evacuate / fill post-passes.
 * Never called from regenerateAll.
 */

import { getSimGroups, getSimDays } from '../data-model/index.js';
import * as CalendarEngine from '../calendar-engine.js';
import {
  getSimCaps,
  getSimPracticalMinLoad,
  getSimIdealMinLoad,
  getDaySimAttendanceCount,
  getSessionCount,
  getStudentClinicalDay,
  wouldSimClinicalConflict,
  getGuestCountFromSchedule,
  countedClinicals,
  findSimWeek
} from './helpers.js';
import {
  buildProgramSimCalendar,
  resolveSimSessionHost
} from './sim-placement.js';

export function guestSoftCap(cfg) {
  var soft = cfg.maxGuestSimsPerStudent;
  if (soft == null || isNaN(soft) || soft < 0) return 1;
  return soft;
}

function simSignature(student) {
  var sims = [];
  (student.schedule || []).forEach(function (c, wi) {
    if (c && c.sim) sims.push({ wi: wi, sim: c.sim, day: c.simDay });
  });
  sims.sort(function (a, b) { return a.wi - b.wi || a.sim - b.sim; });
  return {
    sims: sims,
    clin: countedClinicals(student),
    guests: getGuestCountFromSchedule(student)
  };
}

function signaturesMatch(before, after, soft) {
  if (before.clin !== after.clin) return false;
  if (after.guests > soft) return false;
  if (before.sims.length !== after.sims.length) return false;
  var a = before.sims.map(function (s) { return s.sim; }).sort(function (x, y) { return x - y; });
  var b = after.sims.map(function (s) { return s.sim; }).sort(function (x, y) { return x - y; });
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  for (var j = 1; j < after.sims.length; j++) {
    if (after.sims[j].sim <= after.sims[j - 1].sim) return false;
  }
  return true;
}

export function listDaySessions(data) {
  var cfg = data.config;
  var days = getSimDays(cfg);
  var sessions = [];
  var weeks = (data.weeks && data.weeks.length) ? data.weeks.length : 18;
  for (var wi = 0; wi < weeks; wi++) {
    if (CalendarEngine.isSchedulingBlockedWeek(data, wi)) continue;
    for (var d = 0; d < days.length; d++) {
      var day = days[d];
      if (CalendarEngine.isSchedulingBlockedDay(data, wi, day)) continue;
      var count = getDaySimAttendanceCount(data, wi, day);
      if (count <= 0) continue;
      var students = [];
      (data.students || []).forEach(function (s) {
        var cell = s.schedule[wi];
        if (cell && cell.sim && cell.simDay === day) {
          students.push({ student: s, cell: cell, simNum: cell.sim });
        }
      });
      sessions.push({ weekIndex: wi, day: day, count: count, students: students });
    }
  }
  return sessions;
}

export function thinSessions(data) {
  var half = getSimPracticalMinLoad(data.config);
  return listDaySessions(data).filter(function (s) {
    return s.count > 0 && s.count < half;
  });
}

/**
 * True if another student already has a different sim scenario on this week+day.
 * Scheduling rule: only one simulation scenario may occur on a given day.
 */
export function dayHasForeignSimScenario(data, weekIndex, day, simNum, excludeStudentId) {
  var list = data.students || [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    if (excludeStudentId != null && s.id === excludeStudentId) continue;
    var c = s.schedule && s.schedule[weekIndex];
    if (c && c.sim && c.simDay === day && c.sim !== simNum) return true;
  }
  return false;
}

/**
 * Students whose sim on a week+day differs from the majority scenario that day
 * (violates one-scenario-per-day). Prefer evacuating these off the mixed day.
 */
export function collectMixedDayMismatchEntries(data) {
  var byKey = {};
  (data.students || []).forEach(function (s) {
    (s.schedule || []).forEach(function (c, wi) {
      if (!c || !c.sim || !c.simDay) return;
      var key = wi + '|' + c.simDay;
      if (!byKey[key]) byKey[key] = { weekIndex: wi, day: c.simDay, counts: {}, entries: [] };
      var bucket = byKey[key];
      bucket.counts[c.sim] = (bucket.counts[c.sim] || 0) + 1;
      bucket.entries.push({ student: s, fromWi: wi, fromDay: c.simDay, simNum: c.sim });
    });
  });
  var out = [];
  Object.keys(byKey).forEach(function (key) {
    var bucket = byKey[key];
    var sims = Object.keys(bucket.counts);
    if (sims.length < 2) return;
    var majority = parseInt(sims[0], 10);
    for (var i = 1; i < sims.length; i++) {
      var sn = parseInt(sims[i], 10);
      if (bucket.counts[sn] > bucket.counts[majority]) majority = sn;
    }
    bucket.entries.forEach(function (entry) {
      if (entry.simNum !== majority) {
        entry.mixed = true;
        out.push(entry);
      }
    });
  });
  return out;
}

/** Score open day-sessions against absolute and ideal floors. */
export function scoreThinOutcome(data) {
  var cfg = data.config || {};
  var absolute = getSimPracticalMinLoad(cfg);
  var ideal = getSimIdealMinLoad(cfg);
  var sessions = listDaySessions(data);
  var nAbs = 0;
  var nIdeal = 0;
  var absDeficit = 0;
  sessions.forEach(function (s) {
    if (s.count > 0 && s.count < absolute) {
      nAbs++;
      absDeficit += absolute - s.count;
    }
    if (s.count > 0 && s.count < ideal) nIdeal++;
  });
  return {
    nAbs: nAbs,
    nIdeal: nIdeal,
    absDeficit: absDeficit,
    open: sessions.length,
    absolute: absolute,
    ideal: ideal
  };
}

export function evacuateDestinationCandidates(data, simNum, fromWi, fromDay, cfg) {
  var days = getSimDays(cfg);
  var weeks = (data.weeks && data.weeks.length) ? data.weeks.length : 18;
  var caps = getSimCaps(cfg);
  var half = getSimPracticalMinLoad(cfg);
  var list = [];
  for (var wi = 0; wi < weeks; wi++) {
    if (CalendarEngine.isSchedulingBlockedWeek(data, wi)) continue;
    for (var d = 0; d < days.length; d++) {
      var day = days[d];
      if (wi === fromWi && day === fromDay) continue;
      if (CalendarEngine.isSchedulingBlockedDay(data, wi, day)) continue;
      var dayCount = getDaySimAttendanceCount(data, wi, day);
      if (dayCount <= 0) continue;
      if (dayCount >= caps.normal) continue;
      // One scenario per day: only join days already hosting this simNum (or empty of others).
      if (dayHasForeignSimScenario(data, wi, day, simNum, null)) continue;
      var sameSim = getSessionCount(data, wi, simNum, day);
      if (sameSim <= 0) continue;
      list.push({
        weekIndex: wi,
        day: day,
        dayCount: dayCount,
        sameSim: sameSim,
        denser: dayCount >= half ? 1 : 0,
        sameDay: day === fromDay ? 1 : 0
      });
    }
  }
  list.sort(function (a, b) {
    if (a.denser !== b.denser) return b.denser - a.denser;
    if (a.sameDay !== b.sameDay) return b.sameDay - a.sameDay;
    if (a.sameSim !== b.sameSim) return b.sameSim - a.sameSim;
    if (a.dayCount !== b.dayCount) return b.dayCount - a.dayCount;
    if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
    return String(a.day).localeCompare(String(b.day));
  });
  return list;
}

function clearSimFields(cell) {
  cell.sim = null;
  cell.simDay = null;
  cell.simGuestGroup = null;
  cell.simOverload = false;
  cell.simMakeup = false;
}

function neighborSimBounds(student, simNum) {
  var prevWi = -1;
  var nextWi = 99;
  (student.schedule || []).forEach(function (c, wi) {
    if (!c || !c.sim || c.sim === simNum) return;
    if (c.sim < simNum && wi > prevWi) prevWi = wi;
    if (c.sim > simNum && wi < nextWi) nextWi = wi;
  });
  return { prevWi: prevWi, nextWi: nextWi };
}

export function tryMoveStudent(data, entry, dest, cfg, calendar, simGroups, soft) {
  var student = entry.student;
  var fromWi = entry.fromWi;
  var fromCell = student.schedule[fromWi];
  var toCell = student.schedule[dest.weekIndex];
  if (!fromCell || !toCell || !fromCell.sim) return false;
  if (toCell.inactive || toCell.sim) return false;
  if (CalendarEngine.isSchedulingBlockedDay(data, dest.weekIndex, dest.day)) return false;

  var simNum = fromCell.sim;
  var bounds = neighborSimBounds(student, simNum);
  if (dest.weekIndex <= bounds.prevWi || dest.weekIndex >= bounds.nextWi) return false;

  // Only one simulation scenario may occur on a given week+day.
  if (dayHasForeignSimScenario(data, dest.weekIndex, dest.day, simNum, student.id)) {
    return false;
  }

  var wasMakeup = !!fromCell.simMakeup;
  var wasOverload = !!fromCell.simOverload;
  var oldGuest = fromCell.simGuestGroup;
  var oldDay = fromCell.simDay;
  var oldMissed = !!fromCell.clinicalMissed;

  var conflict = wouldSimClinicalConflict(toCell, student, cfg, dest.day);
  if (conflict) {
    var otherConflicts = 0;
    var clinDay = getStudentClinicalDay(student, cfg);
    (student.schedule || []).forEach(function (c, wi) {
      if (wi === fromWi) return;
      if (c && c.sim && c.clinical && c.clinicalMissed && c.simDay === clinDay) otherConflicts++;
    });
    if (otherConflicts >= 1) return false;
  }

  var sessionHost = resolveSimSessionHost(
    simNum, dest.weekIndex, dest.day, calendar, simGroups, cfg
  ) || student.simGroup;
  var isGuest = sessionHost && sessionHost !== student.simGroup;
  var guestsNow = getGuestCountFromSchedule(student);
  if (oldGuest) guestsNow = Math.max(0, guestsNow - 1);
  if (isGuest && guestsNow + 1 > soft) return false;

  var before = simSignature(student);

  if (oldMissed && fromCell.clinical) fromCell.clinicalMissed = false;
  clearSimFields(fromCell);

  toCell.sim = simNum;
  toCell.simDay = dest.day;
  toCell.simGuestGroup = isGuest ? sessionHost : null;
  toCell.simOverload = wasOverload;
  toCell.simMakeup = wasMakeup;
  if (conflict) toCell.clinicalMissed = true;

  var after = simSignature(student);
  if (!signaturesMatch(before, after, soft) || findSimWeek(student, simNum) !== dest.weekIndex) {
    clearSimFields(toCell);
    if (conflict) toCell.clinicalMissed = false;
    fromCell.sim = simNum;
    fromCell.simDay = oldDay;
    fromCell.simGuestGroup = oldGuest;
    fromCell.simOverload = wasOverload;
    fromCell.simMakeup = wasMakeup;
    fromCell.clinicalMissed = oldMissed;
    return false;
  }
  return true;
}

export function ensureSimCalendar(data) {
  var cfg = data.config || {};
  var calendar = data._simCalendar || buildProgramSimCalendar(data, cfg);
  data._simCalendar = calendar;
  return { cfg: cfg, calendar: calendar, simGroups: getSimGroups(cfg), soft: guestSoftCap(cfg) };
}

/** Clone semester fields needed for thin-sim trial passes. */
export function cloneThinWorkspace(data) {
  return JSON.parse(JSON.stringify({
    config: data.config,
    students: data.students,
    facilities: data.facilities,
    holidays: data.holidays || [],
    calendar: data.calendar,
    weeks: data.weeks
  }));
}

/** Copy schedule arrays from clone students onto live students by id. */
export function applySchedulesFromClone(live, clone) {
  var byId = {};
  (clone.students || []).forEach(function (s) {
    byId[s.id] = s;
  });
  (live.students || []).forEach(function (s) {
    var src = byId[s.id];
    if (src) s.schedule = src.schedule;
  });
}

export { getSimPracticalMinLoad, getSimIdealMinLoad };
