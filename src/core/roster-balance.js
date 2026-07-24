/**
 * Clinical/sim group balancing for rosters.
 */

import * as DataModel from './data-model/index.js';
import * as Scheduler from './scheduler/index.js';

var MAX_SIM_REBALANCE_PASSES = 5;

function buildClinicalToSimMap(clinicalGroups, simGroups) {
  var map = {};
  if (!clinicalGroups.length || !simGroups.length) return map;
  clinicalGroups.forEach(function (g, i) {
    map[g] = simGroups[i % simGroups.length];
  });
  return map;
}

function shouldForceClinicalSimAlignment(clinicalGroups, simGroups) {
  return clinicalGroups.length === simGroups.length && clinicalGroups.length > 0;
}

function buildStrictClinicalToSimMap(clinicalGroups, simGroups) {
  var map = {};
  if (!shouldForceClinicalSimAlignment(clinicalGroups, simGroups)) return map;
  clinicalGroups.forEach(function (g, i) {
    map[g] = simGroups[i];
  });
  return map;
}

function simGroupForClinicalCohort(students, clinicalGroup, clinicalGroups, simGroups, excludeStudentId) {
  var cohort = students.filter(function (s) {
    return s.clinicalGroup === clinicalGroup && s.id !== excludeStudentId;
  });
  if (cohort.length) {
    var counts = {};
    cohort.forEach(function (s) {
      if (s.simGroup) counts[s.simGroup] = (counts[s.simGroup] || 0) + 1;
    });
    var best = null;
    var bestN = -1;
    Object.keys(counts).forEach(function (sg) {
      if (counts[sg] > bestN) {
        bestN = counts[sg];
        best = sg;
      }
    });
    if (best) return best;
  }
  var map = buildClinicalToSimMap(clinicalGroups, simGroups);
  return map[clinicalGroup] || simGroups[0];
}

function assignClinicalGroups(students, clinicalGroups, maxPer) {
  if (!clinicalGroups.length) return;
  var groupCounts = {};
  clinicalGroups.forEach(function (g) { groupCounts[g] = 0; });

  students.forEach(function (student) {
    var bestGroup = clinicalGroups[0];
    var bestCount = Infinity;
    clinicalGroups.forEach(function (g) {
      var count = groupCounts[g];
      if (count < bestCount && count < maxPer) {
        bestCount = count;
        bestGroup = g;
      }
    });
    if (groupCounts[bestGroup] >= maxPer) {
      clinicalGroups.forEach(function (g) {
        if (groupCounts[g] < groupCounts[bestGroup]) bestGroup = g;
      });
    }
    student.clinicalGroup = bestGroup;
    groupCounts[bestGroup]++;
  });
}

function assignSimGroupsByClinicalCohort(students, clinicalGroups, simGroups, options) {
  options = options || {};
  var force = !!options.force;
  if (!simGroups.length) return;
  var map = shouldForceClinicalSimAlignment(clinicalGroups, simGroups) && force
    ? buildStrictClinicalToSimMap(clinicalGroups, simGroups)
    : buildClinicalToSimMap(clinicalGroups, simGroups);

  students.forEach(function (s) {
    if (!force && s.simGroup && simGroups.indexOf(s.simGroup) >= 0) return;
    if (map[s.clinicalGroup]) s.simGroup = map[s.clinicalGroup];
    else s.simGroup = simGroups[0];
  });
}

function rebalanceClinicalGroups(students, config) {
  var clinicalGroups = DataModel.getClinicalGroups(config);
  var maxPer = config.maxPerClinicalGroup || 6;
  assignClinicalGroups(students, clinicalGroups, maxPer);
}

function rebalance(students, config) {
  var clinicalGroups = DataModel.getClinicalGroups(config);
  var simGroups = DataModel.getSimGroups(config);
  var maxPer = config.maxPerClinicalGroup || 6;
  assignClinicalGroups(students, clinicalGroups, maxPer);
  assignSimGroupsByClinicalCohort(students, clinicalGroups, simGroups, { force: true });
}

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

function getStudentHostCounts(student, calendar, simGroups, config) {
  var hostCounts = {};
  var simCount = 0;
  student.schedule.forEach(function (cell, wi) {
    if (!cell || !cell.sim) return;
    simCount++;
    var host = resolvePlacementHost(student, cell, wi, calendar, simGroups, config);
    if (!host || simGroups.indexOf(host) < 0) return;
    hostCounts[host] = (hostCounts[host] || 0) + 1;
  });
  return { hostCounts: hostCounts, simCount: simCount };
}

