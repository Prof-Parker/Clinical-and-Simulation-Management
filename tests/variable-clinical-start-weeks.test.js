import { describe, it, expect } from 'vitest';
import { DataModel, CalendarEngine, Scheduler } from './_harness.js';

function makeSemester(configOverrides) {
  var cfg = DataModel.normalizeConfig(Object.assign(DataModel.defaultConfig(), configOverrides || {}));
  var facilities = [
    { id: 'fac0', name: 'Facility 1' },
    { id: 'fac1', name: 'Facility 2' }
  ];
  var students = [
    DataModel.createStudent('Student 1', 'C1', 'SG1', 'fac0', ''),
    DataModel.createStudent('Student 2', 'C2', 'SG1', 'fac1', '')
  ];
  var sem = {
    config: cfg,
    students: students,
    facilities: facilities,
    faculty: [],
    sections: [],
    holidays: [],
    calendar: { semesterStartDate: '2026-01-12', weeks: [] },
    meta: {}
  };
  CalendarEngine.rebuildWeeks(sem);
  return sem;
}

function firstClinicalWeekIndex(student) {
  if (!student.schedule) return null;
  for (var i = 0; i < student.schedule.length; i++) {
    var cell = student.schedule[i];
    if (cell && (cell.clinical || cell.makeupClinical)) return i;
  }
  return null;
}

describe('variable clinical start weeks', () => {
  describe('normalizeConfig / resolveClinicalStartWeek', () => {
    it('returns global start when flag is off', () => {
      var cfg = DataModel.normalizeConfig({
        clinicalStartWeek: 6,
        variableStartWeeksPerGroup: false,
        clinicalGroupStartWeek: { C1: 3 }
      });
      expect(cfg.variableStartWeeksPerGroup).toBe(false);
      expect(DataModel.resolveClinicalStartWeek(cfg, 'C1')).toBe(6);
      expect(cfg.clinicalGroupStartWeek.C1).toBe(3);
    });

    it('returns per-group start when flag is on and seeds missing keys', () => {
      var cfg = DataModel.normalizeConfig({
        clinicalStartWeek: 5,
        variableStartWeeksPerGroup: true,
        clinicalGroups: ['C1', 'C2', 'C3'],
        clinicalGroupDays: { C1: 'Mon', C2: 'Tue', C3: 'Wed' },
        clinicalGroupStartWeek: { C1: 3, C2: 7 }
      });
      expect(DataModel.resolveClinicalStartWeek(cfg, 'C1')).toBe(3);
      expect(DataModel.resolveClinicalStartWeek(cfg, 'C2')).toBe(7);
      expect(DataModel.resolveClinicalStartWeek(cfg, 'C3')).toBe(5);
      expect(cfg.clinicalGroupStartWeek.C3).toBe(5);
    });

    it('drops orphan group keys and coerces invalid weeks', () => {
      var cfg = DataModel.normalizeConfig({
        clinicalStartWeek: 5,
        variableStartWeeksPerGroup: true,
        clinicalGroups: ['C1'],
        clinicalGroupDays: { C1: 'Mon' },
        clinicalGroupStartWeek: { C1: 'abc', C9: 4 }
      });
      expect(cfg.clinicalGroupStartWeek.C1).toBe(5);
      expect(cfg.clinicalGroupStartWeek.C9).toBeUndefined();
    });
  });

  describe('clinical scheduling floors', () => {
    it('respects different per-group start weeks including earlier than global default', () => {
      var sem = makeSemester({
        clinicalStartWeek: 5,
        variableStartWeeksPerGroup: true,
        clinicalGroups: ['C1', 'C2'],
        clinicalGroupDays: { C1: 'Mon', C2: 'Tue' },
        clinicalGroupStartWeek: { C1: 3, C2: 8 },
        clinicalDaysRequired: 4,
        simDaysRequired: 2
      });
      Scheduler.regenerateAll(sem);

      var s1 = sem.students.find(function (s) { return s.clinicalGroup === 'C1'; });
      var s2 = sem.students.find(function (s) { return s.clinicalGroup === 'C2'; });
      expect(s1).toBeTruthy();
      expect(s2).toBeTruthy();

      var first1 = firstClinicalWeekIndex(s1);
      var first2 = firstClinicalWeekIndex(s2);
      expect(first1).not.toBeNull();
      expect(first2).not.toBeNull();
      expect(first1).toBeGreaterThanOrEqual(2);
      expect(first2).toBeGreaterThanOrEqual(7);

      for (var w = 0; w < 2; w++) {
        var c1 = s1.schedule[w];
        expect(c1.clinical || c1.makeupClinical).toBeFalsy();
      }
      for (var w2 = 0; w2 < 7; w2++) {
        var c2 = s2.schedule[w2];
        expect(c2.clinical || c2.makeupClinical).toBeFalsy();
      }
    });

    it('getClinicalEligibleWeeks uses fromWeek without re-clamping to global', () => {
      var sem = makeSemester({ clinicalStartWeek: 5 });
      var early = CalendarEngine.getClinicalEligibleWeeks(sem, 2);
      expect(early[0]).toBe(2);
      var omitted = CalendarEngine.getClinicalEligibleWeeks(sem);
      expect(omitted[0]).toBe(4);
    });
  });
});
