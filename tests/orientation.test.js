/* eslint-disable no-console */
'use strict';

var harness = require('./_harness');
harness.loadCore();
harness.load('js/orientation.js');

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

function makeSemesterWithOrient() {
  var fileRoot = App.DataModel.createDefaultFile();
  var sem = fileRoot.semesters[0];
  App.CalendarEngine.rebuildWeeks(sem);
  var srmc = sem.facilities.find(function (f) {
    return f.name.indexOf('Shasta') >= 0;
  });
  var se = sem.facilities.find(function (f) {
    return f.name.indexOf('Elizabeth') >= 0;
  });
  var week2Date = sem.calendar.weeks[1] && sem.calendar.weeks[1].startDate;
  sem.orientations = [
    { id: 'o1', clinicalGroup: 'C1', date: week2Date, facilityId: srmc.id },
    { id: 'o2', clinicalGroup: 'C2', date: week2Date, facilityId: se.id }
  ];
  return sem;
}

var sem = makeSemesterWithOrient();
var srmc = sem.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
var se = sem.facilities.find(function (f) { return f.name.indexOf('Elizabeth') >= 0; });

assert(App.Orientation.facilityInitials(sem, srmc.id) === 'SRMC', 'SRMC initials');
assert(App.Orientation.facilityInitials(sem, se.id) === 'SE', 'SE initials');
assert(App.Orientation.facilityInitials(sem, 'unknown') === 'OR', 'unknown facility fallback');

var c1Student = sem.students.find(function (s) { return s.clinicalGroup === 'C1'; });
assert(c1Student, 'C1 student exists');
assert(App.Orientation.getEffectiveOrientationWeekIndex(sem, c1Student) === 1, 'C1 orient maps to week 2');
assert(App.Orientation.isOrientationWeek(sem, c1Student, 1), 'week 2 is orientation for C1');
assert(!App.Orientation.isOrientationWeek(sem, c1Student, 0), 'week 1 is not orientation for C1');
assert(App.Orientation.getOrientationLabel(sem, c1Student) === 'Orient SRMC', 'C1 orient label');

c1Student.orientationWeekIndex = 3;
assert(App.Orientation.getEffectiveOrientationWeekIndex(sem, c1Student) === 3, 'student override week');
assert(App.Orientation.isOrientationWeek(sem, c1Student, 3), 'override week is orientation');
assert(!App.Orientation.isOrientationWeek(sem, c1Student, 1), 'group week no longer orient after override');

c1Student.orientationWeekIndex = 1;
assert(!App.Orientation.weekHasOrientationConflict(sem, c1Student, 1), 'orient-only week has no conflict');

App.Scheduler.regenerateAll(sem);
c1Student = sem.students.find(function (s) { return s.clinicalGroup === 'C1'; });
var orientWeek = App.Orientation.getEffectiveOrientationWeekIndex(sem, c1Student);
if (orientWeek >= 0 && c1Student.schedule[orientWeek]) {
  c1Student.schedule[orientWeek].clinical = true;
  assert(App.Orientation.weekHasOrientationConflict(sem, c1Student, orientWeek), 'orient + clinical is conflict');
  var conflicts = App.Orientation.findOrientationConflicts(sem);
  assert(conflicts.some(function (c) { return c.studentId === c1Student.id; }), 'conflict listed for student');
  assert(conflicts[0].message.indexOf('reassign in Master Schedule') >= 0, 'conflict message prompts reassignment');
} else {
  console.error('SKIP: could not set up orient week conflict (orientWeek=' + orientWeek + ')');
}

console.log('\nOrientation tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