function pickPluralityHost(hostCounts, simCount, student, clinicalMap, simGroups) {
  var best = null;
  var bestN = -1;
  simGroups.forEach(function (sg) {
    var n = hostCounts[sg] || 0;
    if (n > bestN) {
      bestN = n;
      best = sg;
    }
  });
  if (!best || bestN <= 0) return null;

  if (bestN > simCount / 2) return best;

  var tied = simGroups.filter(function (sg) { return (hostCounts[sg] || 0) === bestN; });
  if (tied.length === 1) return best;
  if (student.simGroup && tied.indexOf(student.simGroup) >= 0) return student.simGroup;
  var mapped = clinicalMap[student.clinicalGroup];
  if (mapped && tied.indexOf(mapped) >= 0) return mapped;
  return best;
}

function getStudentPluralityHost(student, calendar, simGroups, config, clinicalMap) {
  var tallies = getStudentHostCounts(student, calendar, simGroups, config);
  if (tallies.simCount === 0) return null;
  return pickPluralityHost(tallies.hostCounts, tallies.simCount, student, clinicalMap, simGroups);
}

function studentSimGroupMismatch(student, calendar, simGroups, config, clinicalMap) {
  var target = getStudentPluralityHost(student, calendar, simGroups, config, clinicalMap);
  return !!(target && student.simGroup !== target);
}

function countSimGroupMismatches(data) {
  var config = data.config;
  var simGroups = DataModel.getSimGroups(config);
  var calendar = getSimCalendar(data);
  var clinicalMap = buildClinicalToSimMap(
    DataModel.getClinicalGroups(config),
    simGroups
  );
  var count = 0;
  data.students.forEach(function (student) {
    if (studentSimGroupMismatch(student, calendar, simGroups, config, clinicalMap)) count++;
  });
  return count;
}

