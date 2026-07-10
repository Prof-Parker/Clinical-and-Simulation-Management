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

function makeSemester(opts) {
  opts = opts || {};
  var config = DataModel.normalizeConfig(opts.config || DataModel.defaultConfig());
  config.simStartWeek = opts.simStartWeek != null ? opts.simStartWeek : 5;
  if (opts.clinicalGroupDays) {
    config.clinicalGroupDays = opts.clinicalGroupDays;
  }
  var facilities = [];
  for (var i = 0; i < 5; i++) {
    facilities.push({ id: 'fac' + i, name: 'Facility ' + (i + 1) });
  }
  var students = opts.students || [];
  if (!students.length) {
    for (var i = 0; i < 30; i++) {
      students.push(DataModel.createStudent(
        'Student ' + (i + 1),
        'C1',
        'SG1',
        'fac0',
        ''
      ));
    }
  }
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
  if (opts.preserveCohorts) {
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
  Scheduler.regenerateAll(sem);
  return sem;
}

function assertGuestFlagsMatchSessionHost(sem) {
  var cal = sem._simCalendar;
  var simGroups = DataModel.getSimGroups(sem.config);
  sem.students.forEach(function (student) {
    student.schedule.forEach(function (cell, wi) {
      if (!cell || !cell.sim) return;
      var host = Scheduler.resolveSimSessionHost(
        cell.sim,
        wi,
        cell.simDay,
        cal,
        simGroups,
        sem.config
      );
      if (host && host !== student.simGroup) {
        expect(cell.simGuestGroup).toBe(host);
      } else if (!host || host === student.simGroup) {
        expect(cell.simGuestGroup).toBeNull();
      }
    });
  });
}

describe('sim guest group flag', () => {
  it('sets simGuestGroup when attending another group session (F2026)', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      }
    });
    var guestCells = 0;
    sem.students.forEach(function (student) {
      student.schedule.forEach(function (cell) {
        if (cell && cell.sim && cell.simGuestGroup) guestCells++;
      });
    });
    expect(guestCells).toBeGreaterThan(0);
    assertGuestFlagsMatchSessionHost(sem);
  });
});
