import { describe, it, expect } from 'vitest';
import {
  instructionalHoursFromMinutes,
  instructionalHoursFromTimes,
  clockHoursFromTimes,
  contactTargetFromCredits,
  contactFormulaNote,
  semesterWeekCount,
  DEFAULT_SEMESTER_WEEKS
} from '../src/core/contact-hours.js';
import * as TheoryData from '../src/core/theory-data.js';
import * as DataModel from '../src/core/data-model/index.js';

describe('contact-hours.test.js', () => {
  it('applies Cont. Mult. plateaus and half-hour bands', () => {
    expect(instructionalHoursFromMinutes(40)).toBeCloseTo(40 / 60, 2);
    expect(instructionalHoursFromMinutes(50)).toBe(1);
    expect(instructionalHoursFromMinutes(60)).toBe(1);
    expect(instructionalHoursFromMinutes(70)).toBe(1.5);
    expect(instructionalHoursFromMinutes(170)).toBe(3);
    expect(instructionalHoursFromMinutes(195)).toBe(3.5);
    expect(instructionalHoursFromTimes('0800', '1050')).toBe(3);
    expect(instructionalHoursFromTimes('0800', '1115')).toBe(3.5);
  });

  it('keeps raw clock hours separate from Cont. Mult.', () => {
    expect(clockHoursFromTimes('0800', '1050')).toBeCloseTo(2.83, 2);
  });

  it('calculates credit → contact targets for theory and practicum', () => {
    expect(contactTargetFromCredits(6.5, 18, false)).toBe(117);
    expect(contactTargetFromCredits(5.5, 18, true)).toBe(297);
    expect(contactFormulaNote(6.5, 18, false)).toBe('6.5 credits × 18 weeks');
    expect(contactFormulaNote(5.5, 18, true)).toBe('5.5 credits × 3 × 18 weeks');
  });

  it('uses calendar week count or default 18', () => {
    expect(semesterWeekCount({ calendar: { weeks: new Array(16) } })).toBe(16);
    expect(semesterWeekCount({})).toBe(DEFAULT_SEMESTER_WEEKS);
  });

  it('migrates lecture/skills sessions from legacy defaults', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    sem.theory = {
      version: 1,
      courseCodes: ['REGN15', 'REGN15P'],
      settings: {
        lectureWeekdays: ['Mon', 'Wed'],
        defaultLectureStart: '0900',
        defaultLectureEnd: '1150',
        defaultSkillsStart: '1300',
        defaultSkillsEnd: '1650'
      },
      days: []
    };
    TheoryData.migrateTheory(sem);
    expect(sem.theory.settings.lectureSessions).toEqual([
      { weekday: 'Mon', start: '0900', end: '1150' },
      { weekday: 'Wed', start: '0900', end: '1150' }
    ]);
    expect(sem.theory.settings.skillsSessions[0]).toEqual({
      weekday: 'Fri',
      start: '1300',
      end: '1650'
    });
  });

  it('eventContactHours uses Cont. Mult.', () => {
    expect(TheoryData.eventContactHours({
      timeStart: '0800',
      timeEnd: '1050'
    })).toBe(3);
  });
});