function alignSimGroupsToPluralityHosts(data) {
  var config = data.config;
  var students = data.students;
  var clinicalGroups = DataModel.getClinicalGroups(config);
  var simGroups = DataModel.getSimGroups(config);
  var calendar = getSimCalendar(data);
  var clinicalMap = buildClinicalToSimMap(clinicalGroups, simGroups);
  var cap = getSessionCap(config);
  var changed = 0;
  var details = [];

  function strengthOnHost(student, host) {
    var tallies = getStudentHostCounts(student, calendar, simGroups, config);
    return tallies.hostCounts[host] || 0;
  }

  function primaryHost(student) {
    var tallies = getStudentHostCounts(student, calendar, simGroups, config);
    if (tallies.simCount === 0) return null;
    return pickPluralityHost(
      tallies.hostCounts,
      tallies.simCount,
      student,
      clinicalMap,
      simGroups
    );
  }

  var plans = students.map(function (student) {
    var tallies = getStudentHostCounts(student, calendar, simGroups, config);
    var ranked = [];
    if (tallies.simCount > 0) {
      simGroups.forEach(function (sg) {
        ranked.push({ sg: sg, n: tallies.hostCounts[sg] || 0 });
      });
      ranked.sort(function (a, b) {
        if (b.n !== a.n) return b.n - a.n;
        return a.sg < b.sg ? -1 : 1;
      });
    }
    var primary = pickPluralityHost(
      tallies.hostCounts,
      tallies.simCount,
      student,
      clinicalMap,
      simGroups
    );
    return {
      student: student,
      ranked: ranked,
      primary: primary,
      strength: primary ? (tallies.hostCounts[primary] || 0) : 0,
      simCount: tallies.simCount
    };
  }).filter(function (p) {
    return p.primary && p.student.simGroup !== p.primary;
  }).sort(function (a, b) {
    if (b.strength !== a.strength) return b.strength - a.strength;
    return a.student.id < b.student.id ? -1 : 1;
  });

  var counts = countSimGroupSizes(students, simGroups);

  plans.forEach(function (plan) {
    var student = plan.student;
    var from = student.simGroup;
    counts[from] = (counts[from] || 0) - 1;

    var target = null;
    var candidates = [];
    if (plan.primary) candidates.push(plan.primary);
    plan.ranked.forEach(function (r) {
      if (candidates.indexOf(r.sg) < 0 && r.n > 0) candidates.push(r.sg);
    });

    for (var i = 0; i < candidates.length; i++) {
      var sg = candidates[i];
      if ((counts[sg] || 0) < cap) {
        target = sg;
        break;
      }
    }

    if (!target && plan.primary && plan.strength > plan.simCount / 2) {
      // Clear majority on a full host: swap with the best partner to displace.
      // Prefer partners who overlap clinically with that host (poor fit) and who
      // can accept this student's current group without a clinical/sim day clash.
      var occupants = students.filter(function (s) {
        return s.id !== student.id && s.simGroup === plan.primary &&
          !clinicalSimDayOverlap(s, from, config);
      });
      occupants.sort(function (a, b) {
        var aOverlapHost = clinicalSimDayOverlap(a, plan.primary, config) ? 0 : 1;
        var bOverlapHost = clinicalSimDayOverlap(b, plan.primary, config) ? 0 : 1;
        if (aOverlapHost !== bOverlapHost) return aOverlapHost - bOverlapHost;
        var sa = strengthOnHost(a, plan.primary);
        var sb = strengthOnHost(b, plan.primary);
        if (sa !== sb) return sa - sb;
        var pa = primaryHost(a);
        var pb = primaryHost(b);
        var aWantsElsewhere = pa && pa !== plan.primary ? 0 : 1;
        var bWantsElsewhere = pb && pb !== plan.primary ? 0 : 1;
        if (aWantsElsewhere !== bWantsElsewhere) return aWantsElsewhere - bWantsElsewhere;
        return a.id < b.id ? -1 : 1;
      });
      var partner = occupants[0];
      if (partner) {
        details.push({
          id: student.id,
          name: student.name,
          from: from,
          to: plan.primary,
          reason: 'plurality_swap',
          swapWith: partner.id
        });
        details.push({
          id: partner.id,
          name: partner.name,
          from: partner.simGroup,
          to: from,
          reason: 'plurality_swap',
          swapWith: student.id
        });
        partner.simGroup = from;
        student.simGroup = plan.primary;
        counts[plan.primary] = (counts[plan.primary] || 0) + 1;
        counts[from] = (counts[from] || 0) + 1;
        changed += 2;
        return;
      }
    }

    if (!target && plan.primary) {
      // Weaker majority: only swap when partner is clearly less attached.
      var weakOccupants = students.filter(function (s) {
        return s.id !== student.id && s.simGroup === plan.primary &&
          !clinicalSimDayOverlap(s, from, config);
      });
      weakOccupants.sort(function (a, b) {
        var sa = strengthOnHost(a, plan.primary);
        var sb = strengthOnHost(b, plan.primary);
        if (sa !== sb) return sa - sb;
        return a.id < b.id ? -1 : 1;
      });
      var weakPartner = weakOccupants[0];
      if (weakPartner && strengthOnHost(weakPartner, plan.primary) < plan.strength) {
        details.push({
          id: student.id,
          name: student.name,
          from: from,
          to: plan.primary,
          reason: 'plurality_swap',
          swapWith: weakPartner.id
        });
        details.push({
          id: weakPartner.id,
          name: weakPartner.name,
          from: weakPartner.simGroup,
          to: from,
          reason: 'plurality_swap',
          swapWith: student.id
        });
        weakPartner.simGroup = from;
        student.simGroup = plan.primary;
        counts[plan.primary] = (counts[plan.primary] || 0) + 1;
        counts[from] = (counts[from] || 0) + 1;
        changed += 2;
        return;
      }
    }

    if (!target) {
      counts[from] = (counts[from] || 0) + 1;
      return;
    }
    if (target === from) {
      counts[from] = (counts[from] || 0) + 1;
      return;
    }

    details.push({
      id: student.id,
      name: student.name,
      from: from,
      to: target,
      reason: 'plurality'
    });
    student.simGroup = target;
    counts[target] = (counts[target] || 0) + 1;
    changed++;
  });

  return { changed: changed, details: details };
}

function needsSimRebalance(data) {
  var config = data.config;
  var softCap = getGuestSoftCap(config);
  if (countHardOversizedSimGroups(data) > 0) return true;
  if (countSimGroupMismatches(data) > 0) return true;
  return data.students.some(function (student) {
    return getStudentGuestCount(student, data) > softCap;
  });
}

function allSimsComplete(data) {
  var needed = (data.config && data.config.simDaysRequired) || 5;
  return data.students.every(function (s) {
    return studentSimCount(s) >= needed;
  });
}

function goalsMet(data, softCap) {
  if (countHardOversizedSimGroups(data) > 0) return false;
  if (countSimGroupMismatches(data) > 0) return false;
  if (!allSimsComplete(data)) return false;
  return maxGuestPerStudent(data) <= softCap;
}

