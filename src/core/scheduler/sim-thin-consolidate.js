/**
 * Explicit thin-session consolidator — move sims from under-half sessions
 * into denser same-simNum sessions when safe. Never called from regenerateAll.
 */

import { getSimGroups, getSimDays } from '../data-model/index.js';
import * as CalendarEngine from '../calendar-engine.js';
import {
  getSimCaps,
  getSimPracticalMinLoad,
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

function guestSoftCap(cfg) {
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
  // Ordered by week ascending sim numbers
  for (var j = 1; j < after.sims.length; j++) {
    if (after.sims[j].sim <= after.sims[j - 1].sim) return false;
  }
  return true;
}

function listDaySessions(data) {
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

function thinSessions(data) {
  var half = getSimPracticalMinLoad(data.config);
  return listDaySessions(data).filter(function (s) {
    return s.count > 0 && s.count < half;
  });
}

function destinationCandidates(data, simNum, fromWi, fromDay, cfg) {
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
      if (dayCount <= 0) continue; // only join already-open sessions
      if (dayCount >= caps.normal) continue;
      var sameSim = getSessionCount(data, wi, simNum, day);
      // Prefer days that already host this sim number, else any open day under cap.
      list.push({
        weekIndex: wi,
        day: day,
        dayCount: dayCount,
        sameSim: sameSim,
        denser: dayCount >= half ? 1 : 0
      });
    }
  }
  list.sort(function (a, b) {
    if (a.denser !== b.denser) return b.denser - a.denser;
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

function tryMoveStudent(data, entry, dest, cfg, calendar, simGroups, soft) {
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

/**
 * Consolidate under-half sim day sessions into denser open sessions when safe.
 * @returns {{ moved: number, skipped: number, notes: string[], thinBefore: number, thinAfter: number }}
 */
export function consolidateThinSimSessions(data) {
  if (!data || !data.students || !data.students.length) {
    return { moved: 0, skipped: 0, notes: [], thinBefore: 0, thinAfter: 0 };
  }
  var cfg = data.config || {};
  var soft = guestSoftCap(cfg);
  var calendar = data._simCalendar || buildProgramSimCalendar(data, cfg);
  data._simCalendar = calendar;
  var simGroups = getSimGroups(cfg);

  var thinBefore = thinSessions(data).length;
  var moved = 0;
  var skipped = 0;
  var notes = [];

  // Snapshot thin members up front (counts change as we move).
  var work = [];
  thinSessions(data).forEach(function (sess) {
    sess.students.forEach(function (entry) {
      work.push({
        student: entry.student,
        fromWi: sess.weekIndex,
        fromDay: sess.day,
        simNum: entry.simNum
      });
    });
  });
  // Prefer moving from thinnest sessions first; stable by id.
  work.sort(function (a, b) {
    var ca = getDaySimAttendanceCount(data, a.fromWi, a.fromDay);
    var cb = getDaySimAttendanceCount(data, b.fromWi, b.fromDay);
    if (ca !== cb) return ca - cb;
    return String(a.student.id).localeCompare(String(b.student.id));
  });

  work.forEach(function (entry) {
    var cell = entry.student.schedule[entry.fromWi];
    if (!cell || cell.sim !== entry.simNum || cell.simDay !== entry.fromDay) return;
    var curCount = getDaySimAttendanceCount(data, entry.fromWi, entry.fromDay);
    var half = getSimPracticalMinLoad(cfg);
    if (curCount >= half) return; // session no longer thin

    var dests = destinationCandidates(data, entry.simNum, entry.fromWi, entry.fromDay, cfg);
    var ok = false;
    for (var i = 0; i < dests.length; i++) {
      if (tryMoveStudent(data, entry, dests[i], cfg, calendar, simGroups, soft)) {
        ok = true;
        moved++;
        break;
      }
    }
    if (!ok) {
      skipped++;
      if (notes.length < 12) {
        notes.push(
          (entry.student.name || entry.student.id) +
          ': no safe denser seat for Sim ' + entry.simNum +
          ' (W' + (entry.fromWi + 1) + ' ' + entry.fromDay + ')'
        );
      }
    }
  });

  return {
    moved: moved,
    skipped: skipped,
    notes: notes,
    thinBefore: thinBefore,
    thinAfter: thinSessions(data).length
  };
}

export { getSimPracticalMinLoad, thinSessions };
