import { describe, it, expect } from 'vitest';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as TheoryData from '../src/core/theory-data.js';

describe('theory-data.test.js', () => {
  it('migrates empty semester with theory block', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    delete sem.theory;
    DataModel.migrateSemester(sem);
    expect(sem.theory).toBeTruthy();
    expect(sem.theory.version).toBe(1);
    expect(sem.theory.courseCodes).toContain('REGN15');
    expect(sem.theory.settings.lectureWeekdays).toEqual(['Wed', 'Thu']);
  });

  it('resolves moduleCode 1A to Wed of week 1', () => {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    sem.calendar.semesterStartDate = '2026-08-01';
    CalendarEngine.rebuildWeeks(sem);
    DataModel.migrateSemester(sem);
    var date = TheoryData.dateForModuleCode(sem, '1A');
    expect(date).toBeTruthy();
    var parsed = TheoryData.parseModuleCode('1A');
    expect(parsed.weekLabel).toBe(1);
    expect(parsed.slotLetter).toBe('A');
    expect(TheoryData.weekdayForSlot(['Wed', 'Thu'], 'A')).toBe('Wed');
  });

  it('projects lecture assignment rows from theory days', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.days = [{
      date: '2026-08-19',
      weekIndex: 0,
      weekday: 'Wed',
      weekLabel: 1,
      events: [{
        id: 'ev1',
        track: 'theory',
        moduleCode: '1A',
        title: 'Module 1A — Syllabus',
        timeStart: '0800',
        timeEnd: '1050',
        faculty: [{ name: 'Lead Faculty 1', role: 'lecturer' }],
        categories: ['lecture']
      }, {
        id: 'ev2',
        track: 'skills',
        title: 'Skills intro',
        description: 'Hand hygiene testout',
        timeStart: '1200',
        timeEnd: '1550',
        categories: ['skills_lab']
      }]
    }];
    var rows = TheoryData.projectLectureAssignments(sem.theory);
    expect(rows.length).toBe(1);
    expect(rows[0].topic).toContain('Syllabus');
    expect(rows[0].skillsLab).toContain('testout');
  });

  it('rolls one-group clinical/sim hours from Setup times', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    // Ensure facility times → 12.5h (0600–1830)
    var fac = sem.facilities[0];
    fac.clinicalStart = '0600';
    fac.clinicalEnd = '1830';
    sem.config.simDefaultStart = '0900';
    sem.config.simDefaultEnd = '1500';
    // Two students in different groups, same week clinical + sim
    sem.students[0].clinicalGroup = 'C1';
    sem.students[0].simGroup = 'SG1';
    sem.students[0].schedule[4] = {
      clinical: true, clinicalMissed: false, sim: null, simDay: null,
      simGuestGroup: null, makeupClinical: false, inactive: false,
      simMakeup: false, simOverload: false, facilityId: fac.id
    };
    sem.students[0].schedule[5] = {
      clinical: false, clinicalMissed: false, sim: 1, simDay: 'Mon',
      simGuestGroup: null, makeupClinical: false, inactive: false,
      simMakeup: false, simOverload: false, facilityId: null
    };
    if (sem.students[1]) {
      sem.students[1].clinicalGroup = 'C2';
      sem.students[1].simGroup = 'SG2';
      sem.students[1].schedule[4] = {
        clinical: true, clinicalMissed: false, sim: null, simDay: null,
        simGuestGroup: null, makeupClinical: false, inactive: false,
        simMakeup: false, simOverload: false, facilityId: fac.id
      };
      sem.students[1].schedule[5] = {
        clinical: false, clinicalMissed: false, sim: 1, simDay: 'Tue',
        simGuestGroup: null, makeupClinical: false, inactive: false,
        simMakeup: false, simOverload: false, facilityId: null
      };
      // Extra clinical week only for C2 (should not inflate C1 semester total)
      sem.students[1].schedule[6] = {
        clinical: true, clinicalMissed: false, sim: null, simDay: null,
        simGuestGroup: null, makeupClinical: false, inactive: false,
        simMakeup: false, simOverload: false, facilityId: fac.id
      };
    }
    var byWeek = TheoryData.rollSchedulerHours(sem, 'REGN15P');
    expect(byWeek[5].clinical).toBe(12.5);
    expect(byWeek[6].simulation).toBe(6);
    expect(byWeek[7].clinical).toBe(12.5); // union still shows C2's week
    var totals = TheoryData.semesterHourTotals(sem.theory, sem, 'REGN15P');
    // Semester clinical = C1 path only (week 5), not C2's extra week 7
    expect(totals.clinical).toBe(12.5);
    expect(totals.simulation).toBe(6);
  });

  it('builds coordinator day items and semester totals', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.days = [{
      date: '2026-08-19',
      weekIndex: 0,
      weekday: 'Wed',
      weekLabel: 1,
      events: [{
        id: 'ev1',
        track: 'theory',
        title: 'Module 1A',
        timeStart: '0800',
        timeEnd: '1050',
        categories: ['lecture']
      }, {
        id: 'ev2',
        track: 'skills',
        title: 'Skills intro',
        timeStart: '1200',
        timeEnd: '1550',
        categories: ['skills_lab']
      }, {
        id: 'ev3',
        track: 'simulation',
        title: 'Simulation',
        categories: ['simulation']
      }]
    }];
    var items = TheoryData.coordinatorItemsForDay(sem.theory, sem, 1, 'Wed', 'REGN15P');
    expect(items.length).toBe(2);
    expect(items[0].label).toBe('Lecture 0800–1050');
    expect(items[1].label).toBe('Skills lab 1200–1550');
    expect(items.every(function (i) { return i.kind !== 'simulation'; })).toBe(true);
    var totals = TheoryData.semesterHourTotals(sem.theory, sem, 'REGN15P');
    expect(totals.lecture).toBeGreaterThan(0);
    expect(totals.practicum).toBe(totals.skills_lab + totals.clinical + totals.simulation);
  });

  it('labels coordinator practicum items with group and sim/clinical number', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    var student = sem.students[0];
    student.clinicalGroup = 'C1';
    student.simGroup = 'SG1';
    sem.config.clinicalGroupDays = sem.config.clinicalGroupDays || {};
    sem.config.clinicalGroupDays.C1 = 'Mon';
    // Two prior clinical weeks so week 6 is Clinical 3
    student.schedule[0] = {
      clinical: true, clinicalMissed: false, sim: null, simDay: null,
      simGuestGroup: null, makeupClinical: false, inactive: false,
      simMakeup: false, simOverload: false, facilityId: 'fac_srmc'
    };
    student.schedule[2] = {
      clinical: true, clinicalMissed: false, sim: null, simDay: null,
      simGuestGroup: null, makeupClinical: false, inactive: false,
      simMakeup: false, simOverload: false, facilityId: 'fac_srmc'
    };
    student.schedule[5] = {
      clinical: true, clinicalMissed: false, sim: 1, simDay: 'Mon',
      simGuestGroup: null, makeupClinical: false, inactive: false,
      simMakeup: false, simOverload: false, facilityId: 'fac_srmc'
    };
    var monItems = TheoryData.coordinatorItemsForDay(sem.theory, sem, 6, 'Mon', 'REGN15P');
    var clin = monItems.filter(function (i) { return i.kind === 'clinical'; });
    var sims = monItems.filter(function (i) { return i.kind === 'simulation'; });
    expect(clin.length).toBe(1);
    expect(clin[0].label).toBe('C1 Clinical 3');
    expect(sims.length).toBe(1);
    expect(sims[0].label).toBe('SG1, Sim 1');
    var sunItems = TheoryData.coordinatorItemsForDay(sem.theory, sem, 6, 'Sun', 'REGN15P');
    expect(sunItems.filter(function (i) { return i.kind === 'simulation'; }).length).toBe(0);
  });

  it('auto-numbers lecture modules across a week and renumbers after remove', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.days = [{
      date: '2026-08-19', weekIndex: 0, weekday: 'Wed', weekLabel: 1,
      events: [
        { id: 'a', track: 'theory', title: 'Vitals', timeStart: '0800', timeEnd: '1050', categories: ['lecture'] },
        { id: 'b', track: 'theory', title: 'Test taking', timeStart: '0800', timeEnd: '1050', categories: ['lecture'] }
      ]
    }, {
      date: '2026-08-20', weekIndex: 0, weekday: 'Thu', weekLabel: 1,
      events: [
        { id: 'c', track: 'theory', title: 'Assessment', timeStart: '0800', timeEnd: '1050', categories: ['lecture'] }
      ]
    }, {
      date: '2026-08-21', weekIndex: 0, weekday: 'Fri', weekLabel: 1,
      events: [
        { id: 'd', track: 'theory', title: 'QSEN', timeStart: '0800', timeEnd: '1050', categories: ['lecture'] }
      ]
    }];
    TheoryData.renumberWeekModules(sem.theory, 1);
    expect(sem.theory.days[0].events[0].moduleCode).toBe('1A');
    expect(sem.theory.days[0].events[1].moduleCode).toBe('1B');
    expect(sem.theory.days[1].events[0].moduleCode).toBe('1C');
    expect(sem.theory.days[2].events[0].moduleCode).toBe('1D');
    expect(sem.theory.days[0].events[0].title).toContain('Module 1A');
    // Remove Wed's second topic → Thu 1C becomes 1B, Fri 1D becomes 1C
    sem.theory.days[0].events.splice(1, 1);
    TheoryData.renumberWeekModules(sem.theory, 1);
    expect(sem.theory.days[0].events[0].moduleCode).toBe('1A');
    expect(sem.theory.days[1].events[0].moduleCode).toBe('1B');
    expect(sem.theory.days[2].events[0].moduleCode).toBe('1C');
    // Same-slot topics count lecture hours once
    expect(TheoryData.sumTheoryHoursForWeek(sem.theory, 1, 'lecture')).toBeCloseTo(2.83 * 3, 1);
  });

  it('validates contact hour targets', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.settings.courseHourTargets[1].contactHoursTarget = 10;
    var v = TheoryData.contactHourValidation(sem.theory, sem, 'REGN15P');
    expect(v.target).toBe(10);
    expect(['on_target', 'under', 'over', 'unknown']).toContain(v.status);
  });

  it('FILE_VERSION is 5', () => {
    expect(DataModel.FILE_VERSION).toBe(5);
  });
});
