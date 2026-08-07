import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DataModel,
  CalendarEngine,
  Scheduler,
  RosterBalance,
  ClinicalSites
} from './_harness.js';
import { getExistingClinicalAtFacility } from '../src/core/scheduler/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockPath = join(__dirname, '..', 'mock-onedrive', 'semesters', 'F2026_REGN_program.json');

var F2026_HOLIDAYS = [
  { id: 'h_labor', date: '2026-09-07', label: 'Labor Day', type: 'mondayHoliday' },
  { id: 'h_veterans', date: '2026-11-09', label: 'Veterans Day', type: 'mondayHoliday' },
  { id: 'h_thanks', date: '2026-11-22', label: 'Thanksgiving', type: 'break', weekIndex: 14 }
];

function loadF2026() {
  if (existsSync(mockPath)) {
    const program = JSON.parse(readFileSync(mockPath, { encoding: 'utf8' }));
    const activeId = program.meta && program.meta.activeSemesterId;
    return program.semesters.find(function (s) { return s.id === activeId; }) || program.semesters[0];
  }
  return makeSyntheticSemester();
}

function makeSyntheticSemester() {
  var cfg = DataModel.normalizeConfig(DataModel.defaultConfig());
  cfg.clinicalGroupDays = { C1: 'Sat', C2: 'Mon', C3: 'Mon', C4: 'Mon', C5: 'Tue' };
  cfg.clinicalGroupFacilities = {
    C1: ['fac_srmc'], C2: ['fac_srmc'], C3: ['fac_srmc'], C4: ['fac_stel'], C5: ['fac_stel']
  };
  var students = [];
  for (var i = 0; i < 30; i++) {
    students.push(DataModel.createStudent('Student ' + (i + 1), 'C1', 'SG1', 'fac_srmc', ''));
  }
  RosterBalance.rebalance(students, cfg);
  students.forEach(function (s) {
    var facList = cfg.clinicalGroupFacilities[s.clinicalGroup];
    if (facList && facList.length) s.facilityId = facList[0];
  });
  var sem = {
    config: cfg,
    students: students,
    facilities: [
      { id: 'fac_srmc', name: 'Shasta Regional Medical Center' },
      { id: 'fac_stel', name: 'St. Elizabeth' }
    ],
    faculty: [],
    sections: [],
    holidays: F2026_HOLIDAYS.slice(),
    calendar: { semesterStartDate: '2026-08-17', weeks: [] },
    meta: {}
  };
  CalendarEngine.rebuildWeeks(sem);
  Scheduler.regenerateAll(sem);
  return sem;
}

describe('clinical makeup finder', () => {
  it('offers Monday C2/C3 join slots at SRMC for C1 Saturday student', () => {
    const sem = loadF2026();
    const s1 = sem.students.find(function (s) { return s.clinicalGroup === 'C1'; });
    expect(s1).toBeTruthy();
    expect(s1.clinicalGroup).toBe('C1');

    const facIds = ClinicalSites.getGroupFacilities(sem, s1.clinicalGroup);
    const sessions = getExistingClinicalAtFacility(sem, facIds[0], s1.id);
    const monJoin = sessions.filter(function (s) {
      return s.day === 'Mon' && (s.group === 'C2' || s.group === 'C3');
    });
    expect(monJoin.length).toBeGreaterThan(0);

    const slots = Scheduler.findMakeupSlots(sem, s1.id, 'clinical');
    const joinSlots = slots.filter(function (s) { return s.facilityJoin && !s.week18Fallback; });
    expect(joinSlots.length).toBeGreaterThan(0);
    expect(slots.some(function (s) { return s.week18Fallback; })).toBe(false);

    if (existsSync(mockPath)) {
      expect(monJoin.some(function (s) { return s.week === 17; })).toBe(true);
      const weeks = joinSlots.map(function (s) { return s.week; });
      if (s1.simGroup === 'SG1') {
        // SG1 has Monday sim on even weeks — those Mondays are blocked for join.
        expect(weeks).toContain(5);
        expect(weeks).toContain(7);
        expect(weeks).toContain(9);
        expect(weeks).toContain(11);
        expect(weeks).not.toContain(6);
        expect(weeks).not.toContain(8);
        expect(weeks).not.toContain(10);
        expect(weeks).not.toContain(12);
        expect(weeks).not.toContain(16);
        // Thanksgiving break is week 15 — Saturday clinicals skip that week; C2/C3 Mon still week 14.
        expect(weeks).toContain(14);
        expect(weeks).not.toContain(15);
      } else {
        expect(weeks.length).toBeGreaterThan(0);
      }
      expect(s1.schedule[14].inactive).toBe(true);
      expect(s1.schedule[14].clinical).toBe(false);
    }
  });

  it('includes makeup-join sessions when discovering facility clinical', () => {
    const sem = loadF2026();
    const facIds = ClinicalSites.getGroupFacilities(sem, 'C1');
    const sessions = getExistingClinicalAtFacility(sem, facIds[0], null);
    const monJoin = sessions.filter(function (s) {
      return s.day === 'Mon' && (s.group === 'C2' || s.group === 'C3');
    });
    expect(monJoin.length).toBeGreaterThan(0);
    if (existsSync(mockPath)) {
      const week17Mon = monJoin.filter(function (s) { return s.week === 17; });
      expect(week17Mon.length).toBeGreaterThan(0);
    }
  });

  it('marks selected clinical missed when applying a clinical makeup slot', () => {
    const sem = loadF2026();
    const student = sem.students.find(function (s) { return s.clinicalGroup === 'C1'; });
    expect(student).toBeTruthy();

    var missedWi = -1;
    for (var wi = 0; wi < 18; wi++) {
      var cell = student.schedule[wi];
      if (cell && cell.clinical && !cell.clinicalMissed) {
        missedWi = wi;
        break;
      }
    }
    expect(missedWi).toBeGreaterThanOrEqual(0);

    const slots = Scheduler.findMakeupSlots(sem, student.id, 'clinical');
    const join = slots.find(function (s) { return s.facilityJoin && !s.week18Fallback; });
    expect(join).toBeTruthy();

    const result = Scheduler.applyMakeupSlot(
      sem, student.id, join, 'clinical', 'Test Faculty', missedWi
    );
    expect(result.applied).toBe(true);
    expect(result.missedWeekIndex).toBe(missedWi);
    expect(result.makeupWeekIndex).toBe(join.weekIndex);
    expect(student.schedule[missedWi].clinicalMissed).toBe(true);
    expect(student.schedule[join.weekIndex].makeupClinical).toBe(true);
    expect(student.makeups.some(function (m) {
      return m.type === 'clinical' && m.weekIndex === join.weekIndex;
    })).toBe(true);
  });
});

