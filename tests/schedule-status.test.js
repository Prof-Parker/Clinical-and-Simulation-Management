/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import {
  DataModel,
  CalendarEngine,
  Scheduler,
  Validator,
  Feasibility,
  ScheduleStatus,
  Orientation
} from './_harness.js';

describe('schedule-status.test.js', () => {
  it('runs assertions', () => {
    let failed = 0;

    function assert(condition, message) {
      if (!condition) {
        failed++;
        console.error('FAIL: ' + message);
        return;
      }
    }

    function makeDefaultSemester() {
      var fileRoot = DataModel.createDefaultFile();
      var sem = fileRoot.semesters[0];
      CalendarEngine.rebuildWeeks(sem);
      Scheduler.regenerateAll(sem);
      return sem;
    }

    var defaultSem = makeDefaultSemester();
    var defaultSummary = ScheduleStatus.summarize(defaultSem);

    assert(defaultSummary.generated, 'default semester has generated schedules');
    assert(defaultSummary.tier === 'yellow', 'default 30-student regen is yellow (got ' + defaultSummary.tier + ')');
    assert(defaultSummary.incompleteCount === 0, 'all default students meet requirements');
    assert(defaultSummary.adjustments.makeupClinicalCount > 0, 'default has makeup clinical adjustments');
    assert(defaultSummary.notes.some(function (n) {
      return n.indexOf('overlaps a simulation day') >= 0;
    }), 'overlap appears as informational note, not blocking failure');
    assert(defaultSummary.blockingIssues.length === 0, 'default has no blocking issues after generation');

    var redSem = DataModel.createDefaultFile().semesters[0];
    CalendarEngine.rebuildWeeks(redSem);
    Scheduler.regenerateAll(redSem);
    redSem.students[0].schedule.forEach(function (cell) {
      if (cell.sim) {
        cell.sim = null;
        cell.simDay = null;
        cell.simGuestGroup = null;
        cell.simOverload = false;
        cell.simMakeup = false;
      }
    });
    var redSummary = ScheduleStatus.summarize(redSem);
    assert(redSummary.tier === 'red', 'student missing sim is red');
    assert(redSummary.incompleteCount > 0, 'incomplete count reported');

    var greenSem = {
      id: 'sem_green',
      meta: { semesterSeason: 'spring', semesterYear: 2026, semesterName: 'Spring 2026' },
      config: DataModel.defaultConfig(),
      calendar: { semesterStartDate: '2026-01-01', weeks: [] },
      holidays: [],
      facilities: DataModel.defaultFacilities(),
      faculty: [],
      sections: [{ id: 'sec1', name: 'A' }],
      students: [
        DataModel.createStudent('Student 1', 'C1', 'SG1', 'fac0', 'A')
      ]
    };
    greenSem.config.clinicalGroups = ['C1'];
    greenSem.config.clinicalGroupDays = { C1: 'Sat' };
    greenSem.config.simGroups = ['SG1'];
    greenSem.config.maxStudents = 1;
    greenSem.config.clinicalDaysRequired = 3;
    greenSem.config.simDaysRequired = 2;
    greenSem.students[0].clinicalGroup = 'C1';
    greenSem.students[0].simGroup = 'SG1';
    CalendarEngine.rebuildWeeks(greenSem);
    Scheduler.regenerateAll(greenSem);
    var greenSummary = ScheduleStatus.summarize(greenSem);
    assert(greenSummary.tier === 'green', 'small non-overlap roster is green (got ' + greenSummary.tier + ')');
    assert(greenSummary.incompleteCount === 0, 'green roster complete');

    var orientSem = makeDefaultSemester();
    var c1 = orientSem.students.find(function (s) { return s.clinicalGroup === 'C1'; });
    var orientWeekDate = orientSem.calendar.weeks[4] && orientSem.calendar.weeks[4].startDate;
    var srmc = orientSem.facilities.find(function (f) { return f.name.indexOf('Shasta') >= 0; });
    orientSem.orientations = [{
      id: 'o1',
      clinicalGroup: 'C1',
      date: orientWeekDate,
      facilityId: srmc.id
    }];
    var ow = Orientation.getEffectiveOrientationWeekIndex(orientSem, c1);
    if (ow >= 0 && c1.schedule[ow]) {
      c1.schedule[ow].clinical = true;
      var orientSummary = ScheduleStatus.summarize(orientSem);
      assert(orientSummary.tier === 'red', 'orientation conflict forces red tier (got ' + orientSummary.tier + ')');
      assert(orientSummary.orientationConflicts.length > 0, 'orientation conflicts reported');
      assert(orientSummary.incompleteCount === 0, 'requirements still met with orient conflict');
    } else {
      console.error('SKIP: could not set up orient red-tier test');
    }

    var blocking = Feasibility.checkBlocking(defaultSem);
    assert(blocking.ok, 'checkBlocking ok for successful default generation');
    var info = Feasibility.checkInformational(defaultSem);
    assert(info.issues.some(function (i) { return i.id === 'day_overlap_risk'; }), 'overlap is informational');

    expect(failed).toBe(0);
  });
});
