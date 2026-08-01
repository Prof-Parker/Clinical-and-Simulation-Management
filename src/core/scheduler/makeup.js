/**
 * Makeup slot discovery, week-18 fallbacks, and manual makeup application.
 */

import {
  uid,
  getCanonicalFacilityId,
  getSimGroups,
  getSimDays
} from '../data-model/index.js';
import * as CalendarEngine from '../calendar-engine.js';
import * as ClinicalSites from '../clinical-sites.js';
import { notifyChange } from '../state.js';
import {
  getSimCaps,
  getClinicalCaps,
  getFacilityName,
  getClinicalGroupAttendanceCount,
  getDaySimAttendanceCount,
  findSimWeek,
  getExistingClinicalAtFacility,
  wouldSimClinicalConflict,
  getStudentClinicalDay
} from './helpers.js';
import {
  buildProgramSimCalendar,
  buildSimPlacementCandidates,
  buildStateFromStudentSchedule,
  getSimGroupSchedule
} from './sim-placement.js';
import { getWeek18ClinicalSlot } from './clinical.js';

// Provenance fields for makeup records (spec §4.3). Auto-generated makeups
// pass appliedByName '' — only Makeup Finder applies carry a user name.
export function withProvenance(record, appliedByName) {
  record.id = uid();
  record.appliedAt = new Date().toISOString();
  record.appliedByName = appliedByName || '';
  return record;
}

export function addSimSlot(slots, seen, slot) {
  var key = slot.weekIndex + '-' + slot.simNum + '-' + slot.day;
  if (seen[key]) return;
  seen[key] = true;
  slots.push(slot);
}

export function getWeek18SimFallback(data, cfg, targetSimNum, student) {
  var slots = [];
  var makeupWeeks = CalendarEngine.resolveMakeupWeeks(data);
  var wi = makeupWeeks.simLastResort;
  if (CalendarEngine.isSchedulingBlockedWeek(data, wi)) return slots;
  var cell = student.schedule[wi];
  if (!cell || cell.inactive) return slots;

  if (cell.sim && cell.sim !== targetSimNum) {
    var simGroups = getSimGroups(cfg);
    var sch = getSimGroupSchedule(student.simGroup, simGroups, cfg);
    var simDays = getSimDays(cfg);
    var day = simDays.indexOf(sch.day) >= 0 ? sch.day : simDays[0];
    slots.push({
      weekIndex: wi,
      week: wi + 1,
      day: day,
      simNum: targetSimNum,
      week18Fallback: true,
      mixedSim: true,
      overload: false,
      clinicalConflict: !!(cell.clinical && !cell.clinicalMissed),
      replacesWeek18Sim: true,
      reason: 'Week ' + (wi + 1) + ' mixed sim makeup — replaces Sim ' + cell.sim + ' (last resort, not preferred)'
    });
    return slots;
  }

  getSimDays(cfg).forEach(function (d) {
    if (cell.sim === targetSimNum && cell.simDay === d) return;
    slots.push({
      weekIndex: wi,
      week: wi + 1,
      day: d,
      simNum: targetSimNum,
      week18Fallback: true,
      mixedSim: true,
      overload: false,
      clinicalConflict: !!(cell.clinical && !cell.clinicalMissed),
      reason: 'Week ' + (wi + 1) + ' mixed sim makeup — last resort (not preferred)'
    });
  });
  return slots;
}

export function compareSimPlacementTier(a, b) {
  var order = { primary: 0, primaryAlt: 1, guest: 2, overload: 3, conflictAllow: 4, week18: 5 };
  var ta = order[a.tier] != null ? order[a.tier] : 99;
  var tb = order[b.tier] != null ? order[b.tier] : 99;
  if (ta !== tb) return ta - tb;
  if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
  return (a.day || '').localeCompare(b.day || '');
}

function blocksClinicalMakeupJoin(cell, student, cfg, joinDay) {
  if (!cell || cell.inactive) return true;
  if (cell.makeupClinical) return true;
  if (cell.sim && cell.simDay === joinDay) return true;
  if (cell.clinical && !cell.clinicalMissed && getStudentClinicalDay(student, cfg) === joinDay) {
    return true;
  }
  return false;
}

