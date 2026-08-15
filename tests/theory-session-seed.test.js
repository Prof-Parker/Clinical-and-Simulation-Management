import { describe, it, expect } from 'vitest';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as TheoryData from '../src/core/theory-data.js';
import {
  seedEmptySessionEvents,
  importTheoryEventsFromSemester
} from '../src/core/theory-session-seed.js';

function makeSemester(startDate) {
  var fileRoot = DataModel.createDefaultFile();
  var sem = fileRoot.semesters[0];
  sem.calendar.semesterStartDate = startDate || '2026-08-16';
  CalendarEngine.rebuildWeeks(sem);
  DataModel.migrateSemester(sem);
  sem.theory.courseCodes = ['REGN15', 'REGN15P'];
  sem.theory.settings.lectureSessions = [
    { weekday: 'Wed', start: '0800', end: '1050' },
    { weekday: 'Thu', start: '0800', end: '1050' }
  ];
  sem.theory.settings.skillsSessions = [
    { weekday: 'Fri', start: '1200', end: '1550' }
  ];
  sem.theory.days = [];
  return sem;
}

describe('theory-session-seed', () => {
  it('seeds blank lecture and skills events with REGN 15 titles', () => {
    var sem = makeSemester();
    var result = seedEmptySessionEvents(sem);
    expect(result.lectureAdded).toBeGreaterThan(0);
    expect(result.skillsAdded).toBeGreaterThan(0);

    var wed = TheoryData.findDay(sem.theory, TheoryData.dateForWeekdayInWeek(sem, 0, 'Wed'));
    expect(wed).toBeTruthy();
    var lecture = wed.events.find(function (e) { return e.track === 'theory'; });
    expect(lecture).toBeTruthy();
    expect(lecture.title).toBe('REGN 15 Lecture');
    expect(lecture.moduleCode).toBeTruthy();

    var fri = TheoryData.findDay(sem.theory, TheoryData.dateForWeekdayInWeek(sem, 0, 'Fri'));
    var skills = fri.events.find(function (e) { return e.track === 'skills'; });
    expect(skills).toBeTruthy();
    expect(skills.title).toBe('REGN 15 Skills Lab');
  });

  it('skips holidays and existing lectures; second run adds zero', () => {
    var sem = makeSemester();
    // Wednesday of week 1 (2026-08-16 Sunday start → Wed 2026-08-19)
    var holidayWed = '2026-08-19';
    sem.holidays = [
      { id: 'h1', type: 'holiday', date: holidayWed, label: 'In-service' }
    ];
    TheoryData.syncHolidaysFromSemester(sem);

    var secondWed = TheoryData.dateForWeekdayInWeek(sem, 1, 'Wed');
    var day = TheoryData.ensureDay(sem.theory, sem, secondWed);
    TheoryData.insertEventOnDay(day, {
      id: 'existing',
      track: 'theory',
      title: 'Already filled',
      timeStart: '0800',
      timeEnd: '1050',
      courseCode: 'REGN15',
      categories: ['lecture'],
      faculty: [],
      moduleCode: null
    });

    var result = seedEmptySessionEvents(sem);
    var holidayDay = TheoryData.findDay(sem.theory, holidayWed);
    expect(holidayDay.isHoliday || holidayDay.events.some(function (e) {
      return e.track === 'holiday';
    })).toBe(true);
    var holidayLectures = (holidayDay.events || []).filter(function (e) {
      return e.track === 'theory';
    });
    expect(holidayLectures.length).toBe(0);

    var wedAgain = TheoryData.findDay(sem.theory, secondWed);
    var lectures = wedAgain.events.filter(function (e) { return e.track === 'theory'; });
    expect(lectures.length).toBe(1);
    expect(lectures[0].title).toMatch(/Already filled|Module/);

    var second = seedEmptySessionEvents(sem);
    expect(second.lectureAdded).toBe(0);
    expect(second.skillsAdded).toBe(0);
    expect(result.lectureAdded).toBeGreaterThan(0);
  });

  it('renumber keeps placeholder title; topic seed fills placeholders only', () => {
    var sem = makeSemester();
    seedEmptySessionEvents(sem);
    var wedDate = TheoryData.dateForWeekdayInWeek(sem, 0, 'Wed');
    var wed = TheoryData.findDay(sem.theory, wedDate);
    var placeholder = wed.events.find(function (e) { return e.track === 'theory'; });
    expect(placeholder.title).toBe('REGN 15 Lecture');
    expect(placeholder.moduleCode).toBe('1A');

    TheoryData.renumberWeekModules(sem.theory, 1);
    expect(placeholder.title).toBe('REGN 15 Lecture');

    var titled = wed.events.find(function (e) { return e.track === 'theory'; });
    titled.title = 'Module 1A — Assessment';

    var source = {
      days: [{
        weekLabel: 1,
        weekday: 'Wed',
        date: '2025-08-20',
        events: [{
          id: 'src1',
          track: 'theory',
          title: 'Module 1A — Vitals',
          moduleCode: '1A',
          moduleRef: 'topic_vitals',
          categories: ['lecture']
        }, {
          id: 'src2',
          track: 'theory',
          title: 'Module 1B — QSEN',
          moduleCode: '1B',
          categories: ['lecture']
        }]
      }]
    };

    var thuDate = TheoryData.dateForWeekdayInWeek(sem, 0, 'Thu');
    var thu = TheoryData.findDay(sem.theory, thuDate);
    var emptyThu = thu.events.find(function (e) { return e.track === 'theory'; });
    expect(TheoryData.isPlaceholderTopicTitle(emptyThu.title)).toBe(true);

    var filled = TheoryData.seedTopicsFromTheory(sem.theory, source);
    expect(filled.filled).toBeGreaterThanOrEqual(1);
    expect(titled.title).toBe('Module 1A — Assessment');
    expect(emptyThu.title).toBe('Module 1B — QSEN');
  });

  it('full import wipes theory events, preserves holidays and synced practicum', () => {
    var target = makeSemester('2026-08-16');
    var laborDate = '2026-09-07';
    target.holidays = [
      { id: 'h1', type: 'holiday', date: laborDate, label: 'Labor Day' }
    ];
    TheoryData.syncHolidaysFromSemester(target);

    var wedDate = TheoryData.dateForWeekdayInWeek(target, 0, 'Wed');
    var wed = TheoryData.ensureDay(target.theory, target, wedDate);
    TheoryData.insertEventOnDay(wed, {
      id: 'old_lec',
      track: 'theory',
      title: 'Old lecture',
      timeStart: '0800',
      timeEnd: '1050',
      courseCode: 'REGN15',
      categories: ['lecture'],
      faculty: [],
      moduleCode: '1A'
    });
    TheoryData.insertEventOnDay(wed, {
      id: 'synced_clin',
      track: 'clinical',
      title: 'Clinical C1',
      categories: [TheoryData.SYNCED_PRACTICUM_CATEGORY],
      courseCode: 'REGN15P',
      faculty: []
    });

    var sourceWed = '2025-08-20';
    var source = {
      days: [
        {
          weekLabel: 1,
          weekday: 'Wed',
          date: sourceWed,
          events: [{
            id: 'src_lec',
            track: 'theory',
            title: 'Module 1A — Imported topic',
            timeStart: '0800',
            timeEnd: '1050',
            courseCode: 'REGN15',
            categories: ['lecture'],
            faculty: [{ name: 'Faculty Needed', needed: true, role: 'lecturer' }],
            moduleCode: '1A'
          }]
        },
        {
          weekLabel: 4,
          weekday: 'Mon',
          date: '2025-09-08',
          events: [{
            id: 'src_holiday',
            track: 'holiday',
            title: 'Labor Day',
            categories: ['synced_holiday'],
            allDay: true
          }]
        },
        {
          weekLabel: 4,
          weekday: 'Mon',
          date: '2025-09-08',
          events: [{
            id: 'src_on_holiday',
            track: 'theory',
            title: 'Should skip — lands on target holiday',
            timeStart: '0800',
            timeEnd: '1050',
            courseCode: 'REGN15',
            categories: ['lecture'],
            moduleCode: '4A'
          }]
        }
      ]
    };

    var result = importTheoryEventsFromSemester(target, source);
    expect(result.removed).toBeGreaterThanOrEqual(1);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBeGreaterThanOrEqual(1);

    var targetWed = TheoryData.findDay(target.theory, wedDate);
    expect(targetWed.events.some(function (e) { return e.id === 'old_lec'; })).toBe(false);
    expect(targetWed.events.some(function (e) {
      return e.categories && e.categories.indexOf(TheoryData.SYNCED_PRACTICUM_CATEGORY) >= 0;
    })).toBe(true);
    expect(targetWed.events.some(function (e) {
      return e.track === 'theory' && /Imported topic/.test(e.title);
    })).toBe(true);

    var labor = TheoryData.findDay(target.theory, laborDate);
    expect(labor.events.some(function (e) { return e.track === 'holiday'; })).toBe(true);
    expect(labor.events.some(function (e) {
      return e.track === 'theory' && /Should skip/.test(e.title);
    })).toBe(false);
  });
});
