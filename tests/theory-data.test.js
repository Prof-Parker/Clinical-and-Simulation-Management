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

  it('rolls contact hours from scheduler and rules', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.students[0].schedule[4] = {
      clinical: true,
      clinicalMissed: false,
      sim: null,
      simDay: null,
      simGuestGroup: null,
      makeupClinical: false,
      inactive: false,
      simMakeup: false,
      simOverload: false,
      facilityId: 'fac_srmc'
    };
    sem.students[0].schedule[5] = {
      clinical: false,
      clinicalMissed: false,
      sim: 1,
      simDay: 'Mon',
      simGuestGroup: null,
      makeupClinical: false,
      inactive: false,
      simMakeup: false,
      simOverload: false,
      facilityId: null
    };
    var raw = TheoryData.rollSchedulerHours(sem, 'REGN15P');
    expect(raw[5].clinical).toBeGreaterThan(0);
    expect(raw[6].simulation).toBeGreaterThan(0);
    var perStudent = TheoryData.rollSchedulerHoursPerStudent(sem, 'REGN15P');
    var n = TheoryData.studentCountForSemester(sem);
    expect(perStudent[5].clinical).toBeCloseTo(raw[5].clinical / n, 2);
    expect(perStudent[6].simulation).toBeCloseTo(raw[6].simulation / n, 2);
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
      }]
    }];
    var items = TheoryData.coordinatorItemsForDay(sem.theory, sem, 1, 'Wed', 'REGN15P');
    expect(items.length).toBe(2);
    expect(items[0].label).toBe('Lecture 0800–1050');
    expect(items[1].label).toBe('Skills lab 1200–1550');
    var totals = TheoryData.semesterHourTotals(sem.theory, sem, 'REGN15P');
    expect(totals.lecture).toBeGreaterThan(0);
    expect(totals.practicum).toBe(totals.skills_lab + totals.clinical + totals.simulation);
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
