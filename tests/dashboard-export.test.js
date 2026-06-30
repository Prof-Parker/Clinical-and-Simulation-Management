/* eslint-disable no-console */
'use strict';

var harness = require('./_harness');
harness.loadCore();
harness.load('js/makeup-display.js');
harness.load('js/dashboard-export.js');

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

var data = makeDefaultSemester();
var validation = App.Validator.validateAll(data);
var students = data.students.slice();
var filterSummary = 'Filters: none (all students)';

assert(App.DashboardExport.DISCLAIMER.indexOf('For reference only') >= 0, 'disclaimer text present');

var master = App.DashboardExport.buildMasterScheduleSheet(data, students, validation, filterSummary);
assert(master[0][0] === App.DashboardExport.DISCLAIMER, 'master sheet row 0 is disclaimer');
assert(master[3][0] === 'Name', 'master sheet row 3 is header');
assert(master[3][4].indexOf('<') < 0, 'master week header is plain text (got ' + master[3][4] + ')');
assert(master[3].length === 23, 'master header has 23 columns (Name, Grp, 18 weeks, 3 stats)');

var expectedBodyRows = students.length;
var simDays = App.DataModel.getSimDays(data.config);
var expectedFooterRows = simDays.length + 1;
var expectedTotalRows = 3 + 1 + expectedBodyRows + expectedFooterRows;
assert(master.length === expectedTotalRows, 'master row count matches students + footer (got ' + master.length + ')');

var simSheet = App.DashboardExport.buildSimProgressionSheet(data, students, filterSummary);
assert(simSheet[0][0] === App.DashboardExport.DISCLAIMER, 'sim sheet row 0 is disclaimer');
assert(simSheet[3][0] === 'Student', 'sim sheet header');
assert(simSheet.length === 3 + 1 + students.length, 'sim sheet row count');

var student1 = students[0];
var sim1Cell = simSheet[4][3];
assert(sim1Cell.indexOf('Wk ') >= 0 && sim1Cell.indexOf('Mon') >= 0, 'sim 1 cell has week and day (got ' + sim1Cell + ')');

var emptyText = App.DashboardExport.cellToExportText(
  App.DataModel.emptyCell(), student1, data, 0
);
assert(emptyText === '-', 'empty cell exports as dash');

var wiWithSim = -1;
student1.schedule.forEach(function (cell, wi) {
  if (cell.sim && wiWithSim < 0) wiWithSim = wi;
});
if (wiWithSim >= 0) {
  var simText = App.DashboardExport.cellToExportText(
    student1.schedule[wiWithSim], student1, data, wiWithSim
  );
  assert(simText.indexOf('SIM') >= 0, 'sim cell contains SIM label');
}

var fname = App.DashboardExport.exportFilename(data);
assert(fname.endsWith('-schedule-export.xlsx'), 'filename ends with -schedule-export.xlsx (got ' + fname + ')');

harness.load('js/orientation.js');
var orientWeekDate = data.calendar.weeks[2] && data.calendar.weeks[2].startDate;
var srmc = data.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
data.orientations = [{
  id: 'o1',
  clinicalGroup: student1.clinicalGroup,
  date: orientWeekDate,
  facilityId: srmc.id
}];
var ow = App.Orientation.getEffectiveOrientationWeekIndex(data, student1);
var orientText = App.DashboardExport.cellToExportText(
  student1.schedule[ow], student1, data, ow
);
assert(orientText.indexOf('Orient SRMC') >= 0, 'export includes Orient SRMC (got ' + orientText + ')');

console.log('\nDashboard export tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
