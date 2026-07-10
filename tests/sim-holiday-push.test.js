import { describe, it, expect } from 'vitest';
import {
  DataModel,
  CalendarEngine,
  Scheduler,
  RosterBalance
} from './_harness.js';

var F2026_HOLIDAYS = [
  { id: 'h_labor', date: '2026-09-07', label: 'Labor Day', type: 'mondayHoliday' },
  { id: 'h_veterans', date: '2026-11-09', label: 'Veterans Day', type: 'mondayHoliday' },
  { id: 'h_thanks', date: '2026-11-22', label: 'Thanksgiving', type: 'break', weekIndex: 14 }
];

function makeFacilities(count) {
  var list = [];
  for (var i = 0; i < count; i++) {
    list.push({ id: 'fac' + i, name: 'Facility ' + (i + 1) });
  }
  return list;
}

function makeStudents(total, clinicalGroup, simGroup) {
  var students = [];
  for (var i = 0; i < total; i++) {
    students.push(DataModel.createStudent(
      'Student ' + (i + 1),
      clinicalGroup || 'C1',
      simGroup || 'SG1',
      'fac0',
      ''
    ));
  }
  return students;
}

function makeSemester(opts) {
  opts = opts || {};
  var config = DataModel.normalizeConfig(opts.config || DataModel.defaultConfig());
  config.simStartWeek = opts.simStartWeek != null ? opts.simStartWeek : 5;
  if (opts.clinicalGroupDays) {
    config.clinicalGroupDays = opts.clinicalGroupDays;
  }
  var facilities = makeFacilities(5);
  var students = opts.students || makeStudents(30, opts.clinicalGroup, opts.simGroup);
  var sem = {
    config: config,
    students: students,
    facilities: facilities,
    faculty: [],
    sections: [],
    holidays: opts.holidays || [],
    calendar: { semesterStartDate: opts.startDate || '2026-08-16', weeks: [] },
    meta: {}
  };
  if (opts.clinicalGroup && opts.simGroup) {
    RosterBalance.assignSimGroupsByClinicalCohort(
      students,
      config.clinicalGroups,
      config.simGroups,
      { force: true }
    );
  } else {
    RosterBalance.rebalance(students, config);
  }
  students.forEach(function (s) {
    var gi = config.clinicalGroups.indexOf(s.clinicalGroup);
    s.facilityId = facilities[gi % facilities.length].id;
  });
  CalendarEngine.rebuildWeeks(sem);
  if (opts.regenerate !== false) {
    Scheduler.regenerateAll(sem);
  }
  return sem;
}

function findSimWeek(student, simNum) {
  for (var w = 0; w < 18; w++) {
    if (student.schedule[w] && student.schedule[w].sim === simNum) return w;
  }
  return -1;
}

function collectSimDays(sem) {
  var days = new Set();
  sem.students.forEach(function (s) {
    s.schedule.forEach(function (cell) {
      if (cell && cell.sim && cell.simDay) days.add(cell.simDay);
    });
  });
  return days;
}

describe('sim holiday week-push cascade', () => {
  it('F2026 calendar: Sim 5 even→week 14, odd→week 16', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      regenerate: false,
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      }
    });
    var cal = Scheduler.buildProgramSimCalendar(sem, sem.config);
    var block5 = cal.blocks[4];
    expect(block5.evenWeekIndex).toBe(13);
    expect(block5.oddWeekIndex).toBe(15);
    expect(block5.nominalEvenWeekIndex).toBe(12);
    expect(block5.nominalOddWeekIndex).toBe(13);
    expect(CalendarEngine.isWeekInactive(sem, 12)).toBe(true);
    expect(CalendarEngine.isWeekInactive(sem, 14)).toBe(true);
  });

  it('F2026: even-pattern SG1 places Sim 5 on week 14 only', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      clinicalGroup: 'C1',
      simGroup: 'SG1',
      students: makeStudents(6, 'C1', 'SG1'),
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      }
    });
    sem.students.forEach(function (s) {
      expect(s.simGroup).toBe('SG1');
      expect(findSimWeek(s, 5)).toBe(13);
      expect(['Mon', 'Tue']).toContain(s.schedule[13].simDay);
    });
    expect(Scheduler.getDaySimAttendanceCount(sem, 12, 'Mon')).toBe(0);
    expect(Scheduler.getDaySimAttendanceCount(sem, 14, 'Mon')).toBe(0);
  });

  it('F2026: odd-pattern SG3 places Sim 5 on week 16 only', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      clinicalGroup: 'C3',
      simGroup: 'SG3',
      students: makeStudents(6, 'C3', 'SG3'),
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      }
    });
    sem.students.forEach(function (s) {
      expect(s.simGroup).toBe('SG3');
      expect(findSimWeek(s, 5)).toBe(15);
    });
  });

  it('F2026: no simDay outside configured simDays after regenerate', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      }
    });
    var allowed = new Set(DataModel.getSimDays(sem.config));
    var used = collectSimDays(sem);
    used.forEach(function (day) {
      expect(allowed.has(day)).toBe(true);
    });
    expect(used.has('Sat')).toBe(false);
  });

  it('no holidays: effective weeks equal nominal', () => {
    var sem = makeSemester({ holidays: [], regenerate: false });
    var patterns = Scheduler.getSimWeekPatterns(sem.config);
    var cal = Scheduler.buildProgramSimCalendar(sem, sem.config);
    for (var i = 0; i < 5; i++) {
      expect(cal.blocks[i].evenWeekIndex).toBe(patterns.evenWeeks[i]);
      expect(cal.blocks[i].oddWeekIndex).toBe(patterns.oddWeeks[i]);
    }
  });

  it('Labor Day only: Sim 1 even pushes to week 7, odd stays week 6', () => {
    var sem = makeSemester({
      holidays: [{ id: 'h_w5', label: 'Week 5 break', type: 'break', weekIndex: 4 }],
      regenerate: false
    });
    expect(CalendarEngine.isWeekInactive(sem, 4)).toBe(true);
    var resolved = Scheduler.resolveSimBlockWeeks(
      sem,
      Scheduler.getSimWeekPatterns(sem.config).evenWeeks,
      Scheduler.getSimWeekPatterns(sem.config).oddWeeks,
      0
    );
    expect(resolved.nominalEvenWeekIndex).toBe(4);
    expect(resolved.evenWeekIndex).toBe(6);
    expect(resolved.oddWeekIndex).toBe(5);
  });
});
