/* eslint-disable no-console */
'use strict';

var harness = require('./_harness');
harness.loadCore();

var App = harness.App;
var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error('FAIL: ' + message);
    return;
  }
  passed++;
}

function makeGroupNames(prefix, count) {
  var names = [];
  for (var i = 1; i <= count; i++) names.push(prefix + i);
  return names;
}

function makeStudents(total) {
  var students = [];
  for (var i = 0; i < total; i++) {
    students.push(App.DataModel.createStudent('Student ' + (i + 1), 'C1', 'SG1', 'fac0', ''));
  }
  return students;
}

function makeConfig(numClinical, numSim) {
  var cfg = App.DataModel.defaultConfig();
  cfg.maxStudents = 30;
  cfg.maxPerClinicalGroup = Math.ceil(30 / numClinical);
  cfg.clinicalGroups = makeGroupNames('C', numClinical);
  cfg.clinicalGroupDays = {};
  cfg.clinicalGroups.forEach(function (g, i) {
    cfg.clinicalGroupDays[g] = App.DataModel.WEEKDAY_OPTIONS[i % 7];
  });
  cfg.simGroups = makeGroupNames('SG', numSim);
  return App.DataModel.normalizeConfig(cfg);
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
  App.RosterBalance.rebalance(students, config);
  students.forEach(function (s) {
    var gi = config.clinicalGroups.indexOf(s.clinicalGroup);
    s.facilityId = facilities[gi % facilities.length].id;
  });
  App.CalendarEngine.rebuildWeeks(sem);
  App.Scheduler.regenerateAll(sem);
  return sem;
}

function assertSimWeekOrder(sem, label) {
  var violations = App.Validator.validateSimChronologicalOrder(sem);
  assert(violations.length === 0, label + ': sims in chronological week order (' + violations.length + ' violations)');
}

function assertValidation(sem, label) {
  var v = App.Validator.validateAll(sem);
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
    console.error('FAIL: ' + App.Feasibility.formatIssue(issue));
    failed++;
    return;
  }
  passed++;
}