function rebalanceSimGroups(data) {
  var config = DataModel.normalizeConfig(data.config);
  data.config = config;
  var softCap = getGuestSoftCap(config);
  var simGroups = DataModel.getSimGroups(config);
  var sessionCap = getSessionCap(config);

  var guestBefore = countGuestSimPlacements(data);
  var mismatchBefore = countSimGroupMismatches(data);
  var oversizedBefore = countHardOversizedSimGroups(data);
  var totalChanged = 0;
  var allDetails = [];
  var passes = 0;
  var metSoftCap = false;

  function applyMoves(result) {
    totalChanged += result.changed;
    allDetails = allDetails.concat(result.details);
    return result.changed;
  }

  applyMoves(balanceSimGroupSizes(data));
  applyMoves(repairClinicalSimDayOverlaps(data));
  applyMoves(balanceSimGroupSizes(data));

  data._enforceGuestSoftCap = true;
  try {
    while (passes < MAX_SIM_REBALANCE_PASSES) {
      Scheduler.regenerateAll(data);
      passes++;

      var moved = 0;
      moved += applyMoves(alignSimGroupsToPluralityHosts(data));
      moved += applyMoves(balanceSimGroupSizes(data));
      if (moved > 0) {
        Scheduler.regenerateAll(data);
        moved += applyMoves(alignSimGroupsToPluralityHosts(data));
        moved += applyMoves(balanceSimGroupSizes(data));
        if (moved > 0) Scheduler.regenerateAll(data);
      }

      if (goalsMet(data, softCap)) {
        metSoftCap = true;
        break;
      }
      if (passes >= MAX_SIM_REBALANCE_PASSES) break;

      var nudged = applyMoves(nudgeStudentsOverGuestCap(data, softCap));
      var dayFixed = applyMoves(repairClinicalSimDayOverlaps(data));
      var sized = applyMoves(balanceSimGroupSizes(data));
      var realigned = applyMoves(alignSimGroupsToPluralityHosts(data));
      realigned += applyMoves(balanceSimGroupSizes(data));
      if (nudged === 0 && dayFixed === 0 && sized === 0 && moved === 0 && realigned === 0) break;
    }
  } finally {
    data._enforceGuestSoftCap = false;
  }

  if (!allSimsComplete(data)) {
    Scheduler.regenerateAll(data);
    if (passes < 1) passes = 1;
  }

  // Final label↔schedule sync so primary sim group matches majority session host.
  var syncPass;
  for (syncPass = 0; syncPass < 3; syncPass++) {
    var mismatchPrior = countSimGroupMismatches(data);
    applyMoves(repairClinicalSimDayOverlaps(data));
    var syncMoved = applyMoves(alignSimGroupsToPluralityHosts(data));
    syncMoved += applyMoves(balanceSimGroupSizes(data));
    Scheduler.regenerateAll(data);
    syncMoved += applyMoves(alignSimGroupsToPluralityHosts(data));
    syncMoved += applyMoves(balanceSimGroupSizes(data));
    if (syncMoved > 0) Scheduler.regenerateAll(data);
    if (countSimGroupMismatches(data) === 0) break;
    if (countSimGroupMismatches(data) >= mismatchPrior && syncPass > 0) break;
  }

  metSoftCap = goalsMet(data, softCap);

  return {
    changed: totalChanged,
    passes: passes,
    guestBefore: guestBefore,
    guestAfter: countGuestSimPlacements(data),
    maxGuestAfter: maxGuestPerStudent(data),
    softCap: softCap,
    metSoftCap: metSoftCap,
    studentsOverSoftCap: countStudentsOverGuestCap(data, softCap),
    oversizedBefore: oversizedBefore,
    oversizedAfter: countHardOversizedSimGroups(data),
    mismatchBefore: mismatchBefore,
    mismatchAfter: countSimGroupMismatches(data),
    details: allDetails
  };
}

export {
  buildClinicalToSimMap,
  buildStrictClinicalToSimMap,
  shouldForceClinicalSimAlignment,
  simGroupForClinicalCohort,
  assignClinicalGroups,
  assignSimGroupsByClinicalCohort,
  rebalanceClinicalGroups,
  rebalance,
  countGuestSimPlacements,
  countSimGroupMismatches,
  needsSimRebalance,
  rebalanceSimGroups,
  balanceSimGroupSizes,
  getGuestSoftCap,
  maxGuestPerStudent
};
