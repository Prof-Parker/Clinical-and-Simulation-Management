import { describe, it, expect } from 'vitest';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as TheoryData from '../src/core/theory-data.js';
import { regenerateAll } from '../src/core/scheduler/index.js';
import { buildMasterCalendarHtml } from '../src/ui/theory/master-calendar-html.js';

function countSynced(theory, track, category) {
  var cat = category || TheoryData.SYNCED_PRACTICUM_CATEGORY;
  var n = 0;
  (theory.days || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (ev.track !== track) return;
      if (ev.categories && ev.categories.indexOf(cat) >= 0) n++;
    });
  });
  return n;
}

function findSyncedOrientations(theory) {
  var out = [];
  (theory.days || []).forEach(function (day) {
    (day.events || []).forEach(function (ev) {
      if (ev.track !== 'orientation') return;
      if (!ev.categories || ev.categories.indexOf(TheoryData.SYNCED_ORIENTATION_CATEGORY) < 0) return;
      out.push({
        date: day.date,
        title: ev.title,
        groups: ev.groups || [],
        timeStart: ev.timeStart,
        timeEnd: ev.timeEnd
      });
    });
  });
  return out;
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

  it('mirrors setup orientations onto theory.days and merges same-slot groups', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    sem.calendar.semesterStartDate = '2026-08-16';
    CalendarEngine.rebuildWeeks(sem);
    DataModel.migrateSemester(sem);

    var facId = (sem.facilities[0] && sem.facilities[0].id) || null;
    sem.orientations = [
      {
        id: 'o1',
        clinicalGroup: 'C1',
        date: '2026-08-22',
        facilityId: facId,
        timeStart: '0800',
        timeEnd: '1200'
      },
      {
        id: 'o2',
        clinicalGroup: 'C2',
        date: '2026-08-22',
        facilityId: facId,
        timeStart: '0800',
        timeEnd: '1200'
      },
      {
        id: 'o3',
        clinicalGroup: 'C3',
        date: '2026-08-29',
        facilityId: facId,
        timeStart: '0900',
        timeEnd: '1300'
      }
    ];

    TheoryData.syncOrientationsFromSemester(sem);
    var synced = findSyncedOrientations(sem.theory);
    expect(synced.length).toBe(2);
    expect(synced.some(function (e) {
      return e.date === '2026-08-22' &&
        e.groups.indexOf('C1') >= 0 &&
        e.groups.indexOf('C2') >= 0;
    })).toBe(true);
    expect(synced.some(function (e) {
      return e.date === '2026-08-29' &&
        e.groups.indexOf('C3') >= 0 &&
        e.timeStart === '0900';
    })).toBe(true);

    var html = buildMasterCalendarHtml(sem, { readOnly: true });
    expect(html).toMatch(/theory-track-orientation/);

    TheoryData.syncPracticumFromSemester(sem);
    expect(findSyncedOrientations(sem.theory).length).toBe(2);

    sem.orientations = [];
    TheoryData.syncOrientationsFromSemester(sem);
    expect(findSyncedOrientations(sem.theory).length).toBe(0);
  });

  it('leaves manual orientation events alone when syncing', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    sem.calendar.semesterStartDate = '2026-08-16';
    CalendarEngine.rebuildWeeks(sem);
    DataModel.migrateSemester(sem);
    var day = TheoryData.ensureDay(sem.theory, sem, '2026-08-16');
    day.events.push({
      id: 'manual-orient',
      track: 'orientation',
      title: 'Manual Orientation',
      categories: ['orientation'],
      groups: [],
      timeStart: '1000',
      timeEnd: '1100',
      allDay: false,
      faculty: []
    });
    sem.orientations = [{
      id: 'o1',
      clinicalGroup: 'C1',
      date: '2026-08-23',
      facilityId: sem.facilities[0].id,
      timeStart: '0800',
      timeEnd: '1200'
    }];
    TheoryData.syncOrientationsFromSemester(sem);
    var manual = day.events.filter(function (e) { return e.id === 'manual-orient'; });
    expect(manual.length).toBe(1);
    expect(findSyncedOrientations(sem.theory).length).toBe(1);
  });
});
