/* eslint-disable no-console */
'use strict';

var harness = require('./_harness');
harness.loadCore();
harness.load('js/validator.js');
harness.load('js/feasibility.js');
harness.load('js/schedule-status.js');

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

function makeDefaultSemester() {
  var fileRoot = App.DataModel.createDefaultFile();
  var sem = fileRoot.semesters[0];
  App.CalendarEngine.rebuildWeeks(sem);
  App.Scheduler.regenerateAll(sem);
  return sem;
}

var defaultSem = makeDefaultSemester();
var defaultSummary = App.ScheduleStatus.summarize(defaultSem);

assert(defaultSummary.generated, 'default semester has generated schedules');
assert(defaultSummary.tier === 'yellow', 'default 30-student regen is yellow (got ' + defaultSummary.tier + ')');
assert(defaultSummary.incompleteCount === 0, 'all default students meet requirements');
assert(defaultSummary.adjustments.makeupClinicalCount > 0, 'default has makeup clinical adjustments');
assert(defaultSummary.notes.some(function (n) {
  return n.indexOf('overlaps a simulation day') >= 0;
}), 'overlap appears as informational note, not blocking failure');
assert(defaultSummary.blockingIssues.length === 0, 'default has no blocking issues after generation');

var redSem = App.DataModel.createDefaultFile().semesters[0];
App.CalendarEngine.rebuildWeeks(redSem);
App.Scheduler.regenerateAll(redSem);
redSem.students[0].schedule.forEach(function (cell) {
  if (cell.sim) {
    cell.sim = null;
    cell.simDay = null;
    cell.simGuestGroup = null;
    cell.simOverload = false;
    cell.simMakeup = false;
  }
});
var redSummary = App.ScheduleStatus.summarize(redSem);
assert(redSummary.tier === 'red', 'student missing sim is red');
assert(redSummary.incompleteCount > 0, 'incomplete count reported');

var greenSem = {
  id: 'sem_green',
  meta: { semesterSeason: 'spring', semesterYear: 2026, semesterName: 'Spring 2026' },
  config: App.DataModel.defaultConfig(),
  calendar: { semesterStartDate: '2026-01-01', weeks: [] },
  holidays: [],
  facilities: App.DataModel.defaultFacilities(),
  faculty: [],
  sections: [{ id: 'sec1', name: 'A' }],
  students: [
    App.DataModel.createStudent('Student 1', 'C1', 'SG1', 'fac0', 'A')
  ]
};
greenSem.config.clinicalGroups = ['C1'];
greenSem.config.clinicalGroupDays = { C1: 'Sat' };
greenSem.config.simGroups = ['SG1'];
greenSem.config.maxStudents = 1;
greenSem.config.clinicalDaysRequired = 3;
greenSem.config.simDaysRequired = 2;
greenSem.students[0].clinicalGroup = 'C1';
greenSem.students[0].simGroup = 'SG1';
App.CalendarEngine.rebuildWeeks(greenSem);
App.Scheduler.regenerateAll(greenSem);
var greenSummary = App.ScheduleStatus.summarize(greenSem);
assert(greenSummary.tier === 'green', 'small non-overlap roster is green (got ' + greenSummary.tier + ')');
assert(greenSummary.incompleteCount === 0, 'green roster complete');

var blocking = App.Feasibility.checkBlocking(defaultSem);
assert(blocking.ok, 'checkBlocking ok for successful default generation');
var info = App.Feasibility.checkInformational(defaultSem);
assert(info.issues.some(function (i) { return i.id === 'day_overlap_risk'; }), 'overlap is informational');

console.log('\nSchedule status tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
