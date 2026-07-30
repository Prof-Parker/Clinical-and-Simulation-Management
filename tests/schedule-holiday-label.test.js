import { describe, it, expect } from 'vitest';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as ScheduleHolidayLabel from '../src/core/schedule-holiday-label.js';

describe('schedule-holiday-label', () => {
  function makeSemester(opts) {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    sem.calendar.semesterStartDate = '2026-08-16';
    if (opts.holidayBlocksFullWeek != null) {
      sem.config.holidayBlocksFullWeek = opts.holidayBlocksFullWeek;
    }
    sem.holidays = opts.holidays || [];
    CalendarEngine.rebuildWeeks(sem);
    return sem;
  }

  it('labels full-week breaks as Break', () => {
    var sem = makeSemester({
      holidays: [{ id: 'h1', date: '2026-11-22', label: 'Thanksgiving', type: 'break', weekIndex: 14 }]
    });
    var student = { clinicalGroup: 'C1', simGroup: 'SG1' };
    expect(ScheduleHolidayLabel.isBreakWeek(sem, 14)).toBe(true);
    expect(ScheduleHolidayLabel.scheduleHolidayPlainLabel(sem, student, 14, { inactive: true }))
      .toBe('Break');
  });

  it('shows Holiday (Mon) for all students when holiday blocks full week', () => {
    var sem = makeSemester({
      holidayBlocksFullWeek: true,
      holidays: [{ id: 'h1', date: '2026-11-09', label: 'Veterans Day', type: 'holiday' }]
    });
    var wi = CalendarEngine.getWeekIndexForDate(sem, '2026-11-09');
    expect(wi).toBeGreaterThanOrEqual(0);
    expect(sem.calendar.weeks[wi].holiday).toBe(true);
    expect(sem.calendar.weeks[wi].inactive).toBe(false);

    var satStudent = { clinicalGroup: 'C1', simGroup: 'SG1' }; // C1 is typically Sat
    var days = ScheduleHolidayLabel.holidayIndicatorDays(sem, satStudent, wi);
    expect(days).toEqual(['Mon']);
    expect(ScheduleHolidayLabel.formatHolidayIndicator(days)).toBe('Holiday (Mon)');
  });

  it('shows Holiday (day) only for affected students when day-only holiday', () => {
    var sem = makeSemester({
      holidayBlocksFullWeek: false,
      holidays: [{ id: 'h1', date: '2026-11-09', label: 'Veterans Day', type: 'holiday' }]
    });
    var wi = CalendarEngine.getWeekIndexForDate(sem, '2026-11-09');
    sem.config.clinicalGroupDays = Object.assign({}, sem.config.clinicalGroupDays, {
      C1: 'Sat',
      C2: 'Mon'
    });
    sem.config.simGroupDays = Object.assign({}, sem.config.simGroupDays, {
      SG1: 'Tue',
      SG2: 'Mon'
    });

    var unaffected = { clinicalGroup: 'C1', simGroup: 'SG1' };
    var clinHit = { clinicalGroup: 'C2', simGroup: 'SG1' };
    var simHit = { clinicalGroup: 'C1', simGroup: 'SG2' };

    expect(ScheduleHolidayLabel.holidayIndicatorDays(sem, unaffected, wi)).toEqual([]);
    expect(ScheduleHolidayLabel.holidayIndicatorDays(sem, clinHit, wi)).toEqual(['Mon']);
    expect(ScheduleHolidayLabel.holidayIndicatorDays(sem, simHit, wi)).toEqual(['Mon']);
  });
});