describe('simulation makeup finder', () => {
  function studentWithSim(sem, simNum) {
    return sem.students.find(function (s) {
      return (s.schedule || []).some(function (c) { return c && c.sim === simNum; });
    });
  }

  it('lists sim join slots with clinical-style reason labels', () => {
    const sem = loadF2026();
    const student = studentWithSim(sem, 1);
    expect(student).toBeTruthy();

    const slots = Scheduler.findMakeupSlots(sem, student.id, 'sim', 1);
    const join = slots.find(function (s) { return !s.week18Fallback; });
    expect(join).toBeTruthy();
    expect(join.reason).toMatch(/^Join Simulation 1 with SG\d+/);
  });

  it('excludes the student\'s currently scheduled sim session from makeup options', () => {
    const sem = loadF2026();
    const student = studentWithSim(sem, 2) || studentWithSim(sem, 1);
    expect(student).toBeTruthy();

    var simNum = (student.schedule || []).some(function (c) { return c && c.sim === 2; }) ? 2 : 1;
    var originalWi = -1;
    var originalDay = null;
    for (var wi = 0; wi < 18; wi++) {
      var cell = student.schedule[wi];
      if (cell && cell.sim === simNum) {
        originalWi = wi;
        originalDay = cell.simDay;
        break;
      }
    }
    expect(originalWi).toBeGreaterThanOrEqual(0);

    const slots = Scheduler.findMakeupSlots(sem, student.id, 'sim', simNum);
    expect(slots.some(function (s) {
      return s.weekIndex === originalWi && s.day === originalDay;
    })).toBe(false);
  });

  it('clears the original scheduled sim week when applying a sim makeup', () => {
    const sem = loadF2026();
    const student = studentWithSim(sem, 1);
    expect(student).toBeTruthy();

    var originalWi = -1;
    var originalDay = null;
    for (var wi = 0; wi < 18; wi++) {
      var cell = student.schedule[wi];
      if (cell && cell.sim === 1) {
        originalWi = wi;
        originalDay = cell.simDay;
        break;
      }
    }
    expect(originalWi).toBeGreaterThanOrEqual(0);

    const slots = Scheduler.findMakeupSlots(sem, student.id, 'sim', 1);
    // Prefer a slot with spare capacity on a different week (finder may list
    // at-normal sessions without the overload flag that apply enforces).
    const join = slots.find(function (s) {
      return !s.week18Fallback && s.weekIndex !== originalWi && s.day === 'Sat';
    }) || slots.find(function (s) {
      return !s.week18Fallback && s.weekIndex !== originalWi && !!s.overload;
    });
    expect(join).toBeTruthy();

    const result = Scheduler.applyMakeupSlot(
      sem, student.id, join, 'sim', 'Test Faculty'
    );
    expect(result.applied).toBe(true);
    expect(result.originalWeekIndex).toBe(originalWi);
    expect(result.originalDay).toBe(originalDay);
    expect(result.makeupWeekIndex).toBe(join.weekIndex);
    expect(result.simNum).toBe(1);
    expect(student.schedule[originalWi].sim).toBe(null);
    expect(student.schedule[join.weekIndex].sim).toBe(1);
    expect(student.schedule[join.weekIndex].simMakeup).toBe(true);
  });
});
