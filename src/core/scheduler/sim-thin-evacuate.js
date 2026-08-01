/**
 * Evacuate under-absolute thin sim sessions into denser open seats.
 * Also relocates minority students stuck on mixed-scenario days
 * (one sim scenario per week+day).
 */

import {
  getDaySimAttendanceCount,
  getSimPracticalMinLoad
} from './helpers.js';
import {
  thinSessions,
  collectMixedDayMismatchEntries,
  evacuateDestinationCandidates,
  tryMoveStudent,
  ensureSimCalendar
} from './sim-thin-shared.js';

function pushUniqueWork(work, seen, entry) {
  var key = entry.student.id + '|' + entry.fromWi + '|' + entry.simNum;
  if (seen[key]) return;
  seen[key] = true;
  work.push(entry);
}

/**
 * Move students out of sessions below the absolute floor into denser open sessions.
 * @returns {{ moved: number, skipped: number, notes: string[] }}
 */
export function runEvacuateThinPass(data) {
  if (!data || !data.students || !data.students.length) {
    return { moved: 0, skipped: 0, notes: [] };
  }
  var ctx = ensureSimCalendar(data);
  var cfg = ctx.cfg;
  var calendar = ctx.calendar;
  var simGroups = ctx.simGroups;
  var soft = ctx.soft;
  var half = getSimPracticalMinLoad(cfg);
  var moved = 0;
  var skipped = 0;
  var notes = [];

  var work = [];
  var seen = {};
  // Mixed-scenario mismatches first (hard rule repair).
  collectMixedDayMismatchEntries(data).forEach(function (entry) {
    pushUniqueWork(work, seen, entry);
  });
  thinSessions(data).forEach(function (sess) {
    sess.students.forEach(function (entry) {
      pushUniqueWork(work, seen, {
        student: entry.student,
        fromWi: sess.weekIndex,
        fromDay: sess.day,
        simNum: entry.simNum
      });
    });
  });
  work.sort(function (a, b) {
    var am = a.mixed ? 1 : 0;
    var bm = b.mixed ? 1 : 0;
    if (am !== bm) return bm - am;
    var ca = getDaySimAttendanceCount(data, a.fromWi, a.fromDay);
    var cb = getDaySimAttendanceCount(data, b.fromWi, b.fromDay);
    if (ca !== cb) return ca - cb;
    return String(a.student.id).localeCompare(String(b.student.id));
  });

  work.forEach(function (entry) {
    var cell = entry.student.schedule[entry.fromWi];
    if (!cell || cell.sim !== entry.simNum || cell.simDay !== entry.fromDay) return;
    var curCount = getDaySimAttendanceCount(data, entry.fromWi, entry.fromDay);
    // Thin evacuate only when still under absolute; mixed mismatches always try.
    if (!entry.mixed && curCount >= half) return;

    var dests = evacuateDestinationCandidates(
      data, entry.simNum, entry.fromWi, entry.fromDay, cfg
    );
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
          (entry.mixed ? ': mixed-day Sim ' : ': no safe denser seat for Sim ') +
          entry.simNum +
          ' (W' + (entry.fromWi + 1) + ' ' + entry.fromDay + ')'
        );
      }
    }
  });

  return { moved: moved, skipped: skipped, notes: notes };
}
