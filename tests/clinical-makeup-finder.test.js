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

var COURSE_15P = 'REGN15P';
var COURSE_35P_36P = 'REGN35P-36P';

var F2026_HOLIDAYS = [
  { id: 'h_labor', date: '2026-09-07', label: 'Labor Day', type: 'mondayHoliday' },
  { id: 'h_veterans', date: '2026-11-09', label: 'Veterans Day', type: 'mondayHoliday' },
  { id: 'h_thanks', date: '2026-11-22', label: 'Thanksgiving', type: 'break', weekIndex: 14 }
];

function courseIdOf(sem) {
  return (sem && sem.meta && sem.meta.courseId) || '';
}

/** True when any student has clinical or sim practicum cells scheduled. */
function hasPracticumSchedule(sem) {
  var students = (sem && sem.students) || [];
  for (var i = 0; i < students.length; i++) {
    var schedule = students[i].schedule || [];
    for (var w = 0; w < schedule.length; w++) {
      var cell = schedule[w];
      if (!cell) continue;
      if (cell.clinical || cell.sim) return true;
    }
  }
  return false;
}

function loadProgram() {
  if (!existsSync(mockPath)) return null;
  return JSON.parse(readFileSync(mockPath, { encoding: 'utf8' }));
}

function findCourseSemester(program, courseId) {
  if (!program || !program.semesters) return null;
  return program.semesters.find(function (s) {
    return courseIdOf(s) === courseId;
  }) || null;
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
    meta: { courseId: COURSE_15P }
  };
  CalendarEngine.rebuildWeeks(sem);
  Scheduler.regenerateAll(sem);
  return sem;
}

/**
 * Full makeup suite runs only on a semester with practicum data.
 * Prefer seeded REGN15P; fall back to synthetic when mock-onedrive is absent.
 */
function loadMakeupFixture() {
  var program = loadProgram();
  if (!program) {
    return { sem: makeSyntheticSemester(), fromMock: false, courseId: COURSE_15P };
  }
  var sem15 = findCourseSemester(program, COURSE_15P);
  if (sem15 && hasPracticumSchedule(sem15)) {
    return { sem: sem15, fromMock: true, courseId: COURSE_15P };
  }
  // Let the gate test fail REGN15P; still need a runnable object for skipIf checks.
  return { sem: sem15, fromMock: true, courseId: COURSE_15P };
}

var makeupFixture = loadMakeupFixture();
var runFullMakeupSuite = !!(makeupFixture.sem && hasPracticumSchedule(makeupFixture.sem));

function cloneSemester(sem) {
  return JSON.parse(JSON.stringify(sem));
}

/** Fresh copy each test so apply mutations do not leak across cases. */
function loadF2026() {
  return cloneSemester(makeupFixture.sem);
}

function mondaySimWeeks(student) {
  var weeks = [];
  (student.schedule || []).forEach(function (cell, wi) {
    if (cell && cell.sim && cell.simDay === 'Mon') weeks.push(wi + 1);
  });
  return weeks;
}

describe('makeup finder practicum gates', () => {
  it('REGN15P has practicum schedule when mock seed is present', () => {
    var program = loadProgram();
    if (!program) {
      console.log('makeup finder: mock-onedrive absent — using synthetic REGN15P practicum');
      expect(runFullMakeupSuite).toBe(true);
      return;
    }
    var sem15 = findCourseSemester(program, COURSE_15P);
    expect(sem15, 'REGN15P semester missing from F2026_REGN_program.json').toBeTruthy();
    expect(
      (sem15.students || []).length,
      'REGN15P roster is empty — re-run npm run seed:mock-onedrive'
    ).toBeGreaterThan(0);
    expect(
      hasPracticumSchedule(sem15),
      'REGN15P practicum is empty — re-run npm run seed:mock-onedrive'
    ).toBe(true);
  });

  it('REGN35P-36P empty practicum is expected (theory-first demo)', () => {
    var program = loadProgram();
    if (!program) {
      console.log('makeup finder: mock-onedrive absent — skipping REGN35P-36P empty-practicum check');
      return;
    }
    var sem35 = findCourseSemester(program, COURSE_35P_36P);
    expect(sem35, 'REGN35P-36P semester missing from F2026_REGN_program.json').toBeTruthy();
    console.log(
      'makeup finder: REGN35P-36P practicum empty (expected) — ' +
        'not running full makeup suite on 35P/36P; clinical/sim come from theory events in this build'
    );
    expect(
      sem35.students || [],
      'REGN35P-36P should not seed a practicum student roster'
    ).toHaveLength(0);
    expect(hasPracticumSchedule(sem35)).toBe(false);
  });
});

describe.skipIf(!runFullMakeupSuite)('clinical makeup finder', () => {
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

    if (makeupFixture.fromMock) {
      expect(monJoin.some(function (s) { return s.week === 17; })).toBe(true);
      const weeks = joinSlots.map(function (s) { return s.week; });
      const blockedMonSim = mondaySimWeeks(s1);
      blockedMonSim.forEach(function (w) {
        expect(weeks).not.toContain(w);
      });
      expect(weeks.length).toBeGreaterThan(0);
      // Thanksgiving break is week 15 — Saturday clinicals skip that week; C2/C3 Mon still week 14.
      expect(weeks).toContain(14);
      expect(weeks).not.toContain(15);
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
    if (makeupFixture.fromMock) {
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

describe.skipIf(!runFullMakeupSuite)('simulation makeup finder', () => {
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
    // Prefer Sat / overload, then any other week (capacity varies by seed).
    const join = slots.find(function (s) {
      return !s.week18Fallback && s.weekIndex !== originalWi && s.day === 'Sat';
    }) || slots.find(function (s) {
      return !s.week18Fallback && s.weekIndex !== originalWi && !!s.overload;
    }) || slots.find(function (s) {
      return !s.week18Fallback && s.weekIndex !== originalWi;
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
