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

    var groupDay = App.DataModel.getClinicalDayForGroup(student.clinicalGroup, cfg);
    if (student.facilityId) {
      var fac = data.facilities.find(function (f) { return f.id === student.facilityId; });
      if (fac && fac.clinicalDay !== groupDay && groupDay !== 'Sat') {
        warnings.push('Facility day (' + fac.clinicalDay + ') may not match group day (' + groupDay + ')');
      }
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
      for (var sim = 1; sim <= 5; sim++) {
        App.DataModel.getSimDays(cfg).forEach(function (day) {
          var list = App.Scheduler.getSessionStudents(data, w, sim, day);
          var count = list.length;
          if (count <= caps.normal) return;

          if (count > caps.overload) {
            violations.push({
              week: w + 1, sim: sim, day: day, count: count,
              message: 'Week ' + (w + 1) + ' Sim ' + sim + ' ' + day + ': ' + count + ' exceeds overload max ' + caps.overload
            });
            return;
          }

          var extras = count - caps.normal;
          var validOverload = list.filter(function (x) {
            return x.cell.simOverload && x.cell.simMakeup;
          }).length;

          if (extras !== validOverload) {
            violations.push({
              week: w + 1, sim: sim, day: day, count: count,
              message: 'Week ' + (w + 1) + ' Sim ' + sim + ' ' + day + ': ' + count + '/' + caps.normal +
                ' — extra students must be assigned via makeup sim overload only'
            });
          }
        });
      }
    }
    return violations;
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
    var results = {
      students: {},
      simSessions: validateSimSessions(data),
      groupErrors: validateGroups(data),
      allValid: true
    };
    data.students.forEach(function (s) {
      var r = validateStudent(s, data);
      results.students[s.id] = r;
      if (!r.valid) results.allValid = false;
    });
    if (results.simSessions.length) results.allValid = false;
    if (results.groupErrors.length) results.allValid = false;
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
    validateGroups: validateGroups,
    validateAll: validateAll,
    statusBadge: statusBadge
  };
})();
