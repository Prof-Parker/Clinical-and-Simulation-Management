import { describe, it, expect } from 'vitest';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as TheoryData from '../src/core/theory-data.js';
import {
  buildMasterCalendarWeeks,
  weekDatesAreInOrder
} from '../src/ui/theory/master-calendar-layout.js';

function makeFallSemesterWithHolidays() {
  var fileRoot = DataModel.createDefaultFile();
  var sem = fileRoot.semesters[0];
  sem.calendar.semesterStartDate = '2026-08-17'; // Monday
  sem.holidays = [
    { id: 'h1', type: 'holiday', date: '2026-09-07', label: 'Labor Day' },
    { id: 'h2', type: 'holiday', date: '2026-11-11', label: 'Veterans Day' },
    { id: 'h3', type: 'break', weekIndex: 14, label: 'Thanksgiving Break' }
  ];
  CalendarEngine.rebuildWeeks(sem);
  DataModel.migrateSemester(sem);
  return sem;
}

describe('theory holiday date placement', () => {
  it('creating a semester with holidays places synced days on correct calendar dates', () => {
    var sem = makeFallSemesterWithHolidays();

    var labor = TheoryData.findDay(sem.theory, '2026-09-07');
    expect(labor).toBeTruthy();
    expect(labor.weekday).toBe('Mon');
    expect(labor.weekLabel).toBe(CalendarEngine.getWeekIndexForDate(sem, '2026-09-07') + 1);
    expect(labor.events.some(function (e) {
      return e.track === 'holiday' && e.title === 'Labor Day' &&
        e.categories && e.categories.indexOf('synced_holiday') >= 0;
    })).toBe(true);

    var veterans = TheoryData.findDay(sem.theory, '2026-11-11');
    expect(veterans).toBeTruthy();
    expect(veterans.weekday).toBe('Wed');
    expect(veterans.weekLabel).toBe(CalendarEngine.getWeekIndexForDate(sem, '2026-11-11') + 1);
    expect(veterans.events.some(function (e) {
      return e.track === 'holiday' && e.title === 'Veterans Day';
    })).toBe(true);

    // Thanksgiving break week covers all 7 Sun–Sat dates for weekIndex 14.
    var thanksgivingWeek = sem.calendar.weeks[14];
    expect(thanksgivingWeek).toBeTruthy();
    var breakDays = (sem.theory.days || []).filter(function (d) {
      return (d.events || []).some(function (e) {
        return e.title === 'Thanksgiving Break' &&
          e.categories && e.categories.indexOf('synced_holiday') >= 0;
      });
    });
    expect(breakDays.length).toBe(7);
    breakDays.forEach(function (d) {
      expect(d.date >= thanksgivingWeek.startDate).toBe(true);
      expect(d.date <= thanksgivingWeek.endDate).toBe(true);
      expect(d.weekLabel).toBe(15);
    });
  });

  it('reindexTheoryDays repairs stale weekLabel after calendar rebuild', () => {
    var sem = makeFallSemesterWithHolidays();
    var veterans = TheoryData.findDay(sem.theory, '2026-11-11');
    var correctLabel = veterans.weekLabel;
    expect(correctLabel).toBeGreaterThan(1);

    veterans.weekLabel = 1;
    veterans.weekIndex = 0;
    veterans.weekday = 'Sun';

    var changed = TheoryData.reindexTheoryDays(sem);
    expect(changed).toBeGreaterThan(0);
    expect(veterans.weekLabel).toBe(correctLabel);
    expect(veterans.weekIndex).toBe(correctLabel - 1);
    expect(veterans.weekday).toBe('Wed');
  });

  it('resync / ensureDay repairs stale metadata without leaving Nov dates in week 1', () => {
    var sem = makeFallSemesterWithHolidays();
    var veterans = TheoryData.findDay(sem.theory, '2026-11-11');
    veterans.weekLabel = 1;
    veterans.weekIndex = 0;

    TheoryData.syncHolidaysFromSemester(sem);
    veterans = TheoryData.findDay(sem.theory, '2026-11-11');
    expect(veterans.weekLabel).toBe(CalendarEngine.getWeekIndexForDate(sem, '2026-11-11') + 1);

    var weeks = buildMasterCalendarWeeks(sem);
    var week1Mon = weeks[0].days.find(function (d) { return d.wd === 'Mon'; });
    expect(week1Mon.date).not.toBe('2026-11-11');
    expect(week1Mon.events.some(function (e) { return e.title === 'Veterans Day'; })).toBe(false);

    var targetWeek = weeks[veterans.weekLabel - 1];
    var wed = targetWeek.days.find(function (d) { return d.wd === 'Wed'; });
    expect(wed.date).toBe('2026-11-11');
    expect(wed.events.some(function (e) { return e.title === 'Veterans Day'; })).toBe(true);
  });

  it('master calendar weeks use calendar dates and stay in chronological order', () => {
    var sem = makeFallSemesterWithHolidays();
    // Corrupt day placement metadata — layout must ignore weekLabel and use calendar dates.
    (sem.theory.days || []).forEach(function (day) {
      day.weekLabel = 1;
      day.weekIndex = 0;
    });

    var weeks = buildMasterCalendarWeeks(sem);
    expect(weeks.length).toBe(18);
    weeks.forEach(function (week) {
      expect(weekDatesAreInOrder(week)).toBe(true);
    });

    var week1Dates = weeks[0].days.map(function (d) { return d.date; }).filter(Boolean);
    expect(week1Dates[0]).toBe('2026-08-17');
    expect(week1Dates.every(function (d) { return d.indexOf('2026-08-') === 0; })).toBe(true);

    var veteransCell = null;
    weeks.forEach(function (week) {
      week.days.forEach(function (cell) {
        if (cell.date === '2026-11-11') veteransCell = cell;
      });
    });
    expect(veteransCell).toBeTruthy();
    expect(veteransCell.wd).toBe('Wed');
    expect(veteransCell.events.some(function (e) { return e.title === 'Veterans Day'; })).toBe(true);
  });

  it('rebuildWeeks reindexes theory days when the semester start moves', () => {
    var sem = makeFallSemesterWithHolidays();
    var before = TheoryData.findDay(sem.theory, '2026-11-11').weekLabel;

    sem.calendar.semesterStartDate = '2026-08-10'; // earlier Monday
    CalendarEngine.rebuildWeeks(sem);

    var after = TheoryData.findDay(sem.theory, '2026-11-11');
    expect(after.weekLabel).toBe(CalendarEngine.getWeekIndexForDate(sem, '2026-11-11') + 1);
    expect(after.weekLabel).not.toBe(before);
  });
});
