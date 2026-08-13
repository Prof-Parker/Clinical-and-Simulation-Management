/**
 * Program-wide faculty inventory + theory-sourced clinical assignment.
 */

import { describe, it, expect } from 'vitest';
import { listAllSlots, findSlotById } from '../src/core/faculty-schedule/slot-inventory.js';
import {
  listProgramSlots,
  findProgramSlotById
} from '../src/core/faculty-schedule/program-inventory.js';
import * as ScheduleProposals from '../src/proposals/schedule-proposals.js';
import { FACULTY_NEEDED_NAME } from '../src/core/theory-events.js';

function theoryClinicalSemester(id) {
  return {
    id: id,
    meta: {
      courseId: 'REGN35P-36P',
      selfSchedulingOpen: true,
      semesterName: 'Fall 2026'
    },
    faculty: [],
    simInstructors: [],
    students: [],
    facilities: [{
      id: 'fac_mmcr',
      shortName: 'MMCR',
      contentTags: ['MS']
    }],
    config: {},
    proposals: [],
    theory: {
      days: [{
        id: '2026-08-26',
        date: '2026-08-26',
        weekday: 'Wed',
        weekIndex: 1,
        events: [{
          id: 'ev_clin',
          track: 'clinical',
          title: 'MS MERCY Clinical',
          courseCode: 'REGN35P',
          timeStart: '0630',
          timeEnd: '1830',
          categories: ['clinical'],
          contentTags: ['MS'],
          facilityId: 'fac_mmcr',
          siteId: 'fac_mmcr',
          siteLabel: 'MMCR',
          groups: ['C1'],
          faculty: [{ name: FACULTY_NEEDED_NAME, role: 'skills', needed: true }]
        }]
      }]
    }
  };
}

describe('theory clinical/sim slots', () => {
  it('emits open clinical inventory from theory Faculty Needed', () => {
    var sem = theoryClinicalSemester('sem35');
    var slots = listAllSlots(sem);
    var clin = slots.find(function (s) { return s.kind === 'clinical'; });
    expect(clin).toBeTruthy();
    expect(clin.sourcePath).toBe('theory');
    expect(clin.open).toBe(true);
    expect(clin.facilityId).toBe('fac_mmcr');
    expect(clin.specialties).toContain('MS');
    expect(clin.theoryRefs.length).toBe(1);
  });

  it('applySlotAssignment fills a theory-sourced clinical needed slot', () => {
    var sem = theoryClinicalSemester('sem35');
    var slot = listAllSlots(sem).find(function (s) { return s.kind === 'clinical'; });
    var ok = ScheduleProposals.applySlotAssignment(
      sem,
      slot.slotId,
      'Adjunct Faculty',
      'usr_1'
    );
    expect(ok).toBe(true);
    expect(sem.theory.days[0].events[0].faculty[0].needed).toBe(false);
    expect(sem.theory.days[0].events[0].faculty[0].name).toBe('Adjunct Faculty');
  });
});

describe('listProgramSlots', () => {
  it('unions two semesters and namespaces slotIds', () => {
    var sem15 = {
      id: 'sem15',
      meta: { courseId: 'REGN15P' },
      faculty: [{ id: 'f1', clinicalGroup: 'C1', needed: true, name: FACULTY_NEEDED_NAME }],
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
      theory: { days: [] }
    };
    var sem35 = theoryClinicalSemester('sem35');
    var fileRoot = { semesters: [sem15, sem35] };
    var slots = listProgramSlots(fileRoot);
    expect(slots.some(function (s) { return s.slotId.indexOf('sem15::') === 0; })).toBe(true);
    expect(slots.some(function (s) { return s.slotId.indexOf('sem35::') === 0; })).toBe(true);
    var found = findProgramSlotById(fileRoot, slots.find(function (s) {
      return s.kind === 'clinical' && s.semesterId === 'sem35';
    }).slotId);
    expect(found.semesterId).toBe('sem35');
    expect(findSlotById(sem35, found.slotId).kind).toBe('clinical');
  });
});

describe('submitSelfScheduleProgram', () => {
  it('writes mixed 15+35 cart ids onto the correct semesters', () => {
    var sem15 = {
      id: 'sem15',
      meta: { courseId: 'REGN15P', selfSchedulingOpen: true },
      faculty: [{ id: 'f1', clinicalGroup: 'C1', needed: true, name: FACULTY_NEEDED_NAME }],
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
      proposals: [],
      theory: { days: [] }
    };
    var sem35 = theoryClinicalSemester('sem35');
    var fileRoot = { semesters: [sem15, sem35] };
    var all = listProgramSlots(fileRoot);
    var id15 = all.find(function (s) { return s.semesterId === 'sem15'; }).slotId;
    var id35 = all.find(function (s) { return s.semesterId === 'sem35'; }).slotId;
    var session = { userId: 'u1', name: 'Ada Faculty', specialties: ['MS'] };
    var result = ScheduleProposals.submitSelfScheduleProgram(
      fileRoot,
      [id15, id35],
      session,
      {}
    );
    expect(result.ok).toBe(true);
    expect(result.proposals.length).toBe(2);
    expect(sem15.proposals.length).toBe(1);
    expect(sem35.proposals.length).toBe(1);
    expect(sem15.proposals[0].items[0].slotId).toBe(id15);
    expect(sem35.proposals[0].items[0].slotId).toBe(id35);
  });
});
