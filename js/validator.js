/* global App */

var App = App || {};



App.Validator = (function () {

  function validateStudent(student, data) {

    var cfg = data.config;

    var errors = [];

    var warnings = [];

    var stats = App.DataModel.countStats(student);

    var clinReq = cfg.clinicalDaysRequired || 10;

    var simReq = cfg.simDaysRequired || 5;



    if (stats.clinicals < clinReq) errors.push('Clinical days: ' + stats.clinicals + '/' + clinReq);

    if (stats.clinicals > clinReq) warnings.push('Extra clinical days: ' + stats.clinicals);

    if (stats.sims < simReq) errors.push('Simulation days: ' + stats.sims + '/' + simReq);

    if (stats.sims > simReq) warnings.push('Extra simulation days: ' + stats.sims);



    var expected = [];

    for (var n = 1; n <= stats.sims; n++) expected.push(n);

    var sorted = stats.simNums.slice().sort(function (a, b) { return a - b; });

    for (var i = 0; i < sorted.length; i++) {

      if (sorted[i] !== i + 1) {

        errors.push('Simulations must be completed in order (missing Sim ' + (i + 1) + ')');

        break;

      }

    }



    if (student.facilityId && !App.DataModel.findFacilityById(data, student.facilityId)) {

      warnings.push('Clinical site is not assigned to a known facility');

    }



    return {

      valid: errors.length === 0,

      errors: errors,

      warnings: warnings,

      stats: stats

    };

  }



  function validateSimSessions(data) {

    var cfg = data.config;

    var caps = App.Scheduler.getSimCaps(cfg);

    var violations = [];

    for (var w = 0; w < 18; w++) {

      if (App.CalendarEngine.isWeekInactive(data, w)) continue;

      App.DataModel.getSimDays(cfg).forEach(function (day) {

        var list = App.Scheduler.getDaySimStudents(data, w, day);

        var count = list.length;

        if (count === 0) return;

        if (count <= caps.normal) return;



        if (count > caps.overload) {

          violations.push({

            week: w + 1, day: day, count: count,

            message: 'Week ' + (w + 1) + ' ' + day + ' sim: ' + count + ' exceeds overload max ' + caps.overload

          });

          return;

        }



        var extras = count - caps.normal;

        var validOverload = list.filter(function (x) {

          return x.cell.simOverload;

        }).length;



        if (extras !== validOverload) {

          violations.push({

            week: w + 1, day: day, count: count,

            message: 'Week ' + (w + 1) + ' ' + day + ' sim: ' + count + '/' + caps.normal +

              ' — extra students must be assigned via sim overload join only'

          });

        }

      });

    }

    return violations;

  }



  function validateClinicalSessions(data) {

    var cfg = data.config;

    var caps = App.Scheduler.getClinicalCaps(cfg);

    var violations = [];



    App.DataModel.getClinicalGroups(cfg).forEach(function (group) {

      var day = App.DataModel.getClinicalDayForGroup(group, cfg);

      for (var w = 0; w < 18; w++) {

        if (App.CalendarEngine.isWeekInactive(data, w)) continue;

        var list = App.Scheduler.getClinicalGroupSessionStudents(data, w, group, day);

        if (!list.length) continue;

        var count = list.length;

        if (count <= caps.normal) continue;



        if (count > caps.overload) {

          violations.push({

            week: w + 1, group: group, day: day, count: count,

            message: 'Week ' + (w + 1) + ' ' + group + ' ' + day + ': ' + count +

              ' exceeds clinical overload max ' + caps.overload

          });

          continue;

        }



        var extras = count - caps.normal;

        var validOverload = list.filter(function (x) {

          return x.makeupJoin && x.overload;

        }).length;



        if (extras !== validOverload) {

          violations.push({

            week: w + 1, group: group, day: day, count: count,

            message: 'Week ' + (w + 1) + ' ' + group + ' ' + day + ': ' + count + '/' + caps.normal +

              ' — extra students must be assigned via makeup clinical overload only'

          });

        }

      }

    });



    return violations;

  }



  function validateNoDoubleBooking(data) {

    var cfg = data.config;

    var violations = [];

    data.students.forEach(function (s) {

      s.schedule.forEach(function (cell, wi) {

        if (App.Scheduler.weekHasDoubleBooking(cell, s, cfg)) {

          violations.push({

            studentId: s.id,

            studentName: s.name,

            week: wi + 1,

            message: (s.name || 'Student') + ': double-booked clinical and simulation on week ' + (wi + 1)

          });

        }

      });

    });

    return violations;

  }



  function validateSimClinicalConflicts(data) {

    var violations = [];

    data.students.forEach(function (s) {

      var conflictWeeks = [];

      s.schedule.forEach(function (cell, wi) {

        if (cell.clinicalMissed && cell.sim) conflictWeeks.push(wi);

      });

      if (conflictWeeks.length > 1) {

        violations.push({

          studentId: s.id,

          studentName: s.name,

          count: conflictWeeks.length,

          message: (s.name || 'Student') + ': more than one sim/clinical conflict (' + conflictWeeks.length + ')'

        });

      }

      conflictWeeks.forEach(function (wi) {

        var hasMakeup = s.schedule.some(function (cell, idx) {

          if (!cell.makeupClinical) return false;

          return s.makeups.some(function (m) {

            return m.type === 'clinical' && m.weekIndex === idx && m.clinicalConflict;

          });

        });

        if (!hasMakeup && s.makeups.every(function (m) {

          return !(m.type === 'clinical' && m.clinicalConflict);

        })) {

          violations.push({

            studentId: s.id,

            studentName: s.name,

            week: wi + 1,

            message: (s.name || 'Student') + ': sim/clinical conflict on week ' + (wi + 1) + ' without conflict makeup'

          });

        }

      });

    });

    return violations;

  }



  function validateProgramSimWeeks(data) {
    var calendar = data._simCalendar || App.Scheduler.buildProgramSimCalendar(data, data.config);
    var violations = [];
    for (var w = 0; w < 18; w++) {
      if (App.CalendarEngine.isWeekInactive(data, w)) continue;
      var programSim = App.Scheduler.getWeekSimNumber(calendar, w);
      var studentSims = {};
      data.students.forEach(function (s) {
        var c = s.schedule[w];
        if (c && c.sim) studentSims[c.sim] = true;
      });
      var simNums = Object.keys(studentSims).map(function (k) { return parseInt(k, 10); });
      if (simNums.length > 1) {
        violations.push({
          week: w + 1,
          message: 'Week ' + (w + 1) + ': multiple sim scenarios scheduled (' + simNums.join(', ') + ')'
        });
      } else if (simNums.length === 1) {
        if (programSim && simNums[0] !== programSim) {
          violations.push({
            week: w + 1,
            message: 'Week ' + (w + 1) + ': students have Sim ' + simNums[0] +
              ' but program calendar expects Sim ' + programSim
          });
        } else if (!programSim && w < 17) {
          violations.push({
            week: w + 1,
            message: 'Week ' + (w + 1) + ': sim scheduled outside program calendar block'
          });
        }
      }
    }
    return violations;
  }

  function validateStudentSimParticipation(data) {
    var simReq = data.config.simDaysRequired || 5;
    var violations = [];
    data.students.forEach(function (s) {
      var counts = {};
      s.schedule.forEach(function (c) {
        if (c.sim) counts[c.sim] = (counts[c.sim] || 0) + 1;
      });
      for (var n = 1; n <= simReq; n++) {
        if (!counts[n]) {
          violations.push({
            studentId: s.id,
            studentName: s.name,
            message: (s.name || 'Student') + ': missing Sim ' + n
          });
        } else if (counts[n] > 1) {
          violations.push({
            studentId: s.id,
            studentName: s.name,
            message: (s.name || 'Student') + ': Sim ' + n + ' completed ' + counts[n] + ' times'
          });
        }
      }
      Object.keys(counts).forEach(function (k) {
        var num = parseInt(k, 10);
        if (num > simReq) {
          violations.push({
            studentId: s.id,
            studentName: s.name,
            message: (s.name || 'Student') + ': extra Sim ' + num + ' beyond required ' + simReq
          });
        }
      });
    });
    return violations;
  }

  function validateSimBlockNoRepeat(data) {
    var violations = [];
    data.students.forEach(function (s) {
      var placements = App.Scheduler.getSimPlacements(s);
      var maxSimSoFar = 0;
      for (var i = 0; i < placements.length; i++) {
        if (placements[i].sim < maxSimSoFar) {
          violations.push({
            studentId: s.id,
            studentName: s.name,
            message: (s.name || 'Student') + ': Sim ' + placements[i].sim +
              ' on week ' + placements[i].week + ' repeats after Sim ' + maxSimSoFar
          });
          break;
        }
        maxSimSoFar = Math.max(maxSimSoFar, placements[i].sim);
      }
    });
    return violations;
  }

  function validateSimChronologicalOrder(data) {
    var violations = [];
    data.students.forEach(function (s) {
      var placements = App.Scheduler.getSimPlacements(s);
      for (var i = 1; i < placements.length; i++) {
        if (placements[i].sim <= placements[i - 1].sim) {
          violations.push({
            studentId: s.id,
            studentName: s.name,
            message: (s.name || 'Student') + ': simulations out of week order (Sim ' +
              placements[i - 1].sim + ' week ' + placements[i - 1].week + ', then Sim ' +
              placements[i].sim + ' week ' + placements[i].week + ')'
          });
          break;
        }
      }
    });
    return violations;
  }

  function validateSimGroupExceptions(data) {
    var violations = [];
    data.students.forEach(function (s) {
      s.schedule.forEach(function (cell) {
        if (cell.sim && cell.simGuestGroup === '') {
          violations.push({
            studentId: s.id,
            message: (s.name || 'Student') + ': guest sim session missing simGuestGroup'
          });
        }
      });
    });
    return violations;
  }



  function validateWeek18SimFallbacks(data) {

    var warnings = [];

    data.students.forEach(function (s) {

      s.makeups.forEach(function (m) {

        if (m.type === 'sim' && m.week18Fallback) {

          warnings.push(s.name + ': Sim ' + m.simNum + ' assigned via Week 18 fallback (not preferred)');

        }

      });

    });

    return warnings;

  }



  function validateGroups(data) {

    var cfg = data.config;

    var maxClin = cfg.maxPerClinicalGroup || 6;

    var counts = {};

    App.DataModel.getClinicalGroups(data.config).forEach(function (g) { counts[g] = 0; });

    data.students.forEach(function (s) {

      if (counts[s.clinicalGroup] !== undefined) counts[s.clinicalGroup]++;

    });

    var errors = [];

    Object.keys(counts).forEach(function (g) {

      if (counts[g] > maxClin) errors.push(g + ' has ' + counts[g] + ' students (max ' + maxClin + ')');

    });

    if (data.students.length > (cfg.maxStudents || 30)) {

      errors.push('Total students ' + data.students.length + ' exceeds max ' + cfg.maxStudents);

    }

    return errors;

  }



  function validateAll(data) {

    var w18Warnings = validateWeek18SimFallbacks(data);

    var doubleBooking = validateNoDoubleBooking(data);

    var simClinical = validateSimClinicalConflicts(data);

    var simGroupExceptions = validateSimGroupExceptions(data);

    var simWeekOrder = validateSimChronologicalOrder(data);

    var programSimWeeks = validateProgramSimWeeks(data);

    var studentSimParticipation = validateStudentSimParticipation(data);

    var simBlockNoRepeat = validateSimBlockNoRepeat(data);

    var results = {

      students: {},

      simSessions: validateSimSessions(data),

      clinicalSessions: validateClinicalSessions(data),

      groupErrors: validateGroups(data),

      doubleBooking: doubleBooking,

      simClinicalConflicts: simClinical,

      simGroupExceptions: simGroupExceptions,

      simWeekOrder: simWeekOrder,

      programSimWeeks: programSimWeeks,

      studentSimParticipation: studentSimParticipation,

      simBlockNoRepeat: simBlockNoRepeat,

      allValid: true

    };

    data.students.forEach(function (s) {

      var r = validateStudent(s, data);

      w18Warnings.forEach(function (msg) {

        if (msg.indexOf(s.name + ':') === 0) r.warnings.push(msg);

      });

      results.students[s.id] = r;

      if (!r.valid) results.allValid = false;

    });

    if (results.simSessions.length) results.allValid = false;

    if (results.clinicalSessions.length) results.allValid = false;

    if (results.groupErrors.length) results.allValid = false;

    if (doubleBooking.length) results.allValid = false;

    if (simClinical.length) results.allValid = false;

    if (simGroupExceptions.length) results.allValid = false;

    if (simWeekOrder.length) results.allValid = false;

    if (programSimWeeks.length) results.allValid = false;

    if (studentSimParticipation.length) results.allValid = false;

    if (simBlockNoRepeat.length) results.allValid = false;

    return results;

  }



  function statusBadge(result) {

    if (result.valid && !result.warnings.length) return { cls: 'status-complete', text: 'Complete' };

    if (result.valid) return { cls: 'status-warning', text: 'Complete*' };

    return { cls: 'status-pending', text: 'Pending' };

  }



  return {

    validateStudent: validateStudent,

    validateSimSessions: validateSimSessions,

    validateClinicalSessions: validateClinicalSessions,

    validateNoDoubleBooking: validateNoDoubleBooking,

    validateSimClinicalConflicts: validateSimClinicalConflicts,

    validateSimGroupExceptions: validateSimGroupExceptions,

    validateSimChronologicalOrder: validateSimChronologicalOrder,

    validateProgramSimWeeks: validateProgramSimWeeks,

    validateStudentSimParticipation: validateStudentSimParticipation,

    validateSimBlockNoRepeat: validateSimBlockNoRepeat,

    validateGroups: validateGroups,

    validateAll: validateAll,

    statusBadge: statusBadge

  };

})();

