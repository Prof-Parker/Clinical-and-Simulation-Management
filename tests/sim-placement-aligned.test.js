/**
 * First-pass aligned host-only sim placement (equal C/SG counts, no day conflicts).
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
import {
  canUseAlignedHostOnlySimPlacement,
  buildAlignedHostOnlyCandidates
} from '../src/core/scheduler/sim-placement-aligned.js';

var __dirname = dirname(fileURLToPath(import.meta.url));
var root = join(__dirname, '..');
var S2027_FIXTURE = 'mock-onedrive/semesters/S2027_REGN15P.json';

function hasFixture(relPath) {
  return existsSync(join(root, relPath));
}

function loadSemester(relPath) {
  var raw = JSON.parse(readFileSync(join(root, relPath), 'utf8'));
  var sem = raw.semesters[0];
  DataModel.migrateSemester(sem);
  return sem;
}

describe('aligned host-only sim placement gate', () => {
  it('allows equal counts with distinct clinical vs sim weekdays', () => {
    var cfg = DataModel.normalizeConfig({
      clinicalGroups: ['C1', 'C2', 'C3', 'C4', 'C5'],
      clinicalGroupDays: { C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue' },
      simGroups: ['SG1', 'SG2', 'SG3', 'SG4', 'SG5'],
      simGroupDays: { SG1: 'Mon', SG2: 'Tue', SG3: 'Fri', SG4: 'Tue', SG5: 'Mon' },
      simGroupPattern: {
        SG1: 'even', SG2: 'even', SG3: 'even', SG4: 'odd', SG5: 'odd'
      },
      simDays: ['Mon', 'Tue', 'Fri']
    });
    expect(canUseAlignedHostOnlySimPlacement(cfg)).toBe(true);
  });

  it('rejects count mismatch', () => {
    var cfg = DataModel.normalizeConfig(DataModel.defaultConfig());
    expect(cfg.clinicalGroups.length).not.toBe(cfg.simGroups.length);
    expect(canUseAlignedHostOnlySimPlacement(cfg)).toBe(false);
  });

  it('rejects when any aligned pair shares a weekday', () => {
    var cfg = DataModel.normalizeConfig({
      clinicalGroups: ['C1', 'C2'],
      clinicalGroupDays: { C1: 'Mon', C2: 'Tue' },
      simGroups: ['SG1', 'SG2'],
      simGroupDays: { SG1: 'Mon', SG2: 'Wed' },
      simDays: ['Mon', 'Wed']
    });
    expect(canUseAlignedHostOnlySimPlacement(cfg)).toBe(false);
  });

  it('rejects when any host cohort exceeds the session cap', () => {
    var cfg = DataModel.normalizeConfig({
      clinicalGroups: ['C1'],
      clinicalGroupDays: { C1: 'Sat' },
      simGroups: ['SG1'],
      simGroupDays: { SG1: 'Tue' },
      simDays: ['Mon', 'Tue'],
      maxStudentsPerSimSession: 8,
      maxPerClinicalGroup: 10
    });
    expect(canUseAlignedHostOnlySimPlacement(cfg)).toBe(false);
    var students = [];
    for (var i = 0; i < 10; i++) {
      students.push({ id: 's' + i, clinicalGroup: 'C1', simGroup: 'SG1' });
    }
    cfg.maxPerClinicalGroup = 6;
    expect(canUseAlignedHostOnlySimPlacement(cfg, students)).toBe(false);
  });
});

describe.skipIf(!hasFixture(S2027_FIXTURE))('S2027 5×5 aligned host-only regen', () => {
  it('places SG3 on Friday host seats without guests', () => {
    var sem = loadSemester(S2027_FIXTURE);
    DataModel.normalizeConfig(sem.config);
    CalendarEngine.rebuildWeeks(sem);
    (sem.students || []).forEach(function (s) {
      s.schedule = DataModel.emptySchedule();
      s.makeups = [];
    });
    delete sem._simCalendar;
    RosterBalance.assignSimGroupsByClinicalCohort(
      sem.students,
      sem.config.clinicalGroups,
      sem.config.simGroups,
      { force: true }
    );
    expect(canUseAlignedHostOnlySimPlacement(sem.config)).toBe(true);
    Scheduler.regenerateAll(sem);

    var needed = sem.config.simDaysRequired || 5;
    var guests = 0;
    var byDay = {};
    var sg3FriHome = 0;
    var sg3Other = 0;

    sem.students.forEach(function (s) {
      expect(s.simGroup).toBe(
        sem.config.simGroups[sem.config.clinicalGroups.indexOf(s.clinicalGroup)]
      );
      var sims = 0;
      s.schedule.forEach(function (cell) {
        if (!cell || !cell.sim) return;
        sims++;
        byDay[cell.simDay] = (byDay[cell.simDay] || 0) + 1;
        if (cell.simGuestGroup) guests++;
        if (s.simGroup === 'SG3') {
          if (cell.simDay === 'Fri' && !cell.simGuestGroup) sg3FriHome++;
          else sg3Other++;
        }
      });
      expect(sims).toBe(needed);
    });

    expect(guests).toBe(0);
    expect(sg3Other).toBe(0);
    expect(sg3FriHome).toBe(6 * needed);
    expect(byDay.Fri).toBe(6 * needed);
    expect(byDay.Mon).toBe(12 * needed); // SG1 even + SG5 odd
    expect(byDay.Tue).toBe(12 * needed); // SG2 even + SG4 odd
  });

  it('buildAlignedHostOnlyCandidates stays on the group host day', () => {
    var sem = loadSemester(S2027_FIXTURE);
    DataModel.normalizeConfig(sem.config);
    CalendarEngine.rebuildWeeks(sem);
    Scheduler.regenerateAll(sem);
    var student = sem.students.find(function (s) { return s.simGroup === 'SG3'; });
    expect(student).toBeTruthy();
    var slots = buildAlignedHostOnlyCandidates(student, sem, sem._simCalendar, 1);
    expect(slots.length).toBeGreaterThan(0);
    slots.forEach(function (slot) {
      expect(slot.day).toBe('Fri');
      expect(slot.hostSimGroup).toBe('SG3');
    });
  });
});
