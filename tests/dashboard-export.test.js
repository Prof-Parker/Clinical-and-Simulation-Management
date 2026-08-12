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
import {
  prototypeLayoutMeta,
  dayCellSpec,
  TITLE
} from '../src/export/dashboard-export-prototype.js';
import ExcelJS from 'exceljs';

describe('dashboard-export.test.js', () => {
  it('runs assertions', async () => {
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

    // Prototype-style primary sheet
    var layout = prototypeLayoutMeta(data, students);
    assert(layout.weekdays.length >= 2, 'prototype weekdays collected (got ' + layout.weekdays.join(',') + ')');
    assert(layout.weekdays.indexOf('Sat') >= 0, 'default semester includes Sat clinical day');
    assert(layout.dayColCount === layout.weekdays.length * 18, 'day columns = weekdays × 18');

    if (wiWithSim >= 0) {
      var simDay = student1.schedule[wiWithSim].simDay || 'Mon';
      var simNum = student1.schedule[wiWithSim].sim;
      var simSpec = dayCellSpec(data, student1, wiWithSim, simDay);
      assert(
        simSpec.text.indexOf('SIM ' + simNum) >= 0,
        'prototype sim day cell includes sim number (got ' + simSpec.text + ')'
      );
    }

    var inactive = DataModel.emptyCell();
    inactive.inactive = true;
    var saved = student1.schedule[0];
    student1.schedule[0] = inactive;
    var graySpec = dayCellSpec(data, student1, 0, layout.weekdays[0]);
    student1.schedule[0] = saved;
    assert(graySpec.gray === true && graySpec.text === '', 'inactive day cells are gray/empty');

    var wb = await DashboardExport.buildWorkbook(data, students, validation, filterSummary);
    assert(wb.worksheets[0].name === 'Schedule', 'primary sheet is Schedule');
    assert(!!wb.getWorksheet('Master Schedule'), 'legacy Master Schedule retained');
    assert(!!wb.getWorksheet('Sim Progression'), 'Sim Progression retained');

    var proto = wb.getWorksheet('Schedule');
    assert(proto.getCell(2, 1).value === TITLE, 'prototype title row');
    assert(proto.getCell(5, 1).value === 'Registration Section Number', 'prototype identity header');
    assert(proto.getCell(3, layout.totalsCol).value === 'HOSPITALS', 'hospitals total header');
    assert(proto.getCell(3, layout.totalsCol + 1).value === 'SIM', 'sim total header');
    assert(proto.getCell(3, layout.totalsCol + 2).value == null, 'Vet-R column removed');

    var firstStudentRow = 6;
    var g1Font = proto.getCell(firstStudentRow, 3).font;
    assert(
      g1Font && g1Font.color && /507A2D/i.test(String(g1Font.color.argb || '')),
      'group 1 row text uses 507A2D'
    );
    var g1DayFont = proto.getCell(firstStudentRow, layout.firstDayCol).font;
    assert(
      g1DayFont && g1DayFont.color && /507A2D/i.test(String(g1DayFont.color.argb || '')),
      'group 1 day cells also use 507A2D text color'
    );

    var buf = await wb.xlsx.writeBuffer();
    assert(buf && buf.byteLength > 1000, 'excel buffer written');

    var wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf);
    var reloaded = wb2.getWorksheet('Schedule');
    assert(!!reloaded, 'reloaded Schedule sheet');
    var titleFill = reloaded.getCell(2, 1).fill;
    assert(
      titleFill && titleFill.fgColor && /D0D0D0/i.test(String(titleFill.fgColor.argb || '')),
      'title has gray fill'
    );

    expect(failed).toBe(0);
  });
});
