import { describe, expect, it } from 'vitest';
import {
  REGN35_SIM_SESSIONS,
  replaceRegn35SeededSims
} from '../scripts/theory/seed-35-sims.js';
import { listAllSlots } from '../src/core/faculty-schedule/slot-inventory.js';
import { applySlotAssignment } from '../src/proposals/schedule-proposals.js';

function semesterWithImportedSims() {
  return {
    id: 'sem35',
    meta: { courseId: 'REGN35P-36P' },
    faculty: [],
    simInstructors: [],
    students: [],
    facilities: [],
    config: {},
    theory: {
      days: [{
        id: '2026-08-18',
        date: '2026-08-18',
        weekIndex: 0,
        weekday: 'Tue',
        events: [{
          id: 'old_tuesday_sim',
          track: 'simulation',
          faculty: [{ name: 'Faculty Needed', needed: true }]
        }]
      }, {
        id: '2026-08-24',
        date: '2026-08-24',
        weekIndex: 1,
        weekday: 'Mon',
        events: [{
          id: 'lecture',
          track: 'theory',
          title: 'Lecture',
          faculty: []
        }]
      }]
    }
  };
}

describe('mock REGN 35P simulation seed', () => {
  it('replaces imported sims with the requested 12 Monday sessions', () => {
    var semester = semesterWithImportedSims();
    replaceRegn35SeededSims(semester.theory, '2026-08-16');

    var sims = semester.theory.days.flatMap(function (day) {
      return day.events.filter(function (ev) {
        return ev.track === 'simulation';
      }).map(function (ev) {
        return { date: day.date, weekday: day.weekday, simNum: ev.title, groups: ev.groups };
      });
    });

    expect(sims).toHaveLength(12);
    expect(sims.every(function (sim) { return sim.weekday === 'Mon'; })).toBe(true);
    expect(sims.map(function (sim) {
      return {
        date: sim.date,
        simNum: Number(sim.simNum.replace('Sim ', '')),
        groups: sim.groups
      };
    })).toEqual(REGN35_SIM_SESSIONS);
    expect(semester.theory.days.some(function (day) {
      return day.events.some(function (ev) { return ev.id === 'old_tuesday_sim'; });
    })).toBe(false);
  });

  it('offers one faculty request that assigns all 12 sessions', () => {
    var semester = semesterWithImportedSims();
    replaceRegn35SeededSims(semester.theory, '2026-08-16');

    var simSlots = listAllSlots(semester).filter(function (slot) {
      return slot.kind === 'sim';
    });
    expect(simSlots).toHaveLength(1);
    expect(simSlots[0].openCount).toBe(1);
    expect(simSlots[0].coversAllInstances).toBe(true);
    expect(simSlots[0].instances).toHaveLength(12);
    expect(simSlots[0].theoryRefs).toHaveLength(12);

    expect(applySlotAssignment(
      semester,
      simSlots[0].slotId,
      'Adjunct Faculty',
      'usr_adjunct'
    )).toBe(true);

    var simFaculty = semester.theory.days.flatMap(function (day) {
      return day.events.filter(function (ev) {
        return ev.track === 'simulation';
      }).map(function (ev) {
        return ev.faculty[0];
      });
    });
    expect(simFaculty).toHaveLength(12);
    expect(simFaculty.every(function (slot) {
      return slot.name === 'Adjunct Faculty' && slot.needed === false;
    })).toBe(true);
  });
});
