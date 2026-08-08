/**
 * Shared attendance, capacity, and count helpers for clinical and sim scheduling.
 */

import {
  findFacilityById,
  studentAtFacilitySite,
  getClinicalDayForGroup,
  getSimGroups,
  getSimDays
} from '../data-model/index.js';
import * as CalendarEngine from '../calendar-engine.js';
import * as ClinicalSites from '../clinical-sites.js';
import {
  buildProgramSimCalendar,
  getWeekSimNumber,
  getSimGroupSchedule,
  alternateSimDay
} from './sim-placement.js';

export function getSimCaps(cfg) {
  return {
    normal: cfg.maxStudentsPerSimSession || 8,
    overload: cfg.maxStudentsPerSimSessionOverload || 9
  };
}

export function getClinicalCaps(cfg) {
  var normal = cfg.maxPerClinicalGroup || 6;
  return {
    normal: normal,
    overload: cfg.maxPerClinicalGroupOverload || (normal + 1)
  };
}

export function findClinicalMakeupRecord(student, weekIndex) {
  if (!student || !student.makeups || !student.makeups.length) return null;
  for (var i = student.makeups.length - 1; i >= 0; i--) {
    var m = student.makeups[i];
    if (m && m.weekIndex === weekIndex && m.type === 'clinical') return m;
  }
  return null;
}

export function getFacilityName(data, facilityId) {
  var fac = findFacilityById(data, facilityId);
  return fac ? fac.name : 'facility';
}

export function studentAtSite(data, student, facilityId, weekIndex) {
  if (weekIndex != null && ClinicalSites) {
    return ClinicalSites.studentAtFacilityAtWeek(data, student, weekIndex, facilityId);
  }
  return studentAtFacilitySite(data, student, facilityId);
}

