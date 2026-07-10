import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
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

  it('needsSimRebalance detects all-guest student', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      }
    });
    var mismatched = sem.students.find(function (s) {
      return s.simGroup === 'SG1' && s.schedule.some(function (c) {
        return c && c.sim && c.simGuestGroup === 'SG2';
      });
    });
    if (mismatched) {
      expect(RosterBalance.needsSimRebalance(sem)).toBe(true);
    }
  });

  it('rebalanceSimGroups reduces guest placements on F2026-like semester', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      }
    });
    var before = RosterBalance.countGuestSimPlacements(sem);
    var result = RosterBalance.rebalanceSimGroups(sem);
    expect(result.passes).toBeGreaterThan(0);
    expect(result.passes).toBeLessThanOrEqual(5);
    expect(result.guestAfter).toBeLessThanOrEqual(result.guestBefore);
    expect(result.guestAfter).toBeLessThanOrEqual(before);
    assertNoDoubleBooking(sem);
    var allowed = new Set(DataModel.getSimDays(sem.config));
    sem.students.forEach(function (s) {
      s.schedule.forEach(function (cell) {
        if (cell && cell.sim && cell.simDay) {
          expect(allowed.has(cell.simDay)).toBe(true);
        }
      });
    });
  });

  it('iterative loop stops at plateau within max passes', () => {
    var sem = makeSemester({
      holidays: F2026_HOLIDAYS,
      clinicalGroupDays: {
        C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue'
      }
    });
    var result = RosterBalance.rebalanceSimGroups(sem);
    if (result.guestBefore === result.guestAfter) {
      expect(result.passes).toBe(1);
    } else {
      expect(result.guestAfter).toBeLessThan(result.guestBefore);
    }
    expect(result.passes).toBeLessThanOrEqual(5);
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
  });

  it('F2026 mock: Student 4 matches majority session host after rebalance', () => {
    var path = join(dirname(fileURLToPath(import.meta.url)), '..', 'mock-onedrive', 'semesters', 'F2026_REGN_program.json');
    var raw = JSON.parse(readFileSync(path, 'utf8'));
    var sem = raw.semesters[0];
    CalendarEngine.rebuildWeeks(sem);
    var s4 = sem.students.find(function (s) { return s.name === 'Student 4'; });
    expect(s4).toBeTruthy();
    expect(s4.simGroup).toBe('SG4');
    RosterBalance.rebalanceSimGroups(sem);
    var cal = sem._simCalendar || Scheduler.buildProgramSimCalendar(sem, sem.config);
    var simGroups = DataModel.getSimGroups(sem.config);
    var tallies = { hostCounts: {}, simCount: 0 };
    s4.schedule.forEach(function (cell, wi) {
      if (!cell || !cell.sim) return;
      tallies.simCount++;
      var host = cell.simGuestGroup || Scheduler.resolveSimSessionHost(
        cell.sim, wi, cell.simDay, cal, simGroups, sem.config
      );
      if (host) tallies.hostCounts[host] = (tallies.hostCounts[host] || 0) + 1;
    });
    var majority = Object.keys(tallies.hostCounts).sort(function (a, b) {
      return tallies.hostCounts[b] - tallies.hostCounts[a];
    })[0];
    expect(s4.simGroup).toBe(majority);
    s4.schedule.forEach(function (cell, wi) {
      if (!cell || !cell.sim) return;
      expect(cell.simGuestGroup).toBeNull();
      var host = Scheduler.resolveSimSessionHost(
        cell.sim, wi, cell.simDay, cal, simGroups, sem.config
      );
      expect(host).toBe(s4.simGroup);
    });
  });
});
