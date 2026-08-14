import { describe, it, expect } from 'vitest';
import { lectureRowsToEvents } from '../scripts/theory/import-lecture-assignments.js';
import { listOpenSlots } from '../src/core/faculty-schedule/slot-inventory.js';
import { buildWeekList } from '../src/core/calendar-weeks.js';

describe('REGN 15P lecture assignment import', () => {
  it('seeds two Faculty Needed seats for Wednesday and Thursday skills labs', () => {
    var events = lectureRowsToEvents([
      {
        week: 1,
        weekday: 'Wed',
        date: '2026-08-19',
        topic: 'Syllabus',
        lecturer: 'Mr. Faculty',
        skillsLab: 'Bed baths; Range of motion'
      },
      {
        week: 1,
        weekday: 'Thu',
        date: '2026-08-20',
        topic: 'Clinical learning',
        lecturer: 'Mr. Faculty',
        skillsLab: 'Vital signs; Physical assessment'
      }
    ], ['Wed', 'Thu']);

    ['2026-08-19', '2026-08-20'].forEach(function (date) {
      var skills = events[date].find(function (ev) { return ev.track === 'skills'; });
      expect(skills.facultyRequired).toBe(2);
      expect(skills.faculty).toEqual([
        { name: 'Faculty Needed', role: 'skills', needed: true },
        { name: 'Faculty Needed', role: 'skills', needed: true }
      ]);
    });
  });

  it('does not seed a faculty need for a No Class skills marker', () => {
    var events = lectureRowsToEvents([{
      week: 18,
      weekday: 'Thu',
      date: '2026-12-17',
      topic: '',
      lecturer: '',
      skillsLab: 'No Class'
    }], ['Wed', 'Thu']);
    var skills = events['2026-12-17'][0];

    expect(skills.facultyRequired).toBe(0);
    expect(skills.faculty).toEqual([]);
  });

  it('omits No Class dates from the recurring Thursday faculty series', () => {
    var events = lectureRowsToEvents([
      {
        week: 1,
        weekday: 'Thu',
        date: '2026-08-20',
        topic: '',
        lecturer: '',
        skillsLab: 'Bed baths; Range of motion'
      },
      {
        week: 18,
        weekday: 'Thu',
        date: '2026-12-17',
        topic: '',
        lecturer: '',
        skillsLab: 'No Class'
      }
    ], ['Wed', 'Thu']);
    var semester = {
      meta: { courseId: 'REGN15P' },
      config: {},
      calendar: {
        semesterStartDate: '2026-08-16',
        weeks: buildWeekList('2026-08-16')
      },
      faculty: [],
      simInstructors: [],
      students: [],
      theory: {
        days: [
          { date: '2026-08-20', weekIndex: 0, weekday: 'Thu', events: events['2026-08-20'] },
          { date: '2026-12-17', weekIndex: 17, weekday: 'Thu', events: events['2026-12-17'] }
        ]
      }
    };

    var skillsSlots = listOpenSlots(semester).filter(function (slot) {
      return slot.kind === 'skills';
    });
    expect(skillsSlots).toHaveLength(2);
    skillsSlots.forEach(function (slot) {
      expect(slot.facultyPerInstance).toBe(2);
      expect(slot.instances.map(function (inst) { return inst.date; })).toEqual(['2026-08-20']);
    });
  });
});
