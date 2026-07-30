/**
 * Regen property tests using S2026 (4×4) and F2026 (5×4) advanced configs.
 *
 * Fixtures live in the gitignored mock-onedrive folder, so these suites skip
 * anywhere the real semester data is unavailable (CI, fresh clones).
 */
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import {
  DataModel,
  CalendarEngine,
  Scheduler,
  RosterBalance
} from './_harness.js';

var __dirname = dirname(fileURLToPath(import.meta.url));
var root = join(__dirname, '..');

var S2026_FIXTURE = 'mock-onedrive/semesters/S2026_REGN15P.json';
var F2026_FIXTURE = 'mock-onedrive/semesters/F2026_REGN_program.json';

function hasFixture(relPath) {
  return existsSync(join(root, relPath));
}

function loadSemester(relPath) {
  var raw = JSON.parse(readFileSync(join(root, relPath), 'utf8'));
  var sem = raw.semesters[0];
  DataModel.migrateSemester(sem);
  return sem;
}

function clearSchedules(sem) {
  (sem.students || []).forEach(function (s) {
    s.schedule = DataModel.emptySchedule();
    s.makeups = [];
  });
  delete sem._simCalendar;
}

function assertNoDuplicateBlockWeeks(cal) {
  var seen = {};
  cal.blocks.forEach(function (b) {
    (b.weeks || []).forEach(function (wi) {
      // A week may host one sim number; collisions across simNums are the bug.
      if (seen[wi] != null && seen[wi] !== b.simNum) {
        throw new Error('Week ' + (wi + 1) + ' claimed by sim ' + seen[wi] + ' and ' + b.simNum);
      }
      seen[wi] = b.simNum;
    });
  });
}

function simsOrdered(student) {
  var list = [];
  student.schedule.forEach(function (cell, wi) {
    if (cell.sim) list.push({ wi: wi, sim: cell.sim });
  });
  for (var i = 1; i < list.length; i++) {
    if (list[i].sim < list[i - 1].sim) return false;
    if (list[i].wi < list[i - 1].wi) return false;
  }
  return true;
}

describe.skipIf(!hasFixture(S2026_FIXTURE))('S2026 4×4 Spring Excel-aligned regen', () => {
  it('rebuilds eligible-list blocks and places ordered sims without guests/misses', () => {
    var sem = loadSemester(S2026_FIXTURE);
    sem.calendar.semesterStartDate = '2026-01-19';
    sem.config.holidayBlocksFullWeek = true;
    sem.config.simStartWeek = 4;
    sem.config.simDaysRequired = 4;
    sem.config.clinicalStartWeek = 6;
    sem.config.maxGuestSimsPerStudent = 0;
    sem.config.simMakeupHeadroomReserved = 0;
    sem.holidays = [
      { id: 'h_wash', date: '2026-02-16', label: 'Washington holiday', type: 'holiday' },
      { id: 'h_break', date: '2026-04-06', label: 'Spring Break', type: 'break', weekIndex: 11 }
    ];
    DataModel.normalizeConfig(sem.config);
    CalendarEngine.rebuildWeeks(sem);
    clearSchedules(sem);
    RosterBalance.assignSimGroupsByClinicalCohort(
      sem.students,
      sem.config.clinicalGroups,
      sem.config.simGroups,
      { force: true }
    );
    Scheduler.regenerateAll(sem);

    expect(CalendarEngine.getWeekIndexForDate(sem, '2026-02-16')).toBe(4);
    expect(CalendarEngine.isSchedulingBlockedWeek(sem, 4)).toBe(true);
    expect(CalendarEngine.isWeekInactive(sem, 4)).toBe(false);

    var cal = sem._simCalendar;
    assertNoDuplicateBlockWeeks(cal);
    expect(cal.blocks.length).toBe(4);
    expect(cal.blocks[0].evenWeekIndex).toBe(3);
    expect(cal.blocks[0].oddWeekIndex).toBe(5);
    expect(cal.blocks[1].evenWeekIndex).toBe(6);
    expect(cal.blocks[1].oddWeekIndex).toBe(7);
    expect(cal.blocks[2].evenWeekIndex).toBe(8);
    expect(cal.blocks[2].oddWeekIndex).toBe(9);
    expect(cal.blocks[3].evenWeekIndex).toBe(10);
    expect(cal.blocks[3].oddWeekIndex).toBe(12);

    var guests = 0;
    var misses = 0;
    var incomplete = 0;
    sem.students.forEach(function (s) {
      expect(simsOrdered(s)).toBe(true);
      var sims = s.schedule.filter(function (c) { return c.sim; }).length;
      if (sims < sem.config.simDaysRequired) incomplete++;
      s.schedule.forEach(function (c) {
        if (c.simGuestGroup) guests++;
        if (c.clinicalMissed) misses++;
      });
    });
    expect(incomplete).toBe(0);
    expect(guests).toBe(0);
    expect(misses).toBe(0);

    // Orientation may sit on Tue of holiday week without week.inactive
    sem.orientations = [{
      id: 'o1',
      clinicalGroup: 'C1',
      facilityId: sem.facilities[0].id,
      date: '2026-02-17',
      timeStart: '0800',
      timeEnd: '1200'
    }];
    expect(CalendarEngine.isWeekInactive(sem, 4)).toBe(false);
    expect(CalendarEngine.getWeekIndexForDate(sem, '2026-02-17')).toBe(4);
  });
});

describe.skipIf(!hasFixture(F2026_FIXTURE))('F2026 5×4 program regen', () => {
  it('migrates mondayHoliday and recreates Sim5 W14/W16 with aligned days', () => {
    var sem = loadSemester(F2026_FIXTURE);
    sem.config.holidayBlocksFullWeek = true;
    (sem.holidays || []).forEach(function (h) {
      if (h.type === 'mondayHoliday') h.type = 'holiday';
    });
    DataModel.migrateSemester(sem);
    CalendarEngine.rebuildWeeks(sem);
    clearSchedules(sem);
    Scheduler.regenerateAll(sem);

    var cal = sem._simCalendar;
    assertNoDuplicateBlockWeeks(cal);
    var block5 = cal.blocks[4];
    expect(block5.evenWeekIndex).toBe(13);
    expect(block5.oddWeekIndex).toBe(15);
    expect(block5.daysAligned).toBe(true);
    expect(block5.weeksByDay.Mon.evenWeekIndex).toBe(13);
    expect(block5.weeksByDay.Tue.evenWeekIndex).toBe(13);
    expect(block5.weeksByDay.Mon.oddWeekIndex).toBe(15);
    expect(block5.weeksByDay.Tue.oddWeekIndex).toBe(15);

    var guests = 0;
    sem.students.forEach(function (s) {
      expect(simsOrdered(s)).toBe(true);
      s.schedule.forEach(function (c) {
        if (c.simGuestGroup) guests++;
      });
    });
    // Oversized SG2/SG3 still produce guests under soft headroom; soft cap is 1.
    expect(guests).toBeGreaterThan(0);
    sem.students.forEach(function (s) {
      var g = s.schedule.filter(function (c) { return c.simGuestGroup; }).length;
      expect(g).toBeLessThanOrEqual(sem.config.maxGuestSimsPerStudent || 1);
    });
  });
});
