import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  DataModel,
  CalendarEngine,
  Scheduler,
  RosterBalance,
  Validator
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

function makeSemester(opts) {
  opts = opts || {};
  var config = DataModel.normalizeConfig(opts.config || DataModel.defaultConfig());
  config.simStartWeek = opts.simStartWeek != null ? opts.simStartWeek : 5;
  if (opts.clinicalGroupDays) {
    config.clinicalGroupDays = opts.clinicalGroupDays;
  }
  if (opts.maxGuestSimsPerStudent != null) {
    config.maxGuestSimsPerStudent = opts.maxGuestSimsPerStudent;
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
    facilities: makeFacilities(5),
    faculty: [],
    sections: [],
    holidays: opts.holidays || [],
    calendar: { semesterStartDate: opts.startDate || '2026-08-16', weeks: [] },
    meta: {}
  };
  RosterBalance.rebalance(sem.students, sem.config);
  CalendarEngine.rebuildWeeks(sem);
  if (opts.regenerate !== false) {
    Scheduler.regenerateAll(sem);
  }
  return sem;
}

function assertNoDoubleBooking(sem) {
  expect(Validator.validateNoDoubleBooking(sem).length).toBe(0);
}

function assertSimDaysOnly(sem) {
  var allowed = new Set(DataModel.getSimDays(sem.config));
  sem.students.forEach(function (s) {
    s.schedule.forEach(function (cell) {
      if (cell && cell.sim && cell.simDay) {
        expect(allowed.has(cell.simDay)).toBe(true);
      }
    });
  });
}

function assertSimGroupsWithinCap(sem) {
  var cap = sem.config.maxStudentsPerSimSessionOverload ||
    ((sem.config.maxStudentsPerSimSession || 8) + 1);
  var simGroups = DataModel.getSimGroups(sem.config);
  var counts = {};
  simGroups.forEach(function (sg) { counts[sg] = 0; });
  sem.students.forEach(function (s) {
    if (s.simGroup && counts[s.simGroup] != null) counts[s.simGroup]++;
  });
  simGroups.forEach(function (sg) {
    expect(counts[sg]).toBeLessThanOrEqual(cap);
  });
}

function assertNoSimGroupMismatch(sem) {
  var cap = sem.config.maxStudentsPerSimSession || 8;
  var simGroups = DataModel.getSimGroups(sem.config);
  var counts = {};
  simGroups.forEach(function (sg) { counts[sg] = 0; });
  sem.students.forEach(function (s) {
    if (s.simGroup && counts[s.simGroup] != null) counts[s.simGroup]++;
  });
  var calendar = sem._simCalendar || Scheduler.buildProgramSimCalendar(sem, sem.config);
  sem.students.forEach(function (s) {
    var hosts = {};
    s.schedule.forEach(function (cell, wi) {
      if (!cell || !cell.sim) return;
      var host = cell.simGuestGroup || Scheduler.resolveSimSessionHost(
        cell.sim, wi, cell.simDay, calendar, simGroups, sem.config
      );
      if (host) hosts[host] = (hosts[host] || 0) + 1;
    });
    var maj = Object.keys(hosts).sort(function (a, b) {
      return hosts[b] - hosts[a];
    })[0];
    if (!maj || maj === s.simGroup) return;
    // Residual mismatch only allowed when majority host is already at session cap.
    expect(counts[maj] || 0).toBeGreaterThanOrEqual(cap);
  });
}

function countCohortGuests(sem, clinicalGroup) {
  var n = 0;
  sem.students.forEach(function (s) {
    if (s.clinicalGroup !== clinicalGroup) return;
    s.schedule.forEach(function (cell) {
      if (cell && cell.simGuestGroup) n++;
    });
  });
  return n;
}

/** Same-weekday clinical cohorts should share guest load within 2. */
function assertWeekdayCohortGuestsBalanced(sem, cohorts) {
  var totals = cohorts.map(function (cg) { return countCohortGuests(sem, cg); });
  var sum = totals.reduce(function (a, b) { return a + b; }, 0);
  if (sum < 3) return;
  var max = Math.max.apply(null, totals);
  var min = Math.min.apply(null, totals);
  expect(max - min).toBeLessThanOrEqual(2);
}

function studentGuestCount(s) {
  var n = 0;
  s.schedule.forEach(function (cell) {
    if (cell && cell.simGuestGroup) n++;
  });
  return n;
}

/**
 * Hard soft cap: no student above maxGuestSimsPerStudent.
 * Nested fairness residual: max student guests among weekday peers may exceed
 * min only by the soft-cap window (already covered by hard cap when softCap is 1).
 */
