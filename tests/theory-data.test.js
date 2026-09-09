import { describe, it, expect } from 'vitest';
import * as DataModel from '../src/core/data-model/index.js';
import * as CalendarEngine from '../src/core/calendar-engine.js';
import * as TheoryData from '../src/core/theory-data.js';

describe('theory-data.test.js', () => {
  it('migrates empty semester with theory block', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    delete sem.theory;
    DataModel.migrateSemester(sem);
    expect(sem.theory).toBeTruthy();
    expect(sem.theory.version).toBe(1);
    expect(sem.theory.courseCodes).toContain('REGN15');
    expect(sem.theory.settings.lectureWeekdays).toEqual(['Wed', 'Thu']);
    expect(sem.theory.settings.defaultSkillsFacultyRequired).toBe(2);
    expect(sem.theory.settings.theoryFaculty).toEqual([]);
    expect(sem.theory.settings.skillsFaculty).toEqual([]);
    expect(sem.theory.settings.showLecturers).toBe(true);
    expect(sem.simInstructors).toEqual([]);
  });

  it('syncs setup holidays onto theory calendar days', () => {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    sem.calendar.semesterStartDate = '2026-08-16'; // Sunday
    CalendarEngine.rebuildWeeks(sem);
    DataModel.migrateSemester(sem);
    sem.holidays = [
      { id: 'h1', type: 'holiday', date: '2026-09-07', label: 'Labor Day' },
      { id: 'h2', type: 'break', weekIndex: 14, label: 'Thanksgiving Break' }
    ];
    TheoryData.syncHolidaysFromSemester(sem);
    var labor = TheoryData.findDay(sem.theory, '2026-09-07');
    expect(labor).toBeTruthy();
    expect(labor.weekday).toBe('Mon');
    expect(labor.weekLabel).toBe(CalendarEngine.getWeekIndexForDate(sem, '2026-09-07') + 1);
    expect(labor.events.some(function (e) { return e.track === 'holiday' && e.title === 'Labor Day'; })).toBe(true);
    var breakDays = (sem.theory.days || []).filter(function (d) {
      return (d.events || []).some(function (e) {
        return e.categories && e.categories.indexOf('synced_holiday') >= 0 && e.title === 'Thanksgiving Break';
      });
    });
    expect(breakDays.length).toBe(7);
  });

  it('moves events between days and renumbers modules', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.days = [{
      date: '2026-08-19', weekIndex: 0, weekday: 'Wed', weekLabel: 1,
      events: [
        { id: 'a', track: 'theory', title: 'Vitals', timeStart: '0800', timeEnd: '1050', categories: ['lecture'], faculty: [] }
      ]
    }, {
      date: '2026-08-20', weekIndex: 0, weekday: 'Thu', weekLabel: 1,
      events: []
    }];
    TheoryData.renumberWeekModules(sem.theory, 1);
    expect(TheoryData.moveEventToDate(sem.theory, sem, 'a', '2026-08-20')).toBe(true);
    expect(TheoryData.findDay(sem.theory, '2026-08-19').events.length).toBe(0);
    expect(TheoryData.findDay(sem.theory, '2026-08-20').events[0].id).toBe('a');
    expect(TheoryData.findDay(sem.theory, '2026-08-20').events[0].moduleCode).toBe('1A');
  });

  it('trackCssClass includes assignment content area', () => {
    expect(TheoryData.trackCssClass({ track: 'assignment', contentArea: 'skills' }))
      .toContain('theory-track-assignment-skills');
  });

  it('classifies practicum vs theory track bands', () => {
    expect(TheoryData.isPracticumTrackEvent({ track: 'skills' })).toBe(true);
    expect(TheoryData.isPracticumTrackEvent({ track: 'clinical' })).toBe(true);
    expect(TheoryData.isPracticumTrackEvent({ track: 'simulation' })).toBe(true);
    expect(TheoryData.isPracticumTrackEvent({ track: 'orientation' })).toBe(true);
    expect(TheoryData.isPracticumTrackEvent({ track: 'assignment', contentArea: 'skills' })).toBe(true);
    expect(TheoryData.isPracticumTrackEvent({ track: 'theory' })).toBe(false);
    expect(TheoryData.isPracticumTrackEvent({ track: 'exam' })).toBe(false);
    expect(TheoryData.isPracticumTrackEvent({ track: 'assignment', contentArea: 'theory' })).toBe(false);
    expect(TheoryData.isPracticumTrackEvent({ track: 'holiday' })).toBe(false);
  });

  it('insertEventOnDay keeps theory events above practicum', () => {
    var day = { date: '2026-08-19', events: [] };
    TheoryData.insertEventOnDay(day, { id: 's1', track: 'skills' });
    TheoryData.insertEventOnDay(day, { id: 't1', track: 'theory' });
    TheoryData.insertEventOnDay(day, { id: 'c1', track: 'clinical' });
    TheoryData.insertEventOnDay(day, { id: 'e1', track: 'exam' });
    expect(day.events.map(function (e) { return e.id; })).toEqual(['t1', 'e1', 's1', 'c1']);
  });

  it('resolves moduleCode 1A to Wed of week 1', () => {
    var fileRoot = DataModel.createDefaultFile();
    var sem = fileRoot.semesters[0];
    sem.calendar.semesterStartDate = '2026-08-16';
    CalendarEngine.rebuildWeeks(sem);
    DataModel.migrateSemester(sem);
    var date = TheoryData.dateForModuleCode(sem, '1A');
    expect(date).toBeTruthy();
    var parsed = TheoryData.parseModuleCode('1A');
    expect(parsed.weekLabel).toBe(1);
    expect(parsed.slotLetter).toBe('A');
    expect(TheoryData.weekdayForSlot(['Wed', 'Thu'], 'A')).toBe('Wed');
  });

  it('projects lecture assignment rows from theory days', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.days = [{
      date: '2026-08-19',
      weekIndex: 0,
      weekday: 'Wed',
      weekLabel: 1,
      events: [{
        id: 'ev1',
        track: 'theory',
        moduleCode: '1A',
        title: 'Module 1A — Syllabus',
        timeStart: '0800',
        timeEnd: '1050',
        faculty: [{ name: 'Lead Faculty 1', role: 'lecturer' }],
        categories: ['lecture']
      }, {
        id: 'ev2',
        track: 'skills',
        title: 'Skills intro',
        description: 'Hand hygiene testout',
        timeStart: '1200',
        timeEnd: '1550',
        categories: ['skills_lab']
      }]
    }];
    var rows = TheoryData.projectLectureAssignments(sem.theory);
    expect(rows.length).toBe(1);
    expect(rows[0].topic).toContain('Syllabus');
    expect(rows[0].skillsLab).toContain('testout');
  });

  it('includes lecture rows on non-instructional weekdays when events exist', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.instructionalWeekdays = ['Wed', 'Thu', 'Fri'];
    sem.theory.days = [{
      date: '2026-08-18',
      weekIndex: 0,
      weekday: 'Tue',
      weekLabel: 1,
      events: [{
        id: 'ev-tue',
        track: 'theory',
        moduleCode: '1A',
        title: 'Module 1A — Being a good nurse',
        timeStart: '0800',
        timeEnd: '1050',
        faculty: [{ name: 'Faculty Needed', needed: true, role: 'lecturer' }],
        categories: ['lecture']
      }]
    }, {
      date: '2026-08-25',
      weekIndex: 1,
      weekday: 'Tue',
      weekLabel: 2,
      events: []
    }];
    var rows = TheoryData.projectLectureAssignments(sem.theory);
    expect(rows.length).toBe(1);
    expect(rows[0].weekday).toBe('Tue');
    expect(rows[0].week).toBe(1);
    expect(rows[0].topic).toContain('Being a good nurse');
  });

  it('rolls one-group clinical/sim hours from Setup times', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    // Ensure facility times → 12.5h (0600–1830)
    var fac = sem.facilities[0];
    fac.clinicalStart = '0600';
    fac.clinicalEnd = '1830';
    sem.config.simDefaultStart = '0900';
    sem.config.simDefaultEnd = '1500';
    // Two students in different groups, same week clinical + sim
    sem.students[0].clinicalGroup = 'C1';
    sem.students[0].simGroup = 'SG1';
    sem.students[0].schedule[4] = {
      clinical: true, clinicalMissed: false, sim: null, simDay: null,
      simGuestGroup: null, makeupClinical: false, inactive: false,
      simMakeup: false, simOverload: false, facilityId: fac.id
    };
    sem.students[0].schedule[5] = {
      clinical: false, clinicalMissed: false, sim: 1, simDay: 'Mon',
      simGuestGroup: null, makeupClinical: false, inactive: false,
      simMakeup: false, simOverload: false, facilityId: null
    };
    if (sem.students[1]) {
      sem.students[1].clinicalGroup = 'C2';
      sem.students[1].simGroup = 'SG2';
      sem.students[1].schedule[4] = {
        clinical: true, clinicalMissed: false, sim: null, simDay: null,
        simGuestGroup: null, makeupClinical: false, inactive: false,
        simMakeup: false, simOverload: false, facilityId: fac.id
      };
      sem.students[1].schedule[5] = {
        clinical: false, clinicalMissed: false, sim: 1, simDay: 'Tue',
        simGuestGroup: null, makeupClinical: false, inactive: false,
        simMakeup: false, simOverload: false, facilityId: null
      };
      // Extra clinical week only for C2 (should not inflate C1 semester total)
      sem.students[1].schedule[6] = {
        clinical: true, clinicalMissed: false, sim: null, simDay: null,
        simGuestGroup: null, makeupClinical: false, inactive: false,
        simMakeup: false, simOverload: false, facilityId: fac.id
      };
    }
    var byWeek = TheoryData.rollSchedulerHours(sem, 'REGN15P');
    expect(byWeek[5].clinical).toBe(12.5);
    expect(byWeek[6].simulation).toBe(5.5); // 0900–1500 minus 30 min lunch
    expect(byWeek[7].clinical).toBe(12.5); // union still shows C2's week
    var totals = TheoryData.semesterHourTotals(sem.theory, sem, 'REGN15P');
    // Semester clinical = C1 path only (week 5), not C2's extra week 7
    expect(totals.clinical).toBe(12.5);
    expect(totals.simulation).toBe(5.5);
  });

  it('builds coordinator day items and semester totals', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.days = [{
      date: '2026-08-19',
      weekIndex: 0,
      weekday: 'Wed',
      weekLabel: 1,
      events: [{
        id: 'ev1',
        track: 'theory',
        title: 'Module 1A',
        timeStart: '0800',
        timeEnd: '1050',
        categories: ['lecture']
      }, {
        id: 'ev2',
        track: 'skills',
        title: 'Skills intro',
        timeStart: '1200',
        timeEnd: '1550',
        categories: ['skills_lab']
      }, {
        id: 'ev3',
        track: 'simulation',
        title: 'Simulation',
        categories: ['simulation']
      }]
    }];
    var items = TheoryData.coordinatorItemsForDay(sem.theory, sem, 1, 'Wed', 'REGN15P');
    expect(items.length).toBe(2);
    expect(items[0].label).toBe('Lecture 0800–1050');
    expect(items[1].label).toBe('Skills lab 1200–1550');
    expect(items.every(function (i) { return i.kind !== 'simulation'; })).toBe(true);
    var totals = TheoryData.semesterHourTotals(sem.theory, sem, 'REGN15P');
    expect(totals.lecture).toBeGreaterThan(0);
    expect(totals.practicum).toBe(totals.skills_lab + totals.clinical + totals.simulation);
  });

  it('shows holiday chips before lecture/skills on coordinator days', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.days = [{
      date: '2026-09-07',
      weekIndex: 3,
      weekday: 'Mon',
      weekLabel: 4,
      events: [{
        id: 'h1',
        track: 'holiday',
        title: 'Labor Day',
        categories: ['synced_holiday']
      }, {
        id: 'ev1',
        track: 'theory',
        timeStart: '0800',
        timeEnd: '1050',
        categories: ['lecture']
      }]
    }];
    var items = TheoryData.coordinatorItemsForDay(sem.theory, sem, 4, 'Mon', 'REGN15P');
    expect(items[0]).toEqual({ kind: 'holiday', label: 'Labor Day' });
    expect(items[1].kind).toBe('theory');
  });

  it('coordinator week totals use live event sums and ignore weekSummaries overrides', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.days = [
      {
        date: '2026-08-19', weekIndex: 0, weekday: 'Wed', weekLabel: 1,
        events: [
          { id: 'a', track: 'theory', timeStart: '0800', timeEnd: '1050', categories: ['lecture'] }
        ]
      },
      {
        date: '2026-08-20', weekIndex: 0, weekday: 'Thu', weekLabel: 1,
        events: [
          { id: 'b', track: 'theory', timeStart: '0800', timeEnd: '1115', categories: ['lecture'] }
        ]
      },
      {
        date: '2026-08-21', weekIndex: 0, weekday: 'Fri', weekLabel: 1,
        events: [
          { id: 'c', track: 'theory', timeStart: '0800', timeEnd: '1050', categories: ['lecture'] },
          { id: 'd', track: 'theory', timeStart: '1145', timeEnd: '1500', categories: ['lecture'] },
          { id: 'e', track: 'skills', timeStart: '1200', timeEnd: '1550', categories: ['skills_lab'] }
        ]
      }
    ];
    // Stale import rollups must not win over Cont. Mult. live sums.
    sem.theory.weekSummaries = {
      '1': { lecture: 8.15, skills_lab: 7 }
    };
    var summary = TheoryData.weekSummaryForLabel(sem.theory, sem, 1, 'REGN15P');
    // 3 + 3.5 + 3 + 3.5 = 13
    expect(summary.lecture).toBe(13);
    expect(summary.lecture).not.toBe(8.15);
    expect(summary.skills_lab).toBe(TheoryData.instructionalHoursFromTimes('1200', '1550'));
    expect(summary.skills_lab).not.toBe(7);
  });

  it('labels coordinator practicum items with group and sim/clinical number', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    var student = sem.students[0];
    student.clinicalGroup = 'C1';
    student.simGroup = 'SG1';
    sem.config.clinicalGroupDays = sem.config.clinicalGroupDays || {};
    sem.config.clinicalGroupDays.C1 = 'Mon';
    // Two prior clinical weeks so week 6 is Clinical 3
    student.schedule[0] = {
      clinical: true, clinicalMissed: false, sim: null, simDay: null,
      simGuestGroup: null, makeupClinical: false, inactive: false,
      simMakeup: false, simOverload: false, facilityId: 'fac_srmc'
    };
    student.schedule[2] = {
      clinical: true, clinicalMissed: false, sim: null, simDay: null,
      simGuestGroup: null, makeupClinical: false, inactive: false,
      simMakeup: false, simOverload: false, facilityId: 'fac_srmc'
    };
    student.schedule[5] = {
      clinical: true, clinicalMissed: false, sim: 1, simDay: 'Mon',
      simGuestGroup: null, makeupClinical: false, inactive: false,
      simMakeup: false, simOverload: false, facilityId: 'fac_srmc'
    };
    var monItems = TheoryData.coordinatorItemsForDay(sem.theory, sem, 6, 'Mon', 'REGN15P');
    var clin = monItems.filter(function (i) { return i.kind === 'clinical'; });
    var sims = monItems.filter(function (i) { return i.kind === 'simulation'; });
    expect(clin.length).toBe(1);
    expect(clin[0].label).toBe('C1 Clinical 3');
    expect(sims.length).toBe(1);
    expect(sims[0].label).toBe('SG1, Sim 1');
    var sunItems = TheoryData.coordinatorItemsForDay(sem.theory, sem, 6, 'Sun', 'REGN15P');
    expect(sunItems.filter(function (i) { return i.kind === 'simulation'; }).length).toBe(0);
  });

  it('shows orientation chips and folds orientation hours into REGN15P clinical', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    CalendarEngine.rebuildWeeks(sem);
    var week = sem.calendar.weeks[3];
    var orientDate = week.startDate; // Sunday of week 4
    var weekday = CalendarEngine.weekdayNameForDate(CalendarEngine.parseDate(orientDate));
    var group = sem.students[0].clinicalGroup;
    var facId = sem.facilities[0].id;
    sem.orientations = [{
      id: 'o1',
      clinicalGroup: group,
      date: orientDate,
      facilityId: facId,
      timeStart: '0800',
      timeEnd: '1200',
      weekIndex: 3
    }];
    var items = TheoryData.coordinatorItemsForDay(sem.theory, sem, 4, weekday, 'REGN15P');
    var orients = items.filter(function (i) { return i.kind === 'orientation'; });
    expect(orients.length).toBe(1);
    expect(orients[0].label).toMatch(new RegExp('^' + group + ' Orient '));

    var summary = TheoryData.weekSummaryForLabel(sem.theory, sem, 4, 'REGN15P');
    expect(summary.clinical).toBe(4);

    // Clear student clinical/sim so semester clinical is orientation-only for the cohort path.
    (sem.students || []).forEach(function (s) {
      (s.schedule || []).forEach(function (cell) {
        if (!cell) return;
        cell.clinical = false;
        cell.clinicalMissed = false;
        cell.sim = null;
        cell.simDay = null;
        cell.simGuestGroup = null;
      });
    });
    var totals = TheoryData.semesterHourTotals(sem.theory, sem, 'REGN15P');
    expect(totals.clinical).toBe(4);
    expect(totals.practicum).toBe(totals.skills_lab + totals.clinical + totals.simulation);

    var pracV = TheoryData.contactHourValidation(sem.theory, sem, 'REGN15P');
    expect(pracV.scheduled).toBe(totals.practicum);
  });

  it('auto-numbers lecture modules across a week and renumbers after remove', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.days = [{
      date: '2026-08-19', weekIndex: 0, weekday: 'Wed', weekLabel: 1,
      events: [
        { id: 'a', track: 'theory', title: 'Vitals', timeStart: '0800', timeEnd: '1050', categories: ['lecture'] },
        { id: 'b', track: 'theory', title: 'Test taking', timeStart: '0800', timeEnd: '1050', categories: ['lecture'] }
      ]
    }, {
      date: '2026-08-20', weekIndex: 0, weekday: 'Thu', weekLabel: 1,
      events: [
        { id: 'c', track: 'theory', title: 'Assessment', timeStart: '0800', timeEnd: '1050', categories: ['lecture'] }
      ]
    }, {
      date: '2026-08-21', weekIndex: 0, weekday: 'Fri', weekLabel: 1,
      events: [
        { id: 'd', track: 'theory', title: 'QSEN', timeStart: '0800', timeEnd: '1050', categories: ['lecture'] }
      ]
    }];
    TheoryData.renumberWeekModules(sem.theory, 1);
    expect(sem.theory.days[0].events[0].moduleCode).toBe('1A');
    expect(sem.theory.days[0].events[1].moduleCode).toBe('1B');
    expect(sem.theory.days[1].events[0].moduleCode).toBe('1C');
    expect(sem.theory.days[2].events[0].moduleCode).toBe('1D');
    expect(sem.theory.days[0].events[0].title).toContain('Module 1A');
    // Remove Wed's second topic → Thu 1C becomes 1B, Fri 1D becomes 1C
    sem.theory.days[0].events.splice(1, 1);
    TheoryData.renumberWeekModules(sem.theory, 1);
    expect(sem.theory.days[0].events[0].moduleCode).toBe('1A');
    expect(sem.theory.days[1].events[0].moduleCode).toBe('1B');
    expect(sem.theory.days[2].events[0].moduleCode).toBe('1C');
    // Same-slot topics count lecture hours once (Cont. Mult.: 0800–1050 → 3.0 h)
    expect(TheoryData.sumTheoryHoursForWeek(sem.theory, 1, 'lecture')).toBeCloseTo(3.0 * 3, 1);
  });

  it('validates contact hour targets separately for theory and practicum', () => {
    var sem = DataModel.createDefaultFile().semesters[0];
    DataModel.migrateSemester(sem);
    sem.theory.days = [{
      date: '2026-08-19', weekIndex: 0, weekday: 'Wed', weekLabel: 1,
      events: [
        { id: 'a', track: 'theory', timeStart: '0800', timeEnd: '1050', categories: ['lecture'] },
        { id: 'b', track: 'skills', timeStart: '1200', timeEnd: '1550', categories: ['skills_lab'] }
      ]
    }];
    sem.theory.settings.courseHourTargets = [
      { courseCode: 'REGN15', contactHoursTarget: 3 },
      { courseCode: 'REGN15P', contactHoursTarget: 10 }
    ];
    var theoryV = TheoryData.contactHourValidation(sem.theory, sem, 'REGN15');
    expect(theoryV.scheduled).toBe(3);
    expect(theoryV.target).toBe(3);
    expect(theoryV.status).toBe('on_target');

    var pracV = TheoryData.contactHourValidation(sem.theory, sem, 'REGN15P');
    // Practicum scheduled excludes lecture (skills Cont. Mult. for 1200–1550 → 4.0).
    expect(pracV.scheduled).toBe(4);
    expect(pracV.target).toBe(10);
    expect(pracV.status).toBe('under');

    var all = TheoryData.contactHourValidations(sem.theory, sem);
    expect(all.length).toBe(2);
    expect(all[0].courseCode).toBe('REGN15');
    expect(all[1].courseCode).toBe('REGN15P');
  });

  it('FILE_VERSION is 5', () => {
    expect(DataModel.FILE_VERSION).toBe(5);
  });
});
