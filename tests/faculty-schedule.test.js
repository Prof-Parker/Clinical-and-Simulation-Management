/**
 * Specialty catalog + message framework + slot rules unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeSpecialty,
  normalizeSpecialties,
  matchesSiteTag,
  ensureLeadLectureTag,
  userMatchesAnySpecialty
} from '../src/core/faculty-schedule/specialties.js';
import { validateCart, userCanSeeSlot } from '../src/core/faculty-schedule/slot-rules.js';
import * as Messages from '../src/messages/messages.js';
import { MESSAGE_TYPES } from '../src/messages/message-types.js';
import * as MessageEmit from '../src/messages/message-emit.js';
import * as ScheduleProposals from '../src/proposals/schedule-proposals.js';
import * as UserTemplate from '../src/auth/user-template.js';

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

  it('ensures Lec for lead course faculty', () => {
    expect(ensureLeadLectureTag('lead_course_faculty', ['MS'])).toContain('Lec');
    expect(ensureLeadLectureTag('adjunct_faculty', ['MS'])).toEqual(['MS']);
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

  it('userCanSeeSlot respects specialties', () => {
    expect(userCanSeeSlot(slot({ specialties: ['OB'] }), ['MS'], false)).toBe(false);
    expect(userCanSeeSlot(slot({ specialties: ['OB'] }), ['MS'], true)).toBe(true);
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

describe('faculty permissions', () => {
  it('grants self-schedule to adjunct and review to admin', () => {
    expect(UserTemplate.canAction('adjunct_faculty', 'faculty.selfSchedule')).toBe(true);
    expect(UserTemplate.canAction('adjunct_faculty', 'faculty.reviewSchedule')).toBe(false);
    expect(UserTemplate.canAction('admin_staff', 'faculty.reviewSchedule')).toBe(true);
    expect(UserTemplate.canAction('lead_course_faculty', 'faculty.export')).toBe(true);
  });
});
