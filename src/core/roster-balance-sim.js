/**
 * Sim group size balancing, day-overlap repair, and guest-cap nudges.
 */

import * as DataModel from './data-model/index.js';
import * as Scheduler from './scheduler/index.js';
import {
  buildClinicalToSimMap
} from './roster-balance-assign.js';

function getSimCalendar(data) {
  return data._simCalendar || Scheduler.buildProgramSimCalendar(data, data.config);
}

function getGuestSoftCap(config) {
  var n = parseInt(config && config.maxGuestSimsPerStudent, 10);
  if (isNaN(n) || n < 0) return 1;
  return n;
}

function getSessionCap(config) {
  return (config && config.maxStudentsPerSimSession) || 8;
}

function getGroupSizeCap(config, opts) {
  opts = opts || {};
  var normal = getSessionCap(config);
  if (!opts.allowOverload) return normal;
  var overload = config && config.maxStudentsPerSimSessionOverload;
  if (overload == null || isNaN(overload)) overload = normal + 1;
  return Math.max(normal, parseInt(overload, 10) || normal);
}

function resolvePlacementHost(student, cell, weekIndex, calendar, simGroups, config) {
  if (cell.simGuestGroup) return cell.simGuestGroup;
  return Scheduler.resolveSimSessionHost(
    cell.sim, weekIndex, cell.simDay, calendar, simGroups, config
  );
}

function isGuestPlacement(student, cell, weekIndex, calendar, simGroups, config) {
  if (!cell || !cell.sim) return false;
  if (cell.simGuestGroup) return true;
  var host = resolvePlacementHost(student, cell, weekIndex, calendar, simGroups, config);
  return !!(host && host !== student.simGroup);
}

function countGuestSimPlacements(data) {
  var config = data.config;
  var simGroups = DataModel.getSimGroups(config);
  var calendar = getSimCalendar(data);
  var count = 0;
  data.students.forEach(function (student) {
    student.schedule.forEach(function (cell, wi) {
      if (isGuestPlacement(student, cell, wi, calendar, simGroups, config)) count++;
    });
  });
  return count;
}

function getStudentGuestCount(student, data) {
  var config = data.config;
  var simGroups = DataModel.getSimGroups(config);
  var calendar = getSimCalendar(data);
  var count = 0;
  student.schedule.forEach(function (cell, wi) {
    if (isGuestPlacement(student, cell, wi, calendar, simGroups, config)) count++;
  });
  return count;
}

function maxGuestPerStudent(data) {
  var max = 0;
  data.students.forEach(function (s) {
    var g = getStudentGuestCount(s, data);
    if (g > max) max = g;
  });
  return max;
}

function countStudentsOverGuestCap(data, softCap) {
  var n = 0;
  data.students.forEach(function (s) {
    if (getStudentGuestCount(s, data) > softCap) n++;
  });
  return n;
}

function countSimGroupSizes(students, simGroups) {
  var counts = {};
  simGroups.forEach(function (sg) { counts[sg] = 0; });
  students.forEach(function (s) {
    if (s.simGroup && counts[s.simGroup] != null) counts[s.simGroup]++;
  });
  return counts;
}

function countOversizedSimGroups(students, simGroups, cap) {
  var counts = countSimGroupSizes(students, simGroups);
  var n = 0;
  simGroups.forEach(function (sg) {
    if ((counts[sg] || 0) > cap) n++;
  });
  return n;
}

function countHardOversizedSimGroups(data) {
  var config = data.config;
  var hardCap = getGroupSizeCap(config, { allowOverload: true });
  return countOversizedSimGroups(
    data.students,
    DataModel.getSimGroups(config),
    hardCap
  );
}

function cohortDensity(students, clinicalGroup, simGroup, excludeId) {
  var n = 0;
  students.forEach(function (s) {
    if (excludeId && s.id === excludeId) return;
    if (s.clinicalGroup === clinicalGroup && s.simGroup === simGroup) n++;
  });
  return n;
}

