/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import {
  DataModel,
  CalendarEngine,
  Scheduler
} from './_harness.js';
import * as ScheduleHours from '../src/core/schedule-hours.js';

describe('schedule-hours.test.js', () => {
  it('resolves clinical, sim, and orientation hours from times', () => {
    let failed = 0;
    function assert(condition, message) {
      if (!condition) {
        failed++;
        console.error('FAIL: ' + message);
      }
    }

    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    DataModel.migrateSemester(sem);
    CalendarEngine.rebuildWeeks(sem);
    Scheduler.regenerateAll(sem);

    assert(sem.config.simDefaultStart === '0900', 'sim default start migrates to 0900');
    assert(sem.config.simDefaultEnd === '1500', 'sim default end migrates to 1500');
    assert(sem.facilities[0].clinicalStart === '0600', 'facility clinical start defaults 0600');
    assert(sem.facilities[0].clinicalEnd === '1830', 'facility clinical end defaults 1830');

    var clinH = ScheduleHours.resolveClinicalDayHours(sem, sem.facilities[0].id);
    assert(clinH === 12.5, '0600-1830 is 12.5 hours (got ' + clinH + ')');

    var simH = ScheduleHours.resolveSimDayHours(sem, 1);
    assert(simH === 6, '0900-1500 is 6 hours (got ' + simH + ')');

    sem.config.simTimeOverrides = [{ simNum: 5, start: '0800', end: '1600' }];
    assert(ScheduleHours.resolveSimDayHours(sem, 5) === 8, 'sim 5 override is 8 hours');
    assert(ScheduleHours.resolveSimDayHours(sem, 1) === 6, 'sim 1 still uses default');

    sem.orientations = [{
      id: 'o1',
      clinicalGroup: sem.students[0].clinicalGroup,
      date: sem.calendar.weeks[3].startDate,
      facilityId: sem.facilities[0].id,
      timeStart: '0800',
      timeEnd: '1200'
    }];
    DataModel.migrateSemester(sem);
    assert(sem.orientations[0].timeStart === '0800', 'orientation start preserved');
    var oh = ScheduleHours.studentOrientationHours(sem.students[0], sem);
    assert(oh === 4, 'orientation hours 4 (got ' + oh + ')');

    var student = sem.students[0];
    student.email = 'student1@example.edu';
    assert(student.email === 'student1@example.edu', 'student email field writable');

    var summary = ScheduleHours.studentHoursSummary(student, sem);
    assert(summary.clinicalHours > 0, 'student clinical hours > 0');
    assert(summary.simHours > 0, 'student sim hours > 0');

    var byWeek = ScheduleHours.rollPracticumHoursByWeek(sem);
    var clinWeek = Object.keys(byWeek).find(function (wl) { return byWeek[wl].clinical > 0; });
    var simWeek = Object.keys(byWeek).find(function (wl) { return byWeek[wl].simulation > 0; });
    assert(!!clinWeek, 'has a clinical week');
    assert(!!simWeek, 'has a sim week');
    assert(byWeek[clinWeek].clinical === 12.5,
      'cohort clinical week is 12.5 not multi-group sum (got ' + byWeek[clinWeek].clinical + ')');
    assert(byWeek[simWeek].simulation === 6 || byWeek[simWeek].simulation === 8,
      'cohort sim week is one session (got ' + byWeek[simWeek].simulation + ')');

    expect(failed).toBe(0);
  });
});