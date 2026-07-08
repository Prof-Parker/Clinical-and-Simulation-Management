/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import { DataModel, CalendarEngine, Orientation, Scheduler } from './_harness.js';

describe('orientation.test.js', () => {
  it('runs assertions', () => {
    let failed = 0;

    function assert(condition, message) {
      if (!condition) {
        failed++;
        console.error('FAIL: ' + message);
        return;
      }
    }

    function makeSemesterWithOrient() {
      var fileRoot = DataModel.createDefaultFile();
      var sem = fileRoot.semesters[0];
      CalendarEngine.rebuildWeeks(sem);
      var srmc = sem.facilities.find(function (f) {
        return f.name.indexOf('Shasta') >= 0;
      });
      var se = sem.facilities.find(function (f) {
        return f.name.indexOf('Elizabeth') >= 0;
      });
      var week2Date = sem.calendar.weeks[1] && sem.calendar.weeks[1].startDate;
      sem.orientations = [
        { id: 'o1', clinicalGroup: 'C1', date: week2Date, facilityId: srmc.id },
        { id: 'o2', clinicalGroup: 'C2', date: week2Date, facilityId: se.id }
      ];
      return sem;
    }

    var sem = makeSemesterWithOrient();
    var srmc = sem.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
    var se = sem.facilities.find(function (f) { return f.name.indexOf('Elizabeth') >= 0; });

    assert(Orientation.facilityInitials(sem, srmc.id) === 'SRMC', 'SRMC initials');
    assert(Orientation.facilityInitials(sem, se.id) === 'SE', 'SE initials');
    assert(Orientation.facilityInitials(sem, 'unknown') === 'OR', 'unknown facility fallback');

    var c1Student = sem.students.find(function (s) { return s.clinicalGroup === 'C1'; });
    assert(c1Student, 'C1 student exists');
    assert(Orientation.getEffectiveOrientationWeekIndex(sem, c1Student) === 1, 'C1 orient maps to week 2');
    assert(Orientation.isOrientationWeek(sem, c1Student, 1), 'week 2 is orientation for C1');
    assert(!Orientation.isOrientationWeek(sem, c1Student, 0), 'week 1 is not orientation for C1');
    assert(Orientation.getOrientationLabel(sem, c1Student) === 'Orient SRMC', 'C1 orient label');

    c1Student.orientationWeekIndex = 3;
    assert(Orientation.getEffectiveOrientationWeekIndex(sem, c1Student) === 3, 'student override week');
    assert(Orientation.isOrientationWeek(sem, c1Student, 3), 'override week is orientation');
    assert(!Orientation.isOrientationWeek(sem, c1Student, 1), 'group week no longer orient after override');

    c1Student.orientationWeekIndex = 1;
    assert(!Orientation.weekHasOrientationConflict(sem, c1Student, 1), 'orient-only week has no conflict');

    Scheduler.regenerateAll(sem);
    c1Student = sem.students.find(function (s) { return s.clinicalGroup === 'C1'; });
    var orientWeek = Orientation.getEffectiveOrientationWeekIndex(sem, c1Student);
    if (orientWeek >= 0 && c1Student.schedule[orientWeek]) {
      c1Student.schedule[orientWeek].clinical = true;
      assert(Orientation.weekHasOrientationConflict(sem, c1Student, orientWeek), 'orient + clinical is conflict');
      var conflicts = Orientation.findOrientationConflicts(sem);
      assert(conflicts.some(function (c) { return c.studentId === c1Student.id; }), 'conflict listed for student');
      assert(conflicts[0].message.indexOf('reassign in Master Schedule') >= 0, 'conflict message prompts reassignment');
    } else {
      console.error('SKIP: could not set up orient week conflict (orientWeek=' + orientWeek + ')');
    }

    expect(failed).toBe(0);
  });
});