/** Higher is better. -Infinity when destination has no room. */
function affinityScore(student, targetSg, students, counts, cap, clinicalMap, config) {
  var size = counts[targetSg] || 0;
  if (student.simGroup !== targetSg && size >= cap) return -Infinity;

  var score = 0;
  score += cohortDensity(students, student.clinicalGroup, targetSg, student.id) * 100;
  if (clinicalMap[student.clinicalGroup] === targetSg) score += 50;

  var clinDay = DataModel.getClinicalDayForGroup(student.clinicalGroup, config);
  var simDay = DataModel.getSimGroupDay(targetSg, config);
  var simDays = DataModel.getSimDays(config);
  if (simDays.indexOf(clinDay) >= 0 && clinDay === simDay) score -= 200;

  score += (cap - size);
  if (student.simGroup === targetSg) score += 5;
  return score;
}

function pickBestDestination(student, students, counts, cap, clinicalMap, config, simGroups, excludeSg) {
  var bestSg = null;
  var bestScore = -Infinity;
  simGroups.forEach(function (sg) {
    if (excludeSg && sg === excludeSg) return;
    var score = affinityScore(student, sg, students, counts, cap, clinicalMap, config);
    if (score > bestScore) {
      bestScore = score;
      bestSg = sg;
    }
  });
  if (bestSg == null || bestScore === -Infinity) return null;
  return bestSg;
}

function balanceSimGroupSizes(data) {
  var config = data.config;
  var students = data.students;
  var clinicalGroups = DataModel.getClinicalGroups(config);
  var simGroups = DataModel.getSimGroups(config);
  if (!simGroups.length) return { changed: 0, details: [] };

  var cap = getSessionCap(config);
  var hardCap = getGroupSizeCap(config, { allowOverload: true });
  var clinicalMap = buildClinicalToSimMap(clinicalGroups, simGroups);
  var details = [];
  var changed = 0;

  students.forEach(function (s) {
    if (s.simGroup && simGroups.indexOf(s.simGroup) >= 0) return;
    var mapped = clinicalMap[s.clinicalGroup] || simGroups[0];
    details.push({
      id: s.id,
      name: s.name,
      from: s.simGroup,
      to: mapped,
      reason: 'invalid'
    });
    s.simGroup = mapped;
    changed++;
  });

  function drainAbove(limit, requireSafeDest) {
    var safety = 0;
    var maxMoves = Math.max(students.length * 2, 1);
    while (safety++ < maxMoves) {
      var counts = countSimGroupSizes(students, simGroups);
      var oversized = null;
      var overBy = 0;
      simGroups.forEach(function (sg) {
        var n = counts[sg] || 0;
        if (n > limit && n - limit > overBy) {
          overBy = n - limit;
          oversized = sg;
        }
      });
      if (!oversized) break;

      var movers = students.filter(function (s) { return s.simGroup === oversized; });
      movers.sort(function (a, b) {
        // Prefer moving students who conflict on this group's weekday.
        var overlapA = clinicalSimDayOverlap(a, oversized, config) ? 0 : 1;
        var overlapB = clinicalSimDayOverlap(b, oversized, config) ? 0 : 1;
        if (overlapA !== overlapB) return overlapA - overlapB;
        var mapA = clinicalMap[a.clinicalGroup] === oversized ? 1 : 0;
        var mapB = clinicalMap[b.clinicalGroup] === oversized ? 1 : 0;
        if (mapA !== mapB) return mapA - mapB;
        var densA = cohortDensity(students, a.clinicalGroup, oversized, a.id);
        var densB = cohortDensity(students, b.clinicalGroup, oversized, b.id);
        if (densA !== densB) return densA - densB;
        return a.id < b.id ? -1 : 1;
      });

      var moved = false;
      for (var i = 0; i < movers.length && !moved; i++) {
        var student = movers[i];
        counts[oversized]--;
        var bestSg = null;
        var bestScore = -Infinity;
        simGroups.forEach(function (sg) {
          if (sg === oversized) return;
          if (requireSafeDest && clinicalSimDayOverlap(student, sg, config)) return;
          var score = affinityScore(student, sg, students, counts, limit, clinicalMap, config);
          if (score > bestScore) {
            bestScore = score;
            bestSg = sg;
          }
        });
        counts[oversized]++;
        if (!bestSg || bestScore === -Infinity) continue;

        details.push({
          id: student.id,
          name: student.name,
          from: student.simGroup,
          to: bestSg,
          reason: 'size_cap'
        });
        student.simGroup = bestSg;
        changed++;
        moved = true;
      }
      if (!moved) break;
    }
  }

  // Never exceed overload headroom; only trim to normal cap when a day-safe dest exists.
  drainAbove(hardCap, false);
  drainAbove(cap, true);

  return { changed: changed, details: details };
}