export function getExistingSimSessions(data, simNum) {
  var cfg = data.config;
  var calendar = data._simCalendar || buildProgramSimCalendar(data, cfg);
  var makeupWeeks = CalendarEngine.resolveMakeupWeeks(data);
  var map = {};
  for (var w = 0; w < makeupWeeks.simLastResort; w++) {
    if (getWeekSimNumber(calendar, w) !== simNum) continue;
    if (CalendarEngine.isSchedulingBlockedWeek(data, w)) continue;
    getSimDays(cfg).forEach(function (day) {
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

export function getExistingClinicalAtFacility(data, facilityId, excludeStudentId) {
  if (!facilityId) return [];
  var cfg = data.config;
  var makeupWeeks = CalendarEngine.resolveMakeupWeeks(data);
  var sessions = {};
  function addSession(w, group, day) {
    var key = w + '-' + day + '-' + group;
    if (!sessions[key]) {
      sessions[key] = {
        weekIndex: w,
        week: w + 1,
        day: day,
        group: group,
        count: 0
      };
    }
    sessions[key].count++;
  }
  for (var w = 0; w < makeupWeeks.simLastResort; w++) {
    if (CalendarEngine.isSchedulingBlockedWeek(data, w)) continue;
    data.students.forEach(function (s) {
      if (s.id === excludeStudentId) return;
      var cell = s.schedule[w];
      if (!cell || cell.inactive) return;
      if (!studentAtSite(data, s, facilityId, w)) return;
      if (cell.clinical && !cell.clinicalMissed) {
        addSession(w, s.clinicalGroup, getClinicalDayForGroup(s.clinicalGroup, cfg));
      }
      if (cell.makeupClinical) {
        var makeup = findClinicalMakeupRecord(s, w);
        if (makeup && makeup.hostGroup) {
          var joinDay = makeup.joinedDay || getClinicalDayForGroup(makeup.hostGroup, cfg);
          addSession(w, makeup.hostGroup, joinDay);
        }
      }
    });
  }
  return Object.keys(sessions).map(function (k) { return sessions[k]; });
}

export function getClinicalGroupSessionStudents(data, weekIndex, clinicalGroup, day) {
  var cfg = data.config;
  var groupDay = getClinicalDayForGroup(clinicalGroup, cfg);
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

export function getClinicalGroupAttendanceCount(data, weekIndex, clinicalGroup, day) {
  return getClinicalGroupSessionStudents(data, weekIndex, clinicalGroup, day).length;
}

export function getClinicalSessionStudents(data, weekIndex, clinicalGroup, day) {
  return getClinicalGroupSessionStudents(data, weekIndex, clinicalGroup, day);
}

export function getClinicalAttendanceCount(data, weekIndex, clinicalGroup, day) {
  return getClinicalGroupAttendanceCount(data, weekIndex, clinicalGroup, day);
}

export function getDaySimStudents(data, weekIndex, day) {
  var list = [];
  data.students.forEach(function (s) {
    var c = s.schedule[weekIndex];
    if (c && c.sim && c.simDay === day) {
      list.push({ student: s, cell: c });
    }
  });
  return list;
}

export function getDaySimAttendanceCount(data, weekIndex, day) {
  return getDaySimStudents(data, weekIndex, day).length;
}

export function getSessionStudents(data, weekIndex, simNum, day) {
  var list = [];
  data.students.forEach(function (s) {
    var c = s.schedule[weekIndex];
    if (c && c.sim === simNum && c.simDay === day) {
      list.push({ student: s, cell: c });
    }
  });
  return list;
}

export function getSessionCount(data, weekIndex, simNum, day) {
  return getSessionStudents(data, weekIndex, simNum, day).length;
}

export function countedClinicals(student) {
  var n = 0;
  student.schedule.forEach(function (c) {
    if (c.inactive) return;
    if (c.clinical && !c.clinicalMissed) n++;
    if (c.makeupClinical) n++;
  });
  return n;
}

export function getStudentClinicalDay(student, cfg) {
  return getClinicalDayForGroup(student.clinicalGroup, cfg);
}

export function wouldSimClinicalConflict(cell, student, cfg, simDay) {
  if (!cell) return false;
  return cell.clinical && !cell.clinicalMissed && getStudentClinicalDay(student, cfg) === simDay;
}

export function clinicalSimWeekdaysOverlap(student, cfg) {
  return getSimDays(cfg).indexOf(getStudentClinicalDay(student, cfg)) >= 0;
}

export function wouldSameWeekClinicalConflict(student, data, weekIndex, simDay, cfg) {
  if (!student || !student.schedule) return false;
  var cell = student.schedule[weekIndex];
  return wouldSimClinicalConflict(cell, student, cfg, simDay);
}

export function weekHasDoubleBooking(cell, student, cfg) {
  if (!cell || !cell.sim || !cell.simDay) return false;
  if (!cell.clinical || cell.clinicalMissed) return false;
  return getStudentClinicalDay(student, cfg) === cell.simDay;
}

export function findSimWeek(student, simNum) {
  if (!student || !student.schedule) return -1;
  for (var w = 0; w < 18; w++) {
    var cell = student.schedule[w];
    if (cell && cell.sim === simNum) return w;
  }
  return -1;
}

export function getSimSchedulingOptions(data, override) {
  var opts = { applyHeadroom: !!(data && data._simSchedulingApplyHeadroom) };
  if (override && override.applyHeadroom !== undefined) opts.applyHeadroom = override.applyHeadroom;
  return opts;
}

export function getEffectiveSimNormalCap(cfg, data, options) {
  var caps = getSimCaps(cfg);
  return caps.normal;
}

export function createSimSchedulingState() {
  return { guestCount: 0, simClinicalConflicts: 0, conflictWeeks: [] };
}

export function getGuestCountFromSchedule(student) {
  var count = 0;
  student.schedule.forEach(function (cell) {
    if (cell.simGuestGroup) count++;
  });
  return count;
}

/** Half of maxStudentsPerSimSession (floored at 1) — absolute practical minimum session size. */
export function getSimPracticalMinLoad(cfg) {
  var normal = getSimCaps(cfg).normal;
  return Math.max(1, Math.floor(normal / 2));
}

/** Three-quarters of maxStudentsPerSimSession (ceiled), at least the absolute floor. */
export function getSimIdealMinLoad(cfg) {
  var normal = getSimCaps(cfg).normal;
  var absolute = getSimPracticalMinLoad(cfg);
  return Math.max(absolute, Math.ceil(normal * 0.75));
}

/**
 * Legacy under-cap score: prefer lower absolute load (spreads).
 */
export function candidateLoadScoreRaw(data, weekIndex, day, cfg) {
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

/**
 * Soft-floor score: prefer joining already-open thin sessions over empty;
 * among open sessions still prefer lower load; empty still beats healthy.
 */
export function candidateLoadScoreSoftFloor(data, weekIndex, day, cfg) {
  var count = getDaySimAttendanceCount(data, weekIndex, day);
  var normal = getSimCaps(cfg).normal;
  var half = getSimPracticalMinLoad(cfg);
  var reserve = cfg.simMakeupHeadroomReserved;
  if (reserve == null || isNaN(reserve)) reserve = 1;
  reserve = Math.max(0, parseInt(reserve, 10) || 0);
  var softCap = Math.max(1, normal - reserve);
  if (count >= normal) return 10000 + count;
  if (reserve > 0 && count >= softCap) return 1000 + count;
  if (count > 0 && count < half) return count;
  if (count === 0) return half;
  return half + count;
}

/**
 * Default load score. Pass applySoftFloor:true for join-thin-over-empty preference.
 */
export function candidateLoadScore(data, weekIndex, day, cfg, opts) {
  if (opts && opts.applySoftFloor) {
    return candidateLoadScoreSoftFloor(data, weekIndex, day, cfg);
  }
  return candidateLoadScoreRaw(data, weekIndex, day, cfg);
}

export function simDaysOrderForWeek(student, wi, sch, cfg) {
  var simDays = getSimDays(cfg);
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

export function daySimAtNormalCap(data, weekIndex, day, cfg) {
  return getDaySimAttendanceCount(data, weekIndex, day) >= getSimCaps(cfg).normal;
}

export function compareCandidatesByDayPreference(student, data, a, b, cfg, simGroups) {
  if (a.weekIndex !== b.weekIndex) return null;
  var aFull = daySimAtNormalCap(data, a.weekIndex, a.day, cfg);
  var bFull = daySimAtNormalCap(data, b.weekIndex, b.day, cfg);
  if (!aFull && !bFull) {
    var sch = getSimGroupSchedule(student.simGroup, simGroups, cfg);
    var order = simDaysOrderForWeek(student, a.weekIndex, sch, cfg);
    var ia = order.indexOf(a.day);
    var ib = order.indexOf(b.day);
    if (ia < 0) ia = 99;
    if (ib < 0) ib = 99;
    if (ia !== ib) return ia - ib;
    return 0;
  }
  if (aFull !== bFull) return (aFull ? 1 : 0) - (bFull ? 1 : 0);
  return null;
}

export function compareCandidatesByLoad(student, data, a, b, cfg) {
  var simGroups = getSimGroups(cfg);
  var dayPref = compareCandidatesByDayPreference(student, data, a, b, cfg, simGroups);
  if (dayPref != null && dayPref !== 0) return dayPref;

  // Soft floor only when both candidates are home seats (protect guest fairness).
  var aHome = a.hostSimGroup === student.simGroup;
  var bHome = b.hostSimGroup === student.simGroup;
  var soft = !!(aHome && bHome);
  var sa = candidateLoadScore(data, a.weekIndex, a.day, cfg, { applySoftFloor: soft });
  var sb = candidateLoadScore(data, b.weekIndex, b.day, cfg, { applySoftFloor: soft });
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

export function sortCandidatesWithinTier(student, data, candidates, cfg) {
  return candidates.slice().sort(function (a, b) {
    return compareCandidatesByLoad(student, data, a, b, cfg);
  });
}

export function blockHasRegularCapacity(data, calendar, simNum, cfg) {
  var block = calendar.blocks[simNum - 1];
  if (!block) return false;
  var cap = getSimCaps(cfg).normal;
  var simDays = getSimDays(cfg);
  for (var i = 0; i < block.weeks.length; i++) {
    var wi = block.weeks[i];
    if (CalendarEngine.isSchedulingBlockedWeek(data, wi)) continue;
    for (var d = 0; d < simDays.length; d++) {
      if (getDaySimAttendanceCount(data, wi, simDays[d]) < cap) return true;
    }
  }
  return false;
}

export function laterBlocksHaveRegularCapacity(data, calendar, fromSimNum, cfg) {
  var needed = cfg.simDaysRequired || 5;
  for (var n = fromSimNum + 1; n <= needed; n++) {
    if (blockHasRegularCapacity(data, calendar, n, cfg)) return true;
  }
  return false;
}

export function studentStillNeedsSim(student, simNum, cfg) {
  var needed = cfg.simDaysRequired || 5;
  if (simNum >= needed) return false;
  for (var n = simNum + 1; n <= needed; n++) {
    if (findSimWeek(student, n) < 0) return true;
  }
  return false;
}

export function shouldDeferWeek18(student, data, calendar, simNum, cfg) {
  if (blockHasRegularCapacity(data, calendar, simNum, cfg)) return true;
  if (studentStillNeedsSim(student, simNum, cfg) &&
      laterBlocksHaveRegularCapacity(data, calendar, simNum, cfg)) {
    return true;
  }
  return false;
}
