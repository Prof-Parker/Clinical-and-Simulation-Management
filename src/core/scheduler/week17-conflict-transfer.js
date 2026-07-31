/**
 * When Week 17 clustering prefers a clinical site, transfer sim-on-clinical
 * conflicts from other sites onto free preferred-site students so makeup
 * clinicals can pack into fewer site/day groups (e.g. 8 at SRMC → 2×4).
 *
 * Preserves sim progression: either move+re-place (recipient lacks that sim
 * number) or swap placements (recipient already has that sim on another week).
 */

import {
  getCanonicalFacilityId,
  getClinicalGroups,
  sameFacilitySite
} from '../data-model/index.js';
import * as ClinicalSites from '../clinical-sites.js';
import { getStudentClinicalDay, findSimWeek } from './helpers.js';
import {
  buildProgramSimCalendar,
  buildStateFromStudentSchedule,
  scheduleOneSimForStudent
} from './sim-placement.js';
import { getStudentAssignedSite, WEEK17_MODES, normalizeWeek17Mode } from './week17-makeup-candidates.js';

function countSimClinicalConflicts(student, cfg) {
  var n = 0;
  var clinDay = getStudentClinicalDay(student, cfg);
  (student.schedule || []).forEach(function (cell) {
    if (cell && cell.sim && cell.clinical && cell.clinicalMissed && cell.simDay === clinDay) n++;
  });
  return n;
}

function countGuestSims(student) {
  var n = 0;
  (student.schedule || []).forEach(function (c) {
    if (c && c.sim && c.simGuestGroup) n++;
  });
  return n;
}

function listConflictWeeks(student, cfg) {
  var clinDay = getStudentClinicalDay(student, cfg);
  var weeks = [];
  (student.schedule || []).forEach(function (cell, wi) {
    if (cell && cell.sim && cell.clinical && cell.clinicalMissed && cell.simDay === clinDay) {
      weeks.push(wi);
    }
  });
  return weeks;
}

function preferredSiteClinicalGroups(data, preferredSiteId) {
  var groups = [];
  getClinicalGroups(data.config).forEach(function (g) {
    var fac = ClinicalSites.getPrimaryGroupFacility(data, g);
    if (fac && sameFacilitySite(data, fac, preferredSiteId)) groups.push(g);
  });
  return groups;
}

function clearSimCell(student, wi) {
  var cell = student.schedule[wi];
  if (!cell) return;
  cell.sim = null;
  cell.simDay = null;
  cell.simGuestGroup = null;
  cell.simOverload = false;
  cell.simMakeup = false;
  if (cell.clinicalMissed) cell.clinicalMissed = false;
  student.makeups = (student.makeups || []).filter(function (m) {
    return !(m.type === 'sim' && m.weekIndex === wi);
  });
}

function stampConflictSim(student, wi, simNum, simDay, host, overload, simMakeup) {
  var cell = student.schedule[wi];
  cell.sim = simNum;
  cell.simDay = simDay;
  cell.simOverload = !!overload;
  cell.simMakeup = !!simMakeup;
  cell.simGuestGroup = (host && host !== student.simGroup) ? host : null;
  cell.clinicalMissed = true;
}

function canTakeConflictSeat(recipient, weekIndex, simDay, cfg) {
  if (!recipient || weekIndex == null || !simDay) return false;
  if (countSimClinicalConflicts(recipient, cfg) >= 1) return false;
  var cell = recipient.schedule[weekIndex];
  if (!cell || cell.inactive || cell.sim) return false;
  if (!(cell.clinical && !cell.clinicalMissed)) return false;
  if (getStudentClinicalDay(recipient, cfg) !== simDay) return false;
  var guestSoft = cfg.maxGuestSimsPerStudent;
  if (guestSoft == null || isNaN(guestSoft) || guestSoft < 0) guestSoft = 1;
  if (countGuestSims(recipient) > guestSoft) return false;
  return true;
}

function resolveSessionHost(fromCell, fromStudent) {
  return fromCell.simGuestGroup || fromStudent.simGroup || null;
}