function studentSimCount(student) {
  var n = 0;
  student.schedule.forEach(function (cell) {
    if (cell && cell.sim) n++;
  });
  return n;
}

function studentNeedsGuestNudge(student, data, softCap) {
  var guests = getStudentGuestCount(student, data);
  if (guests > softCap) return true;
  var needed = (data.config && data.config.simDaysRequired) || 5;
  if (studentSimCount(student) < needed && guests >= softCap) return true;
  return false;
}

function clinicalSimDayOverlap(student, simGroup, config) {
  var clinDay = DataModel.getClinicalDayForGroup(student.clinicalGroup, config);
  var simDay = DataModel.getSimGroupDay(simGroup, config);
  var simDays = DataModel.getSimDays(config);
  return simDays.indexOf(clinDay) >= 0 && clinDay === simDay;
}

function repairClinicalSimDayOverlaps(data) {
  var config = data.config;
  var students = data.students;
  var clinicalGroups = DataModel.getClinicalGroups(config);
  var simGroups = DataModel.getSimGroups(config);
  if (!simGroups.length) return { changed: 0, details: [] };

  var cap = getSessionCap(config);
  var fitCap = getGroupSizeCap(config, { allowOverload: true });
  var clinicalMap = buildClinicalToSimMap(clinicalGroups, simGroups);
  var details = [];
  var changed = 0;

  var movers = students.filter(function (s) {
    return s.simGroup && clinicalSimDayOverlap(s, s.simGroup, config);
  }).sort(function (a, b) {
    return a.id < b.id ? -1 : 1;
  });

  movers.forEach(function (student) {
    var from = student.simGroup;
    var counts = countSimGroupSizes(students, simGroups);
    counts[from]--;

    var bestSg = null;
    var bestScore = -Infinity;
    simGroups.forEach(function (sg) {
      if (sg === from) return;
      if (clinicalSimDayOverlap(student, sg, config)) return;
      var score = affinityScore(student, sg, students, counts, fitCap, clinicalMap, config);
      if (score > bestScore) {
        bestScore = score;
        bestSg = sg;
      }
    });

    if (bestSg && bestScore !== -Infinity) {
      details.push({
        id: student.id,
        name: student.name,
        from: from,
        to: bestSg,
        reason: 'day_overlap'
      });
      student.simGroup = bestSg;
      changed++;
      return;
    }

    // No seat even at overload size: swap with a partner who can accept `from`
    // without a clinical/sim day clash.
    var rankedDest = simGroups.filter(function (sg) {
      return sg !== from && !clinicalSimDayOverlap(student, sg, config);
    }).sort(function (a, b) {
      var ca = counts[a] || 0;
      var cb = counts[b] || 0;
      if (ca !== cb) return ca - cb;
      var mapA = clinicalMap[student.clinicalGroup] === a ? 0 : 1;
      var mapB = clinicalMap[student.clinicalGroup] === b ? 0 : 1;
      return mapA - mapB;
    });

    for (var di = 0; di < rankedDest.length; di++) {
      var dest = rankedDest[di];
      if ((counts[dest] || 0) >= fitCap) continue;
      // Prefer direct move into dest when overload headroom exists.
      details.push({
        id: student.id,
        name: student.name,
        from: from,
        to: dest,
        reason: 'day_overlap_overflow'
      });
      student.simGroup = dest;
      changed++;
      return;
    }

    for (di = 0; di < rankedDest.length; di++) {
      dest = rankedDest[di];
      var occupants = students.filter(function (s) {
        return s.id !== student.id && s.simGroup === dest &&
          !clinicalSimDayOverlap(s, from, config);
      });
      occupants.sort(function (a, b) {
        var aBad = clinicalSimDayOverlap(a, dest, config) ? 0 : 1;
        var bBad = clinicalSimDayOverlap(b, dest, config) ? 0 : 1;
        if (aBad !== bBad) return aBad - bBad;
        return a.id < b.id ? -1 : 1;
      });
      var partner = occupants[0];
      if (!partner) continue;
      details.push({
        id: student.id,
        name: student.name,
        from: from,
        to: dest,
        reason: 'day_overlap_swap',
        swapWith: partner.id
      });
      details.push({
        id: partner.id,
        name: partner.name,
        from: partner.simGroup,
        to: from,
        reason: 'day_overlap_swap',
        swapWith: student.id
      });
      partner.simGroup = from;
      student.simGroup = dest;
      changed += 2;
      return;
    }

    counts[from]++;
  });

  return { changed: changed, details: details };
}

