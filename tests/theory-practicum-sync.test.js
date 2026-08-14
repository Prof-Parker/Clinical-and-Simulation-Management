import { describe, it, expect } from 'vitest';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as TheoryData from '../src/core/theory-data.js';
import { regenerateAll } from '../src/core/scheduler/index.js';
import { buildMasterCalendarHtml } from '../src/ui/theory/master-calendar-html.js';

function countSynced(theory, track) {
  var n = 0;
  (theory.days || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (ev.track !== track) return;
      if (ev.categories && ev.categories.indexOf(TheoryData.SYNCED_PRACTICUM_CATEGORY) >= 0) n++;
    });
  });
  return n;
}

describe('theory-practicum-sync', () => {
  it('mirrors clinical and simulation from student schedules onto theory.days', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    sem.calendar.semesterStartDate = '2026-08-16';
    CalendarEngine.rebuildWeeks(sem);
    DataModel.migrateSemester(sem);
    regenerateAll(sem);

    expect(countSynced(sem.theory, 'clinical')).toBeGreaterThan(0);
    expect(countSynced(sem.theory, 'simulation')).toBeGreaterThan(0);

    var html = buildMasterCalendarHtml(sem, { readOnly: true });
    expect(html).toMatch(/theory-track-clinical/);
    expect(html).toMatch(/theory-track-simulation/);
  });

  it('resync replaces prior synced practicum events without duplicating', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    sem.calendar.semesterStartDate = '2026-08-16';
    CalendarEngine.rebuildWeeks(sem);
    DataModel.migrateSemester(sem);
    regenerateAll(sem);

    var beforeClin = countSynced(sem.theory, 'clinical');
    var beforeSim = countSynced(sem.theory, 'simulation');
    expect(beforeClin).toBeGreaterThan(0);
    expect(beforeSim).toBeGreaterThan(0);

    TheoryData.syncPracticumFromSemester(sem);
    expect(countSynced(sem.theory, 'clinical')).toBe(beforeClin);
    expect(countSynced(sem.theory, 'simulation')).toBe(beforeSim);
  });

  it('clears synced practicum when schedules are empty', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    CalendarEngine.rebuildWeeks(sem);
    DataModel.migrateSemester(sem);
    regenerateAll(sem);
    expect(countSynced(sem.theory, 'clinical')).toBeGreaterThan(0);

    sem.students.forEach(function (s) {
      s.schedule = (s.schedule || []).map(function () {
        return { inactive: true };
      });
    });
    TheoryData.syncPracticumFromSemester(sem);
    expect(countSynced(sem.theory, 'clinical')).toBe(0);
    expect(countSynced(sem.theory, 'simulation')).toBe(0);
  });
});
