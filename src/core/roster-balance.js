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

function needsSimRebalance(data) {
  var config = data.config;
  var simGroups = DataModel.getSimGroups(config);
  var calendar = getSimCalendar(data);
  var clinicalMap = buildClinicalToSimMap(
    DataModel.getClinicalGroups(config),
    simGroups
  );
  return data.students.some(function (student) {
    if (studentSimGroupMismatch(student, calendar, simGroups, config, clinicalMap)) {
      return true;
    }
    var simCount = 0;
    var guestCount = 0;
    student.schedule.forEach(function (cell, wi) {
      if (!cell || !cell.sim) return;
      simCount++;
      if (isGuestPlacement(student, cell, wi, calendar, simGroups, config)) guestCount++;
    });
    if (simCount === 0) return false;
    return guestCount === simCount || guestCount > simCount / 2;
  });
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

function rebalanceSimGroupsSinglePass(data) {
  var config = data.config;
  var students = data.students;
  var clinicalGroups = DataModel.getClinicalGroups(config);
  var simGroups = DataModel.getSimGroups(config);
  var calendar = getSimCalendar(data);
  var clinicalMap = buildClinicalToSimMap(clinicalGroups, simGroups);
  var changed = 0;
  var details = [];

  students.forEach(function (student) {
    var tallies = getStudentHostCounts(student, calendar, simGroups, config);
    if (tallies.simCount === 0) return;

    var target = pickPluralityHost(
      tallies.hostCounts,
      tallies.simCount,
      student,
      clinicalMap,
      simGroups
    );
    if (!target || student.simGroup === target) return;

    details.push({
      id: student.id,
      name: student.name,
      from: student.simGroup,
      to: target
    });
    student.simGroup = target;
    changed++;
  });

  return { changed: changed, details: details };
}

function rebalanceSimGroups(data) {
  var guestBefore = countGuestSimPlacements(data);
  var mismatchBefore = countSimGroupMismatches(data);
  var totalChanged = 0;
  var allDetails = [];
  var passes = 0;

  while (passes < MAX_SIM_REBALANCE_PASSES) {
    var guestPrior = countGuestSimPlacements(data);
    var mismatchPrior = countSimGroupMismatches(data);
    var passResult = rebalanceSimGroupsSinglePass(data);
    totalChanged += passResult.changed;
    allDetails = allDetails.concat(passResult.details);
    Scheduler.regenerateAll(data);
    passes++;
    var guestAfter = countGuestSimPlacements(data);
    var mismatchAfter = countSimGroupMismatches(data);
    if (guestAfter >= guestPrior && mismatchAfter >= mismatchPrior) break;
  }

  return {
    changed: totalChanged,
    passes: passes,
    guestBefore: guestBefore,
    guestAfter: countGuestSimPlacements(data),
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
  rebalanceSimGroups
};