function nudgeStudentsOverGuestCap(data, softCap) {
  var config = data.config;
  var students = data.students;
  var clinicalGroups = DataModel.getClinicalGroups(config);
  var simGroups = DataModel.getSimGroups(config);
  if (!simGroups.length) return { changed: 0, details: [] };

  var cap = getSessionCap(config);
  var clinicalMap = buildClinicalToSimMap(clinicalGroups, simGroups);
  var details = [];
  var changed = 0;

  var offenders = students.map(function (s) {
    return {
      student: s,
      guests: getStudentGuestCount(s, data),
      sims: studentSimCount(s)
    };
  }).filter(function (x) {
    return studentNeedsGuestNudge(x.student, data, softCap);
  }).sort(function (a, b) {
    if (b.guests !== a.guests) return b.guests - a.guests;
    if (a.sims !== b.sims) return a.sims - b.sims;
    return a.student.id < b.student.id ? -1 : 1;
  });

  offenders.forEach(function (item) {
    var student = item.student;
    var counts = countSimGroupSizes(students, simGroups);
    if (!student.simGroup || counts[student.simGroup] == null) return;
    counts[student.simGroup]--;

    var bestSg = null;
    var bestScore = -Infinity;
    simGroups.forEach(function (sg) {
      if (sg === student.simGroup) return;
      if (clinicalSimDayOverlap(student, sg, config)) return;
      var score = affinityScore(student, sg, students, counts, cap, clinicalMap, config);
      if (score > bestScore) {
        bestScore = score;
        bestSg = sg;
      }
    });
    if (!bestSg) {
      bestSg = pickBestDestination(
        student, students, counts, cap, clinicalMap, config, simGroups, student.simGroup
      );
    }
    if (!bestSg) return;

    details.push({
      id: student.id,
      name: student.name,
      from: student.simGroup,
      to: bestSg,
      reason: 'guest_cap',
      guests: item.guests
    });
    student.simGroup = bestSg;
    changed++;
  });

  return { changed: changed, details: details };
}

export {
  getSimCalendar,
  getGuestSoftCap,
  getSessionCap,
  getGroupSizeCap,
  resolvePlacementHost,
  isGuestPlacement,
  countGuestSimPlacements,
  getStudentGuestCount,
  maxGuestPerStudent,
  countStudentsOverGuestCap,
  countSimGroupSizes,
  countOversizedSimGroups,
  countHardOversizedSimGroups,
  cohortDensity,
  affinityScore,
  pickBestDestination,
  balanceSimGroupSizes,
  studentSimCount,
  studentNeedsGuestNudge,
  clinicalSimDayOverlap,
  repairClinicalSimDayOverlaps,
  nudgeStudentsOverGuestCap
};