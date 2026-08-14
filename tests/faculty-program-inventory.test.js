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

function neededFaculty(openCount) {
  var faculty = [{ name: 'Full Time Faculty', role: 'skills', needed: false }];
  for (var i = 0; i < openCount; i++) {
    faculty.push({ name: FACULTY_NEEDED_NAME, role: 'skills', needed: true });
  }
  return faculty;
}

function skillsDay(date, weekday, weekIndex, ev) {
  return {
    id: date,
    date: date,
    weekday: weekday,
    weekIndex: weekIndex,
    events: [ev]
  };
}

describe('recurring vs unique skills inventory', () => {
  it('merges repeating 35P Skills into one series with per-session faculty count', () => {
    var sem = {
      id: 'sem35',
      meta: { courseId: 'REGN35P-36P' },
      faculty: [],
      simInstructors: [],
      students: [],
      facilities: [],
      config: {},
      theory: {
        days: [
          skillsDay('2026-08-24', 'Mon', 1, {
            id: 'ev_a',
            track: 'skills',
            title: '35P Skills',
            courseCode: 'REGN35P',
            timeStart: '1300',
            timeEnd: '1430',
            categories: ['skills_lab'],
            groups: ['C1', 'C2'],
            faculty: neededFaculty(3)
          }),
          skillsDay('2026-08-31', 'Mon', 2, {
            id: 'ev_b',
            track: 'skills',
            title: '35P Skills',
            courseCode: 'REGN35P',
            timeStart: '1300',
            timeEnd: '1430',
            categories: ['skills_lab'],
            groups: ['C3', 'C4'],
            faculty: neededFaculty(3)
          })
        ]
      }
    };
    var skills = listAllSlots(sem).filter(function (s) { return s.kind === 'skills'; });
    expect(skills.length).toBe(3);
    expect(skills[0].facultyPerInstance).toBe(4);
    expect(skills[0].coversAllInstances).toBe(true);
    expect(skills[0].seriesOnce).toBe(false);
    expect(skills[0].instances.map(function (i) { return i.date; })).toEqual([
      '2026-08-24', '2026-08-31'
    ]);
    skills.forEach(function (s) {
      expect(s.theoryRefs.length).toBe(2);
      expect(s.openCount).toBe(1);
    });
  });

  it('keeps Skills Fair and Skims Final as separate one-off chips', () => {
    var sem = {
      id: 'sem35',
      meta: { courseId: 'REGN35P-36P' },
      faculty: [],
      simInstructors: [],
      students: [],
      facilities: [],
      config: {},
      theory: {
        days: [
          skillsDay('2026-08-17', 'Mon', 0, {
            id: 'ev_fair',
            track: 'skills',
            title: '35P Skills Fair',
            courseCode: 'REGN35P',
            timeStart: '1300',
            timeEnd: '1700',
            categories: ['skills_lab'],
            groups: ['C1', 'C2', 'C3', 'C4', 'C5'],
            faculty: neededFaculty(4)
          }),
          skillsDay('2026-12-07', 'Mon', 16, {
            id: 'ev_skims',
            track: 'skills',
            title: '35P Skims Final Evaluation (All Groups) Scheduled',
            courseCode: 'REGN35P',
            timeStart: '1300',
            timeEnd: '1700',
            categories: ['skills_lab'],
            groups: ['C1', 'C2', 'C3', 'C4', 'C5'],
            faculty: neededFaculty(3)
          })
        ]
      }
    };
    var skills = listAllSlots(sem).filter(function (s) { return s.kind === 'skills'; });
    var fair = skills.filter(function (s) { return s.seriesLabel === 'Skills Fair'; });
    var skims = skills.filter(function (s) { return /Skims/i.test(s.seriesLabel); });
    expect(fair.length).toBe(4);
    expect(skims.length).toBe(3);
    expect(fair[0].seriesKey).not.toBe(skims[0].seriesKey);
    expect(fair[0].seriesOnce).toBe(true);
    expect(fair[0].coversAllInstances).toBe(false);
    expect(fair[0].facultyPerInstance).toBe(5);
    expect(skims[0].facultyPerInstance).toBe(4);
  });

  it('emits one clinical signup per group covering that group term', () => {
    function clinEv(id, group, site, start, end) {
      return {
        id: id,
        track: 'clinical',
        title: site + ' Clinical',
        courseCode: 'REGN35P',
        timeStart: start,
        timeEnd: end,
        categories: ['clinical'],
        contentTags: ['MS'],
        facilityId: site === 'MERCY' ? 'fac_mmcr' : 'fac_srmc',
        siteId: site === 'MERCY' ? 'fac_mmcr' : 'fac_srmc',
        siteLabel: site,
        groups: [group],
        faculty: neededFaculty(1)
      };
    }
    var sem = {
      id: 'sem35',
      meta: { courseId: 'REGN35P-36P' },
      faculty: [],
      simInstructors: [],
      students: [],
      facilities: [
        { id: 'fac_mmcr', shortName: 'MERCY', contentTags: ['MS'] },
        { id: 'fac_srmc', shortName: 'SRMC', contentTags: ['MS'] }
      ],
      config: {},
      theory: {
        days: [
          skillsDay('2026-08-21', 'Fri', 0, clinEv('c2a', 'C2', 'SRMC', '0600', '1800')),
          skillsDay('2026-08-28', 'Fri', 1, clinEv('c2b', 'C2', 'SRMC', '0600', '1800')),
          skillsDay('2026-10-09', 'Fri', 7, clinEv('c2m', 'C2', 'SRMC', '0600', '1800')),
          skillsDay('2026-08-26', 'Wed', 1, clinEv('c1a', 'C1', 'MERCY', '0630', '1830')),
          skillsDay('2026-10-07', 'Wed', 7, clinEv('c1b', 'C1', 'MERCY', '0630', '1830')),
          skillsDay('2026-10-14', 'Wed', 8, clinEv('c3a', 'C3', 'MERCY', '0630', '1830')),
          skillsDay('2026-12-16', 'Wed', 17, clinEv('c3m', 'C3', 'MERCY', '0600', '1800')),
          skillsDay('2026-10-16', 'Fri', 8, clinEv('c4a', 'C4', 'SRMC', '0600', '1800')),
          skillsDay('2026-12-11', 'Fri', 16, clinEv('c4m', 'C4', 'SRMC', '0600', '1800'))
        ]
      }
    };
    var clin = listAllSlots(sem).filter(function (s) { return s.kind === 'clinical'; });
    expect(clin.length).toBe(4);
    var byGroup = {};
    clin.forEach(function (s) {
      byGroup[s.clinicalGroup] = s;
      expect(s.openCount).toBe(1);
      expect(s.coversAllInstances).toBe(true);
      expect(s.facultyPerInstance).toBe(2);
    });
    expect(byGroup.C2.instances.map(function (i) { return i.date; })).toEqual([
      '2026-08-21', '2026-08-28', '2026-10-09'
    ]);
    expect(byGroup.C4.instances.map(function (i) { return i.date; })).toEqual([
      '2026-10-16', '2026-12-11'
    ]);
    expect(byGroup.C1.seriesKey).not.toBe(byGroup.C3.seriesKey);
    expect(byGroup.C2.seriesLabel).toMatch(/C2/);
  });

  it('assigns a clinical group seat across every instance for that group', () => {
    var sem = {
      id: 'sem35',
      meta: { courseId: 'REGN35P-36P' },
      faculty: [],
      simInstructors: [],
      students: [],
      facilities: [{ id: 'fac_srmc', shortName: 'SRMC', contentTags: ['MS'] }],
      config: {},
      theory: {
        days: [
          skillsDay('2026-08-21', 'Fri', 0, {
            id: 'c2a',
            track: 'clinical',
            title: 'SRMC Clinical',
            courseCode: 'REGN35P',
            timeStart: '0600',
            timeEnd: '1800',
            categories: ['clinical'],
            contentTags: ['MS'],
            facilityId: 'fac_srmc',
            siteLabel: 'SRMC',
            groups: ['C2'],
            faculty: neededFaculty(1)
          }),
          skillsDay('2026-10-09', 'Fri', 7, {
            id: 'c2m',
            track: 'clinical',
            title: 'SRMC Make up Clinical',
            courseCode: 'REGN35P',
            timeStart: '0600',
            timeEnd: '1800',
            categories: ['clinical'],
            contentTags: ['MS'],
            facilityId: 'fac_srmc',
            siteLabel: 'SRMC',
            groups: ['C2'],
            faculty: neededFaculty(1)
          })
        ]
      }
    };
    var slot = listAllSlots(sem).find(function (s) {
      return s.kind === 'clinical' && s.clinicalGroup === 'C2';
    });
    var ok = ScheduleProposals.applySlotAssignment(sem, slot.slotId, 'Ada Faculty', 'usr_1');
    expect(ok).toBe(true);
    expect(sem.theory.days[0].events[0].faculty[1].name).toBe('Ada Faculty');
    expect(sem.theory.days[1].events[0].faculty[1].name).toBe('Ada Faculty');
  });

  it('assigns a recurring skills seat across every instance', () => {
    var sem = {
      id: 'sem35',
      meta: { courseId: 'REGN35P-36P' },
      faculty: [],
      simInstructors: [],
      students: [],
      facilities: [],
      config: {},
      theory: {
        days: [
          skillsDay('2026-08-24', 'Mon', 1, {
            id: 'ev_a',
            track: 'skills',
            title: '35P Skills',
            courseCode: 'REGN35P',
            timeStart: '1300',
            timeEnd: '1430',
            categories: ['skills_lab'],
            faculty: neededFaculty(3)
          }),
          skillsDay('2026-08-31', 'Mon', 2, {
            id: 'ev_b',
            track: 'skills',
            title: '35P Skills',
            courseCode: 'REGN35P',
            timeStart: '1300',
            timeEnd: '1430',
            categories: ['skills_lab'],
            faculty: neededFaculty(3)
          })
        ]
      }
    };
    var slot = listAllSlots(sem).find(function (s) { return s.kind === 'skills'; });
    var ok = ScheduleProposals.applySlotAssignment(sem, slot.slotId, 'Ada Faculty', 'usr_1');
    expect(ok).toBe(true);
    expect(sem.theory.days[0].events[0].faculty[1].name).toBe('Ada Faculty');
    expect(sem.theory.days[1].events[0].faculty[1].name).toBe('Ada Faculty');
    expect(sem.theory.days[0].events[0].faculty[2].needed).toBe(true);
  });
});
