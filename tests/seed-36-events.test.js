import { describe, expect, it } from 'vitest';
import {
  REGN36_CLINICAL_ROTATIONS,
  REGN36_LECTURES,
  REGN36_OP_PEDS_SIM_SESSIONS,
  SITE_MMCR_OBPED,
  mergeRegn36SeededEvents
} from '../scripts/theory/seed-36-events.js';
import { listAllSlots } from '../src/core/faculty-schedule/slot-inventory.js';
import { applySlotAssignment } from '../src/proposals/schedule-proposals.js';
import { userCanSeeSlot } from '../src/core/faculty-schedule/slot-rules.js';

function emptyTheorySemester() {
  return {
    id: 'sem36',
    meta: { courseId: 'REGN35P-36P' },
    faculty: [],
    simInstructors: [],
    students: [],
    facilities: [SITE_MMCR_OBPED],
    config: {},
    theory: {
      days: [{
        id: '2026-08-18',
        date: '2026-08-18',
        weekIndex: 0,
        weekday: 'Tue',
        events: [{
          id: 'keep_35_lecture',
          track: 'theory',
          title: 'MS 35 Lecture',
          courseCode: 'REGN35',
          faculty: []
        }]
      }]
    }
  };
}

function eventsOf(theory, pred) {
  return theory.days.flatMap(function (day) {
    return (day.events || []).filter(pred).map(function (ev) {
      return { date: day.date, weekday: day.weekday, weekLabel: day.weekLabel, ev: ev };
    });
  });
}

describe('mock REGN 36/36P faculty-scheduling seed', () => {
  it('merges clinical, sim, and lecture events without dropping existing days', () => {
    var semester = emptyTheorySemester();
    mergeRegn36SeededEvents(semester.theory, '2026-08-16');

    expect(semester.theory.days.some(function (day) {
      return day.events.some(function (ev) { return ev.id === 'keep_35_lecture'; });
    })).toBe(true);

    var clinical = eventsOf(semester.theory, function (ev) {
      return ev.courseCode === 'REGN36P' && ev.track === 'clinical';
    });
    var sims = eventsOf(semester.theory, function (ev) {
      return ev.track === 'simulation' && ev.courseCode === 'REGN36P';
    });
    var lectures = eventsOf(semester.theory, function (ev) {
      return ev.courseCode === 'REGN36';
    });

    var expectedClin = REGN36_CLINICAL_ROTATIONS.reduce(function (n, rot) {
      return n + rot.weeks.length;
    }, 1);
    expect(clinical).toHaveLength(expectedClin);
    expect(sims).toHaveLength(REGN36_OP_PEDS_SIM_SESSIONS.length);
    expect(lectures).toHaveLength(REGN36_LECTURES.length);

    var c3 = clinical.filter(function (row) {
      return row.ev.groups && row.ev.groups[0] === 'C3';
    });
    expect(c3.every(function (row) { return row.weekday === 'Wed'; })).toBe(true);
    expect(c3[0].ev.title).toBe('MERCY OB/PEDS Clinical Orientation');
    expect(c3.slice(1).every(function (row) {
      return row.ev.title === 'MERCY OB/PEDS Clinical';
    })).toBe(true);

    var makeup = clinical.filter(function (row) {
      return /make up/i.test(row.ev.title);
    });
    expect(makeup).toHaveLength(1);
    expect(makeup[0].weekday).toBe('Wed');
    expect(makeup[0].ev.groups).toEqual([]);
  });

  it('emits four Mercy clinical signups, one OP Peds sim slot, and Lec+OB / Lec+PED lectures', () => {
    var semester = emptyTheorySemester();
    mergeRegn36SeededEvents(semester.theory, '2026-08-16');

    var slots = listAllSlots(semester);
    var clin = slots.filter(function (slot) {
      return slot.kind === 'clinical';
    });
    var byGroup = {};
    clin.forEach(function (slot) {
      byGroup[slot.clinicalGroup || 'makeup'] = slot;
    });

    expect(byGroup.C1).toBeTruthy();
    expect(byGroup.C2).toBeTruthy();
    expect(byGroup.C3).toBeTruthy();
    expect(byGroup.C4).toBeTruthy();
    expect(byGroup.C1.seriesKey).not.toBe(byGroup.C3.seriesKey);
    expect(byGroup.C3.coversAllInstances).toBe(true);
    expect(byGroup.C3.specialties).toEqual(['OB', 'PED']);
    expect(byGroup.C3.instances.length).toBe(7);
    expect(byGroup.C1.instances.length).toBe(7);

    expect(userCanSeeSlot(byGroup.C3, ['OB'], false)).toBe(false);
    expect(userCanSeeSlot(byGroup.C3, ['OB', 'PED'], false)).toBe(true);

    var simSlots = slots.filter(function (slot) { return slot.kind === 'sim'; });
    expect(simSlots).toHaveLength(1);
    expect(simSlots[0].coversAllInstances).toBe(true);
    expect(simSlots[0].instances).toHaveLength(12);
    expect(simSlots[0].theoryRefs).toHaveLength(12);
    expect(simSlots[0].specialties).toEqual(['PED']);

    expect(applySlotAssignment(
      semester,
      simSlots[0].slotId,
      'Adjunct PED',
      'usr_adjunct_ped'
    )).toBe(true);

    var simFaculty = eventsOf(semester.theory, function (ev) {
      return ev.track === 'simulation' && ev.courseCode === 'REGN36P';
    }).map(function (row) { return row.ev.faculty[0]; });
    expect(simFaculty).toHaveLength(12);
    expect(simFaculty.every(function (slot) {
      return slot.name === 'Adjunct PED' && slot.needed === false;
    })).toBe(true);

    var lectures = slots.filter(function (slot) { return slot.kind === 'lecture'; });
    var mc = lectures.find(function (slot) {
      return slot.specialties.indexOf('OB') >= 0;
    });
    var peds = lectures.find(function (slot) {
      return slot.specialties.indexOf('PED') >= 0;
    });
    expect(mc.specialties).toEqual(['OB', 'Lec']);
    expect(peds.specialties).toEqual(['PED', 'Lec']);
    expect(mc.instances).toHaveLength(8);
    expect(peds.instances).toHaveLength(8);
    expect(mc.openCount).toBe(1);
    expect(peds.openCount).toBe(1);
    expect(mc.coversAllInstances).toBe(true);
    expect(peds.coversAllInstances).toBe(true);
    expect(mc.slotId).toMatch(/:seat:0$/);
    expect(peds.slotId).toMatch(/:seat:0$/);
    expect(userCanSeeSlot(mc, ['OB', 'Lec'], false)).toBe(true);
    expect(userCanSeeSlot(mc, ['OB'], false)).toBe(false);
    expect(userCanSeeSlot(mc, ['PED', 'Lec'], false)).toBe(false);
  });
});
