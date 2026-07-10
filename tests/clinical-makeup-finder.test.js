import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Scheduler, ClinicalSites } from './_harness.js';
import { getExistingClinicalAtFacility } from '../src/core/scheduler/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockPath = join(__dirname, '..', 'mock-onedrive', 'semesters', 'F2026_REGN_program.json');

function loadF2026() {
  const raw = readFileSync(mockPath, { encoding: 'utf8' });
  const program = JSON.parse(raw);
  if (program.semesters && program.semesters.length) {
    const activeId = program.meta && program.meta.activeSemesterId;
    return program.semesters.find(function (s) { return s.id === activeId; }) || program.semesters[0];
  }
  return program;
}

describe('clinical makeup finder', () => {
  it('offers Monday C2/C3 join slots at SRMC for C1 Saturday student', () => {
    const sem = loadF2026();
    const s1 = sem.students.find(function (s) { return s.name === 'Student 1'; });
    expect(s1).toBeTruthy();
    expect(s1.clinicalGroup).toBe('C1');

    const facIds = ClinicalSites.getGroupFacilities(sem, s1.clinicalGroup);
    const sessions = getExistingClinicalAtFacility(sem, facIds[0], s1.id);
    const monJoin = sessions.filter(function (s) {
      return s.day === 'Mon' && (s.group === 'C2' || s.group === 'C3');
    });
    expect(monJoin.length).toBeGreaterThan(0);
    expect(monJoin.some(function (s) { return s.week === 17; })).toBe(true);

    const slots = Scheduler.findMakeupSlots(sem, s1.id, 'clinical');
    const joinSlots = slots.filter(function (s) { return s.facilityJoin && !s.week18Fallback; });
    expect(joinSlots.length).toBeGreaterThan(0);
    expect(slots.some(function (s) { return s.week18Fallback; })).toBe(false);

    const weeks = joinSlots.map(function (s) { return s.week; });
    // Saturday clinical does not block Monday facility joins.
    expect(weeks).toContain(6);
    expect(weeks).toContain(8);
    expect(weeks).toContain(10);
    expect(weeks).toContain(14);
    expect(weeks).toContain(16);
    // Monday sim blocks Monday join the same week.
    expect(weeks).not.toContain(5);
    expect(weeks).not.toContain(7);
    expect(weeks).not.toContain(9);
    expect(weeks).not.toContain(11);
    // Student 1 already has makeup clinical scheduled week 17.
    expect(weeks).not.toContain(17);
  });

  it('includes makeup-join sessions when discovering facility clinical', () => {
    const sem = loadF2026();
    const facIds = ClinicalSites.getGroupFacilities(sem, 'C1');
    const sessions = getExistingClinicalAtFacility(sem, facIds[0], null);
    const week17Mon = sessions.filter(function (s) {
      return s.week === 17 && s.day === 'Mon' && (s.group === 'C2' || s.group === 'C3');
    });
    expect(week17Mon.length).toBeGreaterThan(0);
  });
});