function rePlaceSim(data, student, simNum, cfg) {
  if (findSimWeek(student, simNum) >= 0) return true;
  if (!data._simCalendar) data._simCalendar = buildProgramSimCalendar(data, cfg);
  var state = buildStateFromStudentSchedule(student, cfg);
  return scheduleOneSimForStudent(student, data, state, data._simCalendar, simNum);
}

/**
 * Move conflict onto recipient who does not yet have this sim number; re-place donor.
 */
function transferByMove(data, source, recipient, weekIndex) {
  var cfg = data.config;
  var fromCell = source.schedule[weekIndex];
  var simNum = fromCell.sim;
  var simDay = fromCell.simDay;
  if (findSimWeek(recipient, simNum) >= 0) return false;
  if (!canTakeConflictSeat(recipient, weekIndex, simDay, cfg)) return false;

  var host = resolveSessionHost(fromCell, source);
  var overload = !!fromCell.simOverload;
  var simMakeup = !!fromCell.simMakeup;

  clearSimCell(source, weekIndex);
  stampConflictSim(recipient, weekIndex, simNum, simDay, host, overload, simMakeup);

  if (!rePlaceSim(data, source, simNum, cfg)) {
    clearSimCell(recipient, weekIndex);
    stampConflictSim(source, weekIndex, simNum, simDay, host, overload, simMakeup);
    return false;
  }
  return true;
}

/**
 * Swap: recipient already has simNum elsewhere — put them on the conflict seat
 * and give the donor their former non-conflict (or re-placed) seat.
 */
function transferBySwap(data, source, recipient, weekIndex) {
  var cfg = data.config;
  var fromCell = source.schedule[weekIndex];
  var simNum = fromCell.sim;
  var simDay = fromCell.simDay;
  var recipWi = findSimWeek(recipient, simNum);
  if (recipWi < 0 || recipWi === weekIndex) return false;
  if (!canTakeConflictSeat(recipient, weekIndex, simDay, cfg)) return false;

  var recipCell = recipient.schedule[recipWi];
  if (!recipCell || !recipCell.sim) return false;
  // Prefer swapping off a non-conflict seat.
  var recipClinDay = getStudentClinicalDay(recipient, cfg);
  if (recipCell.clinical && recipCell.clinicalMissed && recipCell.simDay === recipClinDay) {
    return false;
  }

  var donorHost = resolveSessionHost(fromCell, source);
  var donorOverload = !!fromCell.simOverload;
  var donorMakeup = !!fromCell.simMakeup;
  var recipHost = resolveSessionHost(recipCell, recipient);
  var recipDay = recipCell.simDay;
  var recipOverload = !!recipCell.simOverload;
  var recipMakeup = !!recipCell.simMakeup;

  var donorDest = source.schedule[recipWi];
  var canUseRecipWeek = donorDest && !donorDest.inactive && !donorDest.sim;

  clearSimCell(source, weekIndex);
  clearSimCell(recipient, recipWi);
  stampConflictSim(recipient, weekIndex, simNum, simDay, donorHost, donorOverload, donorMakeup);

  if (canUseRecipWeek) {
    donorDest.sim = simNum;
    donorDest.simDay = recipDay;
    donorDest.simOverload = recipOverload;
    donorDest.simMakeup = recipMakeup;
    donorDest.simGuestGroup = (recipHost && recipHost !== source.simGroup) ? recipHost : null;
    var donorClinDay = getStudentClinicalDay(source, cfg);
    if (donorDest.clinical && !donorDest.clinicalMissed && recipDay === donorClinDay) {
      donorDest.clinicalMissed = true;
    }
  } else if (!rePlaceSim(data, source, simNum, cfg)) {
    // Roll back
    clearSimCell(recipient, weekIndex);
    stampConflictSim(source, weekIndex, simNum, simDay, donorHost, donorOverload, donorMakeup);
    recipCell.sim = simNum;
    recipCell.simDay = recipDay;
    recipCell.simOverload = recipOverload;
    recipCell.simMakeup = recipMakeup;
    recipCell.simGuestGroup = (recipHost && recipHost !== recipient.simGroup) ? recipHost : null;
    return false;
  }
  return true;
}

