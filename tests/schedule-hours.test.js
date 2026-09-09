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
    assert(simH === 6, '0900-1500 is 6 hours wall-clock (got ' + simH + ')');
    assert(sem.config.simLunchBreakMinutes === 30, 'sim lunch defaults to 30 minutes');
    var simContact = ScheduleHours.resolveSimDayContactHours(sem, 1);
    assert(simContact === 5.5, 'coordinator sim contact deducts 30 min lunch (got ' + simContact + ')');

    sem.config.simTimeOverrides = [{ simNum: 5, start: '0800', end: '1600' }];
    assert(ScheduleHours.resolveSimDayHours(sem, 5) === 8, 'sim 5 override is 8 hours wall-clock');
    assert(ScheduleHours.resolveSimDayContactHours(sem, 5) === 7.5, 'sim 5 contact is 7.5 with lunch');
    assert(ScheduleHours.resolveSimDayHours(sem, 1) === 6, 'sim 1 still uses default');

    sem.config.simLunchBreakMinutes = 0;
    assert(ScheduleHours.resolveSimDayContactHours(sem, 1) === 6, 'lunch 0 keeps full contact hours');
    sem.config.simLunchBreakMinutes = 30;

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

    var orientWeek = ScheduleHours.rollPracticumHoursByWeek(sem)[4];
    assert(orientWeek && orientWeek.clinical >= 4,
      'weekly clinical rollup includes orientation hours (got ' +
      (orientWeek && orientWeek.clinical) + ')');
    var orientCohort = ScheduleHours.rollPracticumHoursForCohort(sem)[4];
    assert(orientCohort && orientCohort.clinical >= 4,
      'cohort clinical rollup includes orientation hours (got ' +
      (orientCohort && orientCohort.clinical) + ')');

    var student = sem.students[0];
    student.email = 'student1@example.edu';
    assert(student.email === 'student1@example.edu', 'student email field writable');

    var summary = ScheduleHours.studentHoursSummary(student, sem);
    assert(summary.clinicalHours > 0, 'student clinical hours > 0');
    assert(summary.simHours > 0, 'student sim hours > 0');

    var byWeek = ScheduleHours.rollPracticumHoursByWeek(sem);
    // Prefer a full clinical day (12.5h); orientation-only weeks are also > 0.
    var clinWeek = Object.keys(byWeek).find(function (wl) { return byWeek[wl].clinical === 12.5; });
    var simWeek = Object.keys(byWeek).find(function (wl) { return byWeek[wl].simulation > 0; });
    assert(!!clinWeek, 'has a full clinical week (12.5h)');
    assert(!!simWeek, 'has a sim week');
    assert(byWeek[clinWeek].clinical === 12.5,
      'cohort clinical week is 12.5 not multi-group sum (got ' + byWeek[clinWeek].clinical + ')');
    assert(byWeek[simWeek].simulation === 5.5 || byWeek[simWeek].simulation === 7.5,
      'union sim week uses contact hours with lunch (got ' + byWeek[simWeek].simulation + ')');

    var cohort = ScheduleHours.rollPracticumHoursForCohort(sem);
    var simStudent = ScheduleHours.representativeSimStudent(sem);
    var expectedContact = 0;
    var homeSimCountExpected = 0;
    (simStudent.schedule || []).forEach(function (cell) {
      if (cell && cell.sim && !cell.simGuestGroup) {
        homeSimCountExpected += 1;
        expectedContact += ScheduleHours.resolveSimDayContactHours(sem, cell.sim);
      }
    });
    expectedContact = Math.round(expectedContact * 100) / 100;
    var cohortSimTotal = 0;
    var cohortSimWeeks = 0;
    Object.keys(cohort).forEach(function (wl) {
      if (cohort[wl].simulation > 0) {
        cohortSimTotal += cohort[wl].simulation;
        cohortSimWeeks += 1;
      }
    });
    cohortSimTotal = Math.round(cohortSimTotal * 100) / 100;
    assert(cohortSimWeeks === homeSimCountExpected,
      'cohort sim weeks match representative home sims (got ' + cohortSimWeeks +
      ', home=' + homeSimCountExpected + ')');
    assert(homeSimCountExpected > 0, 'representative student has home sims');
    assert(cohortSimTotal === expectedContact,
      'cohort semester sim matches home-sim contact hours (got ' + cohortSimTotal +
      ', expected ' + expectedContact + ')');
    assert(cohortSimTotal < homeSimCountExpected * 6 + 0.01,
      'contact hours are not inflated wall-clock over home count');

    // Guest weeks on other classmates must not inflate the representative path.
    var other = (sem.students || []).find(function (s) {
      return s !== simStudent && s.simGroup === simStudent.simGroup;
    });
    if (other) {
      var emptyWi = -1;
      for (var i = 0; i < 18; i++) {
        var c = other.schedule[i];
        var r = simStudent.schedule[i];
        if ((!c || !c.sim) && (!r || !r.sim)) {
          emptyWi = i;
          break;
        }
      }
      if (emptyWi >= 0) {
        other.schedule[emptyWi] = {
          clinical: false, clinicalMissed: false, sim: 1, simDay: 'Mon',
          simGuestGroup: 'SG2', makeupClinical: false, inactive: false,
          simMakeup: false, simOverload: false, facilityId: null
        };
        var after = ScheduleHours.rollPracticumHoursForCohort(sem);
        var afterTotal = 0;
        Object.keys(after).forEach(function (wl) { afterTotal += after[wl].simulation; });
        assert(Math.abs(afterTotal - cohortSimTotal) < 0.01,
          'classmate guest sim does not change cohort semester total');
      }
    }

    expect(failed).toBe(0);
  });
});
