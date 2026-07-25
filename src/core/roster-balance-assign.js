/**
 * Clinical/sim group assignment and cohort mapping.
 */

import * as DataModel from './data-model/index.js';

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

export {
  buildClinicalToSimMap,
  buildStrictClinicalToSimMap,
  shouldForceClinicalSimAlignment,
  simGroupForClinicalCohort,
  assignClinicalGroups,
  assignSimGroupsByClinicalCohort,
  rebalanceClinicalGroups,
  rebalance
};