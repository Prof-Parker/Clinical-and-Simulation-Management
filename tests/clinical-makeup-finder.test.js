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
    const s1 = sem.students.find(function (s) { return s.name === 'Student 1'; });
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
      expect(weeks).toContain(6);
      expect(weeks).toContain(8);
      expect(weeks).toContain(10);
      expect(weeks).toContain(12);
      expect(weeks).toContain(16);
      expect(weeks).not.toContain(5);
      expect(weeks).not.toContain(7);
      expect(weeks).not.toContain(9);
      expect(weeks).not.toContain(11);
      // Week 14/15 is Thanksgiving break — no Monday join clinicals that week.
      expect(weeks).not.toContain(14);
      expect(weeks).not.toContain(15);
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
});
