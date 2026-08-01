/**
 * Fill under-ideal open sim sessions by pulling from denser same-weekday peers
 * without dropping donor sessions below the absolute floor.
 */

import {
  getDaySimAttendanceCount,
  getSimPracticalMinLoad,
  getSimIdealMinLoad,
  getSimCaps
} from './helpers.js';
import {
  listDaySessions,
  tryMoveStudent,
  ensureSimCalendar,
  dayHasForeignSimScenario
} from './sim-thin-shared.js';

function underIdealTargets(data, absolute, ideal) {
  return listDaySessions(data)
    .filter(function (s) {
      if (!(s.count > 0 && s.count < ideal)) return false;
      // Skip mixed-scenario days until evacuate repairs them.
      var sims = {};
      s.students.forEach(function (e) { sims[e.simNum] = true; });
      return Object.keys(sims).length === 1;
    })
    .sort(function (a, b) {
      var aAbs = a.count < absolute ? 1 : 0;
      var bAbs = b.count < absolute ? 1 : 0;
      if (aAbs !== bAbs) return bAbs - aAbs;
      var aDef = ideal - a.count;
      var bDef = ideal - b.count;
      if (aDef !== bDef) return bDef - aDef;
      if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
      return String(a.day).localeCompare(String(b.day));
    });
}

function donorCandidates(data, target, absolute, caps, targetSimNum) {
  var donors = [];
  listDaySessions(data).forEach(function (sess) {
    if (sess.weekIndex === target.weekIndex && sess.day === target.day) return;
    if (sess.count <= absolute) return;
    if (target.count >= caps.normal) return;
    sess.students.forEach(function (entry) {
      if (targetSimNum != null && entry.simNum !== targetSimNum) return;
      if (dayHasForeignSimScenario(
        data, target.weekIndex, target.day, entry.simNum, entry.student.id
      )) return;
      donors.push({
        student: entry.student,
        fromWi: sess.weekIndex,
        fromDay: sess.day,
        simNum: entry.simNum,
        sourceCount: sess.count,
        sameDay: sess.day === target.day ? 1 : 0,
        weekDist: Math.abs(sess.weekIndex - target.weekIndex)
      });
    });
  });
  donors.sort(function (a, b) {
    if (a.sameDay !== b.sameDay) return b.sameDay - a.sameDay;
    if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount;
    if (a.weekDist !== b.weekDist) return a.weekDist - b.weekDist;
    return String(a.student.id).localeCompare(String(b.student.id));
  });
  return donors;
}

/**
 * Pull students into under-ideal open sessions from spare denser peers.
 * @returns {{ moved: number, skipped: number, notes: string[] }}
 */
export function runFillIdealPass(data) {
  if (!data || !data.students || !data.students.length) {
    return { moved: 0, skipped: 0, notes: [] };
  }
  var ctx = ensureSimCalendar(data);
  var cfg = ctx.cfg;
  var calendar = ctx.calendar;
  var simGroups = ctx.simGroups;
  var soft = ctx.soft;
  var absolute = getSimPracticalMinLoad(cfg);
  var ideal = getSimIdealMinLoad(cfg);
  var caps = getSimCaps(cfg);
  var moved = 0;
  var skipped = 0;
  var notes = [];
  var maxRounds = 64;

  for (var round = 0; round < maxRounds; round++) {
    var targets = underIdealTargets(data, absolute, ideal);
    if (!targets.length) break;

    var progressed = false;
    for (var t = 0; t < targets.length; t++) {
      var target = targets[t];
      var cur = getDaySimAttendanceCount(data, target.weekIndex, target.day);
      if (cur <= 0 || cur >= ideal || cur >= caps.normal) continue;

      var donors = donorCandidates(
        data,
        { weekIndex: target.weekIndex, day: target.day, count: cur },
        absolute,
        caps,
        target.students[0] ? target.students[0].simNum : null
      );
      var dest = { weekIndex: target.weekIndex, day: target.day };
      var filled = false;
      for (var d = 0; d < donors.length; d++) {
        var donor = donors[d];
        var srcCount = getDaySimAttendanceCount(data, donor.fromWi, donor.fromDay);
        if (srcCount <= absolute) continue;
        var cell = donor.student.schedule[donor.fromWi];
        if (!cell || cell.sim !== donor.simNum || cell.simDay !== donor.fromDay) continue;
        if (tryMoveStudent(data, donor, dest, cfg, calendar, simGroups, soft)) {
          moved++;
          filled = true;
          progressed = true;
          break;
        }
      }
      if (!filled) {
        skipped++;
        if (notes.length < 12) {
          notes.push(
            'No safe donor for W' + (target.weekIndex + 1) + ' ' + target.day +
            ' (count ' + cur + ', ideal ' + ideal + ')'
          );
        }
      } else {
        break; // re-rank targets after a successful fill
      }
    }
    if (!progressed) break;
  }

  return { moved: moved, skipped: skipped, notes: notes };
}
