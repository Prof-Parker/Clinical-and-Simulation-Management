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
    var clinicalGroups = App.DataModel.getClinicalGroups(config);
    var simGroups = App.DataModel.getSimGroups(config);
    if (App.RosterBalance) {
      App.RosterBalance.assignSimGroupsByClinicalCohort(students, clinicalGroups, simGroups);
      return;
    }
    students.forEach(function (s, i) {
      if (!s.simGroup) s.simGroup = simGroups[i % simGroups.length];
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

  function getClinicalCaps(cfg) {
    var normal = cfg.maxPerClinicalGroup || 6;
    return {
      normal: normal,
      overload: cfg.maxPerClinicalGroupOverload || (normal + 1)
    };
  }

  function findClinicalMakeupRecord(student, weekIndex) {
    for (var i = student.makeups.length - 1; i >= 0; i--) {
      var m = student.makeups[i];
      if (m.weekIndex === weekIndex && m.type === 'clinical') return m;
    }
    return null;
  }

  function getFacilityName(data, facilityId) {
    var fac = App.DataModel.findFacilityById(data, facilityId);
    return fac ? fac.name : 'facility';
  }

  function studentAtSite(data, student, facilityId) {
    return App.DataModel.studentAtFacilitySite(data, student, facilityId);
  }

  function getExistingSimSessions(data, simNum) {
    var cfg = data.config;
    var calendar = data._simCalendar || buildProgramSimCalendar(data, cfg);
    var map = {};
    for (var w = 0; w < 17; w++) {
      if (getWeekSimNumber(calendar, w) !== simNum) continue;
      if (App.CalendarEngine.isWeekInactive(data, w)) continue;
      App.DataModel.getSimDays(cfg).forEach(function (day) {
        var count = getDaySimAttendanceCount(data, w, day);
        if (count <= 0) return;
        var key = w + '-' + day;
        map[key] = {
          weekIndex: w,
          week: w + 1,
          day: day,
          simNum: simNum,
          count: count
        };
      });
    }
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function getExistingClinicalAtFacility(data, facilityId, excludeStudentId) {
    if (!facilityId) return [];
    var cfg = data.config;
    var sessions = {};
    for (var w = 0; w < 17; w++) {
      if (App.CalendarEngine.isWeekInactive(data, w)) continue;
      data.students.forEach(function (s) {
        if (s.id === excludeStudentId) return;
        if (!studentAtSite(data, s, facilityId)) return;
        var cell = s.schedule[w];
        if (!cell || !cell.clinical || cell.clinicalMissed) return;
        var day = App.DataModel.getClinicalDayForGroup(s.clinicalGroup, cfg);
        var key = w + '-' + day + '-' + s.clinicalGroup;
        if (!sessions[key]) {
          sessions[key] = {
            weekIndex: w,
            week: w + 1,
            day: day,
            group: s.clinicalGroup,
            count: 0
          };
        }
        sessions[key].count++;
      });
    }
    return Object.keys(sessions).map(function (k) { return sessions[k]; });
  }

  function getClinicalGroupSessionStudents(data, weekIndex, clinicalGroup, day) {
    var cfg = data.config;
    var groupDay = App.DataModel.getClinicalDayForGroup(clinicalGroup, cfg);
    var list = [];
    data.students.forEach(function (s) {
      var cell = s.schedule[weekIndex];
      if (!cell || cell.inactive) return;
      if (s.clinicalGroup === clinicalGroup && cell.clinical && !cell.clinicalMissed) {
        if (groupDay === day) {
          list.push({ student: s, cell: cell, makeupJoin: false, overload: false });
        }
      }
      if (cell.makeupClinical) {
        var makeup = findClinicalMakeupRecord(s, weekIndex);
        if (makeup && makeup.hostGroup === clinicalGroup && makeup.joinedDay === day) {
          list.push({ student: s, cell: cell, makeupJoin: true, overload: !!makeup.overload });
        } else if (!makeup && s.clinicalGroup === clinicalGroup && groupDay === day) {
          list.push({
            student: s, cell: cell, makeupJoin: true,
            overload: false, week18Fallback: weekIndex === 17
          });
        }
      }
    });
    return list;
  }

  function getClinicalGroupAttendanceCount(data, weekIndex, clinicalGroup, day) {
    return getClinicalGroupSessionStudents(data, weekIndex, clinicalGroup, day).length;
  }

  function getWeek18ClinicalSlot(data, student) {
    var wi = 17;
    if (App.CalendarEngine.isWeekInactive(data, wi)) return null;
    var cell = student.schedule[wi];
    if (!cell || cell.inactive) return null;
    if (cell.sim || cell.clinical || cell.makeupClinical) return null;
    return {
      weekIndex: wi,
      week: 18,
      week18Fallback: true,
      reason: 'Week 18 makeup clinical at ' + getFacilityName(data, student.facilityId) + ' — last resort'
    };
  }

  function getClinicalSessionStudents(data, weekIndex, clinicalGroup, day) {
    return getClinicalGroupSessionStudents(data, weekIndex, clinicalGroup, day);
  }

  function getClinicalAttendanceCount(data, weekIndex, clinicalGroup, day) {
    return getClinicalGroupAttendanceCount(data, weekIndex, clinicalGroup, day);
  }

  function getWeek18SimFallback(data, cfg, targetSimNum, student) {
    var slots = [];
    var wi = 17;
    if (App.CalendarEngine.isWeekInactive(data, wi)) return slots;
    var cell = student.schedule[wi];
    if (!cell || cell.inactive) return slots;

    if (cell.sim && cell.sim !== targetSimNum) {
      var sch = SIM_GROUP_SCHEDULE[student.simGroup] || SIM_GROUP_SCHEDULE.SG1;
      var simDays = App.DataModel.getSimDays(cfg);
      var day = simDays.indexOf(sch.day) >= 0 ? sch.day : simDays[0];
      slots.push({
        weekIndex: wi,
        week: 18,
        day: day,
        simNum: targetSimNum,
        week18Fallback: true,
        mixedSim: true,
        overload: false,
        clinicalConflict: !!(cell.clinical && !cell.clinicalMissed),
        replacesWeek18Sim: true,
        reason: 'Week 18 mixed sim makeup — replaces Sim ' + cell.sim + ' (last resort, not preferred)'
      });
      return slots;
    }

    App.DataModel.getSimDays(cfg).forEach(function (d) {
      if (cell.sim === targetSimNum && cell.simDay === d) return;
      slots.push({
        weekIndex: wi,
        week: 18,
        day: d,
        simNum: targetSimNum,
        week18Fallback: true,
        mixedSim: true,
        overload: false,
        clinicalConflict: !!(cell.clinical && !cell.clinicalMissed),
        reason: 'Week 18 mixed sim makeup — last resort (not preferred)'
      });
    });
    return slots;
  }

  function getDaySimStudents(data, weekIndex, day) {
    var list = [];
    data.students.forEach(function (s) {
      var c = s.schedule[weekIndex];
      if (c && c.sim && c.simDay === day) {
        list.push({ student: s, cell: c });
      }
    });
    return list;
  }

  function getDaySimAttendanceCount(data, weekIndex, day) {
    return getDaySimStudents(data, weekIndex, day).length;
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

  function getStudentClinicalDay(student, cfg) {
    return App.DataModel.getClinicalDayForGroup(student.clinicalGroup, cfg);
  }

  function wouldSimClinicalConflict(cell, student, cfg, simDay) {
    return cell.clinical && !cell.clinicalMissed && getStudentClinicalDay(student, cfg) === simDay;
  }

  function clinicalSimWeekdaysOverlap(student, cfg) {
    return App.DataModel.getSimDays(cfg).indexOf(getStudentClinicalDay(student, cfg)) >= 0;
  }

  function wouldSameWeekClinicalConflict(student, data, weekIndex, simDay, cfg) {
    var cell = student.schedule[weekIndex];
    return wouldSimClinicalConflict(cell, student, cfg, simDay);
  }

  function anyStudentMissingSims(data, cfg) {
    var needed = cfg.simDaysRequired || 5;
    for (var si = 0; si < data.students.length; si++) {
      var s = data.students[si];
      for (var n = 1; n <= needed; n++) {
        if (findSimWeek(s, n) < 0) return true;
      }
    }
    return false;
  }

  function getSimSchedulingOptions(data, override) {
    var opts = { applyHeadroom: !!(data && data._simSchedulingApplyHeadroom) };
    if (override && override.applyHeadroom !== undefined) opts.applyHeadroom = override.applyHeadroom;
    return opts;
  }

  function getEffectiveSimNormalCap(cfg, data, options) {
    var caps = getSimCaps(cfg);
    return caps.normal;
  }

  function candidateLoadScore(data, weekIndex, day, cfg) {
    var count = getDaySimAttendanceCount(data, weekIndex, day);
    var normal = getSimCaps(cfg).normal;
    var reserve = cfg.simMakeupHeadroomReserved;
    if (reserve == null || isNaN(reserve)) reserve = 1;
    reserve = Math.max(0, parseInt(reserve, 10) || 0);
    var softCap = Math.max(1, normal - reserve);
    if (count >= normal) return 10000 + count;
    if (reserve > 0 && count >= softCap) return 1000 + count;
    return count;
  }

  function simDaysOrderForWeek(student, wi, sch, cfg) {
    var simDays = App.DataModel.getSimDays(cfg);
    var primary = sch.day;
    var alt = alternateSimDay(primary, cfg);
    if (!clinicalSimWeekdaysOverlap(student, cfg)) {
      var basic = [primary];
      if (alt !== primary) basic.push(alt);
      return basic;
    }
    var clinDay = getStudentClinicalDay(student, cfg);
    var cell = student.schedule[wi];
    var nonOverlap = simDays.filter(function (d) { return d !== clinDay; });
    var ordered = [];
    if (wouldSimClinicalConflict(cell, student, cfg, clinDay)) {
      nonOverlap.forEach(function (d) {
        if (ordered.indexOf(d) < 0) ordered.push(d);
      });
      if (!ordered.length) {
        if (primary !== clinDay && ordered.indexOf(primary) < 0) ordered.push(primary);
        if (alt !== clinDay && alt !== primary && ordered.indexOf(alt) < 0) ordered.push(alt);
      }
      return ordered;
    }
    nonOverlap.forEach(function (d) {
      if (ordered.indexOf(d) < 0) ordered.push(d);
    });
    simDays.forEach(function (d) {
      if (ordered.indexOf(d) < 0) ordered.push(d);
    });
    return ordered;
  }

  function compareCandidatesByLoad(student, data, a, b, cfg) {
    var sa = candidateLoadScore(data, a.weekIndex, a.day, cfg);
    var sb = candidateLoadScore(data, b.weekIndex, b.day, cfg);
    if (sa !== sb) return sa - sb;
    if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
    if (clinicalSimWeekdaysOverlap(student, cfg)) {
      var clinDay = getStudentClinicalDay(student, cfg);
      var aOverlap = a.day === clinDay ? 1 : 0;
      var bOverlap = b.day === clinDay ? 1 : 0;
      if (aOverlap !== bOverlap) return aOverlap - bOverlap;
    }
    if (a.hostSimGroup === student.simGroup && b.hostSimGroup !== student.simGroup) return -1;
    if (b.hostSimGroup === student.simGroup && a.hostSimGroup !== student.simGroup) return 1;
    return (a.day || '').localeCompare(b.day || '');
  }

  function sortCandidatesWithinTier(student, data, candidates, cfg) {
    return candidates.slice().sort(function (a, b) {
      return compareCandidatesByLoad(student, data, a, b, cfg);
    });
  }

  function usesOddPatternWeek(simGroup, simGroups) {
    var sch = getSimGroupSchedule(simGroup, simGroups);
    return sch.weeks[0] === SIM_GROUP_SCHEDULE.SG3.weeks[0];
  }

  function buildProgramSimCalendar(data, cfg) {
    var evenWeeks = SIM_GROUP_SCHEDULE.SG1.weeks.slice();
    var oddWeeks = SIM_GROUP_SCHEDULE.SG3.weeks.slice();
    var needed = cfg.simDaysRequired || 5;
    var blocks = [];
    var weekToSim = {};

    for (var i = 0; i < needed; i++) {
      var evenWi = evenWeeks[i];
      var oddWi = oddWeeks[i];
      var block = {
        simNum: i + 1,
        evenWeekIndex: evenWi,
        oddWeekIndex: oddWi,
        weeks: []
      };
      if (evenWi != null && evenWi < 18 && !App.CalendarEngine.isWeekInactive(data, evenWi)) {
        block.weeks.push(evenWi);
        weekToSim[evenWi] = i + 1;
      }
      if (oddWi != null && oddWi < 18 && !App.CalendarEngine.isWeekInactive(data, oddWi)) {
        if (block.weeks.indexOf(oddWi) < 0) block.weeks.push(oddWi);
        weekToSim[oddWi] = i + 1;
      }
      blocks.push(block);
    }
    return { blocks: blocks, weekToSim: weekToSim };
  }

  function getWeekSimNumber(calendar, weekIndex) {
    return calendar && calendar.weekToSim ? calendar.weekToSim[weekIndex] : null;
  }

  function getStudentSimSlot(student, simNum, calendar, simGroups) {
    var candidates = getStudentSimSlotCandidates(student, simNum, calendar, simGroups, null);
    return candidates.length ? candidates[0] : null;
  }

  function getStudentSimSlotCandidates(student, simNum, calendar, simGroups, cfg) {
    var block = calendar.blocks[simNum - 1];
    if (!block) return [];
    var sch = getSimGroupSchedule(student.simGroup, simGroups);
    var odd = usesOddPatternWeek(student.simGroup, simGroups);
    var primaryWi = odd ? block.oddWeekIndex : block.evenWeekIndex;
    var weeksToTry = [];
    if (primaryWi != null && primaryWi < 18) weeksToTry.push(primaryWi);
    block.weeks.forEach(function (wi) {
      if (weeksToTry.indexOf(wi) < 0) weeksToTry.push(wi);
    });
    var slots = [];
    weeksToTry.forEach(function (wi) {
      var days = cfg
        ? simDaysOrderForWeek(student, wi, sch, cfg)
        : [sch.day, alternateSimDay(sch.day, cfg)].filter(function (d, i, arr) {
          return arr.indexOf(d) === i;
        });
      days.forEach(function (day) {
        slots.push({
          weekIndex: wi,
          day: day,
          simNum: simNum,
          hostSimGroup: student.simGroup
        });
      });
    });
    return slots;
  }

  function buildGuestFallbackSlots(student, block, simNum, simGroups, cfg) {
    var slots = [];
    simGroups.forEach(function (sg) {
      if (sg === student.simGroup) return;
      var sch = getSimGroupSchedule(sg, simGroups);
      block.weeks.forEach(function (wi) {
        slots.push({ weekIndex: wi, day: sch.day, simNum: simNum, hostSimGroup: sg, tier: 'guest' });
        var alt = alternateSimDay(sch.day, cfg);
        if (alt !== sch.day) {
          slots.push({ weekIndex: wi, day: alt, simNum: simNum, hostSimGroup: sg, tier: 'guest' });
        }
      });
    });
    return slots;
  }

  function blockHasRegularCapacity(data, calendar, simNum, cfg) {
    var block = calendar.blocks[simNum - 1];
    if (!block) return false;
    var cap = getSimCaps(cfg).normal;
    var simDays = App.DataModel.getSimDays(cfg);
    for (var i = 0; i < block.weeks.length; i++) {
      var wi = block.weeks[i];
      if (App.CalendarEngine.isWeekInactive(data, wi)) continue;
      for (var d = 0; d < simDays.length; d++) {
        if (getDaySimAttendanceCount(data, wi, simDays[d]) < cap) return true;
      }
    }
    return false;
  }

  function laterBlocksHaveRegularCapacity(data, calendar, fromSimNum, cfg) {
    var needed = cfg.simDaysRequired || 5;
    for (var n = fromSimNum + 1; n <= needed; n++) {
      if (blockHasRegularCapacity(data, calendar, n, cfg)) return true;
    }
    return false;
  }

  function studentStillNeedsSim(student, simNum, cfg) {
    var needed = cfg.simDaysRequired || 5;
    if (simNum >= needed) return false;
    for (var n = simNum + 1; n <= needed; n++) {
      if (findSimWeek(student, n) < 0) return true;
    }
    return false;
  }

  function shouldDeferWeek18(student, data, calendar, simNum, cfg) {
    if (blockHasRegularCapacity(data, calendar, simNum, cfg)) return true;
    if (studentStillNeedsSim(student, simNum, cfg) &&
        laterBlocksHaveRegularCapacity(data, calendar, simNum, cfg)) {
      return true;
    }
    return false;
  }

  function getGuestCountFromSchedule(student) {
    var count = 0;
    student.schedule.forEach(function (cell) {
      if (cell.simGuestGroup) count++;
    });
    return count;
  }

  function buildStateFromStudentSchedule(student, cfg) {
    var state = createSimSchedulingState();
    student.schedule.forEach(function (cell, wi) {
      if (cell.simGuestGroup) state.guestCount++;
      if (cell.sim && cell.clinicalMissed && cell.clinical &&
          cell.simDay === getStudentClinicalDay(student, cfg)) {
        state.simClinicalConflicts++;
        state.conflictWeeks.push(wi);
      }
    });
    return state;
  }

  function canPlaceSimSlot(student, data, wi, simNum, day, hostSimGroup, state, options) {
    options = options || {};
    var cfg = data.config;
    var caps = getSimCaps(cfg);
    var count = getDaySimAttendanceCount(data, wi, day);
    if (options.overload) {
      if (count >= caps.overload || count < caps.normal) return false;
    } else if (count >= caps.normal) {
      return false;
    }
    var cell = student.schedule[wi];
    if (!cell || cell.inactive || cell.sim) return false;
    var conflict = wouldSimClinicalConflict(cell, student, cfg, day);
    if (conflict && state.simClinicalConflicts >= 1) return false;
    return true;
  }

  function countRemainingSimSlots(student, data, calendar, simNum, state, cfg) {
    var simGroups = App.DataModel.getSimGroups(cfg);
    var count = 0;
    var block = calendar.blocks[simNum - 1];
    if (!block) return 0;
    var placeOpts = getSimSchedulingOptions(data);
    getStudentSimSlotCandidates(student, simNum, calendar, simGroups, cfg).forEach(function (slot) {
      if (canPlaceSimSlot(student, data, slot.weekIndex, simNum, slot.day, slot.hostSimGroup, state, placeOpts)) {
        count++;
      }
    });
    buildGuestFallbackSlots(student, block, simNum, simGroups, cfg).forEach(function (slot) {
      if (canPlaceSimSlot(student, data, slot.weekIndex, simNum, slot.day, slot.hostSimGroup, state, placeOpts)) {
        count++;
      }
    });
    return count;
  }

  function buildOverloadJoinSlots(student, data, calendar, simNum, cfg) {
    var block = calendar.blocks[simNum - 1];
    if (!block) return [];
    var caps = getSimCaps(cfg);
    var simDays = App.DataModel.getSimDays(cfg);
    var slots = [];
    block.weeks.forEach(function (wi) {
      if (App.CalendarEngine.isWeekInactive(data, wi)) return;
      simDays.forEach(function (day) {
        var count = getDaySimAttendanceCount(data, wi, day);
        if (count < caps.normal || count >= caps.overload) return;
        if (getSessionCount(data, wi, simNum, day) <= 0) return;
        slots.push({
          weekIndex: wi,
          day: day,
          simNum: simNum,
          hostSimGroup: student.simGroup,
          tier: 'overload',
          overload: true
        });
      });
    });
    return slots;
  }

  function sortGuestSlotsByExistingSessions(data, slots) {
    return slots.slice().sort(function (a, b) {
      var ca = getDaySimAttendanceCount(data, a.weekIndex, a.day);
      var cb = getDaySimAttendanceCount(data, b.weekIndex, b.day);
      if (ca !== cb) return ca - cb;
      return a.weekIndex - b.weekIndex;
    });
  }

  function blockHasSoftHeadroom(data, calendar, simNum, cfg) {
    var block = calendar.blocks[simNum - 1];
    if (!block) return false;
    var normal = getSimCaps(cfg).normal;
    var reserve = cfg.simMakeupHeadroomReserved;
    if (reserve == null || isNaN(reserve)) reserve = 1;
    reserve = Math.max(0, parseInt(reserve, 10) || 0);
    if (reserve <= 0) return false;
    var softCap = Math.max(1, normal - reserve);
    var simDays = App.DataModel.getSimDays(cfg);
    for (var i = 0; i < block.weeks.length; i++) {
      var wi = block.weeks[i];
      if (App.CalendarEngine.isWeekInactive(data, wi)) continue;
      for (var d = 0; d < simDays.length; d++) {
        if (getDaySimAttendanceCount(data, wi, simDays[d]) < softCap) return true;
      }
    }
    return false;
  }

  function buildSimPlacementCandidates(student, data, calendar, simNum, state, placementOptions) {
    var cfg = data.config;
    var simGroups = App.DataModel.getSimGroups(cfg);
    var block = calendar.blocks[simNum - 1];
    var primary = [];
    var guest = [];
    var overload = [];
    var w18 = [];

    getStudentSimSlotCandidates(student, simNum, calendar, simGroups, cfg).forEach(function (slot) {
      primary.push({
        weekIndex: slot.weekIndex,
        day: slot.day,
        simNum: simNum,
        hostSimGroup: slot.hostSimGroup,
        tier: 'primary'
      });
    });

    if (block) {
      guest = sortGuestSlotsByExistingSessions(data,
        buildGuestFallbackSlots(student, block, simNum, simGroups, cfg)
      );
    }

    buildOverloadJoinSlots(student, data, calendar, simNum, cfg).forEach(function (slot) {
      if (!blockHasSoftHeadroom(data, calendar, simNum, cfg)) {
        overload.push(slot);
      }
    });

    if (!blockHasRegularCapacity(data, calendar, simNum, cfg) &&
        !shouldDeferWeek18(student, data, calendar, simNum, cfg)) {
      getWeek18SimFallback(data, cfg, simNum, student).forEach(function (w18Slot) {
        w18.push({
          weekIndex: w18Slot.weekIndex,
          day: w18Slot.day,
          simNum: simNum,
          hostSimGroup: student.simGroup,
          tier: 'week18',
          week18Fallback: true,
          mixedSim: !!w18Slot.mixedSim,
          replacesWeek18Sim: !!w18Slot.replacesWeek18Sim
        });
      });
    }

    primary = sortCandidatesWithinTier(student, data, primary, cfg);
    guest = sortCandidatesWithinTier(student, data, guest, cfg);
    overload = sortCandidatesWithinTier(student, data, overload, cfg);
    w18 = sortCandidatesWithinTier(student, data, w18, cfg);

    return primary.concat(guest).concat(overload).concat(w18);
  }

  function compareSimPlacementTier(a, b) {
    var order = { primary: 0, guest: 1, overload: 2, week18: 3 };
    var ta = order[a.tier] != null ? order[a.tier] : 99;
    var tb = order[b.tier] != null ? order[b.tier] : 99;
    if (ta !== tb) return ta - tb;
    if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
    return (a.day || '').localeCompare(b.day || '');
  }

  function candidateToMakeupSlot(student, data, candidate, simNum) {
    var cfg = data.config;
    var caps = getSimCaps(cfg);
    var count = getDaySimAttendanceCount(data, candidate.weekIndex, candidate.day);
    var cell = student.schedule[candidate.weekIndex];
    var overload = candidate.tier === 'overload';
    var clinicalConflict = !!(cell.clinical && !cell.clinicalMissed && !cell.sim &&
      wouldSimClinicalConflict(cell, student, cfg, candidate.day));
    var reason;
    if (candidate.tier === 'week18') {
      reason = 'Week 18 mixed sim makeup — last resort (not preferred)';
    } else if (overload) {
      reason = 'Sim ' + simNum + ' on ' + candidate.day + ' (Week ' + (candidate.weekIndex + 1) +
        ') — ' + count + '/' + caps.normal + ', overload join';
    } else {
      reason = 'Sim ' + simNum + ' on ' + candidate.day + ' (Week ' + (candidate.weekIndex + 1) +
        ') — ' + count + '/' + caps.normal +
        (clinicalConflict ? ' — same week as clinical; student misses clinical' : '');
    }
    return {
      weekIndex: candidate.weekIndex,
      week: candidate.weekIndex + 1,
      day: candidate.day,
      simNum: simNum,
      hostSimGroup: candidate.hostSimGroup,
      tier: candidate.tier,
      overload: overload,
      clinicalConflict: clinicalConflict,
      week18Fallback: candidate.tier === 'week18',
      mixedSim: !!candidate.mixedSim,
      replacesWeek18Sim: !!candidate.replacesWeek18Sim,
      reason: reason
    };
  }

  function createSimSchedulingState() {
    return { guestCount: 0, simClinicalConflicts: 0, conflictWeeks: [] };
  }

  function tryPlaceSim(student, data, wi, simNum, day, hostSimGroup, state, options) {
    options = options || {};
    if (!canPlaceSimSlot(student, data, wi, simNum, day, hostSimGroup, state, options)) return false;

    var cfg = data.config;
    var cell = student.schedule[wi];
    var isGuest = hostSimGroup && hostSimGroup !== student.simGroup;
    var conflict = wouldSimClinicalConflict(cell, student, cfg, day);
    var overload = !!options.overload;

    cell.sim = simNum;
    cell.simDay = day;
    cell.simGuestGroup = isGuest ? hostSimGroup : null;
    cell.simOverload = overload;
    if (isGuest) state.guestCount++;

    if (conflict) {
      cell.clinicalMissed = true;
      state.simClinicalConflicts++;
      state.conflictWeeks.push(wi);
    }

    if (options.week18Fallback) {
      student.makeups.push({
        weekIndex: wi,
        type: 'sim',
        simNum: simNum,
        week18Fallback: true,
        mixedSim: !!options.mixedSim,
        replacesWeek18Sim: !!options.replacesWeek18Sim,
        clinicalConflict: conflict
      });
    }

    return true;
  }

  function getSimGroupSchedule(hostSimGroup, simGroups) {
    if (SIM_GROUP_SCHEDULE[hostSimGroup]) return SIM_GROUP_SCHEDULE[hostSimGroup];
    var idx = simGroups.indexOf(hostSimGroup);
    var keys = ['SG1', 'SG2', 'SG3', 'SG4'];
    var key = keys[Math.max(0, idx) % keys.length];
    return SIM_GROUP_SCHEDULE[key];
  }

  function getSimPlacements(student) {
    var list = [];
    student.schedule.forEach(function (cell, wi) {
      if (cell.sim) list.push({ weekIndex: wi, week: wi + 1, sim: cell.sim, day: cell.simDay });
    });
    list.sort(function (a, b) { return a.weekIndex - b.weekIndex; });
    return list;
  }

  function scheduleOneSimForStudent(student, data, state, calendar, simNum) {
    if (findSimWeek(student, simNum) >= 0) return true;
    var placeOpts = getSimSchedulingOptions(data);
    var candidates = buildSimPlacementCandidates(student, data, calendar, simNum, state, placeOpts);
    for (var i = 0; i < candidates.length; i++) {
      var slot = candidates[i];
      var options = {
        applyHeadroom: placeOpts.applyHeadroom,
        overload: slot.tier === 'overload',
        week18Fallback: slot.tier === 'week18',
        mixedSim: slot.mixedSim,
        replacesWeek18Sim: slot.replacesWeek18Sim
      };
      if (tryPlaceSim(student, data, slot.weekIndex, simNum, slot.day, slot.hostSimGroup, state, options)) {
        return true;
      }
    }
    return false;
  }

  function scheduleSimForStudent(student, data, state, calendar) {
    state = state || createSimSchedulingState();
    var cfg = data.config;
    calendar = calendar || data._simCalendar || buildProgramSimCalendar(data, cfg);
    var needed = cfg.simDaysRequired || 5;

    for (var simNum = 1; simNum <= needed; simNum++) {
      scheduleOneSimForStudent(student, data, state, calendar, simNum);
    }
    return state;
  }

  function orderStudentsForSimBlock(students, simGroups, data, calendar, simNum, states) {
    var cfg = data.config;
    return students.slice().sort(function (a, b) {
      var stateA = states[a.id] || createSimSchedulingState();
      var stateB = states[b.id] || createSimSchedulingState();
      var conflictA = stateA.simClinicalConflicts >= 1 ? 0 : 1;
      var conflictB = stateB.simClinicalConflicts >= 1 ? 0 : 1;
      if (conflictA !== conflictB) return conflictA - conflictB;
      var remA = countRemainingSimSlots(a, data, calendar, simNum, stateA, cfg);
      var remB = countRemainingSimSlots(b, data, calendar, simNum, stateB, cfg);
      if (remA !== remB) return remA - remB;
      var guestA = getGuestCountFromSchedule(a);
      var guestB = getGuestCountFromSchedule(b);
      if (guestA !== guestB) return guestA - guestB;
      var aOdd = usesOddPatternWeek(a.simGroup, simGroups) ? 0 : 1;
      var bOdd = usesOddPatternWeek(b.simGroup, simGroups) ? 0 : 1;
      if (aOdd !== bOdd) return aOdd - bOdd;
      if (a.simGroup !== b.simGroup) return a.simGroup < b.simGroup ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
  }

  function scheduleSimsForAllStudents(data, calendar) {
    var cfg = data.config;
    calendar = calendar || data._simCalendar || buildProgramSimCalendar(data, cfg);
    var needed = cfg.simDaysRequired || 5;
    var simGroups = App.DataModel.getSimGroups(cfg);
    var states = {};
    data.students.forEach(function (s) {
      states[s.id] = createSimSchedulingState();
    });
    for (var simNum = 1; simNum <= needed; simNum++) {
      orderStudentsForSimBlock(data.students, simGroups, data, calendar, simNum, states)
        .forEach(function (s) {
          scheduleOneSimForStudent(s, data, states[s.id], calendar, simNum);
        });
    }
    return states;
  }

  function scheduleConflictClinicalMakeups(student, data, state) {
    if (!state || !state.conflictWeeks.length) return;
    var cfg = data.config;
    var clinDay = getStudentClinicalDay(student, cfg);
    state.conflictWeeks.forEach(function (missedWi) {
      for (var ti = 0; ti < 2; ti++) {
        var target = ti === 0 ? 16 : 17;
        if (target === missedWi) continue;
        var cell = student.schedule[target];
        if (!cell || cell.inactive) continue;
        if (cell.sim || cell.clinical || cell.makeupClinical) continue;
        cell.makeupClinical = true;
        student.makeups.push({
          weekIndex: target,
          type: 'clinical',
          clinicalConflict: true,
          facilityId: student.facilityId
            ? App.DataModel.getCanonicalFacilityId(data, student.facilityId)
            : null,
          joinedDay: clinDay,
          hostGroup: student.clinicalGroup,
          week18Fallback: target === 17
        });
        break;
      }
    });
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
    data.students.forEach(function (s) { s.makeups = []; });
    markInactiveWeeks(data);
    data._simCalendar = buildProgramSimCalendar(data, data.config);
    data.students.forEach(function (s) {
      scheduleClinicalForStudent(s, data);
    });
    data._simSchedulingApplyHeadroom = true;
    var simStates = scheduleSimsForAllStudents(data, data._simCalendar);
    delete data._simSchedulingApplyHeadroom;
    data.students.forEach(function (s) {
      scheduleConflictClinicalMakeups(s, data, simStates[s.id]);
    });
    data.students.forEach(function (s) {
      scheduleMissedMakeups(s, data);
    });
    return data;
  }

  function clearStudentSimSchedule(student, data) {
    var cfg = data.config;
    student.schedule.forEach(function (cell) {
      if (!cell || !cell.sim) return;
      if (cell.clinicalMissed && cell.clinical &&
          cell.simDay === getStudentClinicalDay(student, cfg)) {
        cell.clinicalMissed = false;
      }
      cell.sim = null;
      cell.simDay = null;
      cell.simGuestGroup = null;
      cell.simMakeup = false;
      cell.simOverload = false;
    });
    student.makeups = (student.makeups || []).filter(function (m) { return m.type !== 'sim'; });
  }

  function regenerateStudent(student, data) {
    markInactiveWeeks(data);
    if (!data._simCalendar) data._simCalendar = buildProgramSimCalendar(data, data.config);
    clearStudentSimSchedule(student, data);
    var cfg = data.config;
    var calendar = data._simCalendar;
    var needed = cfg.simDaysRequired || 5;
    var state = buildStateFromStudentSchedule(student, cfg);
    data._simSchedulingApplyHeadroom = true;
    for (var simNum = 1; simNum <= needed; simNum++) {
      if (findSimWeek(student, simNum) < 0) {
        scheduleOneSimForStudent(student, data, state, calendar, simNum);
      }
    }
    delete data._simSchedulingApplyHeadroom;
    scheduleConflictClinicalMakeups(student, data, state);
    scheduleMissedMakeups(student, data);
  }

  function weekHasDoubleBooking(cell, student, cfg) {
    if (!cell || !cell.sim || !cell.simDay) return false;
    if (!cell.clinical || cell.clinicalMissed) return false;
    return getStudentClinicalDay(student, cfg) === cell.simDay;
  }

  function findSimWeek(student, simNum) {
    for (var w = 0; w < 18; w++) {
      if (student.schedule[w].sim === simNum) return w;
    }
    return -1;
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
      if (!student.facilityId) return [];
      var clinCaps = getClinicalCaps(cfg);
      var facName = getFacilityName(data, student.facilityId);
      var joinSlots = [];
      var seenClin = {};

      getExistingClinicalAtFacility(data, student.facilityId, student.id).forEach(function (session) {
        var wi = session.weekIndex;
        var cell = student.schedule[wi];
        if (cell.sim) return;
        if (cell.makeupClinical) return;
        if (cell.clinical && !cell.clinicalMissed) return;

        var count = getClinicalGroupAttendanceCount(data, wi, session.group, session.day);
        var overload = false;
        if (count >= clinCaps.overload) return;
        if (count >= clinCaps.normal) {
          if (count < clinCaps.overload) overload = true;
          else return;
        }

        var key = wi + '-' + session.day;
        if (seenClin[key]) return;
        seenClin[key] = true;

        joinSlots.push({
          weekIndex: wi,
          week: wi + 1,
          day: session.day,
          facilityJoin: true,
          hostGroup: session.group,
          facilityId: App.DataModel.getCanonicalFacilityId(data, student.facilityId),
          overload: overload,
          week18Fallback: false,
          reason: 'Join ' + facName + ' clinical on ' + session.day + ' (Week ' + (wi + 1) + ') — ' +
            count + '/' + clinCaps.normal + (overload ? ', overload available' : '')
        });
      });

      if (joinSlots.length === 0) {
        var w18 = getWeek18ClinicalSlot(data, student);
        if (w18) joinSlots.push(w18);
      }

      joinSlots.sort(function (a, b) {
        if (a.week18Fallback !== b.week18Fallback) return a.week18Fallback ? 1 : -1;
        if (a.overload !== b.overload) return a.overload ? 1 : -1;
        return a.weekIndex - b.weekIndex;
      });
      return joinSlots;
    }

    if (type === 'sim') {
      targetSimNum = parseInt(targetSimNum, 10);
      if (!targetSimNum || targetSimNum < 1) targetSimNum = 1;
      if (targetSimNum > cfg.simDaysRequired) return [];

      var calendar = data._simCalendar || buildProgramSimCalendar(data, cfg);
      var state = buildStateFromStudentSchedule(student, cfg);
      buildSimPlacementCandidates(student, data, calendar, targetSimNum, state).forEach(function (c) {
        addSimSlot(slots, seen, candidateToMakeupSlot(student, data, c, targetSimNum));
      });

      slots.sort(function (a, b) {
        if (a.week18Fallback !== b.week18Fallback) return a.week18Fallback ? 1 : -1;
        if (a.clinicalConflict !== b.clinicalConflict) return a.clinicalConflict ? 1 : -1;
        if (a.overload !== b.overload) return a.overload ? 1 : -1;
        return compareSimPlacementTier(
          { tier: a.tier || 'primary', weekIndex: a.weekIndex, day: a.day },
          { tier: b.tier || 'primary', weekIndex: b.weekIndex, day: b.day }
        );
      });
    }
    return slots;
  }

  function applyMakeupSlot(data, studentId, slot, type) {
    var student = data.students.find(function (s) { return s.id === studentId; });
    if (!student) return { clinicalConflictApplied: false };
    var cell = student.schedule[slot.weekIndex];
    if (type === 'clinical') {
      if (slot.facilityJoin) {
        var clinCaps = getClinicalCaps(data.config);
        var hostGroup = slot.hostGroup || student.clinicalGroup;
        var count = getClinicalGroupAttendanceCount(data, slot.weekIndex, hostGroup, slot.day);
        if (count >= clinCaps.overload) return { clinicalConflictApplied: false };
        if (count >= clinCaps.normal && !slot.overload) return { clinicalConflictApplied: false };
        cell.makeupClinical = true;
        student.makeups.push({
          weekIndex: slot.weekIndex,
          type: 'clinical',
          facilityId: App.DataModel.getCanonicalFacilityId(data, slot.facilityId),
          joinedDay: slot.day,
          hostGroup: slot.hostGroup,
          overload: !!slot.overload
        });
      } else {
        cell.makeupClinical = true;
        student.makeups.push({
          weekIndex: slot.weekIndex,
          type: 'clinical',
          week18Fallback: !!slot.week18Fallback
        });
      }
    } else if (type === 'sim') {
      var caps = getSimCaps(data.config);
      var count = getDaySimAttendanceCount(data, slot.weekIndex, slot.day);
      if (count >= caps.overload) return { clinicalConflictApplied: false };
      if (count >= caps.normal && !slot.overload) return { clinicalConflictApplied: false };

      var existingWeek = findSimWeek(student, slot.simNum);
      if (existingWeek >= 0 && existingWeek !== slot.weekIndex) {
        var old = student.schedule[existingWeek];
        old.sim = null;
        old.simDay = null;
        old.simMakeup = false;
        old.simOverload = false;
      }

      var clinicalConflictApplied = false;
      if (slot.clinicalConflict && cell.clinical && !cell.clinicalMissed) {
        cell.clinicalMissed = true;
        clinicalConflictApplied = true;
      }

      cell.sim = slot.simNum;
      cell.simDay = slot.day;
      cell.simMakeup = true;
      cell.simOverload = !!slot.overload;
      student.makeups.push({
        weekIndex: slot.weekIndex,
        type: 'sim',
        simNum: slot.simNum,
        overload: !!slot.overload,
        clinicalConflict: clinicalConflictApplied,
        week18Fallback: !!slot.week18Fallback
      });
      App.notifyChange();
      return { clinicalConflictApplied: clinicalConflictApplied };
    }
    App.notifyChange();
    return { clinicalConflictApplied: false };
  }

  function getWeek18SimMakeupSlot(data, studentId, targetSimNum) {
    var student = data.students.find(function (s) { return s.id === studentId; });
    if (!student) return null;
    targetSimNum = parseInt(targetSimNum, 10);
    if (!targetSimNum || targetSimNum < 1) return null;
    var calendar = data._simCalendar || buildProgramSimCalendar(data, data.config);
    var state = buildStateFromStudentSchedule(student, data.config);
    var w18 = buildSimPlacementCandidates(student, data, calendar, targetSimNum, state)
      .filter(function (c) { return c.tier === 'week18'; });
    if (!w18.length) return null;
    var sch = SIM_GROUP_SCHEDULE[student.simGroup] || SIM_GROUP_SCHEDULE.SG1;
    var preferred = w18.filter(function (s) { return s.day === sch.day; })[0];
    var pick = preferred || w18[0];
    return candidateToMakeupSlot(student, data, pick, targetSimNum);
  }

  function copyForward(data, newSemesterName) {
    var copy = JSON.parse(JSON.stringify(data));
    copy.meta.semesterName = newSemesterName || 'New Semester';
    copy.meta.lastModified = new Date().toISOString();
    copy.students.forEach(function (s) {
      s.id = App.DataModel.uid();
      s.absences = [];
      s.makeups = [];
    });
    App.DataModel.assignDefaultStudentNames(copy.students);
    var start = new Date();
    start.setMonth(start.getMonth() + 4);
    copy.calendar.semesterStartDate = App.CalendarEngine.toISO(start);
    App.CalendarEngine.rebuildWeeks(copy);
    return copy;
  }

  return {
    SIM_GROUP_SCHEDULE: SIM_GROUP_SCHEDULE,
    buildProgramSimCalendar: buildProgramSimCalendar,
    getStudentSimSlot: getStudentSimSlot,
    getStudentSimSlotCandidates: getStudentSimSlotCandidates,
    getWeekSimNumber: getWeekSimNumber,
    getDaySimStudents: getDaySimStudents,
    getDaySimAttendanceCount: getDaySimAttendanceCount,
    getSimCaps: getSimCaps,
    getClinicalCaps: getClinicalCaps,
    getSessionStudents: getSessionStudents,
    getClinicalGroupAttendanceCount: getClinicalGroupAttendanceCount,
    getClinicalGroupSessionStudents: getClinicalGroupSessionStudents,
    getClinicalAttendanceCount: getClinicalAttendanceCount,
    getClinicalSessionStudents: getClinicalSessionStudents,
    getExistingSimSessions: getExistingSimSessions,
    getExistingClinicalAtFacility: getExistingClinicalAtFacility,
    getWeek18SimMakeupSlot: getWeek18SimMakeupSlot,
    assignSimGroups: assignSimGroups,
    regenerateAll: regenerateAll,
    regenerateStudent: regenerateStudent,
    weekHasDoubleBooking: weekHasDoubleBooking,
    getStudentClinicalDay: getStudentClinicalDay,
    findMakeupSlots: findMakeupSlots,
    findSimWeek: findSimWeek,
    applyMakeupSlot: applyMakeupSlot,
    copyForward: copyForward,
    getSessionCount: getSessionCount,
    getSimPlacements: getSimPlacements,
    blockHasRegularCapacity: blockHasRegularCapacity,
    shouldDeferWeek18: shouldDeferWeek18,
    buildSimPlacementCandidates: buildSimPlacementCandidates,
    getEffectiveSimNormalCap: getEffectiveSimNormalCap,
    clinicalSimWeekdaysOverlap: clinicalSimWeekdaysOverlap
  };
})();
