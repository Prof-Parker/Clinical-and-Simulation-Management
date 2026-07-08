/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DataModel,
  CalendarEngine,
  Scheduler,
  RosterBalance,
  Validator,
  Feasibility,
  ScheduleStatus
} from './_harness.js';

describe('scheduling-rules.test.js', () => {
  it('runs assertions', () => {
    let failed = 0;

    function assert(condition, message) {
      if (!condition) {
        failed++;
        console.error('FAIL: ' + message);
        return;
      }
    }

    function makeGroupNames(prefix, count) {
  var names = [];
  for (var i = 1; i <= count; i++) names.push(prefix + i);
  return names;
}

function makeStudents(total) {
  var students = [];
  for (var i = 0; i < total; i++) {
    students.push(DataModel.createStudent('Student ' + (i + 1), 'C1', 'SG1', 'fac0', ''));
  }
  return students;
}

function makeConfig(numClinical, numSim) {
  var cfg = DataModel.defaultConfig();
  cfg.maxStudents = 30;
  cfg.maxPerClinicalGroup = Math.ceil(30 / numClinical);
  cfg.clinicalGroups = makeGroupNames('C', numClinical);
  cfg.clinicalGroupDays = {};
  cfg.clinicalGroups.forEach(function (g, i) {
    cfg.clinicalGroupDays[g] = DataModel.WEEKDAY_OPTIONS[i % 7];
  });
  cfg.simGroups = makeGroupNames('SG', numSim);
  return DataModel.normalizeConfig(cfg);
}

function makeSemester(numClinical, numSim) {
  var config = makeConfig(numClinical, numSim);
  var facilities = [];
  for (var i = 0; i < Math.max(numClinical, 1); i++) {
    facilities.push({ id: 'fac' + i, name: 'Facility ' + (i + 1) });
  }
  var students = makeStudents(30);
  var sem = {
    config: config,
    students: students,
    facilities: facilities,
    faculty: [],
    sections: [],
    holidays: [],
    calendar: { semesterStartDate: '2026-01-12', weeks: [] },
    meta: {}
  };
  RosterBalance.rebalance(students, config);
  students.forEach(function (s) {
    var gi = config.clinicalGroups.indexOf(s.clinicalGroup);
    s.facilityId = facilities[gi % facilities.length].id;
  });
  CalendarEngine.rebuildWeeks(sem);
  Scheduler.regenerateAll(sem);
  return sem;
}

function assertSimWeekOrder(sem, label) {
  var violations = Validator.validateSimChronologicalOrder(sem);
  assert(violations.length === 0, label + ': sims in chronological week order (' + violations.length + ' violations)');
}

function assertValidation(sem, label) {
  var v = Validator.validateAll(sem);
  if (!v.allValid) {
    var msgs = [];
    Object.keys(v.students).forEach(function (id) {
      var r = v.students[id];
      if (!r.valid) msgs.push(r.errors.join('; '));
    });
    v.groupErrors.forEach(function (e) { msgs.push(e); });
    v.simSessions.forEach(function (x) { msgs.push(x.message); });
    v.clinicalSessions.forEach(function (x) { msgs.push(x.message); });
    v.doubleBooking.forEach(function (x) { msgs.push(x.message); });
    v.simClinicalConflicts.forEach(function (x) { msgs.push(x.message); });
    v.simGroupExceptions.forEach(function (x) { msgs.push(x.message); });
    v.simWeekOrder.forEach(function (x) { msgs.push(x.message); });
    (v.programSimWeeks || []).forEach(function (x) { msgs.push(x.message); });
    (v.studentSimParticipation || []).forEach(function (x) { msgs.push(x.message); });
    (v.simBlockNoRepeat || []).forEach(function (x) { msgs.push(x.message); });
    var issue = {
      id: 'validation_failed',
      message: label + ' schedule validation failed: ' + msgs.slice(0, 3).join('; '),
      studentCount: sem.students.length,
      suggestion: 'Review semester setup.'
    };
    console.error('FAIL: ' + Feasibility.formatIssue(issue));
    failed++;
    return;
  }
}

    function assertNoDoubleBooking(sem, label) {
  var violations = Validator.validateNoDoubleBooking(sem);
  assert(violations.length === 0, label + ': no double-booking (' + violations.length + ' violations)');
}

function assertGuestSimSpread(sem, label) {
  var guestCounts = sem.students.map(function (s) {
    var guest = 0;
    s.schedule.forEach(function (c) { if (c.simGuestGroup) guest++; });
    return guest;
  });
  var maxGuest = Math.max.apply(null, guestCounts.concat([0]));
  var withGuest = guestCounts.filter(function (n) { return n > 0; }).length;
  if (maxGuest > 1 && withGuest > 0) {
    assert(withGuest >= 2 || maxGuest <= 2,
      label + ': guest sim load spread (max ' + maxGuest + ' guests on one student, ' +
      withGuest + ' students guesting)');
  }
}

function assertNoEarlyWeek18(sem, label) {
  var calendar = sem._simCalendar || Scheduler.buildProgramSimCalendar(sem, sem.config);
  var simReq = sem.config.simDaysRequired || 5;
  for (var n = 1; n <= simReq; n++) {
    if (Scheduler.blockHasRegularCapacity(sem, calendar, n, sem.config)) {
      sem.students.forEach(function (s) {
        s.schedule.forEach(function (cell, wi) {
          if (wi === 17 && cell.sim === n) {
            assert(false, label + ': Sim ' + n + ' on Week 18 while block ' + n +
              ' still has regular capacity');
          }
        });
      });
    }
  }
}

function assertPerDaySimCap(sem, label) {
  var normal = sem.config.maxStudentsPerSimSession || 8;
  var overload = sem.config.maxStudentsPerSimSessionOverload || 9;
  var simDays = DataModel.getSimDays(sem.config);
  for (var w = 0; w < 18; w++) {
    if (CalendarEngine.isWeekInactive(sem, w)) continue;
    simDays.forEach(function (day) {
      var count = Scheduler.getDaySimAttendanceCount(sem, w, day);
      assert(count <= overload, label + ': week ' + (w + 1) + ' ' + day + ' sim count ' +
        count + ' exceeds overload cap ' + overload);
      if (count > normal) {
        var students = Scheduler.getDaySimStudents(sem, w, day);
        var overloadCells = students.filter(function (x) { return x.cell.simOverload; }).length;
        assert(count - normal === overloadCells,
          label + ': week ' + (w + 1) + ' ' + day + ' overload count mismatch');
      }
    });
  }
}

function assertSimLoadBalance(sem, label) {
  var normal = sem.config.maxStudentsPerSimSession || 8;
  var overload = sem.config.maxStudentsPerSimSessionOverload || 9;
  var simDays = DataModel.getSimDays(sem.config);
  var calendar = sem._simCalendar || Scheduler.buildProgramSimCalendar(sem, sem.config);
  calendar.blocks.forEach(function (block) {
    block.weeks.forEach(function (wi) {
      if (CalendarEngine.isWeekInactive(sem, wi)) return;
      if (simDays.length < 2) return;
      var counts = simDays.map(function (day) {
        return Scheduler.getDaySimAttendanceCount(sem, wi, day);
      });
      var maxC = Math.max.apply(null, counts);
      var minC = Math.min.apply(null, counts);
      if (maxC >= overload && minC < normal - 1) {
        assert(false, label + ': week ' + (wi + 1) + ' sim imbalance — one day at overload (' +
          maxC + ') while alternate day has spare capacity (' + minC + ')');
      }
    });
  });
}

function assertOverlapRouting(sem, label) {
  var cfg = sem.config;
  var simDays = DataModel.getSimDays(cfg);
  sem.students.forEach(function (s) {
    if (!Scheduler.clinicalSimWeekdaysOverlap(s, cfg)) return;
    var clinDay = DataModel.getClinicalDayForGroup(s.clinicalGroup, cfg);
    s.schedule.forEach(function (cell, wi) {
      if (!cell.sim || cell.simDay === clinDay) return;
      if (cell.clinical && !cell.clinicalMissed) return;
      assert(true, label + ': overlap student uses non-clinical sim day when no conflict week');
    });
    var conflictWeeks = 0;
    s.schedule.forEach(function (cell, wi) {
      if (!cell.sim) return;
      if (cell.clinical && !cell.clinicalMissed && cell.simDay === clinDay) conflictWeeks++;
    });
    assert(conflictWeeks <= 1,
      label + ': ' + s.name + ' has at most one sim/clinical conflict (' + conflictWeeks + ')');
  });
}

function assertHeadroomSpare(sem, label) {
  var normal = sem.config.maxStudentsPerSimSession || 8;
  var headroom = sem.config.simMakeupHeadroomReserved != null ? sem.config.simMakeupHeadroomReserved : 1;
  if (headroom <= 0) return;
  var genMax = Math.max(1, normal - headroom);
  var simDays = DataModel.getSimDays(sem.config);
  var foundSpare = false;
  for (var w = 10; w <= 13 && !foundSpare; w++) {
    simDays.forEach(function (day) {
      var count = Scheduler.getDaySimAttendanceCount(sem, w, day);
      if (count > 0 && count <= genMax) foundSpare = true;
    });
  }
  assert(foundSpare, label + ': sim blocks 4–5 retain headroom spare capacity on at least one session');
}

function assertStudentSimParticipation(sem, label) {
  var simReq = sem.config.simDaysRequired || 5;
  var violations = Validator.validateStudentSimParticipation(sem);
  assert(violations.length === 0, label + ': each student has sims 1..' + simReq + ' once (' +
    violations.length + ' violations)');
  sem.students.forEach(function (s) {
    var nums = [];
    s.schedule.forEach(function (c) { if (c.sim) nums.push(c.sim); });
    var unique = {};
    nums.forEach(function (n) { unique[n] = true; });
    assert(nums.length === Object.keys(unique).length,
      label + ': ' + s.name + ' has no duplicate sim numbers');
  });
}

function assertDefaultConfigComplete(sem, label) {
  assertStudentSimParticipation(sem, label);
  var c2Students = sem.students.filter(function (s) { return s.clinicalGroup === 'C2'; });
  c2Students.forEach(function (s) {
    var simReq = sem.config.simDaysRequired || 5;
    for (var n = 1; n <= simReq; n++) {
      assert(Scheduler.findSimWeek(s, n) >= 0,
        label + ': C2 student ' + s.name + ' missing Sim ' + n);
    }
  });
}

function assertProgramSimCalendar(sem, label) {
  var calendar = sem._simCalendar || Scheduler.buildProgramSimCalendar(sem, sem.config);
  var simReq = sem.config.simDaysRequired || 5;
  for (var n = 1; n <= Math.min(5, simReq); n++) {
    var block = calendar.blocks[n - 1];
    if (!block) continue;
    if (block.evenWeekIndex != null) {
      assert(Scheduler.getWeekSimNumber(calendar, block.evenWeekIndex) === n,
        label + ': even week ' + (block.evenWeekIndex + 1) + ' is Sim ' + n);
    }
    if (block.oddWeekIndex != null) {
      assert(Scheduler.getWeekSimNumber(calendar, block.oddWeekIndex) === n,
        label + ': odd week ' + (block.oddWeekIndex + 1) + ' is Sim ' + n);
    }
  }
  if (simReq >= 5 && !CalendarEngine.isWeekInactive(sem, 4)) {
    assert(Scheduler.getWeekSimNumber(calendar, 4) === 1, label + ': week 5 is Sim 1');
    assert(Scheduler.getWeekSimNumber(calendar, 5) === 1, label + ': week 6 is Sim 1');
    assert(Scheduler.getWeekSimNumber(calendar, 6) === 2, label + ': week 7 is Sim 2');
    assert(Scheduler.getWeekSimNumber(calendar, 7) === 2, label + ': week 8 is Sim 2');
  }
}

function assertEvenPatternSimWeeks(sem, label) {
  var calendar = sem._simCalendar || Scheduler.buildProgramSimCalendar(sem, sem.config);
  sem.students.forEach(function (s) {
    if (s.simGroup !== 'SG1' && s.simGroup !== 'SG2') return;
    var placements = Scheduler.getSimPlacements(s);
    placements.forEach(function (p) {
      var block = calendar.blocks[p.sim - 1];
      if (!block) return;
      assert(block.weeks.indexOf(p.weekIndex) >= 0,
        label + ': ' + s.name + ' Sim ' + p.sim + ' on week ' + p.week + ' outside program block');
    });
  });
}

function makeDefaultSemester() {
  var config = DataModel.defaultConfig();
  var facilities = [];
  for (var i = 0; i < 5; i++) {
    facilities.push({ id: 'fac' + i, name: 'Facility ' + (i + 1) });
  }
  var students = makeStudents(30);
  var sem = {
    config: config,
    students: students,
    facilities: facilities,
    faculty: [],
    sections: [],
    holidays: [],
    calendar: { semesterStartDate: '2026-01-12', weeks: [] },
    meta: {}
  };
  RosterBalance.rebalance(students, config);
  students.forEach(function (s) {
    var gi = config.clinicalGroups.indexOf(s.clinicalGroup);
    s.facilityId = facilities[gi % facilities.length].id;
  });
  CalendarEngine.rebuildWeeks(sem);
  Scheduler.regenerateAll(sem);
  return sem;
}

var sizes = [3, 4, 5, 6];
sizes.forEach(function (numClinical) {
  sizes.forEach(function (numSim) {
    var label = numClinical + ' clinical / ' + numSim + ' sim';
    var sem = makeSemester(numClinical, numSim);
    assertValidation(sem, label);
    assertNoDoubleBooking(sem, label);
    assertSimWeekOrder(sem, label);
    assertGuestSimSpread(sem, label);
    assertNoEarlyWeek18(sem, label);
    assertProgramSimCalendar(sem, label);
    assertStudentSimParticipation(sem, label);
    assertPerDaySimCap(sem, label);
    assertSimLoadBalance(sem, label);
    if (numSim >= 4) assertEvenPatternSimWeeks(sem, label);
  });
});

var defaultSem = makeDefaultSemester();
assertValidation(defaultSem, 'default 5 clinical / 4 sim');
assertDefaultConfigComplete(defaultSem, 'default 5 clinical / 4 sim');
assertNoEarlyWeek18(defaultSem, 'default 5 clinical / 4 sim');
assertSimLoadBalance(defaultSem, 'default 5 clinical / 4 sim');
assertOverlapRouting(defaultSem, 'default 5 clinical / 4 sim');
assertHeadroomSpare(defaultSem, 'default 5 clinical / 4 sim');

var noHeadroomCfg = DataModel.defaultConfig();
noHeadroomCfg.simMakeupHeadroomReserved = 0;
var noHeadroomSem = makeSemester(5, 4);
noHeadroomSem.config = DataModel.normalizeConfig(noHeadroomCfg);
Scheduler.regenerateAll(noHeadroomSem);
assertStudentSimParticipation(noHeadroomSem, 'headroom 0 / 5 clinical / 4 sim');

function assertClinicalSimAlignment(sem, label) {
  var clin = DataModel.getClinicalGroups(sem.config);
  var sim = DataModel.getSimGroups(sem.config);
  if (clin.length !== sim.length) return;
  sem.students.forEach(function (s) {
    var ci = clin.indexOf(s.clinicalGroup);
    assert(ci >= 0 && s.simGroup === sim[ci],
      label + ': ' + s.name + ' aligned ' + s.clinicalGroup + '→' + sim[ci] + ' got ' + s.simGroup);
  });
}

function assertSimGroupConfigRespected(label) {
  var sem = makeSemester(2, 2);
  sem.config.simGroupDays.SG1 = 'Tue';
  sem.config.simGroupPattern.SG1 = 'even';
  sem.config.simGroupDays.SG2 = 'Mon';
  sem.config.simGroupPattern.SG2 = 'odd';
  DataModel.normalizeConfig(sem.config);
  assert(DataModel.getSimGroupDay('SG1', sem.config) === 'Tue', label + ': SG1 day');
  assert(DataModel.getSimGroupPattern('SG2', sem.config) === 'odd', label + ': SG2 pattern');
  assert(Scheduler.getSimWeekPatterns(sem.config).evenWeeks.length > 0, label + ': even weeks');
}

function assertDistinctSimGroupDaysSchedule(label) {
  var sem = makeSemester(2, 2);
  sem.config.simGroupDays.SG1 = 'Mon';
  sem.config.simGroupPattern.SG1 = 'even';
  sem.config.simGroupDays.SG2 = 'Tue';
  sem.config.simGroupPattern.SG2 = 'odd';
  DataModel.normalizeConfig(sem.config);
  Scheduler.regenerateAll(sem);
  var sg1 = sem.students.find(function (s) { return s.simGroup === 'SG1'; });
  var sg2 = sem.students.find(function (s) { return s.simGroup === 'SG2'; });
  assert(sg1 && sg1.schedule.some(function (c) { return c.sim && c.simDay === 'Mon'; }), label + ': SG1 Mon');
  assert(sg2 && sg2.schedule.some(function (c) { return c.sim && c.simDay === 'Tue'; }), label + ': SG2 Tue');
}

function assertMakeupWeeksDerived(label) {
  var sem = makeSemester(4, 4);
  sem.holidays = [{ id: 'b', type: 'break', weekIndex: 16, date: '', label: 'Break' }];
  CalendarEngine.rebuildWeeks(sem);
  var mk = CalendarEngine.resolveMakeupWeeks(sem);
  assert(mk.clinicalFallback === 17, label + ': clinical fallback week 18');
  assert(mk.clinicalPrimary === 15, label + ': clinical primary week 16');
}

function assertMismatchPreservesSimGroup(label) {
  var sem = makeSemester(4, 5);
  var student = sem.students[0];
  student.simGroup = 'SG5';
  Scheduler.regenerateAll(sem);
  assert(student.simGroup === 'SG5', label + ': manual simGroup preserved when counts differ');
}

assertClinicalSimAlignment(makeSemester(4, 4), '4 clinical / 4 sim alignment');
assertSimGroupConfigRespected('sim group config fields');
assertDistinctSimGroupDaysSchedule('distinct sim group weekdays');
assertMakeupWeeksDerived('makeup weeks with week 17 break');
assertMismatchPreservesSimGroup('5 sim / 4 clinical');

function loadS2026SemesterConfig() {
  var file = join(dirname(fileURLToPath(import.meta.url)), '..', 'mock-onedrive', 'semesters', 'S2026_REGN15P.json');
  var raw = JSON.parse(readFileSync(file, 'utf8'));
  return DataModel.normalizeConfig(JSON.parse(JSON.stringify(raw.semesters[0].config)));
}

function makeS2026Semester() {
  var config = loadS2026SemesterConfig();
  var file = join(dirname(fileURLToPath(import.meta.url)), '..', 'mock-onedrive', 'semesters', 'S2026_REGN15P.json');
  var raw = JSON.parse(readFileSync(file, 'utf8'));
  var src = raw.semesters[0];
  var facilities = (src.facilities && src.facilities.length)
    ? JSON.parse(JSON.stringify(src.facilities))
    : [{ id: 'fac0', name: 'Site A' }, { id: 'fac1', name: 'Site B' }];
  var students = makeStudents(30);
  var sem = {
    config: config,
    students: students,
    facilities: facilities,
    faculty: [],
    sections: [],
    holidays: src.holidays ? JSON.parse(JSON.stringify(src.holidays)) : [],
    calendar: src.calendar
      ? JSON.parse(JSON.stringify(src.calendar))
      : { semesterStartDate: '2026-01-19', weeks: [] },
    meta: {}
  };
  RosterBalance.rebalance(students, config);
  students.forEach(function (s) {
    var gi = config.clinicalGroups.indexOf(s.clinicalGroup);
    s.facilityId = facilities[gi >= 0 ? gi % facilities.length : 0].id;
  });
  CalendarEngine.rebuildWeeks(sem);
  Scheduler.regenerateAll(sem);
  return sem;
}

function assertSimGroupDayConsistency(sem, label) {
  var cfg = sem.config;
  sem.students.forEach(function (s) {
    var expected = DataModel.getSimGroupDay(s.simGroup, cfg);
    s.schedule.forEach(function (cell, wi) {
      if (!cell || !cell.sim || cell.simGuestGroup || cell.simOverload) return;
      assert(cell.simDay === expected,
        label + ': ' + s.name + ' (' + s.simGroup + ') week ' + (wi + 1) + ' sim ' + cell.sim +
        ' on ' + cell.simDay + ', expected ' + expected);
    });
  });
}

function assertNoNonPrimarySimPlacements(sem, label) {
  var calendar = sem._simCalendar || Scheduler.buildProgramSimCalendar(sem, sem.config);
  var adj = ScheduleStatus.scanAdjustments(sem, calendar, DataModel.getSimGroups(sem.config));
  assert(adj.nonPrimarySimCount === 0,
    label + ': non-primary sim placements (' + adj.nonPrimarySimCount + ' students)');
}

function assertS2026PrimarySimSchedule(label) {
  var sem = makeS2026Semester();
  assertValidation(sem, label);
  assertPerDaySimCap(sem, label);
  assertSimGroupDayConsistency(sem, label);
  assertNoNonPrimarySimPlacements(sem, label);
  assertClinicalSimAlignment(sem, label);
}

function assertSimDayOverflowCohort(label) {
  var sem = makeSemester(1, 1);
  sem.config.simGroupDays.SG1 = 'Tue';
  sem.config.simMakeupHeadroomReserved = 0;
  sem.config.maxStudentsPerSimSession = 8;
  sem.students = makeStudents(10);
  sem.students.forEach(function (s) {
    s.clinicalGroup = 'C1';
    s.simGroup = 'SG1';
    s.facilityId = sem.facilities[0].id;
  });
  DataModel.normalizeConfig(sem.config);
  CalendarEngine.rebuildWeeks(sem);
  Scheduler.regenerateAll(sem);
  var configured = 0;
  var overflow = 0;
  sem.students.forEach(function (s) {
    s.schedule.forEach(function (cell) {
      if (!cell || cell.sim !== 1) return;
      if (cell.simDay === 'Tue') configured++;
      else if (cell.simDay === 'Mon') overflow++;
    });
  });
  assert(configured === 8, label + ': eight students on configured Tue');
  assert(overflow === 2, label + ': two overflow students on alternate Mon');
}

    var s2026Fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'mock-onedrive', 'semesters', 'S2026_REGN15P.json');
    if (existsSync(s2026Fixture)) {
      assertS2026PrimarySimSchedule('S2026 REGN15P aligned sim days');
    }
    assertSimDayOverflowCohort('sim group day overflow cohort');

    expect(failed).toBe(0);
  });
});
