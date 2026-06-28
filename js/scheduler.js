/* global App */
var App = App || {};

App.Scheduler = (function () {
  var SIM_GROUP_SCHEDULE = {
    SG1: { weeks: [4, 6, 8, 10, 12, 14, 16], day: 'Mon' },
    SG2: { weeks: [4, 6, 8, 10, 12, 14, 16], day: 'Tue' },
    SG3: { weeks: [5, 7, 9, 11, 13, 15, 17], day: 'Mon' },
    SG4: { weeks: [5, 7, 9, 11, 13, 15, 17], day: 'Tue' }
  };

  function alternateSimDay(day, cfg) {
    var simDays = App.DataModel.getSimDays(cfg);
    if (simDays.length < 2) return day;
    var idx = simDays.indexOf(day);
    if (idx < 0) return simDays[0];
    return simDays[(idx + 1) % simDays.length];
  }

  function assignSimGroups(students, config) {
    var groups = App.DataModel.getSimGroups(config);
    students.forEach(function (s, i) {
      if (!s.simGroup) s.simGroup = groups[i % groups.length];
    });
  }

  function assignFacilities(students, facilities) {
    if (!facilities.length) return;
    students.forEach(function (s, i) {
      if (!s.facilityId) s.facilityId = facilities[i % facilities.length].id;
    });
  }

  function clearSchedules(students) {
    students.forEach(function (s) {
      s.schedule = App.DataModel.emptySchedule();
    });
  }

  function markInactiveWeeks(data) {
    data.students.forEach(function (s) {
      data.calendar.weeks.forEach(function (w, i) {
        if (w.inactive) {
          s.schedule[i].inactive = true;
        }
      });
    });
  }

  function getSimCaps(cfg) {
    return {
      normal: cfg.maxStudentsPerSimSession || 8,
      overload: cfg.maxStudentsPerSimSessionOverload || 9
    };
  }

  function getSessionStudents(data, weekIndex, simNum, day) {
    var list = [];
    data.students.forEach(function (s) {
      var c = s.schedule[weekIndex];
      if (c && c.sim === simNum && c.simDay === day) {
        list.push({ student: s, cell: c });
      }
    });
    return list;
  }

  function getSessionCount(data, weekIndex, simNum, day) {
    return getSessionStudents(data, weekIndex, simNum, day).length;
  }

  function countedClinicals(student) {
    var n = 0;
    student.schedule.forEach(function (c) {
      if (c.inactive) return;
      if (c.clinical && !c.clinicalMissed) n++;
      if (c.makeupClinical) n++;
    });
    return n;
  }

  function scheduleSimForStudent(student, data) {
    var cfg = data.config;
    var needed = cfg.simDaysRequired || 5;
    var caps = getSimCaps(cfg);
    var cap = caps.normal;
    var sch = SIM_GROUP_SCHEDULE[student.simGroup] || SIM_GROUP_SCHEDULE.SG1;
    var simNum = 1;

    sch.weeks.forEach(function (wi) {
      if (simNum > needed) return;
      if (wi >= 18 || App.CalendarEngine.isWeekInactive(data, wi)) return;
      var cell = student.schedule[wi];
      var tryDay = sch.day;
      if (getSessionCount(data, wi, simNum, tryDay) >= cap) {
        tryDay = alternateSimDay(tryDay, cfg);
      }
      if (getSessionCount(data, wi, simNum, tryDay) >= cap) return;

      cell.sim = simNum;
      cell.simDay = tryDay;
      simNum++;
    });

    while (simNum <= needed) {
      for (var w = (cfg.simStartWeek || 5) - 1; w < 18 && simNum <= needed; w++) {
        if (App.CalendarEngine.isWeekInactive(data, w)) continue;
        var c = student.schedule[w];
        if (c.sim) continue;
        var d = sch.day;
        if (getSessionCount(data, w, simNum, d) >= cap) d = alternateSimDay(d, cfg);
        if (getSessionCount(data, w, simNum, d) >= cap) continue;
        c.sim = simNum;
        c.simDay = d;
        simNum++;
      }
      break;
    }
  }

  function scheduleClinicalForStudent(student, data) {
    var cfg = data.config;
    var needed = cfg.clinicalDaysRequired || 10;
    var clinStart = (cfg.clinicalStartWeek || 5) - 1;
    var weeks = App.CalendarEngine.getClinicalEligibleWeeks(data, clinStart);

    for (var i = 0; i < weeks.length && countedClinicals(student) < needed; i++) {
      var wi = weeks[i];
      var cell = student.schedule[wi];
      if (cell.inactive || cell.makeupClinical) continue;
      if (cell.clinical && !cell.clinicalMissed) continue;
      cell.clinical = true;
    }

    for (var j = 17; j >= clinStart && countedClinicals(student) < needed; j--) {
      if (App.CalendarEngine.isWeekInactive(data, j)) continue;
      var c = student.schedule[j];
      if (c.inactive || c.sim || c.clinical || c.makeupClinical) continue;
      c.makeupClinical = true;
    }
  }

  function scheduleMissedMakeups(student, data) {
    var needed = data.config.clinicalDaysRequired || 10;
    var clinStart = (data.config.clinicalStartWeek || 5) - 1;
    var shortfall = needed - countedClinicals(student);
    for (var j = 17; j >= clinStart && shortfall > 0; j--) {
      if (App.CalendarEngine.isWeekInactive(data, j)) continue;
      var c = student.schedule[j];
      if (c.inactive || c.sim || c.clinical || c.makeupClinical) continue;
      c.makeupClinical = true;
      shortfall--;
    }
  }

  function regenerateAll(data) {
    if (!data || !data.students.length) return data;
    App.CalendarEngine.rebuildWeeks(data);
    assignSimGroups(data.students, data.config);
    assignFacilities(data.students, data.facilities);
    clearSchedules(data.students);
    markInactiveWeeks(data);
    data.students.forEach(function (s) {
      scheduleClinicalForStudent(s, data);
    });
    data.students.forEach(function (s) {
      scheduleSimForStudent(s, data);
    });
    data.students.forEach(function (s) {
      scheduleMissedMakeups(s, data);
    });
    return data;
  }

  function regenerateStudent(student, data) {
    student.schedule = App.DataModel.emptySchedule();
    markInactiveWeeks(data);
    scheduleClinicalForStudent(student, data);
    scheduleSimForStudent(student, data);
    scheduleMissedMakeups(student, data);
  }

  function findSimWeek(student, simNum) {
    for (var w = 0; w < 18; w++) {
      if (student.schedule[w].sim === simNum) return w;
    }
    return -1;
  }

  function ensureWeek18MakeupClinical(student, data) {
    var wi = 17;
    if (App.CalendarEngine.isWeekInactive(data, wi)) return;
    var cell = student.schedule[wi];
    if (cell.inactive) return;
    if (!cell.makeupClinical && !cell.clinical) {
      cell.makeupClinical = true;
      student.makeups.push({ weekIndex: wi, type: 'clinical', reason: 'auto-week18-sim-conflict' });
    }
  }

  function addSimSlot(slots, seen, slot) {
    var key = slot.weekIndex + '-' + slot.simNum + '-' + slot.day;
    if (seen[key]) return;
    seen[key] = true;
    slots.push(slot);
  }

  function findMakeupSlots(data, studentId, type, targetSimNum) {
    var student = data.students.find(function (s) { return s.id === studentId; });
    if (!student) return [];
    var slots = [];
    var cfg = data.config;
    var seen = {};

    if (type === 'clinical') {
      for (var w = 0; w < 18; w++) {
        if (App.CalendarEngine.isWeekInactive(data, w)) continue;
        var cell = student.schedule[w];
        if (!cell.clinical && !cell.makeupClinical && !cell.sim) {
          slots.push({
            weekIndex: w, week: w + 1,
            reason: 'Open week for makeup clinical',
            day: App.DataModel.getClinicalDayForGroup(student.clinicalGroup, cfg)
          });
        }
      }
      return slots;
    }

    if (type === 'sim') {
      targetSimNum = parseInt(targetSimNum, 10);
      if (!targetSimNum || targetSimNum < 1) targetSimNum = 1;
      if (targetSimNum > cfg.simDaysRequired) return [];

      var caps = getSimCaps(cfg);
      var clinDay = App.DataModel.getClinicalDayForGroup(student.clinicalGroup, cfg);

      for (var i = 0; i < 18; i++) {
        if (App.CalendarEngine.isWeekInactive(data, i)) continue;
        var c = student.schedule[i];
        if (c.sim === targetSimNum) continue;
        if (c.sim && c.sim !== targetSimNum) continue;

        App.DataModel.getSimDays(cfg).forEach(function (d) {
          var count = getSessionCount(data, i, targetSimNum, d);
          var overload = false;
          if (count >= caps.overload) return;
          if (count >= caps.normal) {
            if (count < caps.overload) overload = true;
            else return;
          }

          var openWeek = !c.clinical && !c.makeupClinical && !c.sim;
          var clinicalConflict = c.clinical && !c.clinicalMissed && !c.sim;

          if (openWeek) {
            addSimSlot(slots, seen, {
              weekIndex: i, week: i + 1, day: d, simNum: targetSimNum, overload: overload,
              clinicalConflict: false,
              reason: 'Sim ' + targetSimNum + ' on ' + d + ' (' + count + '/' + caps.normal + ')'
            });
          } else if (clinicalConflict) {
            addSimSlot(slots, seen, {
              weekIndex: i, week: i + 1, day: d, simNum: targetSimNum, overload: overload,
              clinicalConflict: true,
              reason: 'Sim ' + targetSimNum + ' on ' + d + ' — same week as clinical (' + clinDay +
                '); student misses clinical, makeup clinical in Week 18'
            });
          }
        });
      }

      slots.sort(function (a, b) {
        if (a.clinicalConflict !== b.clinicalConflict) return a.clinicalConflict ? 1 : -1;
        if (a.overload !== b.overload) return a.overload ? 1 : -1;
        return a.weekIndex - b.weekIndex;
      });
    }
    return slots;
  }

  function applyMakeupSlot(data, studentId, slot, type) {
    var student = data.students.find(function (s) { return s.id === studentId; });
    if (!student) return;
    var cell = student.schedule[slot.weekIndex];
    if (type === 'clinical') {
      cell.makeupClinical = true;
      student.makeups.push({ weekIndex: slot.weekIndex, type: 'clinical' });
    } else if (type === 'sim') {
      var caps = getSimCaps(data.config);
      var count = getSessionCount(data, slot.weekIndex, slot.simNum, slot.day);
      if (count >= caps.overload) return;
      if (count >= caps.normal && !slot.overload) return;

      var existingWeek = findSimWeek(student, slot.simNum);
      if (existingWeek >= 0 && existingWeek !== slot.weekIndex) {
        var old = student.schedule[existingWeek];
        old.sim = null;
        old.simDay = null;
        old.simMakeup = false;
        old.simOverload = false;
      }

      if (slot.clinicalConflict && cell.clinical && !cell.clinicalMissed) {
        cell.clinicalMissed = true;
        ensureWeek18MakeupClinical(student, data);
      }

      cell.sim = slot.simNum;
      cell.simDay = slot.day;
      cell.simMakeup = true;
      cell.simOverload = !!slot.overload;
      student.makeups.push({
        weekIndex: slot.weekIndex, type: 'sim', simNum: slot.simNum,
        overload: !!slot.overload, clinicalConflict: !!slot.clinicalConflict
      });
    }
    App.notifyChange();
  }

  function copyForward(data, newSemesterName) {
    var copy = JSON.parse(JSON.stringify(data));
    copy.meta.semesterName = newSemesterName || 'New Semester';
    copy.meta.lastModified = new Date().toISOString();
    copy.students.forEach(function (s) {
      s.id = App.DataModel.uid();
      s.name = '';
      s.absences = [];
      s.makeups = [];
    });
    copy.roles = {};
    var start = new Date();
    start.setMonth(start.getMonth() + 4);
    copy.calendar.semesterStartDate = App.CalendarEngine.toISO(start);
    App.CalendarEngine.rebuildWeeks(copy);
    return copy;
  }

  return {
    SIM_GROUP_SCHEDULE: SIM_GROUP_SCHEDULE,
    getSimCaps: getSimCaps,
    getSessionStudents: getSessionStudents,
    assignSimGroups: assignSimGroups,
    regenerateAll: regenerateAll,
    regenerateStudent: regenerateStudent,
    findMakeupSlots: findMakeupSlots,
    findSimWeek: findSimWeek,
    applyMakeupSlot: applyMakeupSlot,
    copyForward: copyForward,
    getSessionCount: getSessionCount
  };
})();