function assertGuestSoftCapFairness(sem, cohorts, softCap) {
  sem.students.forEach(function (s) {
    expect(studentGuestCount(s)).toBeLessThanOrEqual(softCap);
  });
  var peers = sem.students.filter(function (s) {
    return cohorts.indexOf(s.clinicalGroup) >= 0;
  });
  if (!peers.length) return;
  var guestCounts = peers.map(studentGuestCount);
  var maxG = Math.max.apply(null, guestCounts);
  var minG = Math.min.apply(null, guestCounts);
  expect(maxG - minG).toBeLessThanOrEqual(Math.max(softCap, 1));
}

describe('roster sim rebalance', () => {
  it('rebalanceClinicalGroups does not change sim groups', () => {
    var students = [];
    for (var i = 0; i < 30; i++) {
      students.push(DataModel.createStudent('Student ' + (i + 1), 'C1', 'SG3', 'fac0', ''));
    }
    var config = DataModel.normalizeConfig(DataModel.defaultConfig());
    var before = students.map(function (s) { return s.simGroup; });
    RosterBalance.rebalanceClinicalGroups(students, config);
    students.forEach(function (s, idx) {
      expect(s.simGroup).toBe(before[idx]);
    });
  });

  it('needsSimRebalance detects oversized sim group', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      },
      regenerate: false
    });
    var oversized = false;
    var counts = {};
    DataModel.getSimGroups(sem.config).forEach(function (sg) { counts[sg] = 0; });
    sem.students.forEach(function (s) {
      counts[s.simGroup] = (counts[s.simGroup] || 0) + 1;
    });
    Object.keys(counts).forEach(function (sg) {
      if (counts[sg] > (sem.config.maxStudentsPerSimSession || 8)) oversized = true;
    });
    if (oversized) {
      expect(RosterBalance.needsSimRebalance(sem)).toBe(true);
    }
  });

  it('rebalanceSimGroups meets session cap and guest soft cap on F2026-like semester', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      }
    });
    var beforeGuests = RosterBalance.countGuestSimPlacements(sem);
    var result = RosterBalance.rebalanceSimGroups(sem);
    expect(result.passes).toBeGreaterThan(0);
    expect(result.passes).toBeLessThanOrEqual(5);
    expect(result.softCap).toBe(1);
    expect(result.oversizedAfter).toBe(0);
    assertSimGroupsWithinCap(sem);
    assertNoDoubleBooking(sem);
    assertSimDaysOnly(sem);
    assertNoSimGroupMismatch(sem);
    expect(result.mismatchAfter).toBeLessThanOrEqual(result.mismatchBefore);
    expect(result.guestAfter).toBeLessThanOrEqual(beforeGuests);
    if (result.metSoftCap) {
      expect(result.maxGuestAfter).toBeLessThanOrEqual(result.softCap);
    } else {
      expect(result.studentsOverSoftCap).toBeGreaterThan(0);
    }
    sem.students.forEach(function (s) {
      expect(s.schedule.filter(function (c) { return c && c.sim; }).length)
        .toBe(sem.config.simDaysRequired || 5);
    });
    assertWeekdayCohortGuestsBalanced(sem, ['C2', 'C3', 'C4']);
    if (result.metSoftCap) {
      assertGuestSoftCapFairness(sem, ['C2', 'C3', 'C4'], result.softCap);
    }
  });

  it('iterative loop finishes within max passes', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      }
    });
    var result = RosterBalance.rebalanceSimGroups(sem);
    expect(result.passes).toBeGreaterThan(0);
    expect(result.passes).toBeLessThanOrEqual(5);
    expect(result).toHaveProperty('metSoftCap');
    expect(result).toHaveProperty('maxGuestAfter');
  });

  it('rebalanceSimGroups does not increase guest count on default semester', () => {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    CalendarEngine.rebuildWeeks(sem);
    Scheduler.regenerateAll(sem);
    var before = RosterBalance.countGuestSimPlacements(sem);
    var result = RosterBalance.rebalanceSimGroups(sem);
    expect(result.guestAfter).toBeLessThanOrEqual(before);
    assertNoDoubleBooking(sem);
    assertSimDaysOnly(sem);
  });

  it('soft cap 0 runs without throwing and reports metSoftCap', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      },
      maxGuestSimsPerStudent: 0
    });
    var result = RosterBalance.rebalanceSimGroups(sem);
    expect(result.passes).toBeLessThanOrEqual(5);
    expect(result.softCap).toBe(0);
    expect(typeof result.metSoftCap).toBe('boolean');
    assertSimGroupsWithinCap(sem);
    assertSimDaysOnly(sem);
  });

  it('F2026 mock: rebalance aligns labels to majority hosts when capacity allows', function () {
    var path = join(dirname(fileURLToPath(import.meta.url)), '..', 'mock-onedrive', 'semesters', 'F2026_REGN_program.json');
    if (!existsSync(path)) return;
    var raw = JSON.parse(readFileSync(path, 'utf8'));
    var sem = raw.semesters[0];
    sem.config = DataModel.normalizeConfig(sem.config);
    CalendarEngine.rebuildWeeks(sem);
    var beforeGuests = RosterBalance.countGuestSimPlacements(sem);
    var beforeMismatch = RosterBalance.countSimGroupMismatches(sem);
    var result = RosterBalance.rebalanceSimGroups(sem);
    expect(result.passes).toBeLessThanOrEqual(5);
    expect(result.oversizedAfter).toBe(0);
    assertSimGroupsWithinCap(sem);
    assertSimDaysOnly(sem);
    assertNoSimGroupMismatch(sem);
    expect(result.mismatchAfter).toBeLessThanOrEqual(beforeMismatch);
    if (result.metSoftCap) {
      expect(result.maxGuestAfter).toBeLessThanOrEqual(result.softCap);
      assertGuestSoftCapFairness(sem, ['C2', 'C3', 'C4'], result.softCap);
    }
    assertWeekdayCohortGuestsBalanced(sem, ['C2', 'C3', 'C4']);
    ['Student 3', 'Student 6', 'Student 7', 'Student 27'].forEach(function (name) {
      var s = sem.students.find(function (x) { return x.name === name; });
      if (!s) return;
      var hosts = {};
      var calendar = sem._simCalendar || Scheduler.buildProgramSimCalendar(sem, sem.config);
      var simGroups = DataModel.getSimGroups(sem.config);
      s.schedule.forEach(function (cell, wi) {
        if (!cell || !cell.sim) return;
        var host = cell.simGuestGroup || Scheduler.resolveSimSessionHost(
          cell.sim, wi, cell.simDay, calendar, simGroups, sem.config
        );
        if (host) hosts[host] = (hosts[host] || 0) + 1;
      });
      var maj = Object.keys(hosts).sort(function (a, b) { return hosts[b] - hosts[a]; })[0];
      expect(s.simGroup).toBe(maj);
    });
    if (result.metSoftCap) {
      expect(result.maxGuestAfter).toBeLessThanOrEqual(result.softCap);
    } else {
      expect(result.studentsOverSoftCap).toBeGreaterThan(0);
    }
    assertNoDoubleBooking(sem);
    assertWeekdayCohortGuestsBalanced(sem, ['C2', 'C3', 'C4']);
    if (result.metSoftCap) {
      assertGuestSoftCapFairness(sem, ['C2', 'C3', 'C4'], result.softCap);
    }
    sem.students.forEach(function (s) {
      expect(s.schedule.filter(function (c) { return c && c.sim; }).length)
        .toBe(sem.config.simDaysRequired || 5);
    });
  });

  it('rebalance meets soft cap when clinical days avoid sim weekdays', () => {
    var config = DataModel.normalizeConfig(DataModel.defaultConfig());
    config.clinicalGroupDays = {
      C1: 'Sat', C2: 'Wed', C3: 'Thu', C4: 'Fri', C5: 'Sat'
    };
    config.maxGuestSimsPerStudent = 1;
    var students = [];
    for (var i = 0; i < 30; i++) {
      students.push(DataModel.createStudent('Student ' + (i + 1), 'C1', 'SG1', 'fac0', ''));
    }
    var facilities = makeFacilities(5);
    var sem = {
      config: config,
      students: students,
      facilities: facilities,
      faculty: [],
      sections: [],
      holidays: [],
      calendar: { semesterStartDate: '2026-08-16', weeks: [] },
      meta: {}
    };
    RosterBalance.rebalance(sem.students, sem.config);
    students.forEach(function (s, idx) {
      s.facilityId = facilities[idx % facilities.length].id;
    });
    CalendarEngine.rebuildWeeks(sem);
    Scheduler.regenerateAll(sem);
    var result = RosterBalance.rebalanceSimGroups(sem);
    expect(result.oversizedAfter).toBe(0);
    expect(result.metSoftCap).toBe(true);
    expect(result.maxGuestAfter).toBeLessThanOrEqual(1);
    assertSimDaysOnly(sem);
  });
});