function transferOneConflict(data, source, recipient, weekIndex) {
  if (transferByMove(data, source, recipient, weekIndex)) return true;
  return transferBySwap(data, source, recipient, weekIndex);
}

function pickRecipient(data, preferredGroups, weekIndex, simDay, cfg, usedIds) {
  var candidates = [];
  (data.students || []).forEach(function (s) {
    if (usedIds[s.id]) return;
    if (preferredGroups.indexOf(s.clinicalGroup) < 0) return;
    if (!canTakeConflictSeat(s, weekIndex, simDay, cfg)) return;
    var hasAnyMakeup = (s.makeups || []).length > 0 ||
      (s.schedule || []).some(function (c) { return c && (c.makeupClinical || c.simMakeup); });
    candidates.push({
      student: s,
      hasAnyMakeup: hasAnyMakeup ? 1 : 0,
      guestCount: countGuestSims(s),
      group: s.clinicalGroup,
      id: s.id
    });
  });
  if (!candidates.length) return null;
  candidates.sort(function (a, b) {
    if (a.hasAnyMakeup !== b.hasAnyMakeup) return a.hasAnyMakeup - b.hasAnyMakeup;
    if (a.guestCount !== b.guestCount) return a.guestCount - b.guestCount;
    if (a.group !== b.group) return String(a.group).localeCompare(String(b.group));
    return String(a.id).localeCompare(String(b.id));
  });
  var top = candidates.filter(function (c) {
    return c.hasAnyMakeup === candidates[0].hasAnyMakeup &&
      c.guestCount === candidates[0].guestCount;
  });
  var groupUse = {};
  preferredGroups.forEach(function (g) { groupUse[g] = 0; });
  Object.keys(usedIds).forEach(function (id) {
    var s = (data.students || []).find(function (x) { return x.id === id; });
    if (s && groupUse[s.clinicalGroup] != null) groupUse[s.clinicalGroup]++;
  });
  top.sort(function (a, b) {
    var ua = groupUse[a.group] || 0;
    var ub = groupUse[b.group] || 0;
    if (ua !== ub) return ua - ub;
    return String(a.id).localeCompare(String(b.id));
  });
  return top[0].student;
}

/**
 * Move off-preferred-site sim/clinical conflicts onto preferred-site students.
 * @returns {{ transferred: number, details: object[] }}
 */
export function transferConflictsTowardPreferredSite(data) {
  var cfg = data.config || {};
  var mode = normalizeWeek17Mode(cfg.week17MakeupMode);
  if (mode !== WEEK17_MODES.byPreferredSite) {
    return { transferred: 0, details: [] };
  }
  var preferredId = cfg.week17MakeupPreferredSiteId
    ? getCanonicalFacilityId(data, cfg.week17MakeupPreferredSiteId)
    : null;
  if (!preferredId) return { transferred: 0, details: [] };

  var preferredGroups = preferredSiteClinicalGroups(data, preferredId);
  if (!preferredGroups.length) return { transferred: 0, details: [] };

  var usedRecipients = {};
  var details = [];
  var transferred = 0;

  var sources = (data.students || []).filter(function (s) {
    var site = getStudentAssignedSite(data, s);
    if (!site || sameFacilitySite(data, site, preferredId)) return false;
    return listConflictWeeks(s, cfg).length > 0;
  });
  sources.sort(function (a, b) {
    return String(a.id).localeCompare(String(b.id));
  });

  sources.forEach(function (source) {
    listConflictWeeks(source, cfg).forEach(function (wi) {
      var cell = source.schedule[wi];
      if (!cell || !cell.sim) return;
      var recipient = pickRecipient(data, preferredGroups, wi, cell.simDay, cfg, usedRecipients);
      if (!recipient) return;
      if (transferOneConflict(data, source, recipient, wi)) {
        usedRecipients[recipient.id] = true;
        transferred++;
        details.push({
          fromStudentId: source.id,
          toStudentId: recipient.id,
          weekIndex: wi,
          simNum: recipient.schedule[wi].sim,
          day: recipient.schedule[wi].simDay
        });
      }
    });
  });

  return { transferred: transferred, details: details };
}
