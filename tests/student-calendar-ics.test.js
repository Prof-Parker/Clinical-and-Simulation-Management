import { describe, it, expect } from 'vitest';
import {
  DataModel,
  CalendarEngine,
  Scheduler
} from './_harness.js';
import * as TheoryData from '../src/core/theory-data.js';
import {
  buildStudentIcs,
  collectStudentCalendarEvents,
  icsFilename,
  assignmentDueHhmm,
  icsEscape,
  formatLocalDateTime,
  DEFAULT_ASSIGNMENT_DUE
} from '../src/export/student-calendar-ics.js';
import { buildEmailRows, rowsToJson } from '../src/export/power-automate-json.js';

function seedTheoryDay(sem, date, events) {
  TheoryData.migrateTheory(sem);
  var day = TheoryData.ensureDay(sem.theory, sem, date);
  day.events = events;
  return day;
}

describe('student-calendar-ics', () => {
  it('escapes ICS text and formats local DATE-TIME', () => {
    expect(icsEscape('A;B,C\\D\nE')).toBe('A\\;B\\,C\\\\D\\nE');
    expect(formatLocalDateTime('2026-09-15', '0900')).toBe('20260915T090000');
    expect(assignmentDueHhmm({})).toBe(DEFAULT_ASSIGNMENT_DUE);
    expect(assignmentDueHhmm({ timeEnd: '1700' })).toBe('1700');
  });

  it('builds clinical, sim, lecture, skills, and assignment events', () => {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    DataModel.migrateSemester(sem);
    CalendarEngine.rebuildWeeks(sem);
    Scheduler.regenerateAll(sem);

    var student = sem.students.find(function (s) {
      return (s.schedule || []).some(function (c) { return c && c.clinical && c.sim; });
    }) || sem.students[0];

    var lectureDate = sem.calendar.weeks[4].startDate;
    // Force a Wednesday for lecture/skills/assignment if week starts Sunday
    var d = CalendarEngine.parseDate(lectureDate);
    var wed = CalendarEngine.toISO(CalendarEngine.addDays(d, 3));
    seedTheoryDay(sem, wed, [
      {
        id: 'lec1',
        track: 'theory',
        title: 'Module 5A — Vitals (secret topic)',
        timeStart: '0800',
        timeEnd: '1050',
        faculty: [{ name: 'Dr. Secret' }]
      },
      {
        id: 'sk1',
        track: 'skills',
        title: 'Skills lab',
        description: 'IV start; sterile technique',
        timeStart: '1200',
        timeEnd: '1550',
        faculty: [{ name: 'Faculty A' }]
      },
      {
        id: 'as1',
        track: 'assignment',
        title: 'Care plan draft',
        contentArea: 'theory'
      },
      {
        id: 'as2',
        track: 'assignment',
        title: 'Quiz due afternoon',
        contentArea: 'theory',
        timeEnd: '1500'
      }
    ]);

    var events = collectStudentCalendarEvents(sem, student);
    var summaries = events.map(function (e) { return e.summary; });

    expect(events.some(function (e) { return e.summary === 'Clinical' || e.summary === 'Makeup Clinical'; }))
      .toBe(true);
    expect(events.some(function (e) { return /^Simulation /.test(e.summary); })).toBe(true);
    expect(summaries).toContain('Lecture');
    expect(summaries).toContain('Skills lab');
    expect(summaries).toContain('Care plan draft');
    expect(summaries).toContain('Quiz due afternoon');

    // No topic/lecturer/faculty detail in lecture or skills summaries
    expect(summaries.some(function (s) { return /Vitals|Secret|IV start/.test(s); })).toBe(false);

    var dueDefault = events.find(function (e) { return e.summary === 'Care plan draft'; });
    expect(dueDefault.dtStart).toBe(formatLocalDateTime(wed, '2359'));
    expect(dueDefault.dtEnd).toBe(formatLocalDateTime(
      CalendarEngine.toISO(CalendarEngine.addDays(CalendarEngine.parseDate(wed), 1)),
      '0000'
    ));

    var dueExplicit = events.find(function (e) { return e.summary === 'Quiz due afternoon'; });
    expect(dueExplicit.dtStart).toBe(formatLocalDateTime(wed, '1500'));

    var ics = buildStudentIcs(sem, student, { now: new Date('2026-07-28T12:00:00Z') });
    expect(ics.indexOf('BEGIN:VCALENDAR')).toBe(0);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Lecture');
    expect(ics).toContain('SUMMARY:Skills lab');
    expect(ics).toContain('SUMMARY:Care plan draft');
    expect(ics).not.toContain('Dr. Secret');
    expect(ics).not.toContain('Vitals');
    expect(icsFilename(sem, student)).toMatch(/\.ics$/);

    var rows = buildEmailRows([student], {
      calendarType: 'summary',
      semesterName: 'Fall 2026',
      attachmentFor: function () { return 'file.pdf'; },
      icsFor: function () { return icsFilename(sem, student); }
    });
    expect(rows[0].IcsFilename).toMatch(/\.ics$/);
    expect(JSON.parse(rowsToJson(rows)).emails[0].IcsFilename).toMatch(/\.ics$/);
  });
});