export function candidateToMakeupSlot(student, data, candidate, simNum) {
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

export function findMakeupSlots(data, studentId, type, targetSimNum) {
  var student = data.students.find(function (s) { return s.id === studentId; });
  if (!student) return [];
  var slots = [];
  var cfg = data.config;
  var seen = {};

  if (type === 'clinical') {
    var facIds = ClinicalSites
      ? ClinicalSites.getGroupFacilities(data, student.clinicalGroup)
      : (student.facilityId ? [student.facilityId] : []);
    if (!facIds.length) return [];
    var clinCaps = getClinicalCaps(cfg);
    var joinSlots = [];
    var seenClin = {};

    facIds.forEach(function (searchFacId) {
      var facName = getFacilityName(data, searchFacId);
      getExistingClinicalAtFacility(data, searchFacId, student.id).forEach(function (session) {
        var wi = session.weekIndex;
        var cell = student.schedule[wi];
        if (blocksClinicalMakeupJoin(cell, student, cfg, session.day)) return;

        var count = getClinicalGroupAttendanceCount(data, wi, session.group, session.day);
        var overload = false;
        if (count >= clinCaps.overload) return;
        if (count >= clinCaps.normal) {
          if (count < clinCaps.overload) overload = true;
          else return;
        }

        var key = wi + '-' + session.day + '-' + session.group;
        if (seenClin[key]) return;
        seenClin[key] = true;

        joinSlots.push({
          weekIndex: wi,
          week: wi + 1,
          day: session.day,
          facilityJoin: true,
          hostGroup: session.group,
          facilityId: getCanonicalFacilityId(data, searchFacId),
          overload: overload,
          week18Fallback: false,
          reason: 'Join ' + facName + ' clinical with group ' + session.group +
            (overload ? ' (overload)' : '')
        });
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

export function applyMakeupSlot(data, studentId, slot, type, appliedByName, missedWeekIndex) {
  var student = data.students.find(function (s) { return s.id === studentId; });
  if (!student) return { clinicalConflictApplied: false, applied: false };
  var cell = student.schedule[slot.weekIndex];
  var empty = { clinicalConflictApplied: false, applied: false };

  function markMissedIfNeeded() {
    if (missedWeekIndex == null || missedWeekIndex === '') return null;
    var mi = parseInt(missedWeekIndex, 10);
    if (isNaN(mi) || mi < 0 || mi >= 18) return null;
    var missedCell = student.schedule[mi];
    if (!missedCell || !missedCell.clinical || missedCell.clinicalMissed) return null;
    missedCell.clinicalMissed = true;
    return mi;
  }

  function result(extra) {
    var out = {
      clinicalConflictApplied: false,
      applied: true,
      missedWeekIndex: null,
      makeupWeekIndex: slot.weekIndex,
      makeupDay: slot.day || null
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    }
    return out;
  }

  if (type === 'clinical') {
    var markedMissed = null;
    if (slot.facilityJoin) {
      var clinCaps = getClinicalCaps(data.config);
      var hostGroup = slot.hostGroup || student.clinicalGroup;
      var count = getClinicalGroupAttendanceCount(data, slot.weekIndex, hostGroup, slot.day);
      if (count >= clinCaps.overload) return empty;
      if (count >= clinCaps.normal && !slot.overload) return empty;
      markedMissed = markMissedIfNeeded();
      cell.makeupClinical = true;
      var joinFac = getCanonicalFacilityId(data, slot.facilityId);
      if (joinFac) cell.facilityId = joinFac;
      student.makeups.push(withProvenance({
        weekIndex: slot.weekIndex,
        type: 'clinical',
        facilityId: getCanonicalFacilityId(data, slot.facilityId),
        joinedDay: slot.day,
        hostGroup: slot.hostGroup,
        overload: !!slot.overload
      }, appliedByName));
    } else {
      markedMissed = markMissedIfNeeded();
      cell.makeupClinical = true;
      var w18Fac = slot.facilityId ||
        (ClinicalSites
          ? ClinicalSites.getPrimaryGroupFacility(data, student.clinicalGroup)
          : student.facilityId);
      student.makeups.push(withProvenance({
        weekIndex: slot.weekIndex,
        type: 'clinical',
        week18Fallback: !!slot.week18Fallback,
        facilityId: w18Fac ? getCanonicalFacilityId(data, w18Fac) : null
      }, appliedByName));
      if (w18Fac) cell.facilityId = getCanonicalFacilityId(data, w18Fac);
    }
    notifyChange();
    return result({ missedWeekIndex: markedMissed });
  } else if (type === 'sim') {
    var caps = getSimCaps(data.config);
    var count = getDaySimAttendanceCount(data, slot.weekIndex, slot.day);
    if (count >= caps.overload) return empty;
    if (count >= caps.normal && !slot.overload) return empty;

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
    student.makeups.push(withProvenance({
      weekIndex: slot.weekIndex,
      type: 'sim',
      simNum: slot.simNum,
      overload: !!slot.overload,
      clinicalConflict: clinicalConflictApplied,
      week18Fallback: !!slot.week18Fallback
    }, appliedByName));
    notifyChange();
    return result({
      clinicalConflictApplied: clinicalConflictApplied,
      missedWeekIndex: clinicalConflictApplied ? slot.weekIndex : null
    });
  }
  return empty;
}

export function getWeek18SimMakeupSlot(data, studentId, targetSimNum) {
  var student = data.students.find(function (s) { return s.id === studentId; });
  if (!student) return null;
  targetSimNum = parseInt(targetSimNum, 10);
  if (!targetSimNum || targetSimNum < 1) return null;
  var calendar = data._simCalendar || buildProgramSimCalendar(data, data.config);
  var state = buildStateFromStudentSchedule(student, data.config);
  var w18 = buildSimPlacementCandidates(student, data, calendar, targetSimNum, state)
    .filter(function (c) { return c.tier === 'week18'; });
  if (!w18.length) return null;
  var cfg = data.config;
  var simGroups = getSimGroups(cfg);
  var sch = getSimGroupSchedule(student.simGroup, simGroups, cfg);
  var preferred = w18.filter(function (s) { return s.day === sch.day; })[0];
  var pick = preferred || w18[0];
  return candidateToMakeupSlot(student, data, pick, targetSimNum);
}
