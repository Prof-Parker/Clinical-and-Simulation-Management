import { describe, it, expect } from 'vitest';
import * as CourseVisibility from '../src/core/course-visibility.js';
import * as TheoryData from '../src/core/theory-data.js';
import * as DataModel from '../src/core/data-model/index.js';
import * as HoursBySpecialty from '../src/core/hours-by-specialty.js';

describe('course-visibility', () => {
  it('detects third semester course ids', () => {
    expect(CourseVisibility.isThirdSemester('REGN35P-36P')).toBe(true);
    expect(CourseVisibility.isThirdSemester('REGN35')).toBe(true);
    expect(CourseVisibility.isThirdSemester('REGN15P')).toBe(false);
  });

  it('maps OB/PED faculty to REGN36 and others to REGN35', () => {
    var sem = { meta: { courseId: 'REGN35P-36P' } };
    expect(CourseVisibility.theoryCodesForSession(
      { role: 'adjunct_faculty', specialties: ['OB'] }, sem
    )).toEqual(['REGN36']);
    expect(CourseVisibility.theoryCodesForSession(
      { role: 'adjunct_faculty', specialties: ['PED'] }, sem
    )).toEqual(['REGN36']);
    expect(CourseVisibility.theoryCodesForSession(
      { role: 'lead_course_faculty', specialties: ['MS', 'ICU'] }, sem
    )).toEqual(['REGN35']);
    expect(CourseVisibility.theoryCodesForSession(
      { role: 'adjunct_faculty', specialties: [] }, sem
    )).toEqual(['REGN35']);
  });

  it('gives admin and program engineer both theory courses', () => {
    var sem = { meta: { courseId: 'REGN35P-36P' } };
    expect(CourseVisibility.theoryCodesForSession(
      { role: 'admin_staff', specialties: ['OB'] }, sem
    )).toEqual(['REGN35', 'REGN36']);
    expect(CourseVisibility.theoryCodesForSession(
      { role: 'program_engineer', specialties: [] }, sem
    )).toEqual(['REGN35', 'REGN36']);
  });

  it('lets OB win over MS when both present', () => {
    var sem = { meta: { courseId: 'REGN35P-36P' } };
    expect(CourseVisibility.theoryCodesForSession(
      { role: 'lead_course_faculty', specialties: ['MS', 'OB'] }, sem
    )).toEqual(['REGN36']);
  });

  it('maps content tags to practicum course codes', () => {
    expect(CourseVisibility.practicumCourseForContentTags(['MS'])).toBe('REGN35P');
    expect(CourseVisibility.practicumCourseForContentTags(['OB'])).toBe('REGN36P');
    expect(CourseVisibility.practicumCourseForContentTags(['PEDS'])).toBe('REGN36P');
    expect(CourseVisibility.practicumCourseForContentTags(['MH'])).toBe('REGN35P');
  });

  it('filters theory events by courseCode and keeps holidays', () => {
    var events = [
      { track: 'holiday', categories: ['synced_holiday'], title: 'Break' },
      { track: 'theory', courseCode: 'REGN35', title: 'MS lecture' },
      { track: 'theory', courseCode: 'REGN36', title: 'OB lecture' },
      { track: 'skills', courseCode: 'REGN35', title: 'Skills lab' }
    ];
    var filtered = CourseVisibility.filterEventsForCourse(events, 'REGN35', {
      meta: { courseId: 'REGN35P-36P' },
      config: { simDaysRequired: 5, simContentTags: {} }
    });
    expect(filtered.map(function (e) { return e.title; })).toEqual([
      'Break', 'MS lecture', 'Skills lab'
    ]);
  });
});

describe('migrateTheory REGN35P-36P', () => {
  it('sets four course codes for third-semester files', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    sem.meta.courseId = 'REGN35P-36P';
    delete sem.theory;
    TheoryData.migrateTheory(sem);
    expect(sem.theory.courseCodes).toEqual(['REGN35', 'REGN36', 'REGN35P', 'REGN36P']);
  });

  it('upgrades legacy REGN15 codes on an existing 3rd-semester theory blob', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    sem.meta.courseId = 'REGN35P-36P';
    TheoryData.migrateTheory(sem);
    sem.theory.courseCodes = ['REGN15', 'REGN15P'];
    TheoryData.migrateTheory(sem);
    expect(sem.theory.courseCodes).toEqual(['REGN35', 'REGN36', 'REGN35P', 'REGN36P']);
  });
});

describe('hours-by-specialty', () => {
  function makeSemester() {
    var sem = DataModel.createDefaultFile().semesters[0];
    sem.meta.courseId = 'REGN35P-36P';
    DataModel.migrateSemester(sem);
    sem.config.simContentTags = {
      '1': ['MS'],
      '2': ['OB', 'PEDS'],
      '3': ['MS'],
      '4': ['OB', 'PEDS'],
      '5': ['MS']
    };
    sem.facilities = [
      { id: 'fac_ms', name: 'MS Site', shortName: 'MS', contentTags: ['MS'], clinicalStart: '0700', clinicalEnd: '1900' },
      { id: 'fac_ob', name: 'OB Site', shortName: 'OB', contentTags: ['OB'], clinicalStart: '0700', clinicalEnd: '1900' }
    ];
    return sem;
  }

  it('buckets clinical and sim hours by specialty tag', () => {
    var sem = makeSemester();
    var student = DataModel.createStudent('Student 1', 'C1', 'SG1');
    student.facilityId = 'fac_ms';
    student.schedule[4] = Object.assign(DataModel.emptyCell(), {
      clinical: true,
      facilityId: 'fac_ms'
    });
    student.schedule[5] = Object.assign(DataModel.emptyCell(), {
      clinical: true,
      facilityId: 'fac_ob'
    });
    student.schedule[6] = Object.assign(DataModel.emptyCell(), {
      sim: 1,
      simDay: 'Mon'
    });
    student.schedule[7] = Object.assign(DataModel.emptyCell(), {
      sim: 2,
      simDay: 'Mon'
    });
    var h = HoursBySpecialty.studentHoursBySpecialty(student, sem);
    expect(h.clinicalByTag.MS).toBeGreaterThan(0);
    expect(h.clinicalByTag.OB).toBeGreaterThan(0);
    expect(h.simByTag.MS).toBeGreaterThan(0);
    expect(h.simByTag.OB).toBeGreaterThan(0);
    expect(HoursBySpecialty.practicumLabelForSimCell(sem, 1)).toBe('REGN 35P');
    expect(HoursBySpecialty.practicumLabelForSimCell(sem, 2)).toBe('REGN 36P');
  });
});
