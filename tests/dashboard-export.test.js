/* eslint-disable no-console */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  DataModel,
  CalendarEngine,
  Scheduler,
  Validator,
  DashboardExport,
  Orientation
} from './_harness.js';

describe('dashboard-export.test.js', () => {
  it('runs assertions', () => {
    let failed = 0;

    function assert(condition, message) {
      if (!condition) {
        failed++;
        console.error('FAIL: ' + message);
        return;
      }
    }

    function makeDefaultSemester() {
      var fileRoot = DataModel.createDefaultFile();
      var sem = fileRoot.semesters[0];
      CalendarEngine.rebuildWeeks(sem);
      Scheduler.regenerateAll(sem);
      return sem;
    }

    var data = makeDefaultSemester();
    var validation = Validator.validateAll(data);
    var students = data.students.slice();
    var filterSummary = 'Filters: none (all students)';

    assert(DashboardExport.DISCLAIMER.indexOf('For reference only') >= 0, 'disclaimer text present');

    var master = DashboardExport.buildMasterScheduleSheet(data, students, validation, filterSummary);
    assert(master[0][0] === DashboardExport.DISCLAIMER, 'master sheet row 0 is disclaimer');
    assert(master[3][0] === 'Name', 'master sheet row 3 is header');
    assert(master[3][4].indexOf('<') < 0, 'master week header is plain text (got ' + master[3][4] + ')');
    assert(master[3].length === 23, 'master header has 23 columns (Name, Grp, 18 weeks, 3 stats)');

    var expectedBodyRows = students.length;
    var simDays = DataModel.getSimDays(data.config);
    var expectedFooterRows = simDays.length + 1;
    var expectedTotalRows = 3 + 1 + expectedBodyRows + expectedFooterRows;
    assert(master.length === expectedTotalRows, 'master row count matches students + footer (got ' + master.length + ')');

    var simSheet = DashboardExport.buildSimProgressionSheet(data, students, filterSummary);
    assert(simSheet[0][0] === DashboardExport.DISCLAIMER, 'sim sheet row 0 is disclaimer');
    assert(simSheet[3][0] === 'Student', 'sim sheet header');
    assert(simSheet.length === 3 + 1 + students.length, 'sim sheet row count');

    var student1 = students[0];
    var sim1Cell = simSheet[4][3];
    assert(sim1Cell.indexOf('Wk ') >= 0 && sim1Cell.indexOf('Mon') >= 0, 'sim 1 cell has week and day (got ' + sim1Cell + ')');

    var emptyText = DashboardExport.cellToExportText(
      DataModel.emptyCell(), student1, data, 0
    );
    assert(emptyText === '-', 'empty cell exports as dash');

    var wiWithSim = -1;
    student1.schedule.forEach(function (cell, wi) {
      if (cell.sim && wiWithSim < 0) wiWithSim = wi;
    });
    if (wiWithSim >= 0) {
      var simText = DashboardExport.cellToExportText(
        student1.schedule[wiWithSim], student1, data, wiWithSim
      );
      assert(simText.indexOf('SIM') >= 0, 'sim cell contains SIM label');
    }

    var fname = DashboardExport.exportFilename(data);
    assert(fname.endsWith('-schedule-export.xlsx'), 'filename ends with -schedule-export.xlsx (got ' + fname + ')');

    var orientWeekDate = data.calendar.weeks[2] && data.calendar.weeks[2].startDate;
    var srmc = data.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
    data.orientations = [{
      id: 'o1',
      clinicalGroup: student1.clinicalGroup,
      date: orientWeekDate,
      facilityId: srmc.id
    }];
    var ow = Orientation.getEffectiveOrientationWeekIndex(data, student1);
    var orientText = DashboardExport.cellToExportText(
      student1.schedule[ow], student1, data, ow
    );
    assert(orientText.indexOf('Orient SRMC') >= 0, 'export includes Orient SRMC (got ' + orientText + ')');

    expect(failed).toBe(0);
  });
});