function assertNoDoubleBooking(sem, label) {
  var violations = App.Validator.validateNoDoubleBooking(sem);
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
  var calendar = sem._simCalendar || App.Scheduler.buildProgramSimCalendar(sem, sem.config);
  var simReq = sem.config.simDaysRequired || 5;
  for (var n = 1; n <= simReq; n++) {
    if (App.Scheduler.blockHasRegularCapacity(sem, calendar, n, sem.config)) {
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
  var simDays = App.DataModel.getSimDays(sem.config);
  for (var w = 0; w < 18; w++) {
    if (App.CalendarEngine.isWeekInactive(sem, w)) continue;
    simDays.forEach(function (day) {
      var count = App.Scheduler.getDaySimAttendanceCount(sem, w, day);
      assert(count <= overload, label + ': week ' + (w + 1) + ' ' + day + ' sim count ' +
        count + ' exceeds overload cap ' + overload);
      if (count > normal) {
        var students = App.Scheduler.getDaySimStudents(sem, w, day);
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
  var simDays = App.DataModel.getSimDays(sem.config);
  var calendar = sem._simCalendar || App.Scheduler.buildProgramSimCalendar(sem, sem.config);
  calendar.blocks.forEach(function (block) {
    block.weeks.forEach(function (wi) {
      if (App.CalendarEngine.isWeekInactive(sem, wi)) return;
      if (simDays.length < 2) return;
      var counts = simDays.map(function (day) {
        return App.Scheduler.getDaySimAttendanceCount(sem, wi, day);
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
  var simDays = App.DataModel.getSimDays(cfg);
  sem.students.forEach(function (s) {
    if (!App.Scheduler.clinicalSimWeekdaysOverlap(s, cfg)) return;
    var clinDay = App.DataModel.getClinicalDayForGroup(s.clinicalGroup, cfg);
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
  var simDays = App.DataModel.getSimDays(sem.config);
  var foundSpare = false;
  for (var w = 10; w <= 13 && !foundSpare; w++) {
    simDays.forEach(function (day) {
      var count = App.Scheduler.getDaySimAttendanceCount(sem, w, day);
      if (count > 0 && count <= genMax) foundSpare = true;
    });
  }
  assert(foundSpare, label + ': sim blocks 4–5 retain headroom spare capacity on at least one session');
}

function assertStudentSimParticipation(sem, label) {
  var simReq = sem.config.simDaysRequired || 5;
  var violations = App.Validator.validateStudentSimParticipation(sem);
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
      assert(App.Scheduler.findSimWeek(s, n) >= 0,
        label + ': C2 student ' + s.name + ' missing Sim ' + n);
    }
  });
}

function assertProgramSimCalendar(sem, label) {
  var calendar = sem._simCalendar || App.Scheduler.buildProgramSimCalendar(sem, sem.config);
  var simReq = sem.config.simDaysRequired || 5;
  for (var n = 1; n <= Math.min(5, simReq); n++) {
    var block = calendar.blocks[n - 1];
    if (!block) continue;
    if (block.evenWeekIndex != null) {
      assert(App.Scheduler.getWeekSimNumber(calendar, block.evenWeekIndex) === n,
        label + ': even week ' + (block.evenWeekIndex + 1) + ' is Sim ' + n);
    }
    if (block.oddWeekIndex != null) {
      assert(App.Scheduler.getWeekSimNumber(calendar, block.oddWeekIndex) === n,
        label + ': odd week ' + (block.oddWeekIndex + 1) + ' is Sim ' + n);
    }
  }
  if (simReq >= 5 && !App.CalendarEngine.isWeekInactive(sem, 4)) {
    assert(App.Scheduler.getWeekSimNumber(calendar, 4) === 1, label + ': week 5 is Sim 1');
    assert(App.Scheduler.getWeekSimNumber(calendar, 5) === 1, label + ': week 6 is Sim 1');
    assert(App.Scheduler.getWeekSimNumber(calendar, 6) === 2, label + ': week 7 is Sim 2');
    assert(App.Scheduler.getWeekSimNumber(calendar, 7) === 2, label + ': week 8 is Sim 2');
  }
}

function assertEvenPatternSimWeeks(sem, label) {
  var calendar = sem._simCalendar || App.Scheduler.buildProgramSimCalendar(sem, sem.config);
  sem.students.forEach(function (s) {
    if (s.simGroup !== 'SG1' && s.simGroup !== 'SG2') return;
    var placements = App.Scheduler.getSimPlacements(s);
    placements.forEach(function (p) {
      var block = calendar.blocks[p.sim - 1];
      if (!block) return;
      assert(block.weeks.indexOf(p.weekIndex) >= 0,
        label + ': ' + s.name + ' Sim ' + p.sim + ' on week ' + p.week + ' outside program block');
    });
  });
}

function makeDefaultSemester() {
  var config = App.DataModel.defaultConfig();
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
  App.RosterBalance.rebalance(students, config);
  students.forEach(function (s) {
    var gi = config.clinicalGroups.indexOf(s.clinicalGroup);
    s.facilityId = facilities[gi % facilities.length].id;
  });
  App.CalendarEngine.rebuildWeeks(sem);
  App.Scheduler.regenerateAll(sem);
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

var noHeadroomCfg = App.DataModel.defaultConfig();
noHeadroomCfg.simMakeupHeadroomReserved = 0;
var noHeadroomSem = makeSemester(5, 4);
noHeadroomSem.config = App.DataModel.normalizeConfig(noHeadroomCfg);
App.Scheduler.regenerateAll(noHeadroomSem);
assertStudentSimParticipation(noHeadroomSem, 'headroom 0 / 5 clinical / 4 sim');

console.log('\nScheduling rules tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
