/**
 * Specialty catalog + message framework + slot rules unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeSpecialty,
  normalizeSpecialties,
  matchesSiteTag,
  ensureLeadLectureTag,
  userMatchesAnySpecialty,
  userMatchesAllSpecialties
} from '../src/core/faculty-schedule/specialties.js';
import { validateCart, userCanSeeSlot } from '../src/core/faculty-schedule/slot-rules.js';
import * as Messages from '../src/messages/messages.js';
import { MESSAGE_TYPES } from '../src/messages/message-types.js';
import * as MessageEmit from '../src/messages/message-emit.js';
import * as ScheduleProposals from '../src/proposals/schedule-proposals.js';
import * as UserTemplate from '../src/auth/user-template.js';
import { listOpenSlots } from '../src/core/faculty-schedule/slot-inventory.js';
import { FACULTY_NEEDED_NAME, facultyDisplayName } from '../src/core/theory-events.js';

describe('specialties', () => {
  it('normalizes PEDS to PED and Lec case', () => {
    expect(normalizeSpecialty('peds')).toBe('PED');
    expect(normalizeSpecialty('lec')).toBe('Lec');
    expect(normalizeSpecialties(['MS', 'ms', 'PEDS', 'bogus'])).toEqual(['MS', 'PED']);
  });

  it('matches site PEDS to PED specialty', () => {
    expect(matchesSiteTag('PED', 'PEDS')).toBe(true);
    expect(matchesSiteTag('MS', 'MS')).toBe(true);
    expect(matchesSiteTag('OB', 'MS')).toBe(false);
  });

  it('ensures Lec for full time faculty', () => {
    expect(ensureLeadLectureTag('lead_course_faculty', ['MS'])).toContain('Lec');
    expect(ensureLeadLectureTag('adjunct_faculty', ['MS'])).toEqual(['MS']);
  });

  it('matches all required specialties', () => {
    expect(userMatchesAllSpecialties(['OB', 'PED'], ['OB', 'PED'])).toBe(true);
    expect(userMatchesAllSpecialties(['OB'], ['OB', 'PED'])).toBe(false);
    expect(userMatchesAllSpecialties(['OB', 'PED', 'Lec'], ['Lec', 'OB'])).toBe(true);
    expect(userMatchesAllSpecialties(['OB', 'Lec'], [])).toBe(true);
  });
});

describe('messages', () => {
  it('creates and marks read', () => {
    var entry = { messages: [] };
    var msg = Messages.createMessage({
      type: MESSAGE_TYPES.SELF_SCHEDULE_UPDATE,
      body: 'Reviewed'
    });
    Messages.appendMessage(entry, msg);
    expect(Messages.unreadCount(entry)).toBe(1);
    Messages.markRead(entry, msg.id);
    expect(Messages.unreadCount(entry)).toBe(0);
  });

  it('emits to admins', () => {
    var registry = {
      users: {
        a1: { role: 'admin_staff', status: 'active', messages: [] },
        f1: { role: 'adjunct_faculty', status: 'active', messages: [] }
      }
    };
    MessageEmit.emitNewSelfScheduleRequests(registry, 2, {});
    expect(Messages.unreadCount(registry.users.a1)).toBe(1);
    expect(Messages.unreadCount(registry.users.f1)).toBe(0);
  });
});

describe('slot rules', () => {
  function slot(partial) {
    return Object.assign({
      slotId: 's1',
      kind: 'skills',
      specialties: ['MS'],
      timeStart: '0800',
      timeEnd: '1200',
      siteId: '',
      instances: [{ date: '2026-09-01', timeStart: '0800', timeEnd: '1200' }]
    }, partial);
  }

  it('rejects specialty mismatch', () => {
    var r = validateCart([slot({})], ['OB']);
    expect(r.ok).toBe(false);
  });

  it('allows consecutive non-overlapping same-site skills', () => {
    var r = validateCart([
      slot({ slotId: 'a', timeStart: '0800', timeEnd: '1150',
        instances: [{ date: '2026-09-01', timeStart: '0800', timeEnd: '1150' }] }),
      slot({ slotId: 'b', timeStart: '1200', timeEnd: '1550',
        instances: [{ date: '2026-09-01', timeStart: '1200', timeEnd: '1550' }] })
    ], ['MS']);
    expect(r.ok).toBe(true);
  });

  it('rejects overlapping times', () => {
    var r = validateCart([
      slot({ slotId: 'a',
        instances: [{ date: '2026-09-01', timeStart: '0800', timeEnd: '1250' }] }),
      slot({ slotId: 'b',
        instances: [{ date: '2026-09-01', timeStart: '1200', timeEnd: '1550' }] })
    ], ['MS']);
    expect(r.ok).toBe(false);
  });

  it('requires travel gap for clinical different sites', () => {
    var r = validateCart([
      slot({
        slotId: 'c1', kind: 'clinical', siteId: 'srmc',
        instances: [{ date: '2026-09-01', timeStart: '0600', timeEnd: '1200' }]
      }),
      slot({
        slotId: 'c2', kind: 'clinical', siteId: 'stel',
        instances: [{ date: '2026-09-01', timeStart: '1200', timeEnd: '1830' }]
      })
    ], ['MS']);
    expect(r.ok).toBe(false);
  });

  it('userCanSeeSlot requires every listed specialty', () => {
    expect(userCanSeeSlot(slot({ specialties: ['OB'] }), ['MS'], false)).toBe(false);
    expect(userCanSeeSlot(slot({ specialties: ['OB'] }), ['MS'], true)).toBe(true);
    expect(userCanSeeSlot(slot({ specialties: ['OB', 'PED'] }), ['OB'], false)).toBe(false);
    expect(userCanSeeSlot(slot({ specialties: ['OB', 'PED'] }), ['OB', 'PED'], false)).toBe(true);
    expect(userMatchesAnySpecialty(['MS', 'OB'], ['OB'])).toBe(true);
  });
});

describe('self schedule proposals', () => {
  it('submits and partially reviews', () => {
    var semester = {
      id: 'sem1',
      meta: { selfSchedulingOpen: true, courseId: 'REGN15P', semesterName: 'Fall 2026' },
      proposals: [],
      faculty: [{ id: 'f1', clinicalGroup: 'C1', needed: true, name: 'Faculty Needed' }],
      simInstructors: [],
      students: [{
        id: 'stu1',
        clinicalGroup: 'C1',
        facilityId: 'fac1',
        schedule: Array.from({ length: 18 }, function (_, i) {
          return i === 4
            ? { clinical: true, date: '2026-09-14', day: 'Monday', facilityId: 'fac1' }
            : {};
        })
      }],
      facilities: [{
        id: 'fac1', shortName: 'SRMC', siteId: 'srmc',
        clinicalStart: '0600', clinicalEnd: '1830', contentTags: ['MS']
      }],
      config: {},
      facultySchedule: { substitutes: [] }
    };
    var session = { userId: 'u1', name: 'Ada Faculty', email: 'a@x.com', specialties: ['MS'] };
    var result = ScheduleProposals.submitSelfSchedule(semester, ['clinical:f1'], session, {});
    expect(result.ok).toBe(true);
    expect(semester.proposals.length).toBe(1);
    var registry = {
      users: {
        u1: { role: 'adjunct_faculty', status: 'active', messages: [] },
        admin: { role: 'admin_staff', status: 'active', messages: [] }
      }
    };
    var reviewed = ScheduleProposals.reviewSelfSchedule(
      semester,
      result.proposal.id,
      { 'clinical:f1': 'approved' },
      { userId: 'admin', name: 'Admin' },
      'ok',
      registry
    );
    expect(reviewed.ok).toBe(true);
    expect(semester.faculty[0].needed).toBe(false);
    expect(semester.faculty[0].name).toBe('Ada Faculty');
    expect(Messages.unreadCount(registry.users.u1)).toBe(1);
  });

  function theoryDay(date, weekday, weekIndex, ev) {
    return {
      date: date,
      weekday: weekday,
      weekIndex: weekIndex,
      events: [ev]
    };
  }

  function theorySemester(days) {
    return {
      id: 'sem35',
      meta: { selfSchedulingOpen: true, courseId: 'REGN35P-36P', semesterName: 'Fall 2026' },
      proposals: [],
      faculty: [],
      simInstructors: [],
      students: [],
      facilities: [],
      config: {},
      facultySchedule: { substitutes: [] },
      theory: { days: days }
    };
  }

  it('approves a unique skills-fair seat on production-shaped days without id', () => {
    var semester = theorySemester([
      theoryDay('2026-08-17', 'Monday', 0, {
        id: 'ev_fair',
        track: 'skills',
        title: 'REGN 35P Skills Fair',
        courseCode: 'REGN35P',
        timeStart: '0800',
        timeEnd: '1200',
        categories: ['skills_lab'],
        faculty: [
          { name: FACULTY_NEEDED_NAME, role: 'skills', needed: true }
        ]
      })
    ]);
    var slot = listOpenSlots(semester).find(function (s) { return s.kind === 'skills'; });
    expect(slot).toBeTruthy();
    expect(slot.coversAllInstances).toBe(false);
    expect(slot.theoryRefs[0].dayId).toBe('2026-08-17');
    expect(slot.theoryRefs[0].date).toBe('2026-08-17');
    var session = { userId: 'u1', name: 'Ada Faculty', specialties: ['MS'] };
    var submitted = ScheduleProposals.submitSelfSchedule(semester, [slot.slotId], session, {
      allowSpecialtyOverride: true
    });
    expect(submitted.ok).toBe(true);
    var decisions = {};
    decisions[slot.slotId] = 'approved';
    var reviewed = ScheduleProposals.reviewSelfSchedule(
      semester,
      submitted.proposal.id,
      decisions,
      { userId: 'admin', name: 'Admin' },
      'ok',
      null
    );
    expect(reviewed.ok).toBe(true);
    expect(reviewed.proposal.status).toBe('approved');
    var fac = semester.theory.days[0].events[0].faculty[0];
    expect(fac.needed).toBe(false);
    expect(fac.name).toBe('Ada Faculty');
    expect(facultyDisplayName(fac)).toBe('Ada Faculty');
    var stillOpen = listOpenSlots(semester).some(function (s) { return s.slotId === slot.slotId; });
    expect(stillOpen).toBe(false);
  });

  it('approves a repeating lecture seat across every instance', () => {
    var semester = theorySemester([
      theoryDay('2026-08-18', 'Tuesday', 0, {
        id: 'ev_lec_a',
        track: 'theory',
        title: 'REGN 36 Lecture',
        courseCode: 'REGN36',
        timeStart: '0800',
        timeEnd: '1115',
        categories: ['lecture'],
        faculty: [{ name: FACULTY_NEEDED_NAME, role: 'lecturer', needed: true }]
      }),
      theoryDay('2026-08-25', 'Tuesday', 1, {
        id: 'ev_lec_b',
        track: 'theory',
        title: 'REGN 36 Lecture',
        courseCode: 'REGN36',
        timeStart: '0800',
        timeEnd: '1115',
        categories: ['lecture'],
        faculty: [{ name: FACULTY_NEEDED_NAME, role: 'lecturer', needed: true }]
      })
    ]);
    var slot = listOpenSlots(semester).find(function (s) { return s.kind === 'lecture'; });
    expect(slot).toBeTruthy();
    expect(slot.coversAllInstances).toBe(true);
    expect(slot.theoryRefs.length).toBe(2);
    var session = { userId: 'u1', name: 'Ada Faculty', specialties: ['Lec'] };
    var submitted = ScheduleProposals.submitSelfSchedule(semester, [slot.slotId], session, {});
    expect(submitted.ok).toBe(true);
    var decisions = {};
    decisions[slot.slotId] = 'approved';
    var reviewed = ScheduleProposals.reviewSelfSchedule(
      semester,
      submitted.proposal.id,
      decisions,
      { userId: 'admin', name: 'Admin' },
      'ok',
      null
    );
    expect(reviewed.ok).toBe(true);
    expect(semester.theory.days[0].events[0].faculty[0].name).toBe('Ada Faculty');
    expect(semester.theory.days[1].events[0].faculty[0].name).toBe('Ada Faculty');
    expect(facultyDisplayName(semester.theory.days[0].events[0].faculty[0])).toBe('Ada Faculty');
    expect(listOpenSlots(semester).some(function (s) { return s.slotId === slot.slotId; })).toBe(false);
  });

  it('does not mark a request approved when assignment cannot be applied', () => {
    var semester = theorySemester([
      theoryDay('2026-08-18', 'Tuesday', 0, {
        id: 'ev_lec',
        track: 'theory',
        title: 'REGN 36 Lecture',
        courseCode: 'REGN36',
        timeStart: '0800',
        timeEnd: '1115',
        categories: ['lecture'],
        faculty: [{ name: FACULTY_NEEDED_NAME, role: 'lecturer', needed: true }]
      })
    ]);
    var slot = listOpenSlots(semester).find(function (s) { return s.kind === 'lecture'; });
    var session = { userId: 'u1', name: 'Ada Faculty', specialties: ['Lec'] };
    var submitted = ScheduleProposals.submitSelfSchedule(semester, [slot.slotId], session, {});
    expect(submitted.ok).toBe(true);
    semester.theory.days = [];
    var decisions = {};
    decisions[slot.slotId] = 'approved';
    var reviewed = ScheduleProposals.reviewSelfSchedule(
      semester,
      submitted.proposal.id,
      decisions,
      { userId: 'admin', name: 'Admin' },
      'ok',
      null
    );
    expect(reviewed.error).toMatch(/Could not assign slot/i);
    expect(submitted.proposal.status).toBe('pending');
    expect(submitted.proposal.items[0].decision).toBeNull();
  });

  it('does not persist denials when every approve fails to apply', () => {
    var semester = {
      id: 'sem1',
      meta: { selfSchedulingOpen: true, courseId: 'REGN15P', semesterName: 'Fall 2026' },
      proposals: [],
      faculty: [
        { id: 'f1', clinicalGroup: 'C1', needed: true, name: 'Faculty Needed' },
        { id: 'f2', clinicalGroup: 'C2', needed: true, name: 'Faculty Needed' }
      ],
      simInstructors: [],
      students: [{
        id: 'stu1',
        clinicalGroup: 'C1',
        facilityId: 'fac1',
        schedule: Array.from({ length: 18 }, function (_, i) {
          return i === 4
            ? { clinical: true, date: '2026-09-14', day: 'Monday', facilityId: 'fac1' }
            : {};
        })
      }, {
        id: 'stu2',
        clinicalGroup: 'C2',
        facilityId: 'fac1',
        schedule: Array.from({ length: 18 }, function (_, i) {
          return i === 4
            ? { clinical: true, date: '2026-09-14', day: 'Monday', facilityId: 'fac1' }
            : {};
        })
      }],
      facilities: [{
        id: 'fac1', shortName: 'SRMC', siteId: 'srmc',
        clinicalStart: '0600', clinicalEnd: '1830', contentTags: ['MS']
      }],
      config: {},
      facultySchedule: { substitutes: [] },
      theory: {
        days: [{
          date: '2026-08-18',
          weekday: 'Tuesday',
          weekIndex: 0,
          events: [{
            id: 'ev_lec',
            track: 'theory',
            title: 'REGN 15 Lecture',
            courseCode: 'REGN15',
            timeStart: '0800',
            timeEnd: '1115',
            categories: ['lecture'],
            faculty: [{ name: FACULTY_NEEDED_NAME, role: 'lecturer', needed: true }]
          }]
        }]
      }
    };
    var session = { userId: 'u1', name: 'Ada Faculty', specialties: ['MS', 'Lec'] };
    var clinicalSlot = listOpenSlots(semester).find(function (s) {
      return s.kind === 'clinical' && s.slotId === 'clinical:f1';
    });
    var lectureSlot = listOpenSlots(semester).find(function (s) { return s.kind === 'lecture'; });
    expect(clinicalSlot).toBeTruthy();
    expect(lectureSlot).toBeTruthy();

    var submitted = ScheduleProposals.submitSelfSchedule(
      semester,
      [clinicalSlot.slotId, lectureSlot.slotId],
      session,
      {}
    );
    expect(submitted.ok).toBe(true);

    semester.theory.days = [];
    var decisions = {};
    decisions[clinicalSlot.slotId] = 'denied';
    decisions[lectureSlot.slotId] = 'approved';
    var reviewed = ScheduleProposals.reviewSelfSchedule(
      semester,
      submitted.proposal.id,
      decisions,
      { userId: 'admin', name: 'Admin' },
      'ok',
      null
    );
    expect(reviewed.error).toMatch(/Could not assign slot/i);
    expect(submitted.proposal.status).toBe('pending');
    expect(submitted.proposal.reviewedBy == null).toBe(true);
    submitted.proposal.items.forEach(function (item) {
      expect(item.decision).toBeNull();
    });
  });
});

describe('substitute proposals', () => {
  it('rejects covers spanning two weeks', () => {
    var semester = {
      proposals: [],
      faculty: [{ id: 'f1', clinicalGroup: 'C1', needed: false, name: 'Ada Faculty', userId: 'u1' }],
      simInstructors: [],
      students: [{
        id: 'stu1',
        clinicalGroup: 'C1',
        schedule: Array.from({ length: 18 }, function (_, i) {
          return i === 4 || i === 5
            ? {
              clinical: true,
              date: i === 4 ? '2026-09-14' : '2026-09-21',
              day: 'Monday'
            }
            : {};
        })
      }],
      facilities: [{ id: 'fac1', clinicalStart: '0600', clinicalEnd: '1830', contentTags: ['MS'] }],
      config: {},
      meta: { courseId: 'REGN15P' },
      facultySchedule: { substitutes: [] }
    };
    var session = { userId: 'u1', name: 'Ada Faculty', specialties: ['MS'] };
    var result = ScheduleProposals.submitSubstituteRequest(
      semester,
      'clinical:f1',
      [
        { date: '2026-09-14', timeStart: '0600', timeEnd: '1830' },
        { date: '2026-09-21', timeStart: '0600', timeEnd: '1830' }
      ],
      session,
      {}
    );
    expect(result.error).toMatch(/one calendar week/i);
  });
});

describe('slot inventory dates', () => {
  it('derives clinical instances from calendar weeks when cells lack date/day', async () => {
    var { listOpenSlots, clinicalInstances } = await import('../src/core/faculty-schedule/slot-inventory.js');
    var { buildWeekList } = await import('../src/core/calendar-weeks.js');
    var semester = {
      meta: { courseId: 'REGN15P' },
      config: {
        clinicalGroupDays: { C1: 'Sat', C2: 'Mon' },
        clinicalGroupFacilities: { C1: ['fac1'], C2: ['fac1'] }
      },
      calendar: { semesterStartDate: '2026-08-16', weeks: buildWeekList('2026-08-16') },
      faculty: [
        { id: 'f1', clinicalGroup: 'C1', needed: true, name: 'Faculty Needed' },
        { id: 'f2', clinicalGroup: 'C2', needed: true, name: 'Faculty Needed' }
      ],
      simInstructors: [{ id: 's1', needed: true, name: 'Faculty Needed' }],
      students: [{
        id: 'stu1',
        clinicalGroup: 'C1',
        facilityId: 'fac1',
        schedule: Array.from({ length: 18 }, function (_, i) {
          return i === 4
            ? { clinical: true, clinicalMissed: false, sim: 1, simDay: 'Mon', facilityId: 'fac1' }
            : { clinical: false, sim: null };
        })
      }, {
        id: 'stu2',
        clinicalGroup: 'C2',
        facilityId: 'fac1',
        schedule: Array.from({ length: 18 }, function (_, i) {
          return i === 5
            ? { clinical: true, clinicalMissed: false, sim: null, facilityId: 'fac1' }
            : { clinical: false, sim: null };
        })
      }],
      facilities: [{
        id: 'fac1', shortName: 'SRMC', siteId: 'srmc',
        clinicalStart: '0600', clinicalEnd: '1830', contentTags: ['MS']
      }]
    };
    var c1 = clinicalInstances(semester, 'C1');
    expect(c1.length).toBeGreaterThan(0);
    expect(c1[0].weekday).toBe('Saturday');
    expect(c1[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    var open = listOpenSlots(semester);
    expect(open.some(function (s) { return s.kind === 'clinical' && s.weekday === 'Saturday'; })).toBe(true);
    expect(open.some(function (s) { return s.kind === 'clinical' && s.weekday === 'Monday'; })).toBe(true);
    expect(open.some(function (s) { return s.kind === 'sim' && s.instances.length > 0; })).toBe(true);
  });
});

describe('faculty permissions', () => {
  it('grants self-schedule to adjunct and review to admin', () => {
    expect(UserTemplate.canAction('adjunct_faculty', 'faculty.selfSchedule')).toBe(true);
    expect(UserTemplate.canAction('adjunct_faculty', 'faculty.reviewSchedule')).toBe(false);
    expect(UserTemplate.canAction('admin_staff', 'faculty.reviewSchedule')).toBe(true);
    expect(UserTemplate.canAction('lead_course_faculty', 'faculty.export')).toBe(true);
  });
});
