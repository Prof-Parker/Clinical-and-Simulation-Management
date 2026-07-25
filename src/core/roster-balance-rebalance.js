/**
 * Plurality-host alignment and full sim rebalance orchestration.
 */

import * as DataModel from './data-model/index.js';
import * as Scheduler from './scheduler/index.js';
import { buildClinicalToSimMap } from './roster-balance-assign.js';
import {
  getSimCalendar,
  getGuestSoftCap,
  getSessionCap,
  resolvePlacementHost,
  countGuestSimPlacements,
  getStudentGuestCount,
  maxGuestPerStudent,
  countStudentsOverGuestCap,
  countSimGroupSizes,
  countHardOversizedSimGroups,
  balanceSimGroupSizes,
  studentSimCount,
  clinicalSimDayOverlap,
  repairClinicalSimDayOverlaps,
  nudgeStudentsOverGuestCap
} from './roster-balance-sim.js';

var MAX_SIM_REBALANCE_PASSES = 5;
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

  // Final label<->schedule sync so primary sim group matches majority session host.
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
  countSimGroupMismatches,
  needsSimRebalance,
  rebalanceSimGroups,
  alignSimGroupsToPluralityHosts,
  getStudentHostCounts,
  pickPluralityHost,
  getStudentPluralityHost,
  studentSimGroupMismatch,
  allSimsComplete,
  goalsMet
};