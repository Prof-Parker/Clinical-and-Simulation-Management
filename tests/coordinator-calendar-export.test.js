import { describe, it, expect } from 'vitest';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as Scheduler from '../src/core/scheduler/index.js';
import {
  formatClockRange,
  formatClinicalClockRange,
  displayGroupLabel,
  coordinatorSheetName,
  semesterBandLabel,
  buildDayLines,
  listExportFacultyFields
} from '../src/export/coordinator-day-lines.js';
import {
  buildCoordinatorWorkbook,
  exportFilename
} from '../src/export/coordinator-calendar-xlsx.js';
import ExcelJS from 'exceljs';

function makeSemester() {
  var fileRoot = DataModel.createDefaultFile();
  var sem = fileRoot.semesters[0];
  sem.calendar.semesterStartDate = '2026-08-16';
  CalendarEngine.rebuildWeeks(sem);
  DataModel.migrateSemester(sem);
  return sem;
}

describe('coordinator-day-lines', () => {
  it('formats clock ranges and group labels', () => {
    expect(formatClockRange('0800', '1050')).toBe('0800-1050');
    expect(formatClinicalClockRange('0600', '1830')).toBe('0600 - 1830');
    expect(displayGroupLabel('C1')).toBe('G1');
    expect(displayGroupLabel('SG3')).toBe('G3');
    expect(displayGroupLabel('G2')).toBe('G2');
  });

  it('builds sheet name and band label from course codes', () => {
    expect(coordinatorSheetName({ courseCodes: ['REGN15', 'REGN15P'] })).toBe('REGN 15 15P');
    var sem = makeSemester();
    expect(semesterBandLabel(sem)).toBe('1st');
  });

  it('builds EXAMPLE-style lecture and skills stacks', () => {
    var sem = makeSemester();
    sem.theory.days = [{
      date: '2026-08-19',
      weekIndex: 0,
      weekday: 'Wed',
      weekLabel: 1,
      events: [{
        id: 'ev1',
        track: 'theory',
        title: 'Module 1A',
        timeStart: '0800',
        timeEnd: '1050',
        categories: ['lecture'],
        faculty: [{ name: 'Faculty Needed', needed: true, role: 'lecturer' }]
      }, {
        id: 'ev2',
        track: 'skills',
        title: 'Skills lab',
        timeStart: '1200',
        timeEnd: '1550',
        categories: ['skills_lab'],
        faculty: [
          { name: 'Faculty Needed', needed: true, role: 'skills' },
          { name: 'Faculty Needed', needed: true, role: 'skills' }
        ]
      }]
    }];

    var fields = listExportFacultyFields(sem);
    var overlay = {};
    fields.forEach(function (f) {
      if (f.kind === 'lecture') overlay[f.slotId] = 'Parker';
      if (f.kind === 'skills' && !overlay._sk1) {
        overlay[f.slotId] = 'Julie';
        overlay._sk1 = true;
      } else if (f.kind === 'skills') {
        overlay[f.slotId] = 'Brian';
      }
    });
    delete overlay._sk1;

    var lines = buildDayLines(sem.theory, sem, 1, 'Wed', overlay);
    expect(lines[0]).toBe('Lecture');
    expect(lines[1]).toBe('0800-1050');
    expect(lines.indexOf('Parker')).toBeGreaterThan(-1);
    expect(lines.indexOf('Clinical Classroom')).toBeGreaterThan(-1);
    expect(lines.indexOf('1200-1550')).toBeGreaterThan(-1);
    expect(lines.some(function (l) { return /^1\.\s+Julie$/.test(l); })).toBe(true);
    expect(lines.some(function (l) { return /^2\.\s+Brian$/.test(l); })).toBe(true);
  });

  it('builds holiday, clinical, and sim lines with overlay faculty', () => {
    var sem = makeSemester();
    Scheduler.regenerateAll(sem);
    sem.faculty = (sem.faculty || []).map(function (f) {
      return Object.assign({}, f, { needed: true, name: 'Faculty Needed' });
    });
    sem.theory.days = [{
      date: '2026-09-07',
      weekIndex: 3,
      weekday: 'Mon',
      weekLabel: 4,
      events: [{
        id: 'h1',
        track: 'holiday',
        title: 'HOLIDAY',
        categories: ['synced_holiday']
      }]
    }];

    var clinStudent = (sem.students || []).find(function (s) {
      return s.clinicalGroup === 'C2';
    });
    expect(clinStudent).toBeTruthy();
    var wi = 5;
    var cell = clinStudent.schedule[wi];
    expect(cell && cell.clinical).toBeTruthy();
    var clinDay = DataModel.getClinicalDayForGroup('C2', sem.config);
    expect(clinDay).toBe('Mon');

    var fields = listExportFacultyFields(sem);
    var overlay = {};
    fields.forEach(function (f) {
      if (f.kind === 'clinical' && /C2/.test(f.label)) overlay[f.slotId] = 'Imelda';
      if (f.kind === 'sim') overlay[f.slotId] = 'Robin';
    });

    var holidayLines = buildDayLines(sem.theory, sem, 4, 'Mon', overlay);
    expect(holidayLines[0]).toBe('HOLIDAY');

    var weekLabel = wi + 1;
    var clinLines = buildDayLines(sem.theory, sem, weekLabel, clinDay, overlay);
    expect(clinLines.some(function (l) { return /Clinical$/.test(l); })).toBe(true);
    expect(clinLines.some(function (l) { return /G2 Imelda/.test(l); })).toBe(true);
  });

  it('lists export faculty fields for open slots only', () => {
    var sem = makeSemester();
    sem.faculty = (sem.faculty || []).map(function (f, i) {
      if (i === 0) {
        return Object.assign({}, f, { needed: true, name: 'Faculty Needed' });
      }
      return Object.assign({}, f, { needed: false, name: 'Assigned Person' });
    });
    var fields = listExportFacultyFields(sem);
    expect(fields.some(function (f) { return f.kind === 'clinical'; })).toBe(true);
    expect(fields.every(function (f) { return f.slotId && f.label; })).toBe(true);
  });
});

