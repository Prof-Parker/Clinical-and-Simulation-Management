/* eslint-disable no-console */
'use strict';

var harness = require('./_harness');
harness.load('js/data-model.js');
harness.load('js/roster-balance.js');

var App = harness.App;
var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error('FAIL: ' + message);
    return;
  }
  passed++;
}

function makeGroupNames(prefix, count) {
  var names = [];
  for (var i = 1; i <= count; i++) names.push(prefix + i);
  return names;
}

function makeStudents(total) {
  var students = [];
  for (var i = 0; i < total; i++) {
    students.push(App.DataModel.createStudent('Student ' + (i + 1), 'C1', 'SG1', 'fac1', ''));
  }
  return students;
}

function makeConfig(numClinical, numSim) {
  var cfg = App.DataModel.defaultConfig();
  cfg.maxStudents = 30;
  cfg.maxPerClinicalGroup = Math.ceil(30 / numClinical);
  cfg.clinicalGroups = makeGroupNames('C', numClinical);
  cfg.clinicalGroupDays = {};
  cfg.clinicalGroups.forEach(function (g, i) {
    cfg.clinicalGroupDays[g] = App.DataModel.WEEKDAY_OPTIONS[i % 7];
  });
  cfg.simGroups = makeGroupNames('SG', numSim);
  return App.DataModel.normalizeConfig(cfg);
}

function clinicalCounts(students, clinicalGroups) {
  var counts = {};
  clinicalGroups.forEach(function (g) { counts[g] = 0; });
  students.forEach(function (s) {
    if (counts[s.clinicalGroup] !== undefined) counts[s.clinicalGroup]++;
  });
  return counts;
}

function assertClinicalBalance(students, clinicalGroups, maxPer, label) {
  var counts = clinicalCounts(students, clinicalGroups);
  var vals = clinicalGroups.map(function (g) { return counts[g]; });
  var total = vals.reduce(function (a, b) { return a + b; }, 0);
  assert(total === 30, label + ': total students is 30 (got ' + total + ')');
  assert(
    Math.max.apply(null, vals) - Math.min.apply(null, vals) <= 1,
    label + ': clinical groups differ by at most 1 (' + JSON.stringify(counts) + ')'
  );
  clinicalGroups.forEach(function (g) {
    assert(counts[g] <= maxPer, label + ': ' + g + ' within maxPer (' + counts[g] + ')');
  });
}

function assertSimCohortConsistency(students, clinicalGroups, label) {
  clinicalGroups.forEach(function (g) {
    var cohort = students.filter(function (s) { return s.clinicalGroup === g; });
    if (!cohort.length) return;
    var simGroups = {};
    cohort.forEach(function (s) { simGroups[s.simGroup] = true; });
    var unique = Object.keys(simGroups);
    assert(
      unique.length === 1,
      label + ': ' + g + ' uses one sim group (got ' + unique.join(', ') + ' for ' + cohort.length + ' students)'
    );
  });
}

function assertMatchesMap(students, config, label) {
  var map = App.RosterBalance.buildClinicalToSimMap(
    App.DataModel.getClinicalGroups(config),
    App.DataModel.getSimGroups(config)
  );
  students.forEach(function (s) {
    assert(
      s.simGroup === map[s.clinicalGroup],
      label + ': ' + s.name + ' in ' + s.clinicalGroup + ' should be ' + map[s.clinicalGroup] + ' (got ' + s.simGroup + ')'
    );
  });
}

var sizes = [3, 4, 5, 6];
sizes.forEach(function (numClinical) {
  sizes.forEach(function (numSim) {
    var label = numClinical + ' clinical / ' + numSim + ' sim';
    var config = makeConfig(numClinical, numSim);
    var students = makeStudents(30);
    App.RosterBalance.rebalance(students, config);
    assertClinicalBalance(students, config.clinicalGroups, config.maxPerClinicalGroup, label);
    assertSimCohortConsistency(students, config.clinicalGroups, label);
    assertMatchesMap(students, config, label);
  });
});

(function testStandardFiveGroups() {
  var label = '5 clinical / 4 sim (standard max 6)';
  var config = makeConfig(5, 4);
  config.maxPerClinicalGroup = 6;
  config = App.DataModel.normalizeConfig(config);
  var students = makeStudents(30);
  App.RosterBalance.rebalance(students, config);
  assertClinicalBalance(students, config.clinicalGroups, 6, label);
  assertSimCohortConsistency(students, config.clinicalGroups, label);
  assertMatchesMap(students, config, label);
  var map = App.RosterBalance.buildClinicalToSimMap(config.clinicalGroups, config.simGroups);
  assert(map.C1 === map.C5, label + ': overflow clinical group shares sim with C1');
})();

console.log('\nRoster balance tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