describe('coordinator-calendar-xlsx', () => {
  it('builds workbook with 18 weeks, totals column, and target footer', async () => {
    var sem = makeSemester();
    Scheduler.regenerateAll(sem);
    sem.theory.days = [{
      date: '2026-08-19',
      weekIndex: 0,
      weekday: 'Wed',
      weekLabel: 1,
      events: [{
        id: 'ev1',
        track: 'theory',
        timeStart: '0800',
        timeEnd: '1050',
        categories: ['lecture'],
        faculty: [{ name: 'Faculty Needed', needed: true }]
      }]
    }];
    sem.theory.settings = sem.theory.settings || {};
    sem.theory.settings.courseHourTargets = [
      { courseCode: 'REGN15', contactHoursTarget: 54 },
      { courseCode: 'REGN15P', contactHoursTarget: 162 }
    ];

    expect(exportFilename(sem)).toMatch(/-coordinator-calendar\.xlsx$/);

    var wb = await buildCoordinatorWorkbook(sem, {});
    expect(wb).toBeTruthy();
    var ws = wb.getWorksheet('REGN 15 15P');
    expect(ws).toBeTruthy();
    expect(ws.getCell(1, 2).value).toBe('Sunday');
    expect(ws.getCell(1, 9).value).toBe('Weekly totals');

    var weekHeaders = 0;
    var foundTotals = false;
    var foundTarget = false;
    ws.eachRow(function (row) {
      var a = row.getCell(1).value;
      if (a && String(a).indexOf('Week ') === 0) weekHeaders += 1;
      var i = row.getCell(9).value;
      if (i && String(i).indexOf('Lecture:') === 0) foundTotals = true;
      if (a && String(a) === 'Target vs scheduled') foundTarget = true;
    });
    expect(weekHeaders).toBe(18);
    expect(foundTotals).toBe(true);
    expect(foundTarget).toBe(true);

    var buf = await wb.xlsx.writeBuffer();
    expect(buf.byteLength).toBeGreaterThan(1000);

    var roundTrip = new ExcelJS.Workbook();
    await roundTrip.xlsx.load(buf);
    expect(roundTrip.getWorksheet('REGN 15 15P')).toBeTruthy();
  });
});
